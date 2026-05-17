/** Message d'aide affiché quand DataDome bloque les requêtes serveur. */
export const DATADOME_HELP =
  "DataDome bloque les requêtes depuis le serveur MCP. " +
  "Connectez-vous sur https://www.leclercdrive.fr dans Chrome (même compte), passez le captcha si demandé, " +
  "puis copiez le cookie « datadome » (DevTools → Application → Cookies → leclercdrive.fr) " +
  "dans /settings → Leclerc Drive → Cookie DataDome, ou appelez leclercdrive_set_browser_cookies avec tous les cookies.";

export class DataDomeBlockedError extends Error {
  constructor(message = DATADOME_HELP) {
    super(message);
    this.name = "DataDomeBlockedError";
  }
}

export function detectDataDomeBlock(
  finalUrl: string,
  status: number,
  body: string,
  headers?: Headers
): boolean {
  const url = finalUrl.toLowerCase();
  const text = body.toLowerCase();

  if (url.includes("captcha-delivery.com") || url.includes("geo.captcha")) {
    return true;
  }
  if (
    text.includes("captcha-delivery.com") ||
    text.includes("geo.captcha-delivery") ||
    text.includes("datadome captcha")
  ) {
    return true;
  }
  if (headers) {
    const ddBlock = headers.get("x-dd-b");
    if (ddBlock === "1") return true;
  }
  if (
    status === 403 &&
    (text.includes("datadome") || text.includes("captcha-delivery"))
  ) {
    return true;
  }
  return false;
}

const DEFAULT_COOKIE_HOST = "leclercdrive.fr";

/** Parse un export navigateur : valeur seule, paires name=value, ou JSON jar. */
export function parseBrowserCookieImport(
  raw: string
): Record<string, Record<string, string>> {
  const trimmed = raw.trim();
  if (!trimmed) return {};

  if (trimmed.startsWith("{")) {
    const parsed = JSON.parse(trimmed) as Record<string, Record<string, string>>;
    return parsed;
  }

  const jar: Record<string, Record<string, string>> = {};
  if (!jar[DEFAULT_COOKIE_HOST]) jar[DEFAULT_COOKIE_HOST] = {};

  if (!trimmed.includes("=")) {
    jar[DEFAULT_COOKIE_HOST].datadome = trimmed;
    return jar;
  }

  for (const segment of trimmed.split(";")) {
    const part = segment.trim();
    if (!part) continue;
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (name && value) jar[DEFAULT_COOKIE_HOST][name] = value;
  }
  return jar;
}

export function mergeCookieJars(
  base: Record<string, Record<string, string>>,
  extra: Record<string, Record<string, string>>
): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const [host, cookies] of Object.entries(base)) {
    out[host] = { ...cookies };
  }
  for (const [host, cookies] of Object.entries(extra)) {
    if (!out[host]) out[host] = {};
    Object.assign(out[host], cookies);
  }
  return out;
}

export function hasDatadomeCookie(
  jar: Record<string, Record<string, string>>
): boolean {
  for (const cookies of Object.values(jar)) {
    if (cookies.datadome) return true;
  }
  return false;
}
