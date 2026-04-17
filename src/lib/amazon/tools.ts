import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listOrders, listInvoices } from "./client";

export function registerAmazonTools(server: McpServer) {
  server.tool(
    "amazon_list_orders",
    "Liste les commandes Amazon Business via SP-API (Selling Partner API avec Login with Amazon)",
    {
      created_after: z
        .string()
        .optional()
        .describe("Date de début ISO 8601 (ex: 2025-01-01T00:00:00Z)"),
      created_before: z
        .string()
        .optional()
        .describe("Date de fin ISO 8601"),
      order_statuses: z
        .array(
          z.enum([
            "PendingAvailability",
            "Pending",
            "Unshipped",
            "PartiallyShipped",
            "Shipped",
            "Canceled",
            "Unfulfillable",
          ])
        )
        .optional()
        .describe("Filtrer par statut de commande"),
      max_results_per_page: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Nombre de résultats par page (max 100)"),
      next_token: z
        .string()
        .optional()
        .describe("Token de pagination"),
    },
    async (params) => {
      const result = await listOrders({
        createdAfter: params.created_after,
        createdBefore: params.created_before,
        orderStatuses: params.order_statuses,
        maxResultsPerPage: params.max_results_per_page,
        nextToken: params.next_token,
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
    "amazon_list_invoices",
    "Liste les factures TVA Amazon Business (compte acheteur pro) via Business Invoices API",
    {
      marketplace_id: z
        .string()
        .optional()
        .describe("ID du marketplace (défaut: A13V1IB3VIYZZH pour FR)"),
      date_range_start: z
        .string()
        .optional()
        .describe("Date de début ISO 8601 (ex: 2025-01-01T00:00:00Z)"),
      date_range_end: z
        .string()
        .optional()
        .describe("Date de fin ISO 8601"),
      page_size: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Nombre de résultats par page"),
      next_token: z
        .string()
        .optional()
        .describe("Token de pagination"),
    },
    async (params) => {
      const result = await listInvoices({
        marketplaceId: params.marketplace_id,
        dateRangeStart: params.date_range_start,
        dateRangeEnd: params.date_range_end,
        pageSize: params.page_size,
        nextToken: params.next_token,
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
