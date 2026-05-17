import { getServiceKeys, getKvClient } from "@/lib/keys/store";
import {
  extractCartFromDetailPanierHtml,
  parseCartFromPanierResponse,
  type LeclercCartSummary,
} from "./parsing";

const SESSION_KEY = "leclercdrive:session:default";
const SESSION_TTL_SECONDS = 60 * 60 * 4;

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";

const COMMON_HEADERS: Record<string, string> = {
  "user-agent": USER_AGENT,
  "accept-language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
  accept: "application/json, text/javascript, */*; q=0.01",
  "sec-ch-ua": '"Chromium";v="147", "Not.A/Brand";v="8"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"macOS"',
};

export interface LeclercDriveConfig {
  username: string;
  password: string;
  /** Numéro point de livraison (ex. 175601). */
  pointLivraison: string;
  /** Préfixe magasin API (ex. magasin-175601-175601). */
  storePath: string;
  /** Slug ville pour URLs pages (ex. Auray). */
  storeSlug: string;
  coursesHost: string;
  secureHost: string;
  /** Univers drive = 2 (d’après HAR Auray). */
  eUniversContexte: number;
}

interface SessionState {
  cookies: Record<string, Record<string, string>>;
  loggedInAt: number;
  expiresAt: number;
}

class CookieJar {
  private store: Record<string, Record<string, string>> = {};

  constructor(initial?: Record<string, Record<string, string>>) {
    if (initial) this.store = initial;
  }

  toJSON(): Record<string, Record<string, string>> {
    return this.store;
  }

  getCookieHeader(host: string): string {
    const parts: string[] = [];
    const seen = new Set<string>();
    for (const [storeHost, jar] of Object.entries(this.store)) {
      if (host === storeHost || host.endsWith(`.${storeHost}`)) {
        for (const [name, value] of Object.entries(jar)) {
          if (seen.has(name)) continue;
          seen.add(name);
          parts.push(`${name}=${value}`);
        }
      }
    }
    return parts.join("; ");
  }

  ingest(host: string, response: Response): void {
    const setCookieList = extractSetCookies(response.headers);
    for (const raw of setCookieList) {
      const parsed = parseSetCookie(raw);
      if (!parsed) continue;
      const cookieHost = parsed.domain ?? host;
      const normalized = cookieHost.replace(/^\./, "");
      if (!this.store[normalized]) this.store[normalized] = {};
      if (parsed.value === "" || parsed.expired) {
        delete this.store[normalized][parsed.name];
      } else {
        this.store[normalized][parsed.name] = parsed.value;
      }
    }
  }
}

function extractSetCookies(headers: Headers): string[] {
  const anyHeaders = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof anyHeaders.getSetCookie === "function") {
    return anyHeaders.getSetCookie();
  }
  const all: string[] = [];
  headers.forEach((value, name) => {
    if (name.toLowerCase() === "set-cookie") all.push(value);
  });
  return all;
}

function parseSetCookie(raw: string): {
  name: string;
  value: string;
  domain?: string;
  expired: boolean;
} | null {
  const segments = raw.split(";").map((s) => s.trim());
  const [first] = segments;
  if (!first) return null;
  const eqIdx = first.indexOf("=");
  if (eqIdx === -1) return null;
  const name = first.slice(0, eqIdx).trim();
  const value = first.slice(eqIdx + 1).trim();
  let domain: string | undefined;
  let expired = false;
  for (const seg of segments.slice(1)) {
    const lower = seg.toLowerCase();
    if (lower.startsWith("domain=")) domain = seg.slice(7).trim().toLowerCase();
    else if (lower.startsWith("max-age=")) {
      const ma = parseInt(seg.slice(8), 10);
      if (!Number.isNaN(ma) && ma <= 0) expired = true;
    } else if (lower.startsWith("expires=")) {
      const date = new Date(seg.slice(8));
      if (!Number.isNaN(date.getTime()) && date.getTime() < Date.now()) expired = true;
    }
  }
  return { name, value, domain, expired };
}

function hostOf(url: string): string {
  return new URL(url).host;
}

let cachedSession: SessionState | null = null;
let inflightLogin: Promise<SessionState> | null = null;

async function loadSessionFromKv(): Promise<SessionState | null> {
  const kv = getKvClient();
  if (!kv) return null;
  const stored = await kv.get<SessionState>(SESSION_KEY);
  if (!stored) return null;
  if (stored.expiresAt && stored.expiresAt < Date.now()) return null;
  return stored;
}

async function persistSession(state: SessionState): Promise<void> {
  const kv = getKvClient();
  if (!kv) return;
  await kv.set(SESSION_KEY, state, { ex: SESSION_TTL_SECONDS });
}

export async function leclercdriveLogout(): Promise<void> {
  cachedSession = null;
  const kv = getKvClient();
  if (kv) await kv.del(SESSION_KEY);
}

async function fetchWithJar(
  jar: CookieJar,
  startUrl: string,
  init: RequestInit & { maxRedirects?: number } = {}
): Promise<{ response: Response; finalUrl: string }> {
  let currentUrl = startUrl;
  let currentInit: RequestInit = {
    ...init,
    redirect: "manual",
    headers: { ...COMMON_HEADERS, ...(init.headers as Record<string, string> | undefined) },
  };
  const maxRedirects = init.maxRedirects ?? 8;
  for (let i = 0; i <= maxRedirects; i++) {
    const cookieHeader = jar.getCookieHeader(hostOf(currentUrl));
    const headers = new Headers(currentInit.headers as HeadersInit);
    if (cookieHeader) headers.set("cookie", cookieHeader);
    const response = await fetch(currentUrl, { ...currentInit, headers });
    jar.ingest(hostOf(currentUrl), response);
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return { response, finalUrl: currentUrl };
      const keepMethod = response.status === 307 || response.status === 308;
      const nextUrl = new URL(location, currentUrl).toString();
      await response.text().catch(() => undefined);
      currentInit = {
        ...currentInit,
        method: keepMethod ? currentInit.method : "GET",
        body: keepMethod ? currentInit.body : undefined,
      };
      currentUrl = nextUrl;
      continue;
    }
    return { response, finalUrl: currentUrl };
  }
  throw new Error(`Leclerc Drive : trop de redirections (>${maxRedirects}).`);
}

export async function getLeclercDriveConfig(): Promise<LeclercDriveConfig> {
  const keys = await getServiceKeys("leclercdrive");
  const username =
    (typeof keys?.username === "string" && keys.username.trim()) ||
    process.env.LECLERCDRIVE_USERNAME?.trim();
  const password =
    (typeof keys?.password === "string" && keys.password.trim()) ||
    process.env.LECLERCDRIVE_PASSWORD?.trim();
  const pointLivraison =
    (typeof keys?.pointLivraison === "string" && keys.pointLivraison.trim()) ||
    process.env.LECLERCDRIVE_POINT_LIVRAISON?.trim() ||
    "175601";
  const storePath =
    (typeof keys?.storePath === "string" && keys.storePath.trim()) ||
    process.env.LECLERCDRIVE_STORE_PATH?.trim() ||
    "magasin-175601-175601";
  const storeSlug =
    (typeof keys?.storeSlug === "string" && keys.storeSlug.trim()) ||
    process.env.LECLERCDRIVE_STORE_SLUG?.trim() ||
    "Auray";
  const coursesHost =
    (typeof keys?.coursesHost === "string" && keys.coursesHost.trim()) ||
    process.env.LECLERCDRIVE_COURSES_HOST?.trim() ||
    "fd9-courses.leclercdrive.fr";
  const secureHost =
    (typeof keys?.secureHost === "string" && keys.secureHost.trim()) ||
    process.env.LECLERCDRIVE_SECURE_HOST?.trim() ||
    "fd9-secure.leclercdrive.fr";
  const eUniversContexte = Number(
    keys?.eUniversContexte ?? process.env.LECLERCDRIVE_E_UNIVERS ?? "2"
  );

  if (!username || !password) {
    throw new Error(
      "Identifiants Leclerc Drive non configurés. Renseignez username/password sur /settings ou LECLERCDRIVE_USERNAME / LECLERCDRIVE_PASSWORD."
    );
  }

  return {
    username,
    password,
    pointLivraison,
    storePath,
    storeSlug,
    coursesHost,
    secureHost,
    eUniversContexte,
  };
}

function coursesOrigin(config: LeclercDriveConfig): string {
  return `https://${config.coursesHost}`;
}

function secureOrigin(config: LeclercDriveConfig): string {
  return `https://${config.secureHost}`;
}

function storeBasePath(config: LeclercDriveConfig): string {
  return `/${config.storePath}`;
}

function storePagePath(config: LeclercDriveConfig): string {
  return `/${config.storePath}-${config.storeSlug}`;
}

async function buildSession(jar: CookieJar): Promise<SessionState> {
  return {
    cookies: jar.toJSON(),
    loggedInAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000,
  };
}

async function performLogin(): Promise<SessionState> {
  const config = await getLeclercDriveConfig();
  const jar = new CookieJar();

  const homeUrl = `${coursesOrigin(config)}${storePagePath(config)}.aspx`;
  await fetchWithJar(jar, homeUrl, {
    method: "GET",
    headers: {
      accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "upgrade-insecure-requests": "1",
    },
  });

  const loginBody = {
    sLogin: config.username,
    sMotDePasse: config.password,
    fResterConnecte: true,
    sCaptchaReponse: null as string | null,
    sNoPointLivraisonConnexion: config.pointLivraison,
    eUniversContexte: config.eUniversContexte,
    sNoPointRetraitConnexion: config.pointLivraison,
  };

  const connectRes = await fetchWithJar(
    jar,
    `${secureOrigin(config)}/connecter.ashz`,
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        "x-requested-with": "XMLHttpRequest",
        origin: coursesOrigin(config),
        referer: homeUrl,
      },
      body: `d=${encodeURIComponent(JSON.stringify(loginBody))}`,
    }
  );

  const connectText = await connectRes.response.text();
  let connectJson: Record<string, unknown> = {};
  try {
    connectJson = JSON.parse(connectText) as Record<string, unknown>;
  } catch {
  }

  const compteRendu = connectJson.CompteRendu as { iCompteRendu?: number } | undefined;
  if (compteRendu?.iCompteRendu === -1) {
    throw new Error(
      `Leclerc Drive : identifiants refusés. Vérifiez email/mot de passe. Réponse : ${connectText.slice(0, 300)}`
    );
  }

  const connected = await checkConnected(jar, config);
  if (!connected) {
    throw new Error(
      `Leclerc Drive : connexion non confirmée après connecter.ashz. Réponse connecter : ${connectText.slice(0, 300)}`
    );
  }

  const state = await buildSession(jar);
  cachedSession = state;
  await persistSession(state);
  return state;
}

async function checkConnected(
  jar: CookieJar,
  config: LeclercDriveConfig
): Promise<boolean> {
  const res = await fetchWithJar(jar, `${secureOrigin(config)}/drive/estconnecte.ashz`, {
    method: "POST",
    headers: {
      origin: coursesOrigin(config),
      referer: `${coursesOrigin(config)}/`,
    },
  });
  const text = await res.response.text();
  try {
    const json = JSON.parse(text) as {
      objDonneesReponse?: { iIdClient?: number };
    };
    return Boolean(json.objDonneesReponse?.iIdClient);
  } catch {
    return false;
  }
}

async function ensureSession(): Promise<{ jar: CookieJar; config: LeclercDriveConfig }> {
  const config = await getLeclercDriveConfig();

  if (cachedSession && cachedSession.expiresAt > Date.now()) {
    const jar = new CookieJar(cachedSession.cookies);
    const ok = await checkConnected(jar, config);
    if (ok) return { jar, config };
    cachedSession = null;
  }

  if (!cachedSession) {
    const fromKv = await loadSessionFromKv();
    if (fromKv) {
      const jar = new CookieJar(fromKv.cookies);
      const ok = await checkConnected(jar, config);
      if (ok) {
        cachedSession = fromKv;
        return { jar, config };
      }
    }
  }

  if (!inflightLogin) {
    inflightLogin = performLogin().finally(() => {
      inflightLogin = null;
    });
  }
  const state = await inflightLogin;
  return { jar: new CookieJar(state.cookies), config };
}

function encodeFormD(payload: unknown): string {
  return `d=${encodeURIComponent(JSON.stringify(payload))}`;
}

async function leclercdriveRequest<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    referer?: string;
    accept?: string;
    json?: boolean;
  } = {}
): Promise<T> {
  const { jar, config } = await ensureSession();
  const origin = coursesOrigin(config);
  const url = path.startsWith("http") ? path : `${origin}${path}`;
  const method = options.method ?? (options.body ? "POST" : "GET");
  const headers: Record<string, string> = {
    ...(method === "POST" && options.body
      ? { "content-type": "application/x-www-form-urlencoded; charset=UTF-8" }
      : {}),
    "x-requested-with": "XMLHttpRequest",
    origin,
    referer: options.referer ?? `${origin}${storePagePath(config)}.aspx`,
  };
  if (options.accept) headers.accept = options.accept;

  const init: RequestInit = {
    method,
    headers,
    body:
      options.body !== undefined
        ? encodeFormD(options.body)
        : undefined,
  };

  const { response } = await fetchWithJar(jar, url, init);
  const text = await response.text();

  if (response.status === 401 || response.status === 403) {
    cachedSession = null;
    throw new Error(`Leclerc Drive : accès refusé (${response.status}).`);
  }
  if (!response.ok) {
    throw new Error(
      `Leclerc Drive HTTP ${response.status} sur ${path} : ${text.slice(0, 300)}`
    );
  }

  if (options.json === false) return text as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    return text as T;
  }
}

export async function leclercdriveGetHtml(path: string, referer?: string): Promise<string> {
  return leclercdriveRequest<string>(path, {
    method: "GET",
    referer,
    accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    json: false,
  });
}

export async function leclercdriveGetConnectedUser(): Promise<Record<string, unknown>> {
  const { jar, config } = await ensureSession();
  const res = await fetchWithJar(jar, `${secureOrigin(config)}/drive/estconnecte.ashz`, {
    method: "POST",
    headers: {
      origin: coursesOrigin(config),
      referer: `${coursesOrigin(config)}/`,
    },
  });
  const text = await res.response.text();
  return JSON.parse(text) as Record<string, unknown>;
}

export async function leclercdriveSearch(query: string): Promise<string> {
  const config = await getLeclercDriveConfig();
  const encoded = encodeURIComponent(query);
  return leclercdriveGetHtml(
    `${storePagePath(config)}/recherche.aspx?TexteRecherche=${encoded}`,
    `${coursesOrigin(config)}${storePagePath(config)}.aspx`
  );
}

const PRODUCT_ZONES =
  "fpLibelleProduit|fpPrixProduit|fpVisuelProduit|fpStickersFiliere|fpStickersEchelle|fpPlusMoins";

export async function leclercdriveGetProductZones(productId: string): Promise<unknown> {
  const config = await getLeclercDriveConfig();
  return leclercdriveRequest(
    `${storeBasePath(config)}/fiche-produit-zones.ashz`,
    {
      body: {
        idProduit: Number(productId),
        idZones: PRODUCT_ZONES,
      },
      referer: `${coursesOrigin(config)}${storePagePath(config)}/fiche-produits-${productId}.aspx`,
    }
  );
}

export async function leclercdriveModifyCartQuantity(
  productId: string,
  quantity: number,
  eTypeAction: 1 | 2
): Promise<unknown> {
  const config = await getLeclercDriveConfig();
  return leclercdriveRequest(
    `${storeBasePath(config)}/panier.aspx?op=1`,
    {
      body: {
        eTypeAction,
        iIdProduit: productId,
        iQuantite: quantity,
        sNoPointLivraison: config.pointLivraison,
        objContexteProvenanceArticle: {
          eOrigine: 4,
          eTypePage: 6,
          eVue: 11,
          sInformationsComplementaires: "mcp",
        },
      },
      referer: `${coursesOrigin(config)}${storePagePath(config)}.aspx`,
    }
  );
}

export async function leclercdriveGetCart(): Promise<LeclercCartSummary | null> {
  const config = await getLeclercDriveConfig();
  const data = await leclercdriveRequest<unknown>(
    `${storeBasePath(config)}/panier.aspx?op=12`,
    {
      body: { sNoPointLivraison: config.pointLivraison },
    }
  );
  const fromApi = parseCartFromPanierResponse(data);
  if (fromApi) return fromApi;

  const html = await leclercdriveGetHtml(
    `${storePagePath(config)}/detail-panier.aspx`
  );
  return extractCartFromDetailPanierHtml(html);
}

export async function leclercdriveClearCart(): Promise<unknown> {
  const config = await getLeclercDriveConfig();
  return leclercdriveRequest(`${storeBasePath(config)}/panier.aspx?op=3`, {
    body: { sNoPointLivraison: config.pointLivraison },
  });
}

export async function leclercdriveForceRelogin(): Promise<{ loggedInAt: string }> {
  await leclercdriveLogout();
  const state = await performLogin();
  return { loggedInAt: new Date(state.loggedInAt).toISOString() };
}

export function getLeclercdrivePublicConfig(): Promise<LeclercDriveConfig> {
  return getLeclercDriveConfig();
}
