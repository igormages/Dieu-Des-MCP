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
  normalizeCustomerRecipe,
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
  it("mappe le code API et la notation FR affichée", () => {
    assert.deepEqual(normalizeIngredientUnit("grammes"), { unit: "g", unitText: "g" });
    assert.deepEqual(normalizeIngredientUnit("ml"), { unit: "ml", unitText: "ml" });
    assert.deepEqual(normalizeIngredientUnit("c. à soupe"), {
      unit: "tbsp",
      unitText: "c. à soupe",
    });
    assert.deepEqual(normalizeIngredientUnit("pièces"), { unit: "piece", unitText: "pièce" });
  });

  it("laisse passer une unité inconnue", () => {
    assert.deepEqual(normalizeIngredientUnit("botte"), { unit: "botte", unitText: "botte" });
    assert.deepEqual(normalizeIngredientUnit(), { unit: "", unitText: "" });
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
        data: { amount: 50, amountMax: 50, unit: "g", unitText: "g" },
        position: { offset: 0, length: "50 g".length },
      },
    ]);
  });

  it("buildIngredientLine avec quantityMax", () => {
    const line = buildIngredientLine({ name: "oeufs", quantity: 2, quantityMax: 3, unit: "pièce" });
    assert.equal(line.text, "2-3 pièce oeufs");
    assert.equal(line.annotations?.[0].data.amountMax, 3);
  });

  // Bug 1 : Cookidoo répond 500 unexpectederrors sur un VOLUME à unité vide.
  it("quantité sans unité → pièce (jamais d’unité vide)", () => {
    const line = buildIngredientLine({ name: "oignon", quantity: 1 });
    assert.equal(line.text, "1 pièce oignon");
    assert.deepEqual(line.annotations, [
      {
        type: "VOLUME",
        data: { amount: 1, amountMax: 1, unit: "piece", unitText: "pièce" },
        position: { offset: 0, length: "1 pièce".length },
      },
    ]);
  });

  it("sans quantité → aucune annotation VOLUME", () => {
    const line = buildIngredientLine({ name: "sel" });
    assert.equal(line.text, "sel");
    assert.equal(line.annotations, undefined);
  });

  it("la préparation suit le nom après une virgule", () => {
    const line = buildIngredientLine({
      name: "emmental",
      quantity: 80,
      unit: "g",
      preparation: "coupé en morceaux",
    });
    assert.equal(line.text, "80 g emmental, coupé en morceaux");
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
    assert.deepEqual(out, [
      { type: "STEP", text: "étape texte seulement", missedUsages: [] },
    ]);
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

  // Contrats `data` relevés en live sur les 400 validationError de l'API.
  it("MODE : complète les valeurs figées du programme machine", () => {
    const out = buildInstructionsPayload([
      { text: "Vapeur.", mode: { name: "steaming", time: 1200 } },
      { text: "Rissoler.", mode: { name: "browning", time: 300 } },
      { text: "Turbo.", mode: { name: "turbo" } },
      { text: "Mixer.", mode: { name: "blend", time: 60 } },
    ]);
    const dataOf = (i: number) => {
      const a = out[i].annotations?.find((x) => x.type === "MODE");
      return a && a.type === "MODE" ? a.data : null;
    };
    assert.deepEqual(dataOf(0), {
      time: 1200,
      speed: "1",
      direction: "CW",
      accessory: "Varoma",
    });
    assert.deepEqual(dataOf(1), {
      time: 300,
      temperature: { value: "160", unit: "C" },
      power: "Gentle",
    });
    assert.deepEqual(dataOf(2), { time: 1, pulseCount: 1 });
    assert.deepEqual(dataOf(3), { time: 60, speed: "5" });
  });

  it("MODE : erreur explicite si un champ d’intention manque", () => {
    assert.throws(
      () => buildInstructionsPayload([{ text: "Réchauffer.", mode: { name: "warm_up" } }]),
      /warm_up[\s\S]*time, temperature/
    );
    assert.throws(
      () => buildInstructionsPayload([{ text: "Pétrir.", mode: { name: "dough" } }]),
      /dough[\s\S]*time/
    );
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
      { text: "", mode: { name: "warm_up", time: 600, temperature: 65 } },
    ]);
    const mode = out[0].annotations?.find((a) => a.type === "MODE");
    assert.ok(mode && mode.type === "MODE");
    if (mode?.type === "MODE") {
      assert.equal(mode.name, "warm_up");
      assert.equal(mode.data.time, 600);
      assert.deepEqual(mode.data.temperature, { value: "65", unit: "C" });
      // vitesse figée par le programme, complétée automatiquement
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

    const out = buildInstructionsPayload(
      [
        {
          text: `ajouter ${linked1} coupé en morceaux en julienne`,
          linkedIngredients: [linked1],
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
      assert.deepEqual(a0.data.notes, []);
      // La position couvre la mention dans le texte de l’étape, pas la description.
      assert.equal(
        out[0].text.slice(a0.position.offset, a0.position.offset + a0.position.length),
        linked1
      );
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
    // Deux annotations distinctes, jamais superposées.
    assert.notEqual(links[0].position.offset, links[1].position.offset);
  });
});

// Bug 2 : la puce d’étape doit porter le poids et déclencher la balance, même
// quand l’étape est écrite en prose et que `linkedIngredients` ne contient que
// le nom de l’ingrédient.
describe("buildInstructionsPayload — usages d’ingrédients (pesée)", () => {
  const ingredients = buildIngredientsPayload([
    {
      ingredients: [
        { name: "eau", quantity: 800, unit: "g" },
        { name: "poivron rouge", quantity: 1, preparation: "coupé en lanières" },
        { name: "riz basmati", quantity: 250, unit: "g" },
        { name: "filet de poulet", quantity: 400, unit: "g", preparation: "sans peau" },
      ],
    },
  ]);
  const index = indexIngredientsByText(ingredients);

  function usages(step: Parameters<typeof buildInstructionsPayload>[0][number]) {
    const out = buildInstructionsPayload([step], index)[0];
    const links = (out.annotations ?? []).filter((a) => a.type === "INGREDIENT");
    return { out, links };
  }

  it("un nom seul donne une puce « 800 g eau » ancrée sur la mention", () => {
    const { out, links } = usages({
      text: "Mettre l'eau dans le bol.",
      linkedIngredients: ["eau"],
    });
    assert.equal(out.text, "Mettre l'eau dans le bol.");
    assert.deepEqual(out.missedUsages, []);
    assert.equal(links.length, 1);
    const link = links[0];
    assert.ok(link.type === "INGREDIENT");
    if (link.type === "INGREDIENT") {
      const desc = link.data.description as { text: string; annotations: unknown[] };
      assert.equal(desc.text, "800 g eau");
      assert.deepEqual(desc.annotations, [
        {
          type: "VOLUME",
          data: { amount: 800, amountMax: 800, unit: "g", unitText: "g" },
          position: { offset: 0, length: "800 g".length },
        },
      ]);
      assert.equal(out.text.slice(link.position.offset, link.position.offset + link.position.length), "eau");
    }
  });

  it("ancre malgré accents, casse et pluriel", () => {
    const { out, links } = usages({
      text: "Ajouter les Poivrons rouges puis mélanger.",
      linkedIngredients: ["poivron rouge"],
    });
    assert.equal(out.text, "Ajouter les Poivrons rouges puis mélanger.");
    assert.equal(links.length, 1);
    assert.equal(
      out.text.slice(links[0].position.offset, links[0].position.offset + links[0].position.length),
      "Poivrons"
    );
  });

  it("un nom absent du texte est ajouté puis annoté (jamais de texte non ancré)", () => {
    const { out, links } = usages({
      text: "Mettre le reste dans le bol.",
      linkedIngredients: ["riz basmati"],
    });
    assert.ok(out.text.endsWith("riz basmati"));
    assert.equal(links.length, 1);
    assert.equal(
      out.text.slice(links[0].position.offset, links[0].position.offset + links[0].position.length),
      "riz basmati"
    );
    assert.deepEqual(out.missedUsages, []);
  });

  it("s’ancre sur un mot porteur quand le nom complet n’est pas cité", () => {
    const { out, links } = usages({
      text: "Faire dorer le poulet 5 minutes.",
      linkedIngredients: ["filet de poulet, sans peau"],
    });
    assert.equal(out.text, "Faire dorer le poulet 5 minutes.");
    assert.equal(links.length, 1);
    assert.equal(
      out.text.slice(links[0].position.offset, links[0].position.offset + links[0].position.length),
      "poulet"
    );
    const desc = links[0].type === "INGREDIENT" ? links[0].data.description : null;
    assert.equal((desc as { text: string }).text, "400 g filet de poulet, sans peau");
  });

  it("les annotations TTS/MODE cohabitent avec les usages et restent triées", () => {
    const { out } = usages({
      text: "Cuire l'eau à la vapeur.",
      linkedIngredients: ["eau"],
      mode: { name: "steaming", time: 1200 },
    });
    const types = (out.annotations ?? []).map((a) => a.type);
    assert.deepEqual(types, ["INGREDIENT", "MODE"]);
    const offsets = (out.annotations ?? []).map((a) => a.position.offset);
    assert.deepEqual(offsets, [...offsets].sort((a, b) => a - b));
    const mode = out.annotations?.find((a) => a.type === "MODE");
    assert.ok(mode);
    if (mode) {
      assert.equal(
        out.text.slice(mode.position.offset, mode.position.offset + mode.position.length),
        `Cuisson vapeur ${COOKIDOO_ICONS.steaming}/20 min`
      );
    }
  });

  it("n’ancre pas sur un fragment de mot", () => {
    const idx = indexIngredientsByText(
      buildIngredientsPayload([{ ingredients: [{ name: "sel", quantity: 1, unit: "pincée" }] }])
    );
    const out = buildInstructionsPayload(
      [{ text: "Suivre ce conseil avant de servir.", linkedIngredients: ["sel"] }],
      idx
    )[0];
    // « sel » n’apparaît pas comme mot : on l’ajoute en fin d’étape au lieu de
    // pointer l’intérieur de « conseil ».
    assert.ok(out.text.endsWith("sel"));
    const link = out.annotations?.find((a) => a.type === "INGREDIENT");
    assert.ok(link);
    if (link) {
      assert.equal(out.text.slice(link.position.offset, link.position.offset + link.position.length), "sel");
    }
  });

  it("sans index, la description reste le texte fourni", () => {
    const out = buildInstructionsPayload([
      { text: "Ajouter le sel.", linkedIngredients: ["sel"] },
    ])[0];
    const link = out.annotations?.find((a) => a.type === "INGREDIENT");
    assert.ok(link && link.type === "INGREDIENT");
    if (link?.type === "INGREDIENT") {
      assert.equal(link.data.description, "sel");
      assert.deepEqual(link.data.notes, []);
    }
  });
});

describe("normalizeCustomerRecipe", () => {
  it("normalise la réponse created-recipes vers le format schema.org", () => {
    const out = normalizeCustomerRecipe("01KQSFHCSFX63R85KHW78ZZ4XY", {
      recipeId: "01KQSFHCSFX63R85KHW78ZZ4XY",
      recipeContent: {
        name: "Dahl",
        ingredients: [{ type: "INGREDIENT", text: "800 g eau" }],
        instructions: [
          { type: "STEP", text: "Mettre l'eau", annotations: [{ type: "INGREDIENT" }] },
        ],
        yield: { value: 4, unitText: "portion" },
        totalTime: 1800,
      },
    });
    assert.equal(out.name, "Dahl");
    assert.equal(out.identifier, "01KQSFHCSFX63R85KHW78ZZ4XY");
    assert.deepEqual(out.recipeIngredient, ["800 g eau"]);
    assert.deepEqual(out.recipeInstructions, ["Mettre l'eau"]);
    assert.deepEqual(out.recipeYield, { value: 4, unitText: "portion" });
    assert.equal((out.instructionsWithAnnotations as unknown[]).length, 1);
  });

  it("accepte aussi les clés schema.org renvoyées par certains marchés", () => {
    const out = normalizeCustomerRecipe("01KQSFHCSFX63R85KHW78ZZ4XY", {
      recipeContent: {
        recipeName: "Compote",
        recipeIngredient: ["3 pièce pommes"],
        recipeInstructions: ["Éplucher"],
        recipeYield: { value: 2, unitText: "portion" },
      },
    });
    assert.equal(out.name, "Compote");
    assert.deepEqual(out.recipeIngredient, ["3 pièce pommes"]);
    assert.deepEqual(out.recipeInstructions, ["Éplucher"]);
  });
});
