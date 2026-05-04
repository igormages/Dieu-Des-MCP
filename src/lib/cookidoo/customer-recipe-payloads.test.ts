import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildIngredientsPayload,
  buildInstructionsPayload,
  isCookidooCustomerRecipeId,
  normalizeCookidooYieldUnitText,
} from "./customer-recipe-payloads";

describe("isCookidooCustomerRecipeId", () => {
  it("détecte les ULID perso 01…", () => {
    assert.equal(isCookidooCustomerRecipeId("01KQSFHCSFX63R85KHW78ZZ4XY"), true);
    assert.equal(isCookidooCustomerRecipeId("r617774"), false);
  });
});

describe("normalizeCookidooYieldUnitText", () => {
  it("normalise portions / personnes vers portion", () => {
    assert.equal(normalizeCookidooYieldUnitText(), "portion");
    assert.equal(normalizeCookidooYieldUnitText("  "), "portion");
    assert.equal(normalizeCookidooYieldUnitText("portions"), "portion");
    assert.equal(normalizeCookidooYieldUnitText("personnes"), "portion");
    assert.equal(normalizeCookidooYieldUnitText("portion"), "portion");
  });
});

describe("buildIngredientsPayload", () => {
  it("produit uniquement des lignes INGREDIENT avec texte", () => {
    const out = buildIngredientsPayload([
      {
        name: "Groupe A",
        ingredients: [{ name: "sucre", quantity: 50, unit: "g" }],
      },
    ]);
    assert.deepEqual(out[0], { type: "INGREDIENT", text: "Groupe A" });
    assert.deepEqual(out[1], { type: "INGREDIENT", text: "50 g sucre" });
  });
});

describe("buildInstructionsPayload", () => {
  it("étape sans réglages TM : STEP + texte uniquement", () => {
    const out = buildInstructionsPayload([{ text: "Mélanger." }]);
    assert.deepEqual(out, [{ type: "STEP", text: "Mélanger." }]);
  });

  it("réglages TM sur l’étape (sans annotations MODE)", () => {
    const out = buildInstructionsPayload([
      { text: "Mélanger." },
      {
        text: "Cuire 5 min / 100°C / vit. 2.",
        time: 300,
        temperature: 100,
        speed: 2,
      },
    ]);
    assert.deepEqual(out[0], { type: "STEP", text: "Mélanger." });
    assert.deepEqual(out[1], {
      type: "STEP",
      text: "Cuire 5 min / 100°C / vit. 2.",
      time: 300,
      temperature: 100,
      speed: 2,
    });
    assert.ok(!("annotations" in out[1]));
  });
});
