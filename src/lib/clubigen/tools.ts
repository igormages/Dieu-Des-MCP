import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchClubigenArticles } from "./client";

export function registerClubigenTools(server: McpServer) {
  server.tool(
    "clubigen_list_rss_articles",
    "Récupère les articles complets du flux RSS Clubigen (titre, contenu HTML intégral, auteur, catégories, dates, lien). Important : ne pas appeler plus de 10 fois toutes les 5 minutes (limite du fournisseur). Préférer un seul appel et mettre en cache le résultat.",
    {
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe(
          "Nombre maximum d’articles à retourner (défaut 50, max 100)"
        ),
    },
    async (params) => {
      const { articles, feedTitle } = await fetchClubigenArticles({
        limit: params.limit,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                feedTitle,
                count: articles.length,
                articles,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}
