export function parseNetscapeBiocoopCookies(
  text: string
): Record<string, Record<string, string>> {
  const jar: Record<string, Record<string, string>> = {};
  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const cols = line.split("\t");
    if (cols.length < 7) continue;
    const domain = cols[0].trim().replace(/^\./, "").toLowerCase();
    const name = cols[5]?.trim();
    const value = cols[6]?.trim();
    if (!domain.includes("biocoop") || !name || !value) continue;
    if (!jar[domain]) jar[domain] = {};
    jar[domain][name] = value;
  }
  return jar;
}

function parseCookieHeaderPairs(raw: string): Record<string, Record<string, string>> {
  const jar: Record<string, Record<string, string>> = {};
  const host = "www.biocoop.fr";
  jar[host] = {};
  for (const part of raw.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (name) jar[host][name] = value;
  }
  return jar;
}

export function parseBiocoopCookieImportRaw(
  raw: string
): Record<string, Record<string, string>> {
  const trimmed = raw.trim();
  if (!trimmed) return {};

  if (trimmed.includes("\t") && trimmed.toLowerCase().includes("biocoop")) {
    return parseNetscapeBiocoopCookies(trimmed);
  }

  if (trimmed.includes("=") && !trimmed.includes("\n")) {
    return parseCookieHeaderPairs(trimmed);
  }

  const jar: Record<string, Record<string, string>> = {};
  for (const line of trimmed.split("\n")) {
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const name = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (!name) continue;
    const host = "www.biocoop.fr";
    if (!jar[host]) jar[host] = {};
    jar[host][name] = value;
  }
  return jar;
}

export function summarizeBiocoopCookieJar(
  jar: Record<string, Record<string, string>>
): {
  hosts: string[];
  hasPhpSession: boolean;
  hasFormKey: boolean;
  cookieCount: number;
} {
  return {
    hosts: Object.keys(jar),
    hasPhpSession: Object.values(jar).some(
      (c) => c.PHPSESSID || c.phpsessid
    ),
    hasFormKey: Object.values(jar).some((c) => c.form_key),
    cookieCount: Object.values(jar).reduce((n, c) => n + Object.keys(c).length, 0),
  };
}
