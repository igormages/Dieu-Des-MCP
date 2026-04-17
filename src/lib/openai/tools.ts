import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getUsage, getOrganizationCosts, getOrganizationUsage } from "./client";

export function registerOpenAITools(server: McpServer) {
  server.tool(
    "openai_get_usage",
    "Récupère les données d'utilisation OpenAI pour une date donnée (tokens consommés, coûts par modèle)",
    {
      date: z
        .string()
        .describe("Date au format YYYY-MM-DD (ex: 2025-01-15)"),
    },
    async (params) => {
      const result = await getUsage({ date: params.date });
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

  server.tool(
    "openai_get_costs",
    "Récupère les coûts OpenAI de l'organisation pour une période donnée (nécessite une clé API admin)",
    {
      start_time: z
        .number()
        .int()
        .optional()
        .describe("Timestamp Unix de début (secondes)"),
      end_time: z
        .number()
        .int()
        .optional()
        .describe("Timestamp Unix de fin (secondes)"),
      bucket_width: z
        .enum(["1m", "1h", "1d"])
        .optional()
        .describe("Largeur des intervalles de temps (défaut: 1d)"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(180)
        .optional()
        .describe("Nombre maximum de résultats (défaut: 7)"),
      page: z
        .string()
        .optional()
        .describe("Token de page pour la pagination"),
    },
    async (params) => {
      const result = await getOrganizationCosts({
        startTime: params.start_time,
        endTime: params.end_time,
        bucketWidth: params.bucket_width,
        limit: params.limit,
        page: params.page,
      });
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

  server.tool(
    "openai_get_token_usage",
    "Récupère les statistiques d'utilisation des tokens OpenAI (completions) pour l'organisation",
    {
      start_time: z
        .number()
        .int()
        .optional()
        .describe("Timestamp Unix de début (secondes)"),
      end_time: z
        .number()
        .int()
        .optional()
        .describe("Timestamp Unix de fin (secondes)"),
      bucket_width: z
        .enum(["1m", "1h", "1d"])
        .optional()
        .describe("Largeur des intervalles (défaut: 1d)"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(180)
        .optional()
        .describe("Nombre de résultats par page"),
    },
    async (params) => {
      const result = await getOrganizationUsage({
        startTime: params.start_time,
        endTime: params.end_time,
        bucketWidth: params.bucket_width,
        limit: params.limit,
      });
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
