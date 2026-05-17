import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseStoreFromUrl } from "./store-resolver";

describe("leclercdrive store-resolver", () => {
  it("parse une URL magasin Auray fd9", () => {
    const store = parseStoreFromUrl(
      "https://fd9-courses.leclercdrive.fr/magasin-175601-175601-Auray.aspx"
    );
    assert.ok(store);
    assert.equal(store.pointLivraison, "175601");
    assert.equal(store.storePath, "magasin-175601-175601");
    assert.equal(store.storeSlug, "Auray");
    assert.equal(store.coursesHost, "fd9-courses.leclercdrive.fr");
    assert.equal(store.secureHost, "fd9-secure.leclercdrive.fr");
    assert.equal(store.eUniversContexte, 2);
  });

  it("formate un slug multi-mots", () => {
    const store = parseStoreFromUrl(
      "https://fd3-courses.leclercdrive.fr/magasin-123456-123456-saint-brieuc.aspx"
    );
    assert.ok(store);
    assert.equal(store.storeSlug, "Saint-Brieuc");
    assert.equal(store.secureHost, "fd3-secure.leclercdrive.fr");
  });

  it("retourne null pour une URL invalide", () => {
    assert.equal(parseStoreFromUrl("https://www.leclercdrive.fr/"), null);
    assert.equal(
      parseStoreFromUrl("https://fd9-courses.leclercdrive.fr/accueil.aspx"),
      null
    );
  });
});
