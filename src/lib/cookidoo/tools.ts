import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  COOKIDOO,
  cookidooDebugLogin,
  cookidooForceRelogin,
  cookidooGetHtml,
  cookidooLogout,
  cookidooRequest,
} from "./client";
import { buildIngredientsPayload, buildInstructionsPayload } from "./customer-recipe-payloads";
import { decodeHtml, extractAllRecipeTiles } from "./parsing";

const ALGOLIA_APP_ID = "3TA8NT85XJ";
const ALGOLIA_HOST = `${ALGOLIA_APP_ID.toLowerCase()}-dsn.algolia.net`;

let cachedAlgoliaToken: { apiKey: string; validUntil: number } | null = null;

async function getAlgoliaToken(): Promise<string> {
  if (cachedAlgoliaToken && cachedAlgoliaToken.validUntil > Math.floor(Date.now() / 1000) + 30) {
    return cachedAlgoliaToken.apiKey;
  }
  const res = await cookidooRequest<{ apiKey: string; validUntil: number }>(
    "GET",
    "/search/api/subscription/token",
    undefined,
    {
      skipXsrf: true,
      referer: `${COOKIDOO.origin}/search/${COOKIDOO.language}`,
    }
  );
  cachedAlgoliaToken = { apiKey: res.apiKey, validUntil: res.validUntil };
  return res.apiKey;
}

interface AlgoliaHit {
  id: string;
  title: string;
  rating?: number;
  numberOfRatings?: number;
  publishedAt?: string;
  image?: string;
  totalTime?: number;
  description?: string;
  url?: string;
  objectID: string;
}

interface AlgoliaResults {
  results: Array<{
    hits?: AlgoliaHit[];
    nbHits?: number;
    page?: number;
    nbPages?: number;
    hitsPerPage?: number;
    indexName?: string;
    facetHits?: Array<{ value: string; count: number }>;
  }>;
}

async function algoliaSearch(payload: unknown): Promise<AlgoliaResults> {
  const apiKey = await getAlgoliaToken();
  const url = `https://${ALGOLIA_HOST}/1/indexes/*/queries?x-algolia-agent=${encodeURIComponent(
    "Algolia for JavaScript (5.50.1); Search (5.50.1); Browser"
  )}&x-algolia-api-key=${encodeURIComponent(apiKey)}&x-algolia-application-id=${ALGOLIA_APP_ID}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "text/plain",
      accept: "application/json",
      origin: COOKIDOO.origin,
      referer: `${COOKIDOO.origin}/`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Algolia ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as AlgoliaResults;
}

/* ------------------------------------------------------------------ */
/* Helpers de parsing HTML                                            */
/* ------------------------------------------------------------------ */

function extractMeta(html: string, property: string): string | null {
  const m = html.match(
    new RegExp(`<meta\\s+property=["']${property}["']\\s+content=["']([^"']+)["']`, "i")
  );
  return m?.[1] ?? null;
}

function extractCustomLists(html: string): Array<{ id: string; name: string }> {
  const lists: Array<{ id: string; name: string }> = [];
  const regex =
    /<li\s+data-id="(01[0-9A-Z]+)"[^>]*data-sort-key="[^"]*"[\s\S]*?<organize-title[^>]*list="\1">([\s\S]*?)<\/organize-title>/g;
  for (const m of html.matchAll(regex)) {
    lists.push({ id: m[1], name: decodeHtml(m[2].trim()) });
  }
  return lists;
}

function extractCsrfToken(html: string): string | null {
  const m = html.match(/name="_csrf"\s+value="([^"]+)"/);
  return m?.[1] ?? null;
}

function extractJsonLd(html: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const regex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of html.matchAll(regex)) {
    try {
      const data = JSON.parse(m[1]);
      if (Array.isArray(data)) for (const d of data) out.push(d);
      else out.push(data);
    } catch {
      // ignore parse errors
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Types des réponses Cookidoo                                        */
/* ------------------------------------------------------------------ */

interface AddedShoppingResponse {
  message?: string;
  data?: Array<{
    id: string;
    title: string;
    recipeIngredientGroups?: Array<{
      ingredients?: Array<{
        id: string;
        ingredientNotation?: string;
        quantity?: { value?: number };
        unitNotation?: string;
        preparation?: string;
      }>;
    }>;
  }>;
}

interface MyDayResponse {
  message?: string;
  content?: {
    dayKey: string;
    date: string;
    recipeCount: number;
    recipes?: Array<{
      id: string;
      title: string;
      prepTime?: string;
      totalTime?: string;
      portion?: string | null;
      landscapeImage?: string;
    }>;
  };
}

/* ------------------------------------------------------------------ */
/* Outils MCP                                                         */
/* ------------------------------------------------------------------ */

export function registerCookidooTools(server: McpServer): void {
  /* ---------- Recherche & lecture ---------- */

  server.tool(
    "cookidoo_search_recipes",
    "Recherche des recettes Thermomix sur Cookidoo via l'index Algolia (titre, description, totalTime, image, rating).",
    {
      query: z.string().describe("Texte de recherche (ex: 'velouté butternut'). Vide = top recettes."),
      hitsPerPage: z.number().min(1).max(50).optional().describe("Nombre de résultats (défaut 20)."),
      page: z.number().min(0).optional().describe("Numéro de page (0-indexed)."),
      tmversion: z
        .enum(["TM5", "TM6", "TM7"])
        .optional()
        .describe("Filtre version Thermomix (défaut TM7)."),
    },
    async ({ query, hitsPerPage, page, tmversion }) => {
      const filters = `(language:fr) AND (tmversion:"${tmversion ?? "TM7"}")`;
      const payload = {
        requests: [
          {
            type: "default",
            indexName: "recipes-production-fr",
            query: query ?? "",
            hitsPerPage: hitsPerPage ?? 20,
            page: page ?? 0,
            filters,
            attributesToHighlight: ["title"],
            ignorePlurals: true,
            queryLanguages: ["fr"],
            analyticsTags: ["app:mcp", "ui-lang:fr", "touchpoint:web", "context:recipes"],
            ruleContexts: ["lang_fr-FR", "cookidoo.fr", "web", "market_fr__lang_fr-FR"],
          },
        ],
      };
      const res = await algoliaSearch(payload);
      const recipes = res.results[0]?.hits ?? [];
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                total: res.results[0]?.nbHits ?? recipes.length,
                page: res.results[0]?.page ?? 0,
                nbPages: res.results[0]?.nbPages ?? 1,
                recipes: recipes.map((h) => ({
                  id: h.id ?? h.objectID,
                  title: h.title,
                  rating: h.rating,
                  numberOfRatings: h.numberOfRatings,
                  totalTime: h.totalTime,
                  publishedAt: h.publishedAt,
                  description: h.description,
                  image: h.image
                    ?.replace("{assethost}", "assets.tmecosys.com")
                    .replace("{transformation}", "t_web_rdp_recipe_584x480"),
                  url: h.id
                    ? `${COOKIDOO.origin}/recipes/recipe/${COOKIDOO.language}/${h.id}`
                    : undefined,
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.tool(
    "cookidoo_get_recipe_detail",
    "Récupère le détail d'une recette Cookidoo (titre, description, image, durée, ingrédients, étapes via JSON-LD).",
    {
      recipeId: z
        .string()
        .describe("Identifiant Cookidoo de la recette (ex: 'r96393' ou ULID pour recette personnelle)."),
    },
    async ({ recipeId }) => {
      const html = await cookidooGetHtml(`/recipes/recipe/${COOKIDOO.language}/${recipeId}`);
      const ldList = extractJsonLd(html);
      const recipeLd = ldList.find(
        (d) => (d["@type"] as string | undefined) === "Recipe"
      );
      const summary = {
        id: recipeId,
        title: extractMeta(html, "og:title"),
        description: extractMeta(html, "og:description"),
        image: extractMeta(html, "og:image"),
        url: extractMeta(html, "og:url"),
        recipe: recipeLd ?? null,
      };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }],
      };
    }
  );

  server.tool(
    "cookidoo_list_my_favorites",
    "Liste les recettes Cookidoo mises en favoris (Mes recettes).",
    {
      page: z.number().min(1).optional().describe("Numéro de page (défaut 1)."),
    },
    async ({ page }) => {
      const path =
        page && page > 1
          ? `/organize/${COOKIDOO.market}/my-recipes?page=${page}`
          : `/organize/${COOKIDOO.market}/my-recipes`;
      const html = await cookidooGetHtml(path);
      const tiles = extractAllRecipeTiles(html);
      const customLists = extractCustomLists(html);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { page: page ?? 1, count: tiles.length, recipes: tiles, customLists },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.tool(
    "cookidoo_list_recently_cooked",
    "Liste les recettes récemment cuisinées (cooking history).",
    {},
    async () => {
      const html = await cookidooGetHtml(
        `/organize/${COOKIDOO.language}/cooking-history`
      );
      const tiles = extractAllRecipeTiles(html);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ count: tiles.length, recipes: tiles }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "cookidoo_list_my_created_recipes",
    "Liste les recettes personnelles créées par l'utilisateur (Mes créations).",
    {},
    async () => {
      const html = await cookidooGetHtml(`/created-recipes/${COOKIDOO.language}`);
      const tiles = extractAllRecipeTiles(html);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ count: tiles.length, recipes: tiles }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "cookidoo_list_custom_lists",
    "Liste les listes de recettes personnalisées (collections perso) de l'utilisateur.",
    {},
    async () => {
      const html = await cookidooGetHtml(`/organize/${COOKIDOO.market}/my-recipes`);
      const lists = extractCustomLists(html);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ count: lists.length, lists }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "cookidoo_get_custom_list",
    "Récupère le contenu d'une liste de recettes personnalisée (par ULID).",
    {
      listId: z.string().describe("ULID de la liste (ex: '01K6MJKYAFB0ZTFETFHQVBGKZ3')."),
    },
    async ({ listId }) => {
      const html = await cookidooGetHtml(
        `/organize/${COOKIDOO.market}/custom-list/${listId}`
      );
      const tiles = extractAllRecipeTiles(html);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ listId, count: tiles.length, recipes: tiles }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "cookidoo_add_to_favorites",
    "Ajoute une recette aux favoris (bookmark).",
    {
      recipeId: z.string().describe("ID Cookidoo de la recette (ex: 'r617774')."),
    },
    async ({ recipeId }) => {
      const body = new URLSearchParams({ recipeId }).toString();
      await cookidooRequest("POST", `/organize/${COOKIDOO.market}/api/bookmark`, body, {
        contentType: "application/x-www-form-urlencoded",
        json: false,
      });
      return {
        content: [{ type: "text" as const, text: `Recette ${recipeId} ajoutée aux favoris.` }],
      };
    }
  );

  server.tool(
    "cookidoo_remove_from_favorites",
    "Retire une recette des favoris.",
    {
      recipeId: z.string().describe("ID Cookidoo de la recette (ex: 'r617774')."),
    },
    async ({ recipeId }) => {
      const body = new URLSearchParams({ recipeId, _method: "delete" }).toString();
      await cookidooRequest("POST", `/organize/${COOKIDOO.market}/api/bookmark`, body, {
        contentType: "application/x-www-form-urlencoded",
        json: false,
      });
      return {
        content: [{ type: "text" as const, text: `Recette ${recipeId} retirée des favoris.` }],
      };
    }
  );

  /* ---------- Liste de courses ---------- */

  server.tool(
    "cookidoo_get_shopping_list",
    "Récupère la liste de courses complète (ingrédients par recette + ajouts manuels + ingrédients possédés).",
    {},
    async () => {
      const html = await cookidooGetHtml(`/shopping/${COOKIDOO.language}`);
      // Les ingrédients sont rendus côté client via une SPA.
      // On essaie d'extraire ce qui est server-rendered, sinon on remonte le HTML brut tronqué.
      const ingredientRegex =
        /<li[^>]*class="[^"]*pm-check-group__list-item[^"]*"[^>]*>([\s\S]*?)<\/li>/g;
      const items: string[] = [];
      for (const m of html.matchAll(ingredientRegex)) {
        const text = m[1]
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        if (text) items.push(decodeHtml(text));
      }
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                count: items.length,
                items,
                note:
                  items.length === 0
                    ? "La liste de courses est rendue côté client. Ajouter une recette via cookidoo_add_recipe_to_shopping_list pour récupérer ses ingrédients structurés en réponse."
                    : undefined,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.tool(
    "cookidoo_add_recipe_to_shopping_list",
    "Ajoute une ou plusieurs recettes à la liste de courses Cookidoo.",
    {
      recipeIds: z
        .array(z.string())
        .min(1)
        .describe("Liste des IDs de recettes à ajouter (ex: ['r617774'])."),
    },
    async ({ recipeIds }) => {
      const res = await cookidooRequest<AddedShoppingResponse>(
        "POST",
        `/shopping/${COOKIDOO.market}/add-recipes`,
        { recipeIDs: recipeIds }
      );
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                message: res.message,
                added: res.data?.map((r) => ({
                  id: r.id,
                  title: r.title,
                  ingredients: r.recipeIngredientGroups?.flatMap(
                    (g) =>
                      g.ingredients?.map((i) => ({
                        id: i.id,
                        name: i.ingredientNotation,
                        quantity: i.quantity?.value,
                        unit: i.unitNotation,
                        preparation: i.preparation || undefined,
                      })) ?? []
                  ),
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.tool(
    "cookidoo_clear_shopping_list",
    "Vide entièrement la liste de courses (utile une fois les courses faites).",
    {},
    async () => {
      await cookidooRequest(
        "DELETE",
        `/shopping/${COOKIDOO.language}`,
        { _method: "delete" },
        { json: false, referer: `${COOKIDOO.origin}/shopping/${COOKIDOO.language}` }
      );
      return {
        content: [{ type: "text" as const, text: "Liste de courses vidée." }],
      };
    }
  );

  server.tool(
    "cookidoo_remove_recipe_from_shopping_list",
    "Retire une recette précise de la liste de courses (et tous ses ingrédients liés).",
    {
      recipeId: z.string().describe("ID de la recette à retirer."),
    },
    async ({ recipeId }) => {
      await cookidooRequest(
        "DELETE",
        `/shopping/${COOKIDOO.market}/recipes/${recipeId}`,
        { _method: "delete" },
        { json: false }
      );
      return {
        content: [
          { type: "text" as const, text: `Recette ${recipeId} retirée de la liste de courses.` },
        ],
      };
    }
  );

  server.tool(
    "cookidoo_add_custom_ingredient",
    "Ajoute un ingrédient personnalisé (texte libre) à la liste de courses Cookidoo. Côté Cookidoo, c'est un champ texte unique : la quantité et l'unité font partie du texte (ex: '300g de saumon').",
    {
      itemValue: z
        .string()
        .describe(
          "Texte libre de l'item (ex: '300g de saumon', '2 oignons', 'sel'). Inclure quantité et unité directement dans le texte."
        ),
    },
    async ({ itemValue }) => {
      // HAR confirmé : POST /shopping/<language>/additional-item (singulier !) body { "itemValue": "..." }
      const res = await cookidooRequest<{
        id?: string;
        message?: string;
        data?: { id?: string; itemValue?: string };
      }>(
        "POST",
        `/shopping/${COOKIDOO.language}/additional-item`,
        { itemValue }
      );
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                added: itemValue,
                id: res.id ?? res.data?.id,
                response: res,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.tool(
    "cookidoo_update_custom_ingredient",
    "Modifie un ingrédient personnalisé existant (renomme et/ou change son statut 'possédé'). Si onlyOwnership=true, utilise l'endpoint /ownership/edit (toggle léger) ; sinon /edit (rename complet).",
    {
      itemId: z
        .string()
        .describe("ID de l'item personnel à modifier (ex: '01KQM11SH02X8VV9Z02GJKP5NV')."),
      name: z.string().describe("Nouveau texte de l'item (ex: '350g de saumon')."),
      isOwned: z
        .boolean()
        .describe("True = case cochée (acquis), false = à acheter."),
      onlyOwnership: z
        .boolean()
        .optional()
        .describe(
          "Si true, utilise l'endpoint /ownership/edit (toggle uniquement). Défaut false = renomme + statut."
        ),
    },
    async ({ itemId, name, isOwned, onlyOwnership }) => {
      // HAR confirmé :
      //   PUT /shopping/<market>/additional-item/{id}/edit
      //     body { "_method":"put","isOwned":"false","name":"350g de saumon" }
      //   PUT /shopping/<market>/additional-item/{id}/ownership/edit
      //     body { "_method":"put","isOwned":"true|false","name":"350g de saumon" }
      // Côté Cookidoo, isOwned est sérialisé en STRING ("true"/"false"), pas en booléen JSON.
      const path = onlyOwnership
        ? `/shopping/${COOKIDOO.market}/additional-item/${itemId}/ownership/edit`
        : `/shopping/${COOKIDOO.market}/additional-item/${itemId}/edit`;
      await cookidooRequest("PUT", path, {
        _method: "put",
        isOwned: String(isOwned),
        name,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: `Item ${itemId} mis à jour (${onlyOwnership ? "ownership" : "edit"}) : ${name}, owned=${isOwned}.`,
          },
        ],
      };
    }
  );

  server.tool(
    "cookidoo_delete_custom_ingredient",
    "Supprime définitivement un ingrédient personnalisé de la liste de courses.",
    {
      itemId: z.string().describe("ID de l'item personnel à supprimer."),
    },
    async ({ itemId }) => {
      // HAR confirmé : DELETE /shopping/<market>/additional-item/{id}
      //   body { "_method":"delete","isOwned":"","name":"" }
      await cookidooRequest(
        "DELETE",
        `/shopping/${COOKIDOO.market}/additional-item/${itemId}`,
        { _method: "delete", isOwned: "", name: "" }
      );
      return {
        content: [
          {
            type: "text" as const,
            text: `Item personnel ${itemId} supprimé de la liste de courses.`,
          },
        ],
      };
    }
  );

  server.tool(
    "cookidoo_mark_ingredients_owned",
    "Marque un ou plusieurs ingrédients (issus de recettes ajoutées à la liste) comme possédés. Accepte un tableau d'IDs pour traiter plusieurs items en une seule requête.",
    {
      ingredientIds: z
        .array(z.string())
        .min(1)
        .describe("IDs des ingrédients à cocher (ex: ['01KQM14SA08Z3724B2WCXM84ZE'])."),
    },
    async ({ ingredientIds }) => {
      // HAR confirmé : POST /shopping/<market>/owned-ingredients body { "ingredientIDS": [...] }
      // Note : le champ est en MAJUSCULES côté Cookidoo (anti-pattern, mais c'est leur convention).
      await cookidooRequest(
        "POST",
        `/shopping/${COOKIDOO.market}/owned-ingredients`,
        { ingredientIDS: ingredientIds }
      );
      return {
        content: [
          {
            type: "text" as const,
            text: `${ingredientIds.length} ingrédient(s) marqué(s) comme possédé(s).`,
          },
        ],
      };
    }
  );

  server.tool(
    "cookidoo_unmark_ingredient_owned",
    "Décoche un ingrédient de recette (le retire de la liste des possédés). NOTE : pour les items personnels (additional-item), utiliser plutôt cookidoo_update_custom_ingredient avec isOwned=false + onlyOwnership=true.",
    {
      ingredientId: z.string().describe("ID de l'ingrédient à décocher."),
    },
    async ({ ingredientId }) => {
      await cookidooRequest(
        "DELETE",
        `/shopping/${COOKIDOO.market}/owned-ingredients/${ingredientId}`,
        { _method: "delete" }
      );
      return {
        content: [
          {
            type: "text" as const,
            text: `Ingrédient ${ingredientId} décoché.`,
          },
        ],
      };
    }
  );

  /* ---------- Calendrier (Ma semaine) ---------- */

  server.tool(
    "cookidoo_get_my_week",
    "Récupère le calendrier de la semaine (Ma semaine) avec les recettes prévues par jour.",
    {
      date: z
        .string()
        .optional()
        .describe(
          "Date de référence YYYY-MM-DD (un jour de la semaine voulue). Défaut: aujourd'hui."
        ),
    },
    async ({ date }) => {
      const ref = date ?? new Date().toISOString().slice(0, 10);
      const html = await cookidooGetHtml(
        `/planning/${COOKIDOO.language}/my-week?date=${ref}`
      );
      // Les jours sont rendus côté client mais on peut extraire les recipes par dayKey via les balises.
      const dayRegex =
        /data-day-key="(\d{4}-\d{2}-\d{2})"[\s\S]*?<\/(?:section|div)>/g;
      const days: Array<{ dayKey: string; rawHtml: string }> = [];
      for (const m of html.matchAll(dayRegex)) {
        days.push({ dayKey: m[1], rawHtml: m[0].slice(0, 2000) });
      }
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                referenceDate: ref,
                weekUrl: `${COOKIDOO.origin}/planning/${COOKIDOO.language}/my-week?date=${ref}`,
                daysFound: days.length,
                note:
                  days.length === 0
                    ? "Le calendrier est rendu côté client. Utiliser cookidoo_add_recipe_to_day pour planifier des recettes."
                    : undefined,
                days,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.tool(
    "cookidoo_add_recipe_to_day",
    "Planifie une recette à un jour précis dans le calendrier Cookidoo (Ma semaine).",
    {
      recipeId: z.string().describe("ID Cookidoo de la recette (ex: 'r96393')."),
      dayKey: z.string().describe("Jour cible au format YYYY-MM-DD (ex: '2026-05-03')."),
      recipeSource: z
        .enum(["VORWERK", "CUSTOMER"])
        .optional()
        .describe("Source de la recette (défaut VORWERK pour recettes officielles)."),
    },
    async ({ recipeId, dayKey, recipeSource }) => {
      const res = await cookidooRequest<MyDayResponse>(
        "PUT",
        `/planning/${COOKIDOO.market}/api/my-day`,
        {
          _method: "put",
          recipeSource: recipeSource ?? "VORWERK",
          recipeIds: [recipeId],
          dayKey,
        }
      );
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                message: res.message,
                day: res.content?.dayKey,
                date: res.content?.date,
                totalRecipes: res.content?.recipeCount,
                recipes: res.content?.recipes?.map((r) => ({
                  id: r.id,
                  title: r.title,
                  totalTime: r.totalTime,
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.tool(
    "cookidoo_remove_recipe_from_day",
    "Supprime une recette planifiée d'un jour du calendrier.",
    {
      recipeId: z.string().describe("ID de la recette à retirer."),
      dayKey: z.string().describe("Jour ciblé YYYY-MM-DD."),
    },
    async ({ recipeId, dayKey }) => {
      await cookidooRequest(
        "DELETE",
        `/planning/${COOKIDOO.market}/api/my-day/${dayKey}/${recipeId}`,
        { _method: "delete" },
        { json: false }
      );
      return {
        content: [
          {
            type: "text" as const,
            text: `Recette ${recipeId} retirée du ${dayKey}.`,
          },
        ],
      };
    }
  );

  server.tool(
    "cookidoo_cook_today",
    "Marque une recette comme 'cuisinée aujourd'hui' (l'ajoute à l'historique de cuisson).",
    {
      recipeId: z.string().describe("ID de la recette."),
    },
    async ({ recipeId }) => {
      await cookidooRequest(
        "POST",
        `/planning/${COOKIDOO.market}/api/cook-today`,
        { recipeId },
        { json: false }
      );
      return {
        content: [
          { type: "text" as const, text: `Recette ${recipeId} marquée comme cuisinée aujourd'hui.` },
        ],
      };
    }
  );

  /* ---------- Création de recettes personnelles ---------- */

  server.tool(
    "cookidoo_import_recipe_from_cookidoo",
    "Importe une recette officielle Cookidoo dans Mes créations pour pouvoir la modifier.",
    {
      cookidooRecipeId: z
        .string()
        .describe("ID de la recette Cookidoo source à cloner (ex: 'r765201')."),
    },
    async ({ cookidooRecipeId }) => {
      // Étape 1 : récupère les options d'import (HTML).
      await cookidooGetHtml(
        `/created-recipes/${COOKIDOO.language}/import/options?cookidooRecipeId=${cookidooRecipeId}`
      );
      // Étape 2 : POST de l'import.
      const res = await cookidooRequest<{ id?: string; ulid?: string; redirectUrl?: string }>(
        "POST",
        `/created-recipes/${COOKIDOO.language}/api/import`,
        { cookidooRecipeId }
      );
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                imported: cookidooRecipeId,
                createdRecipeId: res.id ?? res.ulid,
                editUrl: res.redirectUrl,
                response: res,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  const ingredientSchema = z.object({
    name: z.string().describe("Nom de l'ingrédient."),
    quantity: z.number().optional().describe("Quantité numérique."),
    unit: z.string().optional().describe("Unité (g, ml, c. à café, pièce…)."),
    preparation: z.string().optional().describe("Préparation (ex: 'pelée et coupée en dés')."),
    optional: z.boolean().optional().describe("Si true, l'ingrédient est marqué optionnel."),
  });

  const stepSchema = z.object({
    text: z.string().describe("Texte de l'étape (ex: 'Mixer pendant 10 sec/vit. 5')."),
    time: z.number().optional().describe("Durée en secondes."),
    temperature: z
      .union([z.number(), z.literal("Varoma"), z.literal("Ebullition")])
      .optional()
      .describe("Température en °C, ou 'Varoma' / 'Ebullition'."),
    speed: z
      .union([z.number(), z.literal("Mijotage"), z.literal("Petrir")])
      .optional()
      .describe("Vitesse Thermomix (1-10), 'Mijotage' ou 'Petrir' (épi)."),
    direction: z
      .enum(["normal", "reverse"])
      .optional()
      .describe("Sens de rotation (normal ou inverse / sens inverse pour ne pas couper)."),
    accessory: z
      .string()
      .optional()
      .describe("Accessoire (fouet, panier de cuisson, Varoma, papillon...)."),
  });

  const recipePayloadSchema = {
    title: z.string().describe("Titre de la recette."),
    description: z.string().optional().describe("Description courte."),
    portion: z
      .object({
        quantity: z.number().describe("Nombre de portions."),
        type: z.string().optional().describe("Type de portion (personne, pièce, ...)."),
      })
      .optional(),
    prepTime: z.number().optional().describe("Temps de préparation en secondes."),
    totalTime: z.number().optional().describe("Temps total en secondes."),
    difficulty: z.enum(["easy", "medium", "advanced"]).optional(),
    ingredientGroups: z
      .array(
        z.object({
          name: z
            .string()
            .optional()
            .describe(
              "Nom du groupe (ex: 'Pour la pâte'). Envoyé comme une ligne INGREDIENT contenant uniquement ce texte (l'API Cookidoo n'expose pas de type dédié pour les titres de section)."
            ),
          ingredients: z.array(ingredientSchema).describe("Ingrédients du groupe."),
        })
      )
      .describe("Groupes d'ingrédients."),
    steps: z.array(stepSchema).describe("Étapes de préparation."),
    tips: z.string().optional().describe("Astuces et conseils."),
    tags: z.array(z.string()).optional().describe("Catégories / tags (ex: ['Plat principal'])."),
    tmversion: z
      .enum(["TM5", "TM6", "TM7"])
      .optional()
      .describe("Version Thermomix cible (défaut TM7)."),
  };

  server.tool(
    "cookidoo_create_recipe",
    "Crée une nouvelle recette personnelle Thermomix complète (titre, ingrédients, étapes avec settings TM, photo optionnelle).",
    recipePayloadSchema,
    async (input) => {
      // Étape 1 : créer le squelette avec le titre uniquement
      const created = await cookidooRequest<{ recipeId?: string }>(
        "POST",
        `/created-recipes/${COOKIDOO.language}`,
        { recipeName: input.title },
        { referer: `${COOKIDOO.origin}/created-recipes/${COOKIDOO.language}` }
      );
      const recipeId = created.recipeId;
      if (!recipeId)
        throw new Error(
          `Cookidoo : recipeId absent de la réponse de création. Réponse : ${JSON.stringify(created)}`
        );
      const base = `/created-recipes/${COOKIDOO.language}/${recipeId}`;

      const ingredients = buildIngredientsPayload(input.ingredientGroups);
      await cookidooRequest("PATCH", base, { ingredients });

      const instructions = buildInstructionsPayload(input.steps);
      await cookidooRequest("PATCH", base, { instructions });

      // Étape 4 : PATCH paramètres (temps, portions, version TM, description, etc.)
      const settings: Record<string, unknown> = {};
      if (input.totalTime !== undefined) settings.totalTime = input.totalTime;
      if (input.prepTime !== undefined) settings.prepTime = input.prepTime;
      if (input.portion)
        settings.yield = { value: input.portion.quantity, unitText: input.portion.type ?? "portions" };
      settings.tools = [input.tmversion ?? "TM7"];
      if (input.description) settings.description = input.description;
      if (input.difficulty) settings.difficulty = input.difficulty;
      if (input.tips) settings.tips = input.tips;
      if (input.tags?.length) settings.tags = input.tags;
      await cookidooRequest("PATCH", base, settings);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                createdRecipeId: recipeId,
                editUrl: `${COOKIDOO.origin}/created-recipes/${COOKIDOO.language}/${recipeId}/edit`,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.tool(
    "cookidoo_update_recipe",
    "Met à jour une recette personnelle existante (mêmes champs que la création).",
    {
      recipeId: z.string().describe("ULID de la recette personnelle à modifier."),
      ...recipePayloadSchema,
    },
    async (input) => {
      const { recipeId, ...rest } = input;
      const base = `/created-recipes/${COOKIDOO.language}/${recipeId}`;

      const ingredients = buildIngredientsPayload(rest.ingredientGroups);
      await cookidooRequest("PATCH", base, { ingredients });

      const instructions = buildInstructionsPayload(rest.steps);
      await cookidooRequest("PATCH", base, { instructions });

      const settings: Record<string, unknown> = { recipeName: rest.title };
      if (rest.totalTime !== undefined) settings.totalTime = rest.totalTime;
      if (rest.prepTime !== undefined) settings.prepTime = rest.prepTime;
      if (rest.portion)
        settings.yield = { value: rest.portion.quantity, unitText: rest.portion.type ?? "portions" };
      settings.tools = [rest.tmversion ?? "TM7"];
      if (rest.description) settings.description = rest.description;
      if (rest.difficulty) settings.difficulty = rest.difficulty;
      if (rest.tips) settings.tips = rest.tips;
      if (rest.tags?.length) settings.tags = rest.tags;
      await cookidooRequest("PATCH", base, settings);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ updated: recipeId }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "cookidoo_delete_recipe",
    "Supprime une recette personnelle.",
    {
      recipeId: z.string().describe("ULID de la recette personnelle à supprimer."),
    },
    async ({ recipeId }) => {
      // HAR confirmé (formulaire détail recette dans modification d'une recette.har) :
      //   <form action="/created-recipes/fr/{id}">
      //     <input type="hidden" name="_method" value="delete">
      // → DELETE /created-recipes/<language>/{id} body { "_method":"delete" }
      // Le path historique /api/recipes/{id} n'existe pas côté Cookidoo.
      await cookidooRequest(
        "DELETE",
        `/created-recipes/${COOKIDOO.language}/${recipeId}`,
        { _method: "delete" },
        {
          referer: `${COOKIDOO.origin}/created-recipes/${COOKIDOO.language}/${recipeId}`,
        }
      );
      return {
        content: [
          { type: "text" as const, text: `Recette personnelle ${recipeId} supprimée.` },
        ],
      };
    }
  );

  server.tool(
    "cookidoo_upload_recipe_image",
    "Téléverse une image pour une recette personnelle. Fournir soit imageBase64 (recommandé) soit imageUrl.",
    {
      recipeId: z.string().describe("ULID de la recette personnelle cible."),
      imageBase64: z
        .string()
        .optional()
        .describe("Image encodée en base64 (sans préfixe data:). JPEG ou PNG."),
      imageUrl: z
        .string()
        .url()
        .optional()
        .describe("URL HTTPS publique d'une image à télécharger côté serveur Cookidoo."),
      mimeType: z
        .string()
        .optional()
        .describe("Type MIME (défaut image/jpeg)."),
    },
    async ({ recipeId, imageBase64, imageUrl, mimeType }) => {
      const finalMime = mimeType ?? "image/jpeg";
      // atob + Uint8Array.from évite la dépendance à Buffer (@types/node)
      const imageBytes: Uint8Array = await (async (): Promise<Uint8Array> => {
        if (imageBase64) {
          return Uint8Array.from(atob(imageBase64), (c) => c.charCodeAt(0));
        }
        if (imageUrl) {
          const dl = await fetch(imageUrl);
          if (!dl.ok) throw new Error(`Téléchargement de l'image échoué (${dl.status}).`);
          return new Uint8Array(await dl.arrayBuffer());
        }
        throw new Error("Fournir 'imageBase64' ou 'imageUrl'.");
      })();

      // Étape 1 : obtenir la signature HMAC Cloudinary depuis Cookidoo
      const timestamp = Math.floor(Date.now() / 1000);
      const sigRes = await cookidooRequest<{ signature?: string }>(
        "POST",
        `/created-recipes/${COOKIDOO.language}/image/signature`,
        { timestamp, upload_preset: "prod-customer-recipe-signed" }
      );
      if (!sigRes.signature)
        throw new Error(
          `Cookidoo : signature absente de la réponse. Réponse : ${JSON.stringify(sigRes)}`
        );

      // Étape 2 : upload vers Cloudinary EU (cloud vorwerk-users-gc)
      const formData = new FormData();
      formData.append("file", new Blob([imageBytes.buffer as ArrayBuffer], { type: finalMime }));
      formData.append("api_key", "993585863591145");
      formData.append("upload_preset", "prod-customer-recipe-signed");
      formData.append("signature", sigRes.signature);
      formData.append("timestamp", String(timestamp));

      const upload = await fetch(
        "https://api-eu.cloudinary.com/v1_1/vorwerk-users-gc/image/upload",
        { method: "POST", body: formData }
      );
      const uploadJson = (await upload.json().catch(() => ({}))) as {
        public_id?: string;
        format?: string;
        secure_url?: string;
      };
      if (!upload.ok) {
        throw new Error(
          `Upload image Cloudinary échoué (${upload.status}): ${JSON.stringify(uploadJson)}`
        );
      }
      if (!uploadJson.public_id || !uploadJson.format) {
        throw new Error(
          `Upload image : réponse Cloudinary inattendue : ${JSON.stringify(uploadJson)}`
        );
      }

      // Étape 3 : associer l'image à la recette via PATCH
      await cookidooRequest(
        "PATCH",
        `/created-recipes/${COOKIDOO.language}/${recipeId}`,
        { image: `${uploadJson.public_id}.${uploadJson.format}`, isImageOwnedByUser: false }
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                recipeId,
                imageUrl: uploadJson.secure_url,
                publicId: `${uploadJson.public_id}.${uploadJson.format}`,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  /* ---------- Custom lists / collections ---------- */

  server.tool(
    "cookidoo_create_custom_list",
    "Crée une nouvelle liste de recettes personnalisée (collection perso).",
    {
      name: z.string().describe("Nom de la liste à créer."),
    },
    async ({ name }) => {
      const html = await cookidooGetHtml(
        `/organize/${COOKIDOO.market}/transclude/create-custom-list-modal`
      );
      const csrf = extractCsrfToken(html);
      const body = new URLSearchParams({ title: name });
      if (csrf) body.set("_csrf", csrf);
      const res = await cookidooRequest<{ id?: string; ulid?: string }>(
        "POST",
        `/organize/${COOKIDOO.market}/api/custom-list`,
        body.toString(),
        { contentType: "application/x-www-form-urlencoded" }
      );
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ created: name, response: res }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "cookidoo_add_recipe_to_custom_list",
    "Ajoute une recette à une liste personnalisée existante.",
    {
      listId: z.string().describe("ULID de la liste."),
      recipeId: z.string().describe("ID de la recette à ajouter."),
    },
    async ({ listId, recipeId }) => {
      await cookidooRequest(
        "POST",
        `/organize/${COOKIDOO.market}/api/custom-list/${listId}/recipes`,
        { recipeId },
        { json: false }
      );
      return {
        content: [
          {
            type: "text" as const,
            text: `Recette ${recipeId} ajoutée à la liste ${listId}.`,
          },
        ],
      };
    }
  );

  server.tool(
    "cookidoo_remove_recipe_from_custom_list",
    "Retire une recette d'une liste personnalisée.",
    {
      listId: z.string().describe("ULID de la liste."),
      recipeId: z.string().describe("ID de la recette à retirer."),
    },
    async ({ listId, recipeId }) => {
      await cookidooRequest(
        "DELETE",
        `/organize/${COOKIDOO.market}/api/custom-list/${listId}/recipes/${recipeId}`,
        { _method: "delete" },
        { json: false }
      );
      return {
        content: [
          {
            type: "text" as const,
            text: `Recette ${recipeId} retirée de la liste ${listId}.`,
          },
        ],
      };
    }
  );

  /* ---------- Compte / session ---------- */

  server.tool(
    "cookidoo_get_user_info",
    "Récupère les informations du compte Cookidoo connecté (email, abonnement, etc.).",
    {},
    async () => {
      const res = await cookidooRequest<unknown>("GET", "/profile/api/user", undefined, {
        skipXsrf: true,
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(res, null, 2) }],
      };
    }
  );

  server.tool(
    "cookidoo_relogin",
    "Force un re-login Cookidoo (utile si tu suspectes que la session est expirée). Le re-login se fait normalement automatiquement à chaque requête, ce tool est surtout pour debug.",
    {},
    async () => {
      const res = await cookidooForceRelogin();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                ok: true,
                loggedInAt: new Date(res.loggedInAt).toISOString(),
                message:
                  "Session Cookidoo réinitialisée avec succès. Les prochains appels utiliseront les nouveaux cookies.",
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.tool(
    "cookidoo_logout",
    "Supprime la session Cookidoo en cache. Le prochain appel se reconnectera avec les identifiants stockés.",
    {},
    async () => {
      await cookidooLogout();
      return {
        content: [
          { type: "text" as const, text: "Session Cookidoo effacée du cache." },
        ],
      };
    }
  );

  server.tool(
    "cookidoo_debug_login",
    "Diagnostic : exécute le flow de login Cookidoo étape par étape et renvoie pour chaque requête HTTP : URL de départ, URL finale (après redirections), statut, cookies posés, début du body. Permet d'identifier pourquoi un re-login échoue (mot de passe invalide, redirection imprévue, cookie manquant, etc.). N'expose pas le mot de passe ; l'email est masqué.",
    {},
    async () => {
      const result = await cookidooDebugLogin();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );
}
