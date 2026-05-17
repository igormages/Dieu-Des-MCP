/**
 * Exporte la session Leclerc Drive vers Redis pour le MCP (Vercel).
 *
 * Modes (LECLERCDRIVE_HARVEST_MODE) :
 *   cdp       — recommandé : se connecte à VOTRE Arc/Chrome déjà ouvert (même empreinte)
 *   playwright — lance un Chromium Playwright (souvent détecté par DataDome, déconseillé)
 *
 * Mode CDP (Arc) :
 *   1. Quittez Arc complètement
 *   2. Lancez : /Applications/Arc.app/Contents/MacOS/Arc --remote-debugging-port=9222
 *   3. Sur www.leclercdrive.fr : connectez-vous, choisissez le magasin
 *   4. pnpm leclercdrive:harvest
 *
 * Usage:
 *   pnpm leclercdrive:harvest
 */
import "dotenv/config";
import * as readline from "node:readline";
import { chromium, type Browser, type BrowserContext } from "playwright";
import { getServiceKeys } from "../src/lib/keys/store";
import { playwrightCookiesToJar } from "../src/lib/leclercdrive/session-harvest";
import {
  persistBrowserCookies,
  persistHarvestedSession,
} from "../src/lib/leclercdrive/client";
import { LECLERC_PORTAL_URL } from "../src/lib/leclercdrive/navigation";

const DEFAULT_CDP_URL = "http://127.0.0.1:9222";

function waitForEnter(prompt: string): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, () => {
      rl.close();
      resolve();
    });
  });
}

async function exportSession(
  username: string,
  context: BrowserContext,
  ownsBrowser: boolean,
  browser?: Browser
) {
  const cookies = await context.cookies();
  const jar = playwrightCookiesToJar(cookies);

  if (!Object.values(jar).some((c) => c.datadome)) {
    console.warn("⚠ Cookie datadome absent.");
  }
  if (!Object.values(jar).some((c) => c["ASP.NET_SessionId"])) {
    console.warn("⚠ ASP.NET_SessionId absent — êtes-vous connecté sur le drive ?");
  }

  await persistBrowserCookies(username, jar);
  await persistHarvestedSession(jar);

  console.log("");
  console.log("✓ Session exportée vers Redis pour", username);
  console.log("  Hosts :", Object.keys(jar).join(", "));

  if (ownsBrowser && browser) {
    await browser.close();
  } else {
    await browser?.close();
  }
}

async function harvestViaCdp(cdpUrl: string, username: string) {
  console.log("Connexion à votre navigateur via CDP…");
  console.log("URL CDP :", cdpUrl);
  console.log("");
  console.log("→ Utilisez VOTRE Arc/Chrome (même empreinte TLS/JS que d’habitude).");
  console.log("→ Si ce n’est pas fait : ouvrez www.leclercdrive.fr, connectez-vous, choisissez le magasin.");
  console.log("");

  let browser: Browser;
  try {
    browser = await chromium.connectOverCDP(cdpUrl);
  } catch {
    console.error("");
    console.error("Impossible de se connecter au port de débogage.");
    console.error("");
    console.error("Arc (recommandé) — quittez Arc puis :");
    console.error('  /Applications/Arc.app/Contents/MacOS/Arc --remote-debugging-port=9222');
    console.error("");
    console.error("Chrome :");
    console.error('  open -a "Google Chrome" --args --remote-debugging-port=9222');
    console.error("");
    console.error("Puis reconnectez-vous sur www.leclercdrive.fr avant de relancer ce script.");
    process.exit(1);
  }

  const context = browser.contexts()[0] ?? (await browser.newContext());
  const leclercPage = context.pages().find((p) => p.url().includes("leclercdrive"));

  if (!leclercPage) {
    console.log("Ouverture de www.leclercdrive.fr dans un nouvel onglet de votre navigateur…");
    const page = await context.newPage();
    await page.goto(LECLERC_PORTAL_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
  } else {
    console.log("Onglet Leclerc trouvé :", leclercPage.url());
  }

  await waitForEnter(
    "Quand vous êtes connecté sur le drive (après redirection depuis www), appuyez sur Entrée… "
  );

  await exportSession(username, context, false, browser);
}

async function harvestViaPlaywright(username: string) {
  console.warn("");
  console.warn("⚠ Mode Playwright : Chromium automatisé, souvent détecté par DataDome.");
  console.warn("  Préférez le mode CDP (défaut) avec votre Arc : pnpm leclercdrive:harvest");
  console.warn("");

  const browser = await chromium.launch({
    headless: false,
    args: ["--disable-blink-features=AutomationControlled"],
  });
  const context = await browser.newContext({
    locale: "fr-FR",
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();
  await page.goto(LECLERC_PORTAL_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });

  await waitForEnter(
    "Quand vous êtes connecté sur le drive, appuyez sur Entrée… "
  );

  await exportSession(username, context, true, browser);
}

async function main() {
  const keys = await getServiceKeys("leclercdrive");
  const username = keys?.username?.trim() || process.env.LECLERCDRIVE_USERNAME?.trim();
  if (!username) {
    console.error("Configurez username/password sur /settings ou dans .env");
    process.exit(1);
  }

  const mode = (process.env.LECLERCDRIVE_HARVEST_MODE ?? "cdp").toLowerCase();
  const cdpUrl = process.env.LECLERCDRIVE_CDP_URL?.trim() || DEFAULT_CDP_URL;

  if (mode === "playwright") {
    await harvestViaPlaywright(username);
  } else {
    await harvestViaCdp(cdpUrl, username);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
