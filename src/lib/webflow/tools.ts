import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listSites, listWorkspaces, getAuthorizedUser, listEcommerceOrders } from "./client";

export function registerWebflowTools(server: McpServer) {
  server.tool(
    "webflow_get_account",
    "Récupère les informations du compte Webflow lié au token API",
    {},
    async () => {
      const user = await getAuthorizedUser();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(user, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "webflow_list_workspaces",
    "Liste les workspaces Webflow accessibles",
    {},
    async () => {
      const result = await listWorkspaces();
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
    "webflow_list_sites",
    "Liste tous les sites Webflow du compte (avec dates de création et de publication)",
    {},
    async () => {
      const result = await listSites();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { count: result.sites?.length ?? 0, sites: result.sites },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.tool(
    "webflow_list_ecommerce_orders",
    "Liste les commandes e-commerce Webflow d'un site (pour les sites avec Webflow Commerce)",
    {
      site_id: z
        .string()
        .describe("ID du site Webflow (obtenu via webflow_list_sites)"),
      status: z
        .enum(["pending", "unfulfilled", "fulfilled", "refunded", "disputed", "dispute-lost"])
        .optional()
        .describe("Filtrer par statut de commande"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Nombre de commandes à retourner"),
      offset: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Décalage pour la pagination"),
    },
    async (params) => {
      const result = await listEcommerceOrders({
        siteId: params.site_id,
        status: params.status,
        limit: params.limit,
        offset: params.offset,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                total: result.pagination?.total,
                count: result.orders?.length ?? 0,
                orders: result.orders,
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
