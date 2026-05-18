/**
 * Importe des cookies exportés depuis Arc/Chrome (sans Playwright).
 *
 * Formats acceptés :
 *   - Valeur datadome seule
 *   - Chaîne "name=value; name2=value2"
 *   - Fichier JSON jar (voir leclercdrive_set_browser_cookies)
 *   - Fichier Netscape cookies.txt (extension « Get cookies.txt LOCALLY »)
 *
 * Usage:
 *   pnpm leclercdrive:import-cookies -- datadome=xxx
 *   pnpm leclercdrive:import-cookies -- cookies.txt
 */
import "dotenv/config";
import * as fs from "node:fs";
import { getServiceKeys } from "../src/lib/keys/store";
import { parseBrowserCookieImport, spreadDatadomeToHosts } from "../src/lib/leclercdrive/datadome";
import { spreadRegionalSessionCookies } from "../src/lib/leclercdrive/session-harvest";
import {
  persistBrowserCookies,
  persistHarvestedSession,
} from "../src/lib/leclercdrive/client";

function parseNetscapeCookies(text: string): Record<string, Record<string, string>> {
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

function resolveImportArg(): string | undefined {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  return args[args.length - 1];
}

async function main() {
  const arg = resolveImportArg();
  if (!arg) {
    console.error("Usage: pnpm leclercdrive:import-cookies -- <fichier.txt|cookie-string>");
    process.exit(1);
  }

  const keys = await getServiceKeys("leclercdrive");
  const username = keys?.username?.trim() || process.env.LECLERCDRIVE_USERNAME?.trim();
  if (!username) {
    console.error("Configurez username sur /settings");
    process.exit(1);
  }

  let raw = arg;
  if (fs.existsSync(arg)) {
    raw = fs.readFileSync(arg, "utf8");
  }

  let jar =
    raw.includes("\t") && raw.includes("leclercdrive")
      ? parseNetscapeCookies(raw)
      : parseBrowserCookieImport(raw);

  jar = spreadRegionalSessionCookies(jar);
  jar = spreadDatadomeToHosts(jar, Object.keys(jar));

  if (Object.keys(jar).length === 0) {
    console.error("Aucun cookie leclercdrive parsé.");
    process.exit(1);
  }

  await persistBrowserCookies(username, jar);
  await persistHarvestedSession(jar);
  const hasSession = Object.values(jar).some((c) => c["ASP.NET_SessionId"]);
  const hasDatadome = Object.values(jar).some((c) => c.datadome);

  console.log("✓ Cookies importés pour", username);
  console.log("  Hosts :", Object.keys(jar).join(", "));
  console.log("  ASP.NET_SessionId :", hasSession ? "oui" : "non");
  console.log("  datadome :", hasDatadome ? "oui" : "non");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
