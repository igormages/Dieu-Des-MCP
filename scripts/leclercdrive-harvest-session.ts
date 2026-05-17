/**
 * Harvest session Leclerc Drive via navigateur réel (contournement DataDome).
 *
 * DataDome exige TLS + JS + cookies de session issus d'un vrai Chrome.
 * Ce script ouvre le magasin, vous connectez manuellement, puis exporte
 * tous les cookies vers Redis (même stockage que le MCP sur Vercel).
 *
 * Usage:
 *   pnpm leclercdrive:harvest
 *
 * Prérequis: LECLERCDRIVE_STORE_URL ou magasin Auray par défaut,
 * KV_REST_API_URL + KV_REST_API_TOKEN, identifiants dans /settings.
 */
import "dotenv/config";
import * as readline from "node:readline";
import { chromium } from "playwright";
import { getServiceKeys } from "../src/lib/keys/store";
import { playwrightCookiesToJar } from "../src/lib/leclercdrive/session-harvest";
import {
  persistBrowserCookies,
  persistHarvestedSession,
} from "../src/lib/leclercdrive/client";

const DEFAULT_STORE_URL =
  "https://fd9-courses.leclercdrive.fr/magasin-175601-175601-Auray.aspx";

function waitForEnter(prompt: string): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, () => {
      rl.close();
      resolve();
    });
  });
}

async function main() {
  const keys = await getServiceKeys("leclercdrive");
  const username = keys?.username?.trim() || process.env.LECLERCDRIVE_USERNAME?.trim();
  if (!username) {
    console.error("Configurez username/password sur /settings ou dans .env");
    process.exit(1);
  }

  const storeUrl =
    keys?.storeUrl?.trim() ||
    process.env.LECLERCDRIVE_STORE_URL?.trim() ||
    DEFAULT_STORE_URL;

  console.log("Ouverture de Chrome (Playwright)…");
  console.log("URL :", storeUrl);
  console.log("");
  console.log("Étapes :");
  console.log("  1. Passez le captcha DataDome si demandé");
  console.log("  2. Connectez-vous à votre compte Leclerc");
  console.log("  3. Vérifiez que le magasin / panier s’affiche");
  console.log("");

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    locale: "fr-FR",
    viewport: { width: 1280, height: 900 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  await page.goto(storeUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });

  await waitForEnter(
    "Quand vous êtes connecté et sur le drive, appuyez sur Entrée pour exporter la session… "
  );

  const cookies = await context.cookies();
  const jar = playwrightCookiesToJar(cookies);

  const datadome = Object.values(jar).some((c) => c.datadome);
  const sessionId = Object.values(jar).some((c) => c["ASP.NET_SessionId"]);

  if (!datadome) {
    console.warn("⚠ Cookie datadome absent — export peut échouer sur Vercel.");
  }
  if (!sessionId) {
    console.warn("⚠ ASP.NET_SessionId absent — êtes-vous bien connecté ?");
  }

  await persistBrowserCookies(username, jar);
  await persistHarvestedSession(jar);

  console.log("");
  console.log("✓ Session exportée vers Redis pour", username);
  console.log("  Hosts :", Object.keys(jar).join(", "));
  console.log("  Relancez le MCP sur Vercel — pas besoin de recoller le datadome.");

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
