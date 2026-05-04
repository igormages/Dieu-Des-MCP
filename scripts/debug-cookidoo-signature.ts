/**
 * Sonde POST image/signature : affiche le message d’erreur complet (usage ponctuel).
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
for (const name of [".env", ".env.local"] as const) {
  const p = path.join(root, name);
  if (fs.existsSync(p)) loadEnv({ path: p, override: name === ".env.local" });
}

/** Valeurs à tester pour POST image/signature (le widget Cookidoo utilise `uw`). */
const sources = ["uw", "URL", "LOCAL"];

async function main(): Promise<void> {
  const { cookidooRequest, COOKIDOO } = await import("../src/lib/cookidoo/client");
  const base = `/created-recipes/${COOKIDOO.language}/image/signature`;
  const ts = Math.floor(Date.now() / 1000);
  const preset = "prod-customer-recipe-signed";
  const formats = ["PNG", "JPG", "WEBP", "GIF", "png", "jpg"];

  for (const source of sources) {
    for (const format of formats) {
      const body = { source, format, timestamp: ts, upload_preset: preset };
      try {
        const res = await cookidooRequest<{ signature?: string }>("POST", base, body);
        console.log("WIN", JSON.stringify(body), res.signature?.slice(0, 24));
        return;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const j = msg.match(/\{[\s\S]*\}/);
        if (j) {
          try {
            const p = JSON.parse(j[0]) as { message?: string };
            console.log("FAIL", JSON.stringify(body), "->", p.message?.slice(0, 280));
          } catch {
            console.log("FAIL", JSON.stringify(body), "->", msg.slice(0, 400));
          }
        } else console.log("FAIL", JSON.stringify(body), "->", msg.slice(0, 400));
      }
    }
  }
}

main().catch(console.error);
