import { getServiceKeys } from "@/lib/keys/store";
import { getKvClient } from "@/lib/keys/store";

const MARKET = "fr";
const LANGUAGE = "fr-FR";
const ORIGIN = "https://cookidoo.fr";
const CIAM_HOST = "https://ciam.prod.cookidoo.vorwerk-digital.com";
const SESSION_KEY = "cookidoo:session:default";
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12h

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";

const COMMON_HEADERS: Record<string, string> = {
  "user-agent": USER_AGENT,
  "accept-language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
  "accept-encoding": "gzip, deflate, br",
  "sec-ch-ua": '"Chromium";v="147", "Not.A/Brand";v="8"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"macOS"',
};

interface SessionState {
  /** Map d'hôte (ex. "cookidoo.fr") vers Map de cookies (nom → valeur). */
  cookies: Record<string, Record<string, string>>;
  /** XSRF token dernièrement vu (entête X-XSRF-TOKEN ou cookie XSRF-TOKEN). */
  xsrfToken: string | null;
  /** Timestamp d'expiration en ms (utilisé pour invalider proactivement). */
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

  /** Retourne l'entête `Cookie` pour un host (et inclut les cookies du domaine parent). */
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

  /** Parse les Set-Cookie d'une réponse et stocke les cookies. */
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
  // Node's Headers.getSetCookie() exists in modern runtimes. Fallback to manual.
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
  path?: string;
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
  let path: string | undefined;
  let expired = false;
  for (const seg of segments.slice(1)) {
    const lower = seg.toLowerCase();
    if (lower.startsWith("domain=")) domain = seg.slice(7).trim().toLowerCase();
    else if (lower.startsWith("path=")) path = seg.slice(5).trim();
    else if (lower.startsWith("max-age=")) {
      const ma = parseInt(seg.slice(8), 10);
      if (!Number.isNaN(ma) && ma <= 0) expired = true;
    } else if (lower.startsWith("expires=")) {
      const date = new Date(seg.slice(8));
      if (!Number.isNaN(date.getTime()) && date.getTime() < Date.now()) expired = true;
    }
  }
  return { name, value, domain, path, expired };
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

async function clearSession(): Promise<void> {
  cachedSession = null;
  const kv = getKvClient();
  if (kv) await kv.del(SESSION_KEY);
}

async function getCredentials(): Promise<{ username: string; password: string }> {
  const keys = await getServiceKeys("cookidoo");
  if (!keys?.username || !keys?.password) {
    throw new Error(
      "Identifiants Cookidoo non configurés. Rendez-vous sur /settings pour les ajouter."
    );
  }
  return { username: keys.username, password: keys.password };
}

/**
 * Effectue une requête HTTP avec gestion automatique des cookies et redirections manuelles.
 * Suit jusqu'à 6 redirections, en collectant les Set-Cookie à chaque étape.
 */
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
  const maxRedirects = init.maxRedirects ?? 6;
  for (let i = 0; i <= maxRedirects; i++) {
    const cookieHeader = jar.getCookieHeader(hostOf(currentUrl));
    const headers = new Headers(currentInit.headers as HeadersInit);
    if (cookieHeader) headers.set("cookie", cookieHeader);
    const response = await fetch(currentUrl, { ...currentInit, headers });
    jar.ingest(hostOf(currentUrl), response);
    const status = response.status;
    if (status >= 300 && status < 400) {
      const location = response.headers.get("location");
      if (!location) return { response, finalUrl: currentUrl };
      // Pour les redirections, on bascule sur GET (sauf 307/308 qui doivent garder la méthode).
      const keepMethod = status === 307 || status === 308;
      const nextUrl = new URL(location, currentUrl).toString();
      // Drain le body de la précédente réponse pour libérer la connexion.
      await response.text().catch(() => undefined);
      currentInit = {
        ...currentInit,
        method: keepMethod ? currentInit.method : "GET",
        body: keepMethod ? currentInit.body : undefined,
        headers: { ...COMMON_HEADERS },
      };
      currentUrl = nextUrl;
      continue;
    }
    return { response, finalUrl: currentUrl };
  }
  throw new Error(`Trop de redirections en chaîne (>${maxRedirects})`);
}

/**
 * Exécute le flow OAuth2 complet et retourne un état de session prêt à l'emploi.
 */
async function performLogin(): Promise<SessionState> {
  const { username, password } = await getCredentials();
  const jar = new CookieJar();

  // 1. Démarrer le flow en demandant la page de login Cookidoo (qui redirige vers CIAM).
  const initial = await fetchWithJar(jar, `${ORIGIN}/profile/${LANGUAGE}/login`, {
    method: "GET",
    headers: {
      accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    },
  });

  // À ce stade on doit être sur la page de formulaire CIAM. On lit le HTML.
  const loginHtml = await initial.response.text();
  if (!initial.finalUrl.startsWith(CIAM_HOST)) {
    throw new Error(
      `Redirection inattendue vers ${initial.finalUrl} pendant l'init du login Cookidoo`
    );
  }

  // 2. Extraire le requestId du formulaire et l'URL d'action.
  const requestId = extractFormValue(loginHtml, "requestId");
  if (!requestId) {
    throw new Error(
      "Impossible de trouver le requestId du formulaire de login CIAM (page modifiée ?)"
    );
  }
  const actionMatch = loginHtml.match(/<form[^>]+action="([^"]+)"/i);
  const action = actionMatch
    ? new URL(actionMatch[1], initial.finalUrl).toString()
    : `${CIAM_HOST}/login-srv/login`;

  // 3. POST des identifiants. La réponse 302 contient l'URL `oauth2/callback?code=...`.
  const body = new URLSearchParams({
    requestId,
    username,
    password,
  }).toString();
  const submit = await fetchWithJar(jar, action, {
    method: "POST",
    body,
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      origin: CIAM_HOST,
      referer: initial.finalUrl,
    },
  });

  // À l'issue des redirections, on doit être authentifié sur cookidoo.fr.
  const finalText = await submit.response.text();
  if (submit.response.status >= 400) {
    throw new Error(
      `Échec du login Cookidoo (statut ${submit.response.status}). Vérifie email/mot de passe.`
    );
  }
  if (
    finalText.includes("login-srv/login") ||
    submit.finalUrl.includes("login-srv/login")
  ) {
    throw new Error(
      "Login Cookidoo refusé : identifiants invalides ou compte verrouillé."
    );
  }

  const xsrfMatch = finalText.match(/name="_csrf"\s+value="([^"]+)"/);
  const xsrfToken = xsrfMatch?.[1] ?? null;

  const state: SessionState = {
    cookies: jar.toJSON(),
    xsrfToken,
    expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000,
  };
  cachedSession = state;
  await persistSession(state);
  return state;
}

function extractFormValue(html: string, name: string): string | null {
  const regex = new RegExp(
    `<input[^>]+name=["']${name}["'][^>]+value=["']([^"']+)["']`,
    "i"
  );
  const m = html.match(regex);
  if (m) return m[1];
  // ordre inverse value puis name
  const regex2 = new RegExp(
    `<input[^>]+value=["']([^"']+)["'][^>]+name=["']${name}["']`,
    "i"
  );
  return html.match(regex2)?.[1] ?? null;
}

async function getOrCreateSession(force = false): Promise<SessionState> {
  if (!force && cachedSession && cachedSession.expiresAt > Date.now()) {
    return cachedSession;
  }
  if (!force) {
    const stored = await loadSessionFromKv();
    if (stored) {
      cachedSession = stored;
      return stored;
    }
  }
  if (inflightLogin) return inflightLogin;
  inflightLogin = performLogin().finally(() => {
    inflightLogin = null;
  });
  return inflightLogin;
}

async function refreshXsrfFromHomepage(state: SessionState): Promise<string | null> {
  const jar = new CookieJar(state.cookies);
  const result = await fetchWithJar(jar, `${ORIGIN}/organize/${MARKET}/my-recipes`, {
    method: "GET",
    headers: {
      accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    },
  });
  const xsrfHeader = result.response.headers.get("x-xsrf-token");
  let token = xsrfHeader ?? null;
  if (!token) {
    const html = await result.response.text();
    const m = html.match(/name="_csrf"\s+value="([^"]+)"/);
    token = m?.[1] ?? null;
  } else {
    await result.response.text().catch(() => undefined);
  }
  state.cookies = jar.toJSON();
  state.xsrfToken = token;
  await persistSession(state);
  return token;
}

interface CookidooRequestOptions {
  /** Si true, n'inclut pas le X-XSRF-TOKEN (utile pour les GET HTML publics). */
  skipXsrf?: boolean;
  /** Si true, retry une fois après un re-login lors d'un 401/403. Défaut true. */
  autoRelogin?: boolean;
  /** Surcharge de Content-Type (défaut: application/json). */
  contentType?: string;
  /** En-têtes additionnels. */
  extraHeaders?: Record<string, string>;
  /** Referer custom. */
  referer?: string;
  /** Doit-on parser la réponse comme JSON. Défaut: true. */
  json?: boolean;
}

/**
 * Effectue une requête authentifiée vers cookidoo.fr et renvoie la réponse JSON typée.
 */
export async function cookidooRequest<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
  options: CookidooRequestOptions = {}
): Promise<T> {
  const { skipXsrf = false, autoRelogin = true, json = true } = options;
  const url = path.startsWith("http") ? path : `${ORIGIN}${path}`;

  let state = await getOrCreateSession();
  let attempts = 0;
  while (attempts < 2) {
    attempts++;
    const jar = new CookieJar(state.cookies);
    const headers: Record<string, string> = {
      accept: json ? "application/json, */*;q=0.1" : "*/*",
      origin: ORIGIN,
      referer: options.referer ?? `${ORIGIN}/organize/${MARKET}/my-recipes`,
      "x-requested-with": "xmlhttprequest",
      ...options.extraHeaders,
    };
    if (body !== undefined) {
      headers["content-type"] = options.contentType ?? "application/json";
    }
    if (!skipXsrf && state.xsrfToken) {
      headers["x-xsrf-token"] = state.xsrfToken;
    }

    const result = await fetchWithJar(jar, url, {
      method,
      body:
        body === undefined
          ? undefined
          : typeof body === "string" || body instanceof URLSearchParams
            ? (body as BodyInit)
            : JSON.stringify(body),
      headers,
    });

    state.cookies = jar.toJSON();
    await persistSession(state);

    const status = result.response.status;
    if (status === 401 || status === 403) {
      if (!autoRelogin || attempts >= 2) {
        const errText = await result.response.text().catch(() => "");
        throw new Error(`Cookidoo ${status}: ${errText.slice(0, 200)}`);
      }
      // Tente d'abord de rafraîchir uniquement le XSRF, puis force un re-login.
      const newToken = await refreshXsrfFromHomepage(state).catch(() => null);
      if (!newToken) {
        await clearSession();
        state = await getOrCreateSession(true);
      }
      continue;
    }

    if (status >= 400) {
      const errText = await result.response.text().catch(() => "");
      throw new Error(
        `Cookidoo erreur ${status} sur ${method} ${path} : ${errText.slice(0, 300)}`
      );
    }

    if (status === 204 || status === 205) return undefined as T;

    const xsrfHeader = result.response.headers.get("x-xsrf-token");
    if (xsrfHeader) {
      state.xsrfToken = xsrfHeader;
      await persistSession(state);
    }

    if (!json) {
      return (await result.response.text()) as unknown as T;
    }
    const text = await result.response.text();
    if (!text) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as unknown as T;
    }
  }
  throw new Error("Cookidoo: nombre maximum de tentatives atteint");
}

/**
 * GET HTML d'une page Cookidoo (utile pour scraper les pages organize/created-recipes).
 */
export async function cookidooGetHtml(path: string): Promise<string> {
  return cookidooRequest<string>("GET", path, undefined, {
    skipXsrf: true,
    json: false,
    extraHeaders: {
      accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    },
  });
}

/** Constantes exposées pour les modules d'outils. */
export const COOKIDOO = {
  origin: ORIGIN,
  market: MARKET,
  language: LANGUAGE,
};

/** Réinitialise la session en cache (utile pour un test "logout"). */
export async function cookidooLogout(): Promise<void> {
  await clearSession();
}
