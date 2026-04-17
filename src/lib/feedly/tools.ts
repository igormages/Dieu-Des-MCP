import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  getProfile,
  getSubscriptions,
  getCollections,
  getStreamContents,
  createCollection,
  markArticlesRead,
} from "./client";

export function registerFeedlyTools(server: McpServer) {
  server.tool("feedly_get_profile", "Récupère le profil de l'utilisateur Feedly", {}, async () => {
    const profile = await getProfile();
    return { content: [{ type: "text" as const, text: JSON.stringify(profile, null, 2) }] };
  });

  server.tool("feedly_get_subscriptions", "Liste tous les flux RSS auxquels l'utilisateur est abonné", {}, async () => {
    const subs = await getSubscriptions();
    return { content: [{ type: "text" as const, text: JSON.stringify(subs, null, 2) }] };
  });

  server.tool("feedly_get_collections", "Liste tous les dossiers/catégories Feedly avec leurs flux", {}, async () => {
    const collections = await getCollections();
    return { content: [{ type: "text" as const, text: JSON.stringify(collections, null, 2) }] };
  });

  server.tool(
    "feedly_get_stream_articles",
    "Récupère les articles d'un flux ou d'un dossier Feedly",
    {
      streamId: z.string().describe("ID du flux (ex: feed/https://...) ou dossier (ex: user/USER_ID/category/tech)"),
      count: z.number().optional().describe("Nombre d'articles à récupérer (défaut: 20)"),
      continuation: z.string().optional().describe("Token de pagination pour la page suivante"),
    },
    async ({ streamId, count, continuation }) => {
      const result = await getStreamContents(streamId, count ?? 20, continuation);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "feedly_create_collection",
    "Crée un nouveau dossier/catégorie dans Feedly",
    {
      label: z.string().describe("Nom du dossier à créer"),
    },
    async ({ label }) => {
      const result = await createCollection(label);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "feedly_mark_articles_read",
    "Marque des articles comme lus dans Feedly",
    {
      articleIds: z.array(z.string()).describe("Liste des IDs d'articles à marquer comme lus"),
    },
    async ({ articleIds }) => {
      await markArticlesRead(articleIds);
      return { content: [{ type: "text" as const, text: `${articleIds.length} article(s) marqué(s) comme lus.` }] };
    }
  );
}
