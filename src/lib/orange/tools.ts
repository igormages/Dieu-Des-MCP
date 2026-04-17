import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listInvoices, listCustomerAccounts } from "./client";

export function registerOrangeTools(server: McpServer) {
  server.tool(
    "orange_list_customer_accounts",
    "Liste les comptes clients Orange Business associés aux identifiants API",
    {
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Nombre de comptes à retourner"),
      offset: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Décalage pour la pagination"),
    },
    async (params) => {
      const result = await listCustomerAccounts({
        limit: params.limit,
        offset: params.offset,
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
    "orange_list_invoices",
    "Liste les factures Orange Business (téléphonie, internet, cloud entreprise)",
    {
      invoice_date_from: z
        .string()
        .optional()
        .describe("Date de facture de début (YYYY-MM-DD)"),
      invoice_date_to: z
        .string()
        .optional()
        .describe("Date de facture de fin (YYYY-MM-DD)"),
      state: z
        .string()
        .optional()
        .describe("Statut de la facture (ex: sent, settled, partial)"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Nombre de factures à retourner"),
      offset: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Décalage pour la pagination"),
    },
    async (params) => {
      const result = await listInvoices({
        invoiceDateFrom: params.invoice_date_from,
        invoiceDateTo: params.invoice_date_to,
        state: params.state,
        limit: params.limit,
        offset: params.offset,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                totalResults: result.totalResults,
                count: result.invoice?.length ?? 0,
                invoices: result.invoice ?? [],
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
