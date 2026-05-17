import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { LECLERC_PORTAL_URL, storePageUrl } from "./navigation";

describe("leclercdrive navigation", () => {
  it("utilise www comme portail d'entrée", () => {
    assert.equal(LECLERC_PORTAL_URL, "https://www.leclercdrive.fr/");
  });

  it("construit l'URL magasin régionale", () => {
    assert.equal(
      storePageUrl({
        username: "u",
        password: "p",
        pointLivraison: "175601",
        storePath: "magasin-175601-175601",
        storeSlug: "Auray",
        coursesHost: "fd9-courses.leclercdrive.fr",
        secureHost: "fd9-secure.leclercdrive.fr",
        eUniversContexte: 2,
      }),
      "https://fd9-courses.leclercdrive.fr/magasin-175601-175601-Auray.aspx"
    );
  });
});
