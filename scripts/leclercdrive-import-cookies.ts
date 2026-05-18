/**
 * Importe des cookies exportés depuis Arc/Chrome (sans Playwright).
 *
 * Usage:
 *   pnpm leclercdrive:import-cookies -- cookies.txt
 */
import "dotenv/config";
import * as fs from "node:fs";
import { getServiceKeys } from "../src/lib/keys/store";
import { importLeclercdriveCookies } from "../src/lib/leclercdrive/import-cookies-server";

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

  const summary = await importLeclercdriveCookies(username, raw);

  console.log("✓ Cookies importés pour", username);
  console.log("  Hosts :", summary.hosts.join(", "));
  console.log("  ASP.NET_SessionId :", summary.hasAspNetSession ? "oui" : "non");
  console.log("  datadome :", summary.hasDatadome ? "oui" : "non");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
