import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  biocoopAddToCart,
  biocoopClearSession,
  biocoopGetCart,
  biocoopGetProduct,
  biocoopGetSessionStatus,
  biocoopSearchProducts,
  biocoopSetBrowserCookies,
  biocoopUpdateCartQuantity,
} from "./client";

function jsonText(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

export function registerBiocoopTools(server: McpServer): void {
  server.tool(
    "biocoop_get_session",
    "Vérifie la session Biocoop (magasin configuré, cookies, form_key Magento).",
    {},
    async () => jsonText(await biocoopGetSessionStatus())
  );

  server.tool(
    "biocoop_set_browser_cookies",
    "Importe les cookies depuis Chrome/Arc (fichier cookies.txt ou chaîne nom=valeur). Nécessaire pour le panier invité Magento.",
    {
      cookieString: z
        .string()
        .describe(
          "Contenu cookies.txt Netscape pour biocoop.fr, ou chaîne « PHPSESSID=…; form_key=… » depuis DevTools."
        ),
    },
    async ({ cookieString }) => jsonText(await biocoopSetBrowserCookies(cookieString))
  );

  server.tool(
    "biocoop_search_products",
    "Recherche des produits sur le magasin Biocoop configuré (page catalogsearch Magento).",
    {
      query: z.string().min(1).describe("Texte de recherche (ex: 'viande', 'riz basmati')."),
      limit: z.number().min(1).max(50).optional().describe("Nombre max de résultats (défaut 20)."),
    },
    async ({ query, limit }) => jsonText(await biocoopSearchProducts(query, limit ?? 20))
  );

  server.tool(
    "biocoop_get_product",
    "Récupère le détail d'un produit (id numérique, URL ou chemin relatif magasin).",
    {
      productIdOrUrl: z
        .string()
        .describe("ID produit Magento, URL complète ou chemin relatif (ex. viande-boeuf-….html)."),
    },
    async ({ productIdOrUrl }) => jsonText(await biocoopGetProduct(productIdOrUrl))
  );

  server.tool(
    "biocoop_get_cart",
    "Récupère le panier courant (sections Magento cart : lignes, quantités, sous-total).",
    {},
    async () => jsonText(await biocoopGetCart())
  );

  server.tool(
    "biocoop_add_to_cart",
    "Ajoute un produit au panier Biocoop (POST checkout/cart/add, multipart Magento).",
    {
      productId: z.string().describe("ID produit Magento (ex: '27420')."),
      quantity: z
        .number()
        .int()
        .min(1)
        .max(99)
        .optional()
        .describe("Quantité (défaut 1)."),
      refererUrl: z
        .string()
        .optional()
        .describe("URL de la fiche produit pour le paramètre uenc (optionnel)."),
    },
    async ({ productId, quantity, refererUrl }) =>
      jsonText(await biocoopAddToCart(productId, quantity ?? 1, refererUrl))
  );

  server.tool(
    "biocoop_update_cart_quantity",
    "Met à jour la quantité d'une ligne panier (POST checkout/sidebar/updateItemQty).",
    {
      productId: z.string().describe("ID produit Magento."),
      itemId: z.string().describe("ID de ligne panier (quote_item_id, ex: '36114064')."),
      quantity: z.number().int().min(0).max(99).describe("Nouvelle quantité (0 pour retirer)."),
      refererUrl: z.string().optional().describe("URL referer optionnelle."),
    },
    async ({ productId, itemId, quantity, refererUrl }) =>
      jsonText(await biocoopUpdateCartQuantity(productId, itemId, quantity, refererUrl))
  );

  server.tool(
    "biocoop_clear_session",
    "Efface la session Biocoop en cache (cookies / form_key).",
    {},
    async () => {
      await biocoopClearSession();
      return jsonText({ message: "Session Biocoop effacée." });
    }
  );
}
