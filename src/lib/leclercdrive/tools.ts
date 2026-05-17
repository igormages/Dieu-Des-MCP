import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  leclercdriveClearCart,
  leclercdriveForceRelogin,
  leclercdriveGetCart,
  leclercdriveGetConnectedUser,
  leclercdriveGetDatadomeStatus,
  leclercdriveGetProductZones,
  leclercdriveModifyCartQuantity,
  leclercdriveSearch,
  leclercdriveLogout,
  leclercdriveSetBrowserCookies,
  leclercdriveDiagnose,
  getLeclercdrivePublicConfig,
} from "./client";
import {
  extractSearchProducts,
  formatProductZones,
  parseProductZonesResponse,
} from "./parsing";

function jsonText(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

export function registerLeclercdriveTools(server: McpServer): void {
  server.tool(
    "leclercdrive_get_account",
    "Vérifie la session Leclerc Drive et retourne les infos client connecté (nom, magasin, point de livraison) ainsi que le magasin détecté automatiquement.",
    {},
    async () => {
      const [res, config, datadome] = await Promise.all([
        leclercdriveGetConnectedUser(),
        getLeclercdrivePublicConfig(),
        leclercdriveGetDatadomeStatus(),
      ]);
      return jsonText({
        account: res,
        store: {
          pointLivraison: config.pointLivraison,
          storePath: config.storePath,
          storeSlug: config.storeSlug,
          coursesHost: config.coursesHost,
          secureHost: config.secureHost,
        },
        datadome,
      });
    }
  );

  server.tool(
    "leclercdrive_diagnose",
    "Diagnostic DataDome / cookies : persistance KV, scope sous-domaines, sonde sur fdN-secure, proxy. À lancer si le captcha persiste.",
    {},
    async () => jsonText(await leclercdriveDiagnose())
  );

  server.tool(
    "leclercdrive_set_browser_cookies",
    "Importe les cookies depuis Arc/Chrome (DevTools ou fichier cookies.txt). Préférez pnpm leclercdrive:harvest en mode CDP pour exporter toute la session depuis votre Arc.",
    {
      cookieString: z
        .string()
        .describe(
          "Valeur du cookie datadome, ou chaîne complète « nom=valeur; nom2=valeur2 » depuis DevTools."
        ),
    },
    async ({ cookieString }) => {
      const res = await leclercdriveSetBrowserCookies(cookieString);
      return jsonText(res);
    }
  );

  server.tool(
    "leclercdrive_search_products",
    "Recherche des produits sur le drive Leclerc du magasin configuré (parsing HTML de la page recherche).",
    {
      query: z.string().min(1).describe("Texte de recherche (ex: 'riz basmati')."),
      limit: z.number().min(1).max(50).optional().describe("Nombre max de résultats (défaut 20)."),
    },
    async ({ query, limit }) => {
      const config = await getLeclercdrivePublicConfig();
      const html = await leclercdriveSearch(query);
      const base = `https://${config.coursesHost}`;
      const products = extractSearchProducts(html, base).slice(0, limit ?? 20);
      return jsonText({ query, count: products.length, products });
    }
  );

  server.tool(
    "leclercdrive_get_product",
    "Récupère le détail d'un produit (titre, prix, image) via l'API fiche-produit-zones.ashz.",
    {
      productId: z.string().describe("Identifiant numérique produit (ex: '120488')."),
    },
    async ({ productId }) => {
      const raw = (await leclercdriveGetProductZones(productId)) as Parameters<
        typeof parseProductZonesResponse
      >[0];
      const zones = parseProductZonesResponse(raw);
      if (!zones) {
        return jsonText({ productId, error: "Réponse produit vide ou invalide.", raw });
      }
      return jsonText(formatProductZones(zones, productId));
    }
  );

  server.tool(
    "leclercdrive_get_cart",
    "Récupère le panier drive courant (lignes, quantités, total TTC).",
    {},
    async () => {
      const cart = await leclercdriveGetCart();
      return jsonText(cart ?? { empty: true, message: "Panier vide ou non lisible." });
    }
  );

  server.tool(
    "leclercdrive_add_to_cart",
    "Ajoute un produit au panier ou fixe sa quantité (eTypeAction=1, quantité absolue).",
    {
      productId: z.string().describe("ID produit Leclerc Drive."),
      quantity: z
        .number()
        .int()
        .min(1)
        .max(99)
        .describe("Quantité souhaitée dans le panier."),
    },
    async ({ productId, quantity }) => {
      const res = await leclercdriveModifyCartQuantity(productId, quantity, 1);
      const cart = await leclercdriveGetCart();
      return jsonText({ productId, quantity, apiEvents: res, cart });
    }
  );

  server.tool(
    "leclercdrive_update_cart_quantity",
    "Met à jour la quantité d'un produit déjà présent dans le panier.",
    {
      productId: z.string().describe("ID produit."),
      quantity: z.number().int().min(0).max(99).describe("Nouvelle quantité (0 = retirer)."),
    },
    async ({ productId, quantity }) => {
      if (quantity === 0) {
        const res = await leclercdriveModifyCartQuantity(productId, 0, 2);
        const cart = await leclercdriveGetCart();
        return jsonText({ productId, removed: true, apiEvents: res, cart });
      }
      const res = await leclercdriveModifyCartQuantity(productId, quantity, 1);
      const cart = await leclercdriveGetCart();
      return jsonText({ productId, quantity, apiEvents: res, cart });
    }
  );

  server.tool(
    "leclercdrive_remove_from_cart",
    "Retire un produit du panier (décrémentation jusqu'à quantité 0).",
    {
      productId: z.string().describe("ID produit à retirer."),
    },
    async ({ productId }) => {
      const res = await leclercdriveModifyCartQuantity(productId, 0, 2);
      const cart = await leclercdriveGetCart();
      return jsonText({ productId, removed: true, apiEvents: res, cart });
    }
  );

  server.tool(
    "leclercdrive_clear_cart",
    "Vide entièrement le panier Leclerc Drive (panier.aspx?op=3).",
    {},
    async () => {
      await leclercdriveClearCart();
      return jsonText({ cleared: true });
    }
  );

  server.tool(
    "leclercdrive_relogin",
    "Force une nouvelle connexion Leclerc Drive (utile si la session a expiré).",
    {},
    async () => {
      const res = await leclercdriveForceRelogin();
      return jsonText({ ok: true, ...res });
    }
  );

  server.tool(
    "leclercdrive_logout",
    "Efface la session Leclerc Drive en cache.",
    {},
    async () => {
      await leclercdriveLogout();
      return jsonText({ message: "Session Leclerc Drive effacée." });
    }
  );
}
