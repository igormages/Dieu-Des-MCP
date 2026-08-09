import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  COOKIDOO_ICONS,
  buildIngredientLine,
  buildIngredientsPayload,
  buildInstructionsPayload,
  formatCookidooTime,
  formatTtsChip,
  indexIngredientsByText,
  isCookidooCustomerRecipeId,
  normalizeCookidooYieldUnitText,
  normalizeIngredientUnit,
} from "./customer-recipe-payloads";

describe("isCookidooCustomerRecipeId", () => {
  it("détecte les ULID perso 01…", () => {
    assert.equal(isCookidooCustomerRecipeId("01KQSFHCSFX63R85KHW78ZZ4XY"), true);
    assert.equal(isCookidooCustomerRecipeId("r617774"), false);
  });
});

describe("normalizeCookidooYieldUnitText", () => {
  it("normalise portions / morceaux / verres", () => {
    assert.equal(normalizeCookidooYieldUnitText(), "portion");
    assert.equal(normalizeCookidooYieldUnitText("portions"), "portion");
    assert.equal(normalizeCookidooYieldUnitText("morceaux"), "piece");
    assert.equal(normalizeCookidooYieldUnitText("verres"), "glass");
    assert.equal(normalizeCookidooYieldUnitText("piece"), "piece");
  });
});

describe("normalizeIngredientUnit", () => {
  it("mappe g / ml / c. à soupe", () => {
    assert.deepEqual(normalizeIngredientUnit("grammes"), { unit: "g", unitText: "g" });
    assert.deepEqual(normalizeIngredientUnit("ml"), { unit: "ml", unitText: "ml" });
    assert.deepEqual(normalizeIngredientUnit("c. à soupe"), { unit: "tbsp", unitText: "tbsp" });
  });
});

describe("buildIngredientsPayload + VOLUME", () => {
  it("ajoute VOLUME sur quantité + unit", () => {
    const out = buildIngredientsPayload([
      {
        name: "Groupe A",
        ingredients: [{ name: "sucre", quantity: 50, unit: "g" }],
      },
    ]);
    assert.deepEqual(out[0], { type: "INGREDIENT", text: "Groupe A" });
    assert.equal(out[1].type, "INGREDIENT");
    assert.equal(out[1].text, "50 g sucre");
    assert.deepEqual(out[1].annotations, [
      {
        type: "VOLUME",
        data: { amount: 50, unit: "g", unitText: "g" },
        position: { offset: 0, length: "50 g".length },
      },
    ]);
  });

  it("buildIngredientLine avec quantityMax", () => {
    const line = buildIngredientLine({ name: "oeufs", quantity: 2, quantityMax: 3, unit: "pièce" });
    assert.equal(line.text, "2-3 piece oeufs");
    assert.equal(line.annotations?.[0].data.amountMax, 3);
  });
});

describe("formatters TTS / time", () => {
  it("formatCookidooTime", () => {
    assert.equal(formatCookidooTime(600), "10 min");
    assert.equal(formatCookidooTime(140), "2 min 20 sec");
    assert.equal(formatCookidooTime(45), "45 sec");
  });

  it("formatTtsChip aligné HAR (temps/temp/sens/vitesse soft)", () => {
    const chip = formatTtsChip({
      time: 600,
      temperature: 40,
      speed: "soft",
      direction: "CCW",
    });
    assert.equal(
      chip,
      `10 min/40°C/${COOKIDOO_ICONS.reverse}/vitesse ${COOKIDOO_ICONS.softSpeed}`
    );
  });
});

describe("buildInstructionsPayload (HAR)", () => {
  it("étape texte seul", () => {
    const out = buildInstructionsPayload([{ text: "étape texte seulement" }]);
    assert.deepEqual(out, [{ type: "STEP", text: "étape texte seulement" }]);
  });

  it("TTS via champs plats compat", () => {
    const out = buildInstructionsPayload([
      {
        text: "Pendant cette étape on fait",
        time: 600,
        temperature: 40,
        speed: "soft",
        direction: "CCW",
      },
    ]);
    assert.equal(out[0].type, "STEP");
    assert.ok(out[0].text.includes("10 min/40°C"));
    const tts = out[0].annotations?.find((a) => a.type === "TTS");
    assert.ok(tts);
    if (tts?.type === "TTS") {
      assert.equal(tts.data.time, 600);
      assert.deepEqual(tts.data.temperature, { value: "40", unit: "C" });
      assert.equal(tts.data.speed, "soft");
      assert.equal(tts.data.direction, "CCW");
      assert.equal(tts.position.offset + tts.position.length, out[0].text.length);
    }
  });

  it("MODE dough", () => {
    const out = buildInstructionsPayload([
      {
        text: "pendant cette étape on va pétrir avec le pétrin",
        mode: { name: "dough", time: 140 },
      },
    ]);
    const mode = out[0].annotations?.find((a) => a.type === "MODE");
    assert.ok(mode);
    if (mode?.type === "MODE") {
      assert.equal(mode.name, "dough");
      assert.deepEqual(mode.data, { time: 140 });
      assert.ok(out[0].text.includes("Pétrin"));
      assert.ok(out[0].text.includes(COOKIDOO_ICONS.dough));
    }
  });

  it("MODE rice_cooker", () => {
    const out = buildInstructionsPayload([
      { text: "voici un autre mode", mode: { name: "rice_cooker" } },
    ]);
    const mode = out[0].annotations?.find((a) => a.type === "MODE");
    assert.ok(mode && mode.type === "MODE" && mode.name === "rice_cooker");
    assert.deepEqual(mode && mode.type === "MODE" ? mode.data : null, {});
  });

  it("MODE warm_up", () => {
    const out = buildInstructionsPayload([
      { text: "", mode: { name: "warm_up", temperature: 65, speed: 1 } },
    ]);
    const mode = out[0].annotations?.find((a) => a.type === "MODE");
    assert.ok(mode && mode.type === "MODE");
    if (mode?.type === "MODE") {
      assert.equal(mode.name, "warm_up");
      assert.deepEqual(mode.data.temperature, { value: "65", unit: "C" });
      assert.equal(mode.data.speed, "1");
    }
  });

  it("TTS Varoma", () => {
    const out = buildInstructionsPayload([
      {
        text: "Le mode varoma",
        manual: { time: 1800, temperature: "Varoma", speed: "soft" },
      },
    ]);
    const tts = out[0].annotations?.find((a) => a.type === "TTS");
    assert.ok(tts && tts.type === "TTS");
    if (tts?.type === "TTS") {
      assert.equal(tts.data.time, 1800);
      assert.deepEqual(tts.data.temperature, { value: "varoma" });
      assert.ok(out[0].text.includes("Varoma"));
    }
  });

  it("lien INGREDIENT + VOLUME enrichi", () => {
    const ingredients = buildIngredientsPayload([
      {
        ingredients: [
          { name: "ingrédient 1", quantity: 100, unit: "g" },
          { name: "ingrédient 2", quantity: 100, unit: "g" },
        ],
      },
    ]);
    const index = indexIngredientsByText(ingredients);
    const linked1 = ingredients[0].text;
    const linked2 = ingredients[1].text;

    const out = buildInstructionsPayload(
      [
        {
          text: `ajouter ${linked1} coupé en morceaux en julienne`,
          linkedIngredients: [linked1],
        },
        {
          text: `${linked1.replace("1", "2")} et ${linked2.replace("ingrédient 2", "de ingredient 3")} dans le pot`,
          linkedIngredients: [linked2],
        },
      ],
      index
    );

    const a0 = out[0].annotations?.find((a) => a.type === "INGREDIENT");
    assert.ok(a0 && a0.type === "INGREDIENT");
    if (a0?.type === "INGREDIENT") {
      assert.equal(typeof a0.data.description, "object");
      const desc = a0.data.description as {
        text: string;
        annotations: Array<{ type: string }>;
      };
      assert.equal(desc.text, linked1);
      assert.equal(desc.annotations[0]?.type, "VOLUME");
    }
  });

  it("deux ingrédients liés dans une étape", () => {
    const ingredients = buildIngredientsPayload([
      {
        ingredients: [
          { name: "ingrédient 2", quantity: 100, unit: "g" },
          { name: "de ingredient 3", quantity: 200, unit: "g" },
        ],
      },
    ]);
    const t1 = ingredients[0].text;
    const t2 = ingredients[1].text;
    const out = buildInstructionsPayload(
      [
        {
          text: `${t1} et ${t2} dans le pot`,
          linkedIngredients: [t1, t2],
        },
      ],
      indexIngredientsByText(ingredients)
    );
    const links = out[0].annotations?.filter((a) => a.type === "INGREDIENT") ?? [];
    assert.equal(links.length, 2);
  });
});
