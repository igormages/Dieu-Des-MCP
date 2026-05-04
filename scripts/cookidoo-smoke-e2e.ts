/**
 * Smoke E2E Cookidoo : même session Redis que le serveur MCP (Upstash / env du projet).
 *
 * Usage :
 *   COOKIDOO_E2E=1 pnpm exec tsx scripts/cookidoo-smoke-e2e.ts
 *
 * Optionnel : COOKIDOO_E2E_DELETE=1 supprime la recette de test à la fin.
 *
 * Même prérequis que le serveur MCP : identifiants Cookidoo enregistrés (ex. /settings)
 * + Redis/Upstash si la session y est stockée.
 */
import {
  COOKIDOO,
  cookidooForceRelogin,
  cookidooRequest,
  cookidooGetHtml,
} from "../src/lib/cookidoo/client";
import { buildIngredientsPayload, buildInstructionsPayload } from "../src/lib/cookidoo/customer-recipe-payloads";
import { extractAllRecipeTiles } from "../src/lib/cookidoo/parsing";

async function main(): Promise<void> {
  if (process.env.COOKIDOO_E2E !== "1") {
    console.error(
      "Définir COOKIDOO_E2E=1 pour lancer le flux réel (session Cookidoo via Redis comme le MCP)."
    );
    process.exit(1);
  }

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const title = `MCP E2E ${stamp}`;

  console.log("1) Revalidation session…");
  await cookidooForceRelogin();

  console.log("2) POST création recette…");
  const created = await cookidooRequest<{ recipeId?: string }>(
    "POST",
    `/created-recipes/${COOKIDOO.language}`,
    { recipeName: title },
    { referer: `${COOKIDOO.origin}/created-recipes/${COOKIDOO.language}` }
  );
  const recipeId = created.recipeId;
  if (!recipeId) {
    console.error("Pas de recipeId :", created);
    process.exit(1);
  }
  console.log("   recipeId =", recipeId);

  const base = `/created-recipes/${COOKIDOO.language}/${recipeId}`;
  const ingredientGroups = [
    {
      name: "Pour le test",
      ingredients: [
        { name: "farine", quantity: 100, unit: "g" },
        { name: "eau", quantity: 50, unit: "ml" },
      ],
    },
  ];
  const steps = [
    { text: "Mélanger." },
    {
      text: "Cuire 5 min / 100°C / vit. 2.",
      time: 300,
      temperature: 100,
      speed: 2,
    },
  ];

  console.log("3) PATCH ingrédients + instructions (+ réglages)…");
  await cookidooRequest("PATCH", base, { ingredients: buildIngredientsPayload(ingredientGroups) });
  await cookidooRequest("PATCH", base, { instructions: buildInstructionsPayload(steps) });
  await cookidooRequest("PATCH", base, {
    totalTime: 600,
    prepTime: 120,
    yield: { value: 2, unitText: "portions" },
    tools: ["TM7"],
    description: "Recette de test automatisé MCP.",
    difficulty: "easy",
  });

  console.log("4) Liste « Mes créations » (HTML)…");
  const html = await cookidooGetHtml(`/created-recipes/${COOKIDOO.language}`);
  const tiles = extractAllRecipeTiles(html);
  const found = tiles.find((t) => t.id === recipeId || t.title.includes("MCP E2E"));
  if (!found || found.id !== recipeId) {
    console.warn(
      "   Annonce : la recette créée n’a pas été retrouvée dans le HTML (pagination ou délai). Tuiles :",
      tiles.length
    );
  } else {
    console.log("   Trouvée :", found.title.trim(), `(id ${found.id})`);
  }

  console.log("5) Ajout liste de courses…");
  try {
    const shop = await cookidooRequest<{ message?: string; data?: unknown }>(
      "POST",
      `/shopping/${COOKIDOO.market}/add-recipes`,
      { recipeIDs: [recipeId] }
    );
    console.log("   OK :", shop.message ?? JSON.stringify(shop).slice(0, 200));
  } catch (e) {
    console.error(
      "   Échec add-recipes (souvent normal si l’API attend un autre schéma pour les recettes perso) :",
      e instanceof Error ? e.message : e
    );
  }

  if (process.env.COOKIDOO_E2E_DELETE === "1") {
    console.log("6) Suppression recette de test…");
    await cookidooRequest("DELETE", base, { _method: "delete" });
    console.log("   Supprimée.");
  } else {
    console.log("6) Recette conservée (COOKIDOO_E2E_DELETE=1 pour supprimer).");
  }

  console.log("Terminé.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
