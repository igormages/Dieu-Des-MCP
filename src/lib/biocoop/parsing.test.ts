import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  encodeMagentoUenc,
  extractFormKey,
  extractSearchProducts,
  parseCartSection,
} from "./parsing";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "../../..");

function decodeMagentoUenc(uenc: string): string {
  const b64 = uenc.replace(/~/g, "=").replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64, "base64").toString("utf8");
}

describe("biocoop parsing", () => {
  it("extrait form_key et uenc depuis le HAR produit", () => {
    const harPath = path.join(
      root,
      "ressources/biocoop/recherche produit + ajout pannier.har"
    );
    const har = JSON.parse(fs.readFileSync(harPath, "utf8")) as {
      log: {
        entries: Array<{
          request: { url: string };
          response: { content?: { text?: string } };
        }>;
      };
    };
    const page = har.log.entries.find((e) =>
      e.request.url.includes("viande-boeuf-sechee")
    );
    assert.ok(page?.response.content?.text);
    const key = extractFormKey(page.response.content.text);
    assert.equal(key, "iDbFrIxaDj3T8hqf");

    const add = har.log.entries.find((e) =>
      e.request.url.includes("checkout/cart/add")
    );
    assert.ok(add?.request.url);
    const uencMatch = add.request.url.match(/\/uenc\/([^/]+)\//);
    assert.ok(uencMatch);
    const decoded = decodeMagentoUenc(uencMatch[1]);
    assert.ok(decoded.includes("viande-boeuf-sechee"));
    assert.equal(
      encodeMagentoUenc(decoded).slice(0, 20),
      uencMatch[1].slice(0, 20)
    );
  });

  it("parse le panier customer/section/load du HAR", () => {
    const harPath = path.join(
      root,
      "ressources/biocoop/recherche produit + ajout pannier.har"
    );
    const har = JSON.parse(fs.readFileSync(harPath, "utf8")) as {
      log: {
        entries: Array<{
          request: { url: string };
          response: { content?: { text?: string } };
        }>;
      };
    };
    const entry = har.log.entries.find(
      (e) =>
        e.request.url.includes("customer/section/load") &&
        e.request.url.includes("sections=cart")
    );
    assert.ok(entry?.response.content?.text);
    const data = JSON.parse(entry.response.content.text);
    const cart = parseCartSection(data);
    assert.ok(cart);
    assert.equal(cart.summary_count, 1);
    assert.equal(cart.items[0]?.product_id, "27420");
    assert.equal(cart.items[0]?.product_sku, "RO2005_000");
  });

  it("extrait les produits associés depuis recommender/ajax", () => {
    const harPath = path.join(
      root,
      "ressources/biocoop/recherche produit + ajout pannier.har"
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
      e.request.url.includes("recommender/ajax")
    );
    assert.ok(entry?.response.content?.text);
    const products = extractSearchProducts(entry.response.content.text);
    assert.ok(products.length >= 3);
    assert.ok(products.some((p) => p.sku === "RO2017_000"));
  });
});
