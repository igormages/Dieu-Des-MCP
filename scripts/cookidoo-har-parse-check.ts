/**
 * Vérifie l’extraction des tuiles « Mes créations » sur un HAR local (pas de réseau, pas de session).
 * pnpm run cookidoo:har-check
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { extractAllRecipeTiles } from "../src/lib/cookidoo/parsing";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const harPath = path.join(
  root,
  "ressources/cookidoo/liste de mes recettes que j'ai ajouté.har"
);

const har = JSON.parse(fs.readFileSync(harPath, "utf8")) as {
  log: { entries: Array<{ request: { url: string; method: string }; response: { content?: { text?: string; mimeType?: string } } }> };
};

const entry = har.log.entries.find(
  (e) =>
    e.request.url.endsWith("/created-recipes/fr-FR") &&
    e.request.method === "GET" &&
    e.response.content?.mimeType === "text/html"
);

if (!entry?.response.content?.text) {
  console.error("HAR : entrée HTML /created-recipes/fr-FR introuvable.");
  process.exit(1);
}

const tiles = extractAllRecipeTiles(entry.response.content.text);
const customer = tiles.filter((t) => /^01[A-Za-z0-9]{24}$/.test(t.id));

if (customer.length < 1) {
  console.error("Échec : aucune tuile ULID (id cr-…) extraite — regex ou HTML à revoir.");
  process.exit(1);
}

const expectedId = "01K9AHQB0T0YY4HYK5NACWC58M";
const match = customer.find((t) => t.id === expectedId);
if (!match || !match.title.includes("Bœuf teriyaki")) {
  console.error("Échec : ID ou titre attendu du HAR ne correspond pas.", customer[0]);
  process.exit(1);
}

console.log(`OK — ${customer.length} recette(s) perso extraite(s) du HAR (ex. « ${match.title.trim()} »).`);
