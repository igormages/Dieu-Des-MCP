import { parseBrowserCookieImport, spreadDatadomeToHosts } from "./datadome";
import { spreadRegionalSessionCookies } from "./session-harvest";

export function parseNetscapeCookies(
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
    if (!domain.includes("leclercdrive") || !name || !value) continue;
    if (!jar[domain]) jar[domain] = {};
    jar[domain][name] = value;
  }
  return jar;
}

export function parseCookieImportRaw(
  raw: string
): Record<string, Record<string, string>> {
  const trimmed = raw.trim();
  if (!trimmed) return {};

  let jar =
    trimmed.includes("\t") && trimmed.includes("leclercdrive")
      ? parseNetscapeCookies(trimmed)
      : parseBrowserCookieImport(trimmed);

  jar = spreadRegionalSessionCookies(jar);
  jar = spreadDatadomeToHosts(jar, Object.keys(jar));
  return jar;
}

export interface CookieImportSummary {
  hosts: string[];
  hasAspNetSession: boolean;
  hasDatadome: boolean;
  cookieCount: number;
}

export function summarizeCookieJar(
  jar: Record<string, Record<string, string>>
): CookieImportSummary {
  return {
    hosts: Object.keys(jar),
    hasAspNetSession: Object.values(jar).some((c) => c["ASP.NET_SessionId"]),
    hasDatadome: Object.values(jar).some((c) => c.datadome),
    cookieCount: Object.values(jar).reduce((n, c) => n + Object.keys(c).length, 0),
  };
}
