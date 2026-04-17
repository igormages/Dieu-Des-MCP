import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listInvoices, getInvoiceDocuments } from "./client";

export function registerMicrosoftTools(server: McpServer) {
  server.tool(
    "microsoft_list_invoices",
    "Liste les factures Microsoft 365 via Microsoft Graph API (nécessite la permission InvoiceRead.All dans Azure AD)",
    {
      period_start_date: z
        .string()
        .optional()
        .describe("Date de début au format YYYY-MM-DD (ex: 2025-01-01)"),
      period_end_date: z
        .string()
        .optional()
        .describe("Date de fin au format YYYY-MM-DD (ex: 2025-12-31)"),
      top: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Nombre maximum de résultats (défaut: 20)"),
    },
    async (params) => {
      const result = await listInvoices({
        periodStartDate: params.period_start_date,
        periodEndDate: params.period_end_date,
        top: params.top,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { count: result.value.length, invoices: result.value, nextLink: result["@odata.nextLink"] },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.tool(
    "microsoft_get_invoice_documents",
    "Récupère les documents (PDF) associés à une facture Microsoft 365",
    {
      invoice_id: z.string().describe("ID de la facture Microsoft (obtenu via microsoft_list_invoices)"),
    },
    async (params) => {
      const documents = await getInvoiceDocuments(params.invoice_id);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ count: documents.length, documents }, null, 2),
          },
        ],
      };
    }
  );
}
