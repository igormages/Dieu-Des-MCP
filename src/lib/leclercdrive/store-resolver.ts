import { getKvClient } from "@/lib/keys/store";
import type { LeclercDriveConfig } from "./types";

const STORE_CACHE_PREFIX = "leclercdrive:store:";
const SILO_MAX = 15;

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";

export interface ResolvedStoreContext {
  pointLivraison: string;
  storePath: string;
  storeSlug: string;
  coursesHost: string;
  secureHost: string;
  eUniversContexte: number;
}

export interface StoreOverrides {
  pointLivraison?: string;
  storePath?: string;
  storeSlug?: string;
  coursesHost?: string;
  secureHost?: string;
  eUniversContexte?: number;
}

function storeCacheKey(username: string): string {
  return `${STORE_CACHE_PREFIX}${username.trim().toLowerCase()}`;
}

export async function loadCachedStore(username: string): Promise<ResolvedStoreContext | null> {
  const kv = getKvClient();
  if (!kv) return null;
  return kv.get<ResolvedStoreContext>(storeCacheKey(username));
}

export async function persistStoreCache(
  username: string,
  store: ResolvedStoreContext
): Promise<void> {
  const kv = getKvClient();
  if (!kv) return;
  await kv.set(storeCacheKey(username), store);
}

/** Parse une URL magasin Leclerc Drive (ex. …/magasin-175601-175601-Auray.aspx). */
export function parseStoreFromUrl(url: string): ResolvedStoreContext | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    if (!host.includes("leclercdrive.fr")) return null;

    const coursesMatch = host.match(/^fd(\d+)-courses\.leclercdrive\.fr$/i);
    const silo = coursesMatch?.[1];
    if (!silo) return null;

    const pathMatch = parsed.pathname.match(
      /\/magasin-(\d+)-(\d+)-([^/]+)\.aspx$/i
    );
    if (!pathMatch) return null;

    const pointLivraison = pathMatch[1];
    const storeId = pathMatch[2];
    const slugRaw = pathMatch[3];

    return {
      pointLivraison,
      storePath: `magasin-${pointLivraison}-${storeId}`,
      storeSlug: formatStoreSlug(slugRaw),
      coursesHost: `fd${silo}-courses.leclercdrive.fr`,
      secureHost: `fd${silo}-secure.leclercdrive.fr`,
      eUniversContexte: 2,
    };
  } catch {
    return null;
  }
}

function formatStoreSlug(raw: string): string {
  return raw
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("-");
}

function parseConnecterResponse(text: string): {
  redirectUrl?: string;
  loginFailed: boolean;
} {
  try {
    const json = JSON.parse(text) as {
      CompteRendu?: { iCompteRendu?: number };
      objDonneesReponse?: { sUrlRedirection?: string; iTypeConnexion?: number };
    };
    if (json.CompteRendu?.iCompteRendu === -1) {
      return { loginFailed: true };
    }
    const redirect = json.objDonneesReponse?.sUrlRedirection;
    if (redirect) return { redirectUrl: redirect, loginFailed: false };
    const type = json.objDonneesReponse?.iTypeConnexion;
    if (type === 1 || type === 2) return { loginFailed: false };
    return { loginFailed: false };
  } catch {
    return { loginFailed: false };
  }
}

async function tryConnectOnSilo(
  silo: number,
  username: string,
  password: string
): Promise<{ store: ResolvedStoreContext | null; cookies: Record<string, Record<string, string>> }> {
  const secureHost = `fd${silo}-secure.leclercdrive.fr`;
  const coursesHost = `fd${silo}-courses.leclercdrive.fr`;
  const origin = `https://${coursesHost}`;

  const loginBody = {
    sLogin: username,
    sMotDePasse: password,
    fResterConnecte: true,
    sCaptchaReponse: null as string | null,
    eUniversContexte: 2,
  };

  const res = await fetch(`https://${secureHost}/connecter.ashz`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      "x-requested-with": "XMLHttpRequest",
      "user-agent": USER_AGENT,
      accept: "application/json, text/javascript, */*; q=0.01",
      origin,
      referer: `${origin}/`,
    },
    body: `d=${encodeURIComponent(JSON.stringify(loginBody))}`,
  });

  const cookies = ingestResponseCookies(secureHost, res);
  const text = await res.text();
  const parsed = parseConnecterResponse(text);
  if (parsed.loginFailed) return { store: null, cookies };

  if (parsed.redirectUrl) {
    const store = parseStoreFromUrl(parsed.redirectUrl);
    if (store) return { store, cookies };
  }

  const estRes = await fetch(`https://${secureHost}/drive/estconnecte.ashz`, {
    method: "POST",
    headers: {
      cookie: buildCookieHeader(cookies, secureHost),
      origin,
      referer: `${origin}/`,
      "user-agent": USER_AGENT,
    },
  });
  ingestResponseCookies(secureHost, estRes, cookies);

  const estText = await estRes.text();
  const store = parseStoreFromEstConnecte(estText, silo);
  return { store, cookies };
}

function parseStoreFromEstConnecte(
  text: string,
  silo: number
): ResolvedStoreContext | null {
  try {
    const json = JSON.parse(text) as {
      objDonneesReponse?: { sNoPL?: string; sNomMagasin?: string };
    };
    const pl = json.objDonneesReponse?.sNoPL;
    const nom = json.objDonneesReponse?.sNomMagasin;
    if (!pl || !nom) return null;
    return {
      pointLivraison: String(pl),
      storePath: `magasin-${pl}-${pl}`,
      storeSlug: formatStoreSlug(nom.replace(/\s+/g, "-")),
      coursesHost: `fd${silo}-courses.leclercdrive.fr`,
      secureHost: `fd${silo}-secure.leclercdrive.fr`,
      eUniversContexte: 2,
    };
  } catch {
    return null;
  }
}

function ingestResponseCookies(
  host: string,
  response: Response,
  existing?: Record<string, Record<string, string>>
): Record<string, Record<string, string>> {
  const store = existing ? { ...existing } : {};
  const setCookies = extractSetCookies(response.headers);
  for (const raw of setCookies) {
    const parsed = parseSetCookie(raw);
    if (!parsed) continue;
    const cookieHost = (parsed.domain ?? host).replace(/^\./, "");
    if (!store[cookieHost]) store[cookieHost] = {};
    if (parsed.value === "" || parsed.expired) {
      delete store[cookieHost][parsed.name];
    } else {
      store[cookieHost][parsed.name] = parsed.value;
    }
  }
  return store;
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
    }
  }
  return { name, value, domain, expired };
}

function buildCookieHeader(
  jar: Record<string, Record<string, string>>,
  host: string
): string {
  const parts: string[] = [];
  const seen = new Set<string>();
  for (const [storeHost, cookies] of Object.entries(jar)) {
    if (host === storeHost || host.endsWith(`.${storeHost}`)) {
      for (const [name, value] of Object.entries(cookies)) {
        if (seen.has(name)) continue;
        seen.add(name);
        parts.push(`${name}=${value}`);
      }
    }
  }
  return parts.join("; ");
}

/**
 * Découvre le magasin et la région (fdN) via connecter.ashz sur les silos Leclerc.
 * Nécessite uniquement email + mot de passe.
 */
export async function discoverStoreByLogin(
  username: string,
  password: string
): Promise<ResolvedStoreContext> {
  for (let silo = 1; silo <= SILO_MAX; silo++) {
    const { store } = await tryConnectOnSilo(silo, username, password);
    if (store) {
      await persistStoreCache(username, store);
      return store;
    }
  }
  throw new Error(
    "Leclerc Drive : impossible de détecter automatiquement votre magasin. Vérifiez vos identifiants ou renseignez manuellement pointLivraison et coursesHost dans les réglages."
  );
}

export function mergeStoreConfig(
  username: string,
  password: string,
  overrides: StoreOverrides,
  resolved: ResolvedStoreContext
): LeclercDriveConfig {
  return {
    username,
    password,
    pointLivraison: overrides.pointLivraison ?? resolved.pointLivraison,
    storePath: overrides.storePath ?? resolved.storePath,
    storeSlug: overrides.storeSlug ?? resolved.storeSlug,
    coursesHost: overrides.coursesHost ?? resolved.coursesHost,
    secureHost: overrides.secureHost ?? resolved.secureHost,
    eUniversContexte: overrides.eUniversContexte ?? resolved.eUniversContexte,
  };
}

export function hasFullStoreOverrides(overrides: StoreOverrides): boolean {
  return Boolean(
    overrides.pointLivraison &&
      overrides.storePath &&
      overrides.storeSlug &&
      overrides.coursesHost &&
      overrides.secureHost
  );
}

export async function resolveStoreContext(
  username: string,
  password: string,
  overrides: StoreOverrides
): Promise<ResolvedStoreContext> {
  if (hasFullStoreOverrides(overrides)) {
    return {
      pointLivraison: overrides.pointLivraison!,
      storePath: overrides.storePath!,
      storeSlug: overrides.storeSlug!,
      coursesHost: overrides.coursesHost!,
      secureHost: overrides.secureHost!,
      eUniversContexte: overrides.eUniversContexte ?? 2,
    };
  }

  const cached = await loadCachedStore(username);
  if (cached) {
    return {
      pointLivraison: overrides.pointLivraison ?? cached.pointLivraison,
      storePath: overrides.storePath ?? cached.storePath,
      storeSlug: overrides.storeSlug ?? cached.storeSlug,
      coursesHost: overrides.coursesHost ?? cached.coursesHost,
      secureHost: overrides.secureHost ?? cached.secureHost,
      eUniversContexte: overrides.eUniversContexte ?? cached.eUniversContexte,
    };
  }

  return discoverStoreByLogin(username, password);
}
