import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listInvoices, getTeam, listProjects, getSubscription } from "./client";

export function registerVercelTools(server: McpServer) {
  server.tool(
    "vercel_list_invoices",
    "Liste les factures Vercel de l'équipe",
    {
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Nombre de factures à retourner (défaut: 20)"),
      next: z
        .number()
        .int()
        .optional()
        .describe("Curseur de pagination (timestamp Unix ms)"),
    },
    async (params) => {
      const result = await listInvoices({
        limit: params.limit,
        next: params.next,
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
    "vercel_get_team",
    "Récupère les informations de l'équipe Vercel (plan, dates de facturation)",
    {},
    async () => {
      const team = await getTeam();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(team, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "vercel_list_projects",
    "Liste tous les projets Vercel de l'équipe",
    {
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Nombre de projets à retourner"),
    },
    async (params) => {
      const result = await listProjects({ limit: params.limit });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { count: result.projects?.length ?? 0, projects: result.projects },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.tool(
    "vercel_get_subscription",
    "Récupère les détails de l'abonnement Vercel actuel",
    {},
    async () => {
      const result = await getSubscription();
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
