/** Message d'aide affiché quand DataDome bloque les requêtes serveur. */
export const DATADOME_HELP =
  "DataDome bloque le fetch serveur (TLS/IP/JS). Contournement fiable : lancer « pnpm leclercdrive:harvest » " +
  "sur votre Mac (Chrome réel), se connecter, exporter la session vers Redis — le MCP Vercel réutilise ces cookies. " +
  "Coller uniquement datadome suffit rarement ; il faut la session navigateur complète.";

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
    text.includes("datadome captcha") ||
    (text.includes('"url"') && text.includes("captcha-delivery"))
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

const BASE_DATADOME_HOSTS = ["leclercdrive.fr", "www.leclercdrive.fr"];

/** Réplique datadome sur chaque host Leclerc (sous-domaines fdN-* inclus). */
export function spreadDatadomeToHosts(
  jar: Record<string, Record<string, string>>,
  extraHosts: string[] = []
): Record<string, Record<string, string>> {
  const value = extractDatadomeValue(jar);
  if (!value) return jar;

  const hosts = [
    ...new Set(
      [...BASE_DATADOME_HOSTS, ...extraHosts]
        .map((h) => h.replace(/^\./, "").toLowerCase())
        .filter(Boolean)
    ),
  ];

  let out = jar;
  for (const host of hosts) {
    out = mergeCookieJars(out, { [host]: { datadome: value } });
  }
  return out;
}

/** Parse un export navigateur : valeur seule, paires name=value, JSON jar, ou « @host valeur ». */
export function parseBrowserCookieImport(
  raw: string,
  extraHosts: string[] = []
): Record<string, Record<string, string>> {
  const trimmed = raw.trim();
  if (!trimmed) return {};

  if (trimmed.startsWith("{")) {
    const parsed = JSON.parse(trimmed) as Record<string, Record<string, string>>;
    return spreadDatadomeToHosts(parsed, extraHosts);
  }

  const hostPrefix = trimmed.match(/^@([a-z0-9.-]+)\s+(.+)$/i);
  if (hostPrefix) {
    const host = hostPrefix[1].toLowerCase();
    const rest = hostPrefix[2].trim();
    const inner = parseBrowserCookieImport(rest, extraHosts);
    return spreadDatadomeToHosts(inner, [host, ...extraHosts]);
  }

  const jar: Record<string, Record<string, string>> = {};
  if (!jar[DEFAULT_COOKIE_HOST]) jar[DEFAULT_COOKIE_HOST] = {};

  if (!trimmed.includes("=")) {
    jar[DEFAULT_COOKIE_HOST].datadome = trimmed;
    return spreadDatadomeToHosts(jar, extraHosts);
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
  return spreadDatadomeToHosts(jar, extraHosts);
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
  latestValue: string,
  extraHosts: string[] = []
): Record<string, Record<string, string>> {
  return spreadDatadomeToHosts(
    mergeCookieJars(stored, { [DEFAULT_COOKIE_HOST]: { datadome: latestValue } }),
    extraHosts
  );
}

export function maskCookieValue(value: string): string {
  if (value.length <= 12) return "••••••••";
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

export function listDatadomeHosts(
  jar: Record<string, Record<string, string>>
): string[] {
  return Object.entries(jar)
    .filter(([, cookies]) => cookies.datadome)
    .map(([host]) => host);
}
