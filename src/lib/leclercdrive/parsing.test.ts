import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  extractCartFromDetailPanierHtml,
  parseProductZonesResponse,
} from "./parsing";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "../../..");

describe("leclercdrive parsing", () => {
  it("extrait le panier depuis detail-panier HAR", () => {
    const harPath = path.join(
      root,
      "ressources/leclercdrive/voir pannier - récupérer pannier.har"
    );
    const har = JSON.parse(fs.readFileSync(harPath, "utf8")) as {
      log: {
        entries: Array<{
          request: { url: string };
          response: { content?: { text?: string } };
        }>;
      };
    };
    const entry = har.log.entries.find((e) =>
      e.request.url.includes("detail-panier.aspx")
    );
    assert.ok(entry?.response.content?.text);
    const cart = extractCartFromDetailPanierHtml(entry.response.content.text);
    assert.ok(cart);
    assert.equal(cart.iQuantitePanier, 3);
    assert.equal(cart.lstProduitsLight.length, 2);
    assert.equal(cart.lstProduitsLight[0]?.iIdProduit, 120488);
  });

  it("parse fiche-produit-zones HAR", () => {
    const harPath = path.join(
      root,
      "ressources/leclercdrive/recherche - ajout pannier- augmentation des qte.har"
    );
    const har = JSON.parse(fs.readFileSync(harPath, "utf8")) as {
      log: {
        entries: Array<{
          request: { url: string };
          response: { content?: { text?: string } };
        }>;
      };
    };
    const entry = har.log.entries.find((e) =>
      e.request.url.includes("fiche-produit-zones.ashz")
    );
    assert.ok(entry?.response.content?.text);
    const raw = JSON.parse(entry.response.content.text);
    const zones = parseProductZonesResponse(raw);
    assert.ok(zones?.fpLibelleProduit?.lblLg1?.includes("Riz"));
  });
});
