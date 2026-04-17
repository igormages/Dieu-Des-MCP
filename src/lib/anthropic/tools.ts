import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listModels, getUsage, listWorkspaces, listApiKeys, createMessage } from "./client";

export function registerAnthropicTools(server: McpServer) {
  server.tool(
    "anthropic_list_models",
    "Liste tous les modèles Claude disponibles (avec dates de création)",
    {},
    async () => {
      const result = await listModels();
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.tool(
    "anthropic_get_usage",
    "Récupère l'usage API Anthropic (tokens consommés par modèle, par période). Nécessite une clé admin.",
    {
      start_time: z.string().optional().describe("Date de début ISO 8601 (ex: 2025-01-01T00:00:00Z)"),
      end_time: z.string().optional().describe("Date de fin ISO 8601"),
      granularity: z.enum(["day", "month"]).optional().describe("Granularité (défaut: day)"),
      model_id: z.string().optional().describe("Filtrer par modèle (ex: claude-opus-4-5)"),
      workspace_id: z.string().optional().describe("Filtrer par workspace"),
      limit: z.number().int().min(1).max(100).optional().describe("Nombre de résultats"),
    },
    async (params) => {
      const result = await getUsage({
        startTime: params.start_time,
        endTime: params.end_time,
        granularity: params.granularity,
        modelId: params.model_id,
        workspaceId: params.workspace_id,
        limit: params.limit,
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.tool(
    "anthropic_list_workspaces",
    "Liste les workspaces Anthropic de l'organisation. Nécessite une clé admin.",
    {
      limit: z.number().int().min(1).max(100).optional().describe("Nombre de résultats"),
      include_archived: z.boolean().optional().describe("Inclure les workspaces archivés"),
    },
    async (params) => {
      const result = await listWorkspaces({
        limit: params.limit,
        includeArchived: params.include_archived,
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.tool(
    "anthropic_list_api_keys",
    "Liste les clés API Anthropic du workspace. Nécessite une clé admin.",
    {
      workspace_id: z.string().optional().describe("Filtrer par workspace"),
      status: z
        .enum(["active", "disabled", "archived"])
        .optional()
        .describe("Filtrer par statut"),
      limit: z.number().int().min(1).max(100).optional(),
    },
    async (params) => {
      const result = await listApiKeys({
        workspaceId: params.workspace_id,
        status: params.status,
        limit: params.limit,
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.tool(
    "anthropic_create_message",
    "Envoie un message à un modèle Claude et retourne la réponse (lancer un agent, poser une question, exécuter une tâche)",
    {
      model: z
        .string()
        .describe("ID du modèle (ex: claude-sonnet-4-6, claude-opus-4-7, claude-haiku-4-5-20251001)"),
      message: z.string().describe("Message de l'utilisateur"),
      system: z
        .string()
        .optional()
        .describe("Prompt système (instructions pour l'agent)"),
      max_tokens: z
        .number()
        .int()
        .min(1)
        .max(8096)
        .optional()
        .describe("Nombre maximum de tokens en réponse (défaut: 1024)"),
      temperature: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Température (0 = déterministe, 1 = créatif)"),
    },
    async (params) => {
      const result = await createMessage({
        model: params.model,
        messages: [{ role: "user", content: params.message }],
        system: params.system,
        maxTokens: params.max_tokens,
        temperature: params.temperature,
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}
