/** Message d'aide affiché quand DataDome bloque les requêtes serveur. */
export const DATADOME_HELP =
  "DataDome bloque les requêtes depuis le serveur MCP. " +
  "Connectez-vous sur https://www.leclercdrive.fr dans Chrome, passez le captcha si demandé, " +
  "copiez une fois le cookie « datadome » (DevTools → Application → Cookies). " +
  "Sa valeur change à chaque rechargement de page dans le navigateur — c'est normal : " +
  "ce n'est pas une expiration, le serveur MCP met à jour automatiquement le cookie quand Leclerc en renvoie un nouveau.";

/** Note affichée dans les réglages / statut compte. */
export const DATADOME_ROTATION_NOTE =
  "Le cookie datadome est un jeton glissant : sa valeur change souvent dans Chrome, " +
  "mais la date d'expiration reste ~1 an. Collez-le une fois après le captcha ; inutile de le recopier à chaque rechargement.";

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
  return Boolean(extractDatadomeValue(jar));
}

/** Dernière valeur datadome trouvée dans un jar (sous-domaines inclus). */
export function extractDatadomeValue(
  jar: Record<string, Record<string, string>>
): string | undefined {
  for (const cookies of Object.values(jar)) {
    if (cookies.datadome) return cookies.datadome;
  }
  return undefined;
}

/** Met à jour le jar stocké si Leclerc a renvoyé un datadome plus récent. */
export function applyDatadomeRotation(
  stored: Record<string, Record<string, string>>,
  latestValue: string
): Record<string, Record<string, string>> {
  return mergeCookieJars(stored, {
    [DEFAULT_COOKIE_HOST]: { datadome: latestValue },
  });
}
