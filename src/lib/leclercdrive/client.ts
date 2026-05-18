import { getServiceKeys, getKvClient } from "@/lib/keys/store";
import { parseCookieImportRaw } from "./cookie-import";
import {
  extractCartFromDetailPanierHtml,
  parseCartFromPanierResponse,
  type LeclercCartSummary,
} from "./parsing";
import {
  applyDatadomeRotation,
  DataDomeBlockedError,
  DATADOME_HELP,
  DATADOME_ROTATION_NOTE,
  detectDataDomeBlock,
  extractDatadomeValue,
  hasDatadomeCookie,
  listDatadomeHosts,
  maskCookieValue,
  mergeCookieJars,
  parseBrowserCookieImport,
  spreadDatadomeToHosts,
} from "./datadome";
import { fetchPublicIp } from "./external-ip";
import { getLeclercHttpProxy, leclercFetch } from "./http";
import { wireGuardConfigExists } from "./wg-config";
import {
  apiRequestHeaders,
  clearBrowserFingerprintCache,
  getCachedBrowserFingerprint,
  resolveBrowserFingerprint,
} from "./browser-fingerprint";
import {
  documentNavigationHeaders,
  LECLERC_PORTAL_URL,
  storePageUrl,
} from "./navigation";
import {
  mergeStoreConfig,
  persistStoreCache,
  resolveStoreContext,
} from "./store-resolver";
import type { LeclercDriveConfig, LeclercDriveCredentials } from "./types";

const SESSION_KEY = "leclercdrive:session:default";
const BROWSER_COOKIES_KEY_PREFIX = "leclercdrive:browser:";
const SESSION_TTL_SECONDS = 60 * 60 * 4;

export type { LeclercDriveConfig } from "./types";

let resolvedConfigCache: LeclercDriveConfig | null = null;

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

  merge(extra: Record<string, Record<string, string>>): void {
    this.store = mergeCookieJars(this.store, extra);
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
  resolvedConfigCache = null;
  clearBrowserFingerprintCache();
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
    headers: {
      ...apiRequestHeaders(getCachedBrowserFingerprint()),
      ...(init.headers as Record<string, string> | undefined),
    },
  };
  const maxRedirects = init.maxRedirects ?? 8;
  for (let i = 0; i <= maxRedirects; i++) {
    const cookieHeader = jar.getCookieHeader(hostOf(currentUrl));
    const headers = new Headers(currentInit.headers as HeadersInit);
    if (cookieHeader) headers.set("cookie", cookieHeader);
    const response = await leclercFetch(currentUrl, { ...currentInit, headers });
    jar.ingest(hostOf(currentUrl), response);
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return { response, finalUrl: currentUrl };
      const nextUrl = new URL(location, currentUrl).toString();
      if (detectDataDomeBlock(nextUrl, response.status, "", response.headers)) {
        throw new DataDomeBlockedError();
      }
      const keepMethod = response.status === 307 || response.status === 308;
      await response.text().catch(() => undefined);
      currentInit = {
        ...currentInit,
        method: keepMethod ? currentInit.method : "GET",
        body: keepMethod ? currentInit.body : undefined,
      };
      currentUrl = nextUrl;
      continue;
    }
    const bodyPeek = await response.clone().text().catch(() => "");
    assertNotDataDomeBlocked(currentUrl, response.status, bodyPeek, response.headers);
    return { response, finalUrl: currentUrl };
  }
  throw new Error(`Leclerc Drive : trop de redirections (>${maxRedirects}).`);
}

function browserCookiesKey(username: string): string {
  return `${BROWSER_COOKIES_KEY_PREFIX}${username.trim().toLowerCase()}`;
}

export async function loadBrowserCookies(
  username: string
): Promise<Record<string, Record<string, string>>> {
  const kv = getKvClient();
  if (kv) {
    const stored = await kv.get<Record<string, Record<string, string>>>(
      browserCookiesKey(username)
    );
    if (stored && Object.keys(stored).length > 0) return stored;
  }
  return {};
}

export async function persistBrowserCookies(
  username: string,
  cookies: Record<string, Record<string, string>>
): Promise<void> {
  const kv = getKvClient();
  if (!kv) return;
  await kv.set(browserCookiesKey(username), cookies);
}

/** Session complète exportée par le script harvest (cookies navigateur + MCP). */
export async function persistHarvestedSession(
  jar: Record<string, Record<string, string>>
): Promise<void> {
  const state: SessionState = {
    cookies: jar,
    loggedInAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000,
  };
  cachedSession = state;
  resolvedConfigCache = null;
  await persistSession(state);
}

export async function leclercdriveSetBrowserCookies(
  cookieString: string
): Promise<{ saved: boolean; hasDatadome: boolean; cookieNames: string[] }> {
  const creds = await getCredentialsFromEnvOrKv();
  const parsed = parseCookieImportRaw(cookieString);
  if (Object.keys(parsed).length === 0) {
    throw new Error("Aucun cookie leclercdrive parsé.");
  }
  await persistBrowserCookies(creds.username, parsed);
  await persistHarvestedSession(parsed);
  resolvedConfigCache = null;
  cachedSession = null;
  const names = Object.values(parsed).flatMap((c) => Object.keys(c));
  return { saved: true, hasDatadome: hasDatadomeCookie(parsed), cookieNames: names };
}

function storeHostsFromConfig(config?: {
  coursesHost?: string;
  secureHost?: string;
}): string[] {
  const hosts: string[] = [];
  if (config?.coursesHost) hosts.push(config.coursesHost);
  if (config?.secureHost) hosts.push(config.secureHost);
  return hosts;
}

async function buildBrowserCookiesFromCredentials(
  creds: LeclercDriveCredentials,
  configHosts?: { coursesHost?: string; secureHost?: string }
): Promise<Record<string, Record<string, string>>> {
  const extraHosts = storeHostsFromConfig(configHosts);
  let jar = spreadDatadomeToHosts(await loadBrowserCookies(creds.username), extraHosts);

  const fromSettings =
    creds.browserCookies?.trim() ||
    process.env.LECLERCDRIVE_BROWSER_COOKIES?.trim();
  const datadome =
    creds.datadomeCookie?.trim() || process.env.LECLERCDRIVE_DATADOME_COOKIE?.trim();

  if (fromSettings) {
    jar = mergeCookieJars(jar, parseBrowserCookieImport(fromSettings, extraHosts));
  } else if (datadome) {
    jar = mergeCookieJars(jar, parseBrowserCookieImport(datadome, extraHosts));
  }

  jar = spreadDatadomeToHosts(jar, extraHosts);
  if (hasDatadomeCookie(jar)) {
    await persistBrowserCookies(creds.username, jar);
  }
  return jar;
}

/** Persiste un datadome renvoyé par Leclerc (jeton glissant). */
async function syncDatadomeFromJar(
  username: string,
  jar: CookieJar,
  config?: LeclercDriveConfig
): Promise<void> {
  const latest = extractDatadomeValue(jar.toJSON());
  if (!latest) return;
  const stored = await loadBrowserCookies(username);
  const storedValue = extractDatadomeValue(stored);
  if (latest !== storedValue) {
    await persistBrowserCookies(
      username,
      applyDatadomeRotation(stored, latest, storeHostsFromConfig(config))
    );
  }
}

/**
 * Parcours naturel : www.leclercdrive.fr → page magasin fdN (jamais fd9 en entrée directe).
 * Retourne l’URL magasin pour le referer du login.
 */
async function navigateNaturalEntry(
  jar: CookieJar,
  config: LeclercDriveConfig,
  username: string
): Promise<string> {
  await fetchWithJar(jar, LECLERC_PORTAL_URL, {
    method: "GET",
    headers: documentNavigationHeaders(),
  });
  await syncDatadomeFromJar(username, jar, config);

  const magasinUrl = storePageUrl(config);
  await fetchWithJar(jar, magasinUrl, {
    method: "GET",
    headers: documentNavigationHeaders({ referer: LECLERC_PORTAL_URL }),
  });
  await syncDatadomeFromJar(username, jar, config);

  return magasinUrl;
}

function applyBrowserCookiesToJar(
  jar: CookieJar,
  browserCookies: Record<string, Record<string, string>>
): void {
  if (Object.keys(browserCookies).length > 0) {
    jar.merge(browserCookies);
  }
}

function assertNotDataDomeBlocked(
  finalUrl: string,
  status: number,
  body: string,
  headers: Headers
): void {
  if (detectDataDomeBlock(finalUrl, status, body, headers)) {
    throw new DataDomeBlockedError();
  }
}

async function getCredentialsFromEnvOrKv(): Promise<LeclercDriveCredentials> {
  const keys = await getServiceKeys("leclercdrive");
  const username =
    (typeof keys?.username === "string" && keys.username.trim()) ||
    process.env.LECLERCDRIVE_USERNAME?.trim();
  const password =
    (typeof keys?.password === "string" && keys.password.trim()) ||
    process.env.LECLERCDRIVE_PASSWORD?.trim();

  if (!username || !password) {
    throw new Error(
      "Identifiants Leclerc Drive non configurés. Renseignez username/password sur /settings ou LECLERCDRIVE_USERNAME / LECLERCDRIVE_PASSWORD."
    );
  }

  return {
    username,
    password,
    datadomeCookie:
      (typeof keys?.datadomeCookie === "string" && keys.datadomeCookie.trim()) ||
      process.env.LECLERCDRIVE_DATADOME_COOKIE?.trim(),
    browserCookies:
      (typeof keys?.browserCookies === "string" && keys.browserCookies.trim()) ||
      process.env.LECLERCDRIVE_BROWSER_COOKIES?.trim(),
    storeUrl:
      (typeof keys?.storeUrl === "string" && keys.storeUrl.trim()) ||
      process.env.LECLERCDRIVE_STORE_URL?.trim(),
    pointLivraison:
      (typeof keys?.pointLivraison === "string" && keys.pointLivraison.trim()) ||
      process.env.LECLERCDRIVE_POINT_LIVRAISON?.trim(),
    storePath:
      (typeof keys?.storePath === "string" && keys.storePath.trim()) ||
      process.env.LECLERCDRIVE_STORE_PATH?.trim(),
    storeSlug:
      (typeof keys?.storeSlug === "string" && keys.storeSlug.trim()) ||
      process.env.LECLERCDRIVE_STORE_SLUG?.trim(),
    coursesHost:
      (typeof keys?.coursesHost === "string" && keys.coursesHost.trim()) ||
      process.env.LECLERCDRIVE_COURSES_HOST?.trim(),
    secureHost:
      (typeof keys?.secureHost === "string" && keys.secureHost.trim()) ||
      process.env.LECLERCDRIVE_SECURE_HOST?.trim(),
    eUniversContexte: keys?.eUniversContexte
      ? Number(keys.eUniversContexte)
      : process.env.LECLERCDRIVE_E_UNIVERS
        ? Number(process.env.LECLERCDRIVE_E_UNIVERS)
        : undefined,
  };
}

export async function getLeclercDriveConfig(): Promise<LeclercDriveConfig> {
  if (resolvedConfigCache) return resolvedConfigCache;

  const creds = await getCredentialsFromEnvOrKv();
  const browserCookies = await buildBrowserCookiesFromCredentials(creds);
  const store = await resolveStoreContext(creds.username, creds.password, {
    storeUrl: creds.storeUrl,
    browserCookies,
    pointLivraison: creds.pointLivraison,
    storePath: creds.storePath,
    storeSlug: creds.storeSlug,
    coursesHost: creds.coursesHost,
    secureHost: creds.secureHost,
    eUniversContexte: creds.eUniversContexte,
  });

  resolvedConfigCache = mergeStoreConfig(
    creds.username,
    creds.password,
    {
      pointLivraison: creds.pointLivraison,
      storePath: creds.storePath,
      storeSlug: creds.storeSlug,
      coursesHost: creds.coursesHost,
      secureHost: creds.secureHost,
      eUniversContexte: creds.eUniversContexte,
    },
    store
  );
  return resolvedConfigCache;
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
  const creds = await getCredentialsFromEnvOrKv();
  const browserCookies = await buildBrowserCookiesFromCredentials(creds, config);
  if (!hasDatadomeCookie(browserCookies)) {
    throw new DataDomeBlockedError(
      `Connexion serveur impossible sans cookie DataDome. ${DATADOME_HELP}`
    );
  }

  const jar = new CookieJar();
  applyBrowserCookiesToJar(jar, browserCookies);
  const homeUrl = await navigateNaturalEntry(jar, config, creds.username);

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
  if (detectDataDomeBlock(connectRes.finalUrl, connectRes.response.status, connectText)) {
    throw new DataDomeBlockedError();
  }

  let connectJson: Record<string, unknown> = {};
  try {
    connectJson = JSON.parse(connectText) as Record<string, unknown>;
  } catch {
  }

  const interstitialUrl = connectJson.url as string | undefined;
  if (interstitialUrl?.includes("captcha-delivery.com")) {
    throw new DataDomeBlockedError();
  }

  const compteRendu = connectJson.CompteRendu as {
    iCompteRendu?: number;
    CompteRendu?: { sAction?: string; sMotif?: string };
  } | undefined;
  if (compteRendu?.iCompteRendu === -1) {
    const action = compteRendu.CompteRendu?.sAction;
    const motif = compteRendu.CompteRendu?.sMotif;
    if (action === "CAPTCHA" || motif === "COMPTE_NOUVEAU_TERMINAL" || motif === "MODE_DEGRADE") {
      throw new Error(
        "Leclerc Drive : captcha ou validation « nouveau terminal » requis. " +
          "Lancez « pnpm leclercdrive:harvest » sur votre Mac, connectez-vous dans Chrome, puis réessayez le MCP."
      );
    }
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

  const redirectStore = connectJson.objDonneesReponse as { sUrlRedirection?: string } | undefined;
  if (redirectStore?.sUrlRedirection) {
    const { parseStoreFromUrl } = await import("./store-resolver");
    const fromRedirect = parseStoreFromUrl(redirectStore.sUrlRedirection);
    if (fromRedirect) {
      await persistStoreCache(config.username, fromRedirect);
      resolvedConfigCache = mergeStoreConfig(config.username, config.password, {}, fromRedirect);
    }
  }

  await syncDatadomeFromJar(config.username, jar, config);

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
  await resolveBrowserFingerprint(config.username);
  const creds = await getCredentialsFromEnvOrKv();
  const browserCookies = await buildBrowserCookiesFromCredentials(creds, config);

  const prepareJar = (sessionCookies: Record<string, Record<string, string>>) => {
    const jar = new CookieJar(sessionCookies);
    applyBrowserCookiesToJar(jar, browserCookies);
    return jar;
  };

  if (cachedSession && cachedSession.expiresAt > Date.now()) {
    const jar = prepareJar(cachedSession.cookies);
    const ok = await checkConnected(jar, config);
    if (ok) return { jar, config };
    cachedSession = null;
  }

  if (!cachedSession) {
    const fromKv = await loadSessionFromKv();
    if (fromKv) {
      const jar = prepareJar(fromKv.cookies);
      const ok = await checkConnected(jar, config);
      if (ok) {
        cachedSession = fromKv;
        return { jar, config };
      }
    }
  }

  const harvestedJar = prepareJar({});
  if (await checkConnected(harvestedJar, config)) {
    const state = await buildSession(harvestedJar);
    cachedSession = state;
    await persistSession(state);
    return { jar: harvestedJar, config };
  }

  if (!inflightLogin) {
    inflightLogin = performLogin().finally(() => {
      inflightLogin = null;
    });
  }
  const state = await inflightLogin;
  const jar = prepareJar(state.cookies);
  return { jar, config };
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

  const { response, finalUrl } = await fetchWithJar(jar, url, init);
  await syncDatadomeFromJar(config.username, jar, config);
  const text = await response.text();

  if (detectDataDomeBlock(finalUrl, response.status, text, response.headers)) {
    cachedSession = null;
    throw new DataDomeBlockedError();
  }

  if (response.status === 401 || response.status === 403) {
    cachedSession = null;
    throw new Error(`Leclerc Drive : accès refusé (${response.status}). ${DATADOME_HELP}`);
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
  await syncDatadomeFromJar(config.username, jar, config);
  assertNotDataDomeBlocked(res.finalUrl, res.response.status, text, res.response.headers);
  return JSON.parse(text) as Record<string, unknown>;
}

export async function leclercdriveGetDatadomeStatus(): Promise<{
  hasDatadomeCookie: boolean;
  cookieNames: string[];
  datadomePreview: string | null;
  note: string;
}> {
  const creds = await getCredentialsFromEnvOrKv();
  const jar = await buildBrowserCookiesFromCredentials(creds);
  const names = Object.values(jar).flatMap((c) => Object.keys(c));
  const value = extractDatadomeValue(jar);
  return {
    hasDatadomeCookie: Boolean(value),
    cookieNames: names,
    datadomePreview: value ? `${value.slice(0, 16)}…` : null,
    note: DATADOME_ROTATION_NOTE,
  };
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

export async function getLeclercdrivePublicConfig(): Promise<
  Omit<LeclercDriveConfig, "username" | "password">
> {
  const { username: _u, password: _p, ...publicConfig } = await getLeclercDriveConfig();
  return publicConfig;
}

export async function leclercdriveDiagnose(): Promise<Record<string, unknown>> {
  const creds = await getCredentialsFromEnvOrKv();
  const kvKeys = await getServiceKeys("leclercdrive");
  const redisJar = await loadBrowserCookies(creds.username);

  let config: LeclercDriveConfig | null = null;
  let configError: string | undefined;
  try {
    config = await getLeclercDriveConfig();
  } catch (e) {
    configError = e instanceof Error ? e.message : String(e);
  }

  const browserCookies = await buildBrowserCookiesFromCredentials(
    creds,
    config ?? undefined
  );
  const jar = new CookieJar();
  applyBrowserCookiesToJar(jar, browserCookies);

  const secureHost = config?.secureHost ?? "fd9-secure.leclercdrive.fr";
  const cookieHeader = jar.getCookieHeader(secureHost);
  const datadomeValue = extractDatadomeValue(browserCookies);

  let probe: Record<string, unknown> = { skipped: true };
  if (cookieHeader) {
    const probeRes = await leclercFetch(`https://${secureHost}/`, {
      method: "GET",
      redirect: "manual",
      headers: {
        ...documentNavigationHeaders({
          secFetchSite: "same-origin",
          referer: `https://${secureHost}/`,
        }),
        cookie: cookieHeader,
      },
    });
    const body = await probeRes.text();
    const finalUrl = probeRes.headers.get("location") ?? `https://${secureHost}/`;
    probe = {
      host: secureHost,
      status: probeRes.status,
      blocked: detectDataDomeBlock(finalUrl, probeRes.status, body, probeRes.headers),
      finalUrl,
      xDdB: probeRes.headers.get("x-dd-b"),
    };
  }

  return {
    persistence: {
      usernameInKv: Boolean(kvKeys?.username?.trim()),
      passwordInKv: Boolean(kvKeys?.password?.trim()),
      datadomeInKv: Boolean(kvKeys?.datadomeCookie?.trim()),
      datadomeKvPreview: kvKeys?.datadomeCookie
        ? maskCookieValue(kvKeys.datadomeCookie)
        : null,
      datadomeInRedis: Boolean(extractDatadomeValue(redisJar)),
      datadomeRedisHosts: listDatadomeHosts(redisJar),
      datadomeRedisPreview: extractDatadomeValue(redisJar)
        ? maskCookieValue(extractDatadomeValue(redisJar)!)
        : null,
    },
    cookieScope: {
      hostsWithDatadome: listDatadomeHosts(browserCookies),
      cookieHeaderOnSecure: cookieHeader
        ? `${cookieHeader.slice(0, 80)}${cookieHeader.length > 80 ? "…" : ""}`
        : null,
      datadomeSentToSecure: cookieHeader.includes("datadome="),
    },
    store: config
      ? {
          coursesHost: config.coursesHost,
          secureHost: config.secureHost,
          storeSlug: config.storeSlug,
        }
      : null,
    configError,
    network: {
      publicIp: await fetchPublicIp(),
      httpProxy: getLeclercHttpProxy() ?? null,
      wireGuardConfigPresent: wireGuardConfigExists(),
      wireGuardHint:
        "En local : pnpm leclercdrive:vpn -- probe (wg-quick) ou app WireGuard. Sur Vercel : WireGuard impossible — proxy HTTP sur le serveur VPN ou MCP local.",
    },
    proxy: {
      configured: Boolean(getLeclercHttpProxy()),
      hint: "LECLERCDRIVE_HTTP_PROXY=http://user:pass@host:port (proxy sur 51.159.164.44 pour Vercel)",
    },
    browserFingerprint: {
      userAgent: getCachedBrowserFingerprint().userAgent,
      secChUa: getCachedBrowserFingerprint().secChUa,
    },
    harvest: {
      command: "pnpm leclercdrive:harvest",
      cdpArc:
        "/Applications/Arc.app/Contents/MacOS/Arc --remote-debugging-port=9222 puis harvest",
      note: "Harvest CDP enregistre cookies + Client Hints. TLS/IP Vercel restent différents d’Arc.",
    },
    probe,
    recommendations: [
      "Toujours passer par https://www.leclercdrive.fr avant fd9 (accès direct = spam).",
      "Lancez pnpm leclercdrive:harvest : connexion sur www puis choix du magasin.",
      "Sur Vercel, réutilisez la session harvestée (cookies complets, pas seulement datadome).",
    ],
  };
}
