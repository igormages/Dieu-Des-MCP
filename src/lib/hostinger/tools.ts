import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listInvoices, listSubscriptions, listOrders } from "./client";

export function registerHostingerTools(server: McpServer) {
  server.tool(
    "hostinger_list_invoices",
    "Liste les factures Hostinger du compte",
    {
      page: z.number().int().min(1).optional().describe("Numéro de page"),
      per_page: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Résultats par page"),
      status: z
        .string()
        .optional()
        .describe("Filtrer par statut (ex: paid, unpaid, overdue)"),
      date_from: z
        .string()
        .optional()
        .describe("Date de début (YYYY-MM-DD)"),
      date_to: z
        .string()
        .optional()
        .describe("Date de fin (YYYY-MM-DD)"),
    },
    async (params) => {
      const result = await listInvoices({
        page: params.page,
        perPage: params.per_page,
        status: params.status,
        dateFrom: params.date_from,
        dateTo: params.date_to,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                total: result.meta?.total,
                count: result.data.length,
                invoices: result.data,
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
    "hostinger_list_subscriptions",
    "Liste les abonnements actifs Hostinger (hébergement, domaines, emails)",
    {
      page: z.number().int().min(1).optional().describe("Numéro de page"),
      per_page: z.number().int().min(1).max(100).optional().describe("Résultats par page"),
      status: z
        .string()
        .optional()
        .describe("Filtrer par statut (ex: active, expired, cancelled)"),
    },
    async (params) => {
      const result = await listSubscriptions({
        page: params.page,
        perPage: params.per_page,
        status: params.status,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                total: result.meta?.total,
                count: result.data.length,
                subscriptions: result.data,
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
    "hostinger_list_orders",
    "Liste les commandes Hostinger",
    {
      page: z.number().int().min(1).optional().describe("Numéro de page"),
      per_page: z.number().int().min(1).max(100).optional().describe("Résultats par page"),
    },
    async (params) => {
      const result = await listOrders({
        page: params.page,
        perPage: params.per_page,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                total: result.meta?.total,
                count: result.data.length,
                orders: result.data,
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
