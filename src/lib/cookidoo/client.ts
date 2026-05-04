import { getServiceKeys, getKvClient } from "@/lib/keys/store";

const MARKET = "fr";
const LANGUAGE = "fr-FR";
const ORIGIN = "https://cookidoo.fr";
const CIAM_HOST = "https://eu.login.vorwerk.com";
const CIAM_HOST_LEGACY = "https://ciam.prod.cookidoo.vorwerk-digital.com";
const SESSION_KEY = "cookidoo:session:default";
/**
 * TTL conservateur pour le cache Redis. Cookidoo invalide souvent ses cookies
 * de session bien avant ça (~1-4h). Le code détecte les redirections vers la
 * page de login et déclenche automatiquement un re-login : la valeur ne sert
 * qu'à éviter de stocker indéfiniment des cookies périmés.
 */
const SESSION_TTL_SECONDS = 60 * 60 * 4;
/** Au-delà de cette ancienneté, on revalide proactivement la session avant de l'utiliser. */
const SESSION_REVALIDATE_AFTER_MS = 60 * 60 * 1000; // 1h
/** Nombre d'essais maximum sur une requête (1 essai initial + 2 re-login). */
const MAX_REQUEST_ATTEMPTS = 3;

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
  /** Timestamp d'expiration max en ms (cap dur, pas une garantie). */
  expiresAt: number;
  /** Timestamp ms du dernier login réussi (utilisé pour la revalidation proactive). */
  loggedInAt: number;
  /** Timestamp ms de la dernière requête authentifiée réussie. */
  lastValidatedAt: number;
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

/**
 * Détecte qu'une URL finale correspond à une page de login (donc que la session
 * Cookidoo est expirée et qu'il faut se reconnecter). Cookidoo ne renvoie pas
 * de 401 sur les requêtes : il redirige vers `/profile/<lang>/login` qui rebondit
 * vers `ciam.prod.cookidoo.vorwerk-digital.com` (HTML 200).
 */
function isLoginRedirect(finalUrl: string): boolean {
  const lower = finalUrl.toLowerCase();
  return (
    lower.startsWith(CIAM_HOST.toLowerCase()) ||
    lower.startsWith(CIAM_HOST_LEGACY.toLowerCase()) ||
    lower.includes("eu.login.vorwerk.com") ||
    /\/profile\/[a-z-]+\/login(\?|$|#)/.test(lower) ||
    lower.includes("login-srv/login") ||
    lower.includes("/ciam/login") ||
    lower.includes("/oauth2/authorize")
  );
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
  const username =
    (typeof keys?.username === "string" && keys.username.trim()) ||
    process.env.COOKIDOO_USERNAME?.trim();
  const password =
    (typeof keys?.password === "string" && keys.password.trim()) ||
    process.env.COOKIDOO_PASSWORD?.trim();
  if (!username || !password) {
    throw new Error(
      "Identifiants Cookidoo non configurés. Enregistrez-les sur /settings (clés stockées dans Redis) ou définissez COOKIDOO_USERNAME et COOKIDOO_PASSWORD (ex. dans .env pour les scripts CLI)."
    );
  }
  return { username, password };
}

/**
 * Effectue une requête HTTP avec gestion automatique des cookies et redirections manuelles.
 * Suit jusqu'à 8 redirections, en collectant les Set-Cookie à chaque étape.
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
  const maxRedirects = init.maxRedirects ?? 8;
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
      const keepMethod = status === 307 || status === 308;
      const nextUrl = new URL(location, currentUrl).toString();
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

interface LoginTrace {
  step: string;
  startUrl: string;
  finalUrl: string;
  status: number;
  cookieNamesSet?: string[];
  bodyPreview?: string;
}

/**
 * Exécute le flow OAuth2 complet et retourne un état de session prêt à l'emploi.
 * Idempotent et concurrent-safe via `inflightLogin`.
 *
 * Quand `traceCollector` est fourni, chaque étape HTTP est consignée pour debug.
 */
async function performLogin(traceCollector?: LoginTrace[]): Promise<SessionState> {
  const { username, password } = await getCredentials();
  const jar = new CookieJar();
  const cookieSnapshot = () => {
    const all = jar.toJSON();
    return Object.entries(all).flatMap(([host, cookies]) =>
      Object.keys(cookies).map((n) => `${host}:${n}`)
    );
  };

  // 1. Démarrer le flow en demandant la page de login Cookidoo (qui redirige vers CIAM).
  const initial = await fetchWithJar(jar, `${ORIGIN}/profile/${LANGUAGE}/login`, {
    method: "GET",
    headers: {
      accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      "upgrade-insecure-requests": "1",
      "sec-fetch-dest": "document",
      "sec-fetch-mode": "navigate",
      "sec-fetch-site": "none",
      "sec-fetch-user": "?1",
    },
  });
  const loginHtml = await initial.response.text();
  traceCollector?.push({
    step: "GET /profile/<lang>/login (redirige vers CIAM)",
    startUrl: `${ORIGIN}/profile/${LANGUAGE}/login`,
    finalUrl: initial.finalUrl,
    status: initial.response.status,
    cookieNamesSet: cookieSnapshot(),
    bodyPreview: loginHtml.slice(0, 200),
  });

  const onCiam =
    initial.finalUrl.startsWith(CIAM_HOST) ||
    initial.finalUrl.startsWith(CIAM_HOST_LEGACY);
  if (!onCiam) {
    // Cas particulier : on est déjà authentifié (cookies encore valides), on a atterri sur cookidoo.fr.
    if (initial.finalUrl.startsWith(ORIGIN)) {
      const xsrfMatch = loginHtml.match(/name="_csrf"\s+value="([^"]+)"/);
      const state = await buildSession(jar, xsrfMatch?.[1] ?? null);
      return state;
    }
    throw new Error(
      `Cookidoo : redirection inattendue vers ${initial.finalUrl} pendant l'init du login.`
    );
  }

  // 2. Extraire le requestId du formulaire et l'URL d'action.
  const requestId = extractFormValue(loginHtml, "requestId");
  if (!requestId) {
    throw new Error(
      "Cookidoo : impossible de trouver le requestId du formulaire CIAM (format de page modifié)."
    );
  }
  const actionMatch = loginHtml.match(/<form[^>]+action="([^"]+)"/i);
  const action = actionMatch
    ? new URL(actionMatch[1], initial.finalUrl).toString()
    : `${CIAM_HOST}/login-srv/login`;

  // 3. POST des identifiants. CIAM rend le formulaire dans un contexte sandboxé,
  // donc le navigateur envoie `Origin: null` et pas de Referer. Reproduire ces headers
  // est crucial : sinon CIAM rejette le POST par protection CSRF et redirige vers le login.
  const body = new URLSearchParams({ requestId, username, password }).toString();
  const submit = await fetchWithJar(jar, action, {
    method: "POST",
    body,
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      origin: "null",
      "upgrade-insecure-requests": "1",
      "sec-fetch-dest": "document",
      "sec-fetch-mode": "navigate",
      "sec-fetch-site": "cross-site",
      "sec-fetch-user": "?1",
      "cache-control": "max-age=0",
    },
  });
  const submitText = await submit.response.text();
  traceCollector?.push({
    step: "POST CIAM /login-srv/login (credentials)",
    startUrl: action,
    finalUrl: submit.finalUrl,
    status: submit.response.status,
    cookieNamesSet: cookieSnapshot(),
    bodyPreview: submitText.slice(0, 200),
  });

  if (submit.response.status >= 400) {
    throw new Error(
      `Cookidoo : login refusé (HTTP ${submit.response.status}). Vérifie email/mot de passe sur /settings. URL finale : ${submit.finalUrl}`
    );
  }
  // Si on est encore sur CIAM après le POST, c'est que les identifiants ont été refusés
  // OU que CIAM a invalidé le requestId (rejeu, expiration, headers manquants).
  if (
    submit.finalUrl.toLowerCase().startsWith(CIAM_HOST.toLowerCase()) ||
    submit.finalUrl.toLowerCase().startsWith(CIAM_HOST_LEGACY.toLowerCase())
  ) {
    const looksLikeError =
      /invalid|incorrect|wrong|verrouill|locked|expired|expir(é|ee)/i.test(submitText);
    throw new Error(
      `Cookidoo : POST credentials rejeté par CIAM (URL finale : ${submit.finalUrl}). ${looksLikeError ? "Le formulaire mentionne une erreur d'identifiants ou de compte verrouillé. " : ""}Vérifie le mot de passe sur /settings ou utilise cookidoo_debug_login pour voir la trace complète.`
    );
  }

  // 4. Toujours visiter /organize/fr/my-recipes pour récupérer un XSRF token frais.
  const csrfPage = await fetchWithJar(jar, `${ORIGIN}/organize/${MARKET}/my-recipes`, {
    method: "GET",
    headers: {
      accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    },
  });
  const csrfHtml = await csrfPage.response.text();
  traceCollector?.push({
    step: "GET /organize/fr/my-recipes (récupération XSRF)",
    startUrl: `${ORIGIN}/organize/${MARKET}/my-recipes`,
    finalUrl: csrfPage.finalUrl,
    status: csrfPage.response.status,
    cookieNamesSet: cookieSnapshot(),
    bodyPreview: csrfHtml.slice(0, 200),
  });
  if (isLoginRedirect(csrfPage.finalUrl)) {
    throw new Error(
      `Cookidoo : login en apparence réussi mais session immédiatement invalidée (URL finale : ${csrfPage.finalUrl}). Cause probable : compte sans abonnement actif, ou cookies non préservés.`
    );
  }
  const xsrfFromHtml = csrfHtml.match(/name="_csrf"\s+value="([^"]+)"/)?.[1] ?? null;
  const xsrfFromHeader = csrfPage.response.headers.get("x-xsrf-token");

  return buildSession(jar, xsrfFromHeader ?? xsrfFromHtml);
}

async function buildSession(
  jar: CookieJar,
  xsrfToken: string | null
): Promise<SessionState> {
  const now = Date.now();
  const state: SessionState = {
    cookies: jar.toJSON(),
    xsrfToken,
    expiresAt: now + SESSION_TTL_SECONDS * 1000,
    loggedInAt: now,
    lastValidatedAt: now,
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
  const regex2 = new RegExp(
    `<input[^>]+value=["']([^"']+)["'][^>]+name=["']${name}["']`,
    "i"
  );
  return html.match(regex2)?.[1] ?? null;
}

/**
 * Récupère la session en cache, ou déclenche un login. `force=true` invalide
 * d'abord la session courante et reconnecte.
 */
async function getOrCreateSession(force = false): Promise<SessionState> {
  if (force) {
    await clearSession();
  } else {
    if (cachedSession && cachedSession.expiresAt > Date.now()) {
      return cachedSession;
    }
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

/**
 * Si la session est ancienne (plus d'une heure depuis le dernier check), on la
 * revalide proactivement avec un GET léger : si ça redirige vers le login, on
 * force un re-login avant la requête réelle.
 */
async function ensureFreshSession(state: SessionState): Promise<SessionState> {
  const ageMs = Date.now() - state.lastValidatedAt;
  if (ageMs < SESSION_REVALIDATE_AFTER_MS) return state;

  const jar = new CookieJar(state.cookies);
  const probe = await fetchWithJar(jar, `${ORIGIN}/profile/api/user`, {
    method: "GET",
    headers: { accept: "application/json,*/*;q=0.1" },
    maxRedirects: 4,
  });
  await probe.response.text().catch(() => undefined);

  if (probe.response.status === 200 && !isLoginRedirect(probe.finalUrl)) {
    state.cookies = jar.toJSON();
    state.lastValidatedAt = Date.now();
    await persistSession(state);
    return state;
  }
  return await getOrCreateSession(true);
}

interface CookidooRequestOptions {
  /** Si true, n'inclut pas le X-XSRF-TOKEN (utile pour les GET HTML publics). */
  skipXsrf?: boolean;
  /** Si true, retry après un re-login lors d'un 401/403/login-redirect. Défaut true. */
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
 * Re-login automatique si la session est expirée (détecté via 401/403 ou redirection
 * vers la page de login).
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
  state = await ensureFreshSession(state);

  let attempt = 0;
  let lastError: string | null = null;

  while (attempt < MAX_REQUEST_ATTEMPTS) {
    attempt++;
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
    const status = result.response.status;

    // Cas 1 : Cookidoo a redirigé vers le login (session expirée silencieusement).
    if (isLoginRedirect(result.finalUrl)) {
      await result.response.text().catch(() => undefined);
      lastError = `redirection vers ${result.finalUrl}`;
      if (!autoRelogin || attempt >= MAX_REQUEST_ATTEMPTS) {
        throw new Error(
          `Cookidoo : session expirée et re-login impossible après ${attempt} tentative(s). ${lastError}`
        );
      }
      state = await getOrCreateSession(true);
      continue;
    }

    // Cas 2 : 401/403 explicite (XSRF stale, ou session refusée).
    if (status === 401 || status === 403) {
      const errText = await result.response.text().catch(() => "");
      lastError = `${status} ${errText.slice(0, 150)}`;
      if (!autoRelogin || attempt >= MAX_REQUEST_ATTEMPTS) {
        throw new Error(`Cookidoo ${status}: ${errText.slice(0, 200)}`);
      }
      // On force un re-login (qui rafraîchit aussi le XSRF).
      state = await getOrCreateSession(true);
      continue;
    }

    if (status >= 400) {
      const errText = await result.response.text().catch(() => "");
      throw new Error(
        `Cookidoo erreur ${status} sur ${method} ${path} : ${errText.slice(0, 300)}`
      );
    }

    // Succès : on persiste la session et on lit le body.
    state.lastValidatedAt = Date.now();
    const xsrfHeader = result.response.headers.get("x-xsrf-token");
    if (xsrfHeader) state.xsrfToken = xsrfHeader;
    await persistSession(state);

    if (status === 204 || status === 205) return undefined as T;

    if (!json) {
      return (await result.response.text()) as unknown as T;
    }
    const text = await result.response.text();
    if (!text) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      // Si on attendait du JSON mais qu'on a du HTML, c'est généralement signe d'un
      // problème non détecté (ex: maintenance). On renvoie le texte brut.
      return text as unknown as T;
    }
  }

  throw new Error(
    `Cookidoo : nombre maximum de tentatives atteint (${MAX_REQUEST_ATTEMPTS})${lastError ? ` — dernière erreur : ${lastError}` : ""}`
  );
}

/**
 * GET HTML d'une page Cookidoo (utile pour scraper les pages organize/created-recipes).
 * Détecte automatiquement les redirections vers le login et déclenche un re-login.
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

/** Force une déconnexion locale (le cache + Redis). Le prochain appel reconnectera. */
export async function cookidooLogout(): Promise<void> {
  await clearSession();
}

/** Force un re-login immédiat (utile pour un endpoint /api/cookidoo/refresh). */
export async function cookidooForceRelogin(): Promise<{ ok: true; loggedInAt: number }> {
  const state = await getOrCreateSession(true);
  return { ok: true, loggedInAt: state.loggedInAt };
}

/**
 * Exécute un login complet et renvoie une trace détaillée de chaque étape HTTP
 * (URL initiale → URL finale → status → cookies posés). Utile pour diagnostiquer
 * les "redirect-to-login" silencieux. N'écrase pas la session courante en cas
 * d'échec, mais la remplace en cas de succès.
 */
export async function cookidooDebugLogin(): Promise<{
  ok: boolean;
  error?: string;
  trace: LoginTrace[];
  configuredEmail?: string;
}> {
  const trace: LoginTrace[] = [];
  const keys = await getServiceKeys("cookidoo");
  const configuredEmail = keys?.username;
  if (!keys?.username || !keys?.password) {
    return {
      ok: false,
      error: "Identifiants non configurés sur /settings.",
      trace,
      configuredEmail,
    };
  }
  await clearSession();
  if (!(await performLoginNoThrow(trace))) {
    return {
      ok: false,
      error:
        trace[trace.length - 1]?.finalUrl?.startsWith(CIAM_HOST)
          ? "POST CIAM rejeté → identifiants probablement invalides ou compte verrouillé."
          : "Échec du login (voir trace).",
      trace,
      configuredEmail: maskEmail(configuredEmail),
    };
  }
  return { ok: true, trace, configuredEmail: maskEmail(configuredEmail) };
}

async function performLoginNoThrow(trace: LoginTrace[]): Promise<boolean> {
  try {
    await performLogin(trace);
    return true;
  } catch (err) {
    trace.push({
      step: "ERROR",
      startUrl: "",
      finalUrl: err instanceof Error ? err.message : String(err),
      status: 0,
    });
    return false;
  }
}

function maskEmail(email?: string): string | undefined {
  if (!email) return undefined;
  const [user, domain] = email.split("@");
  if (!domain) return email.slice(0, 2) + "***";
  const masked =
    user.length <= 2 ? user[0] + "*" : user.slice(0, 2) + "***" + user.slice(-1);
  return `${masked}@${domain}`;
}
