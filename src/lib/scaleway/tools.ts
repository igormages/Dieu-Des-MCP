import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listInvoices, downloadInvoice, getConsumption } from "./client";

export function registerScalewayTools(server: McpServer) {
  server.tool(
    "scaleway_list_invoices",
    "Liste les factures Scaleway de l'organisation",
    {
      started_after: z
        .string()
        .optional()
        .describe("Date de début (ISO 8601, ex: 2025-01-01T00:00:00Z)"),
      started_before: z
        .string()
        .optional()
        .describe("Date de fin (ISO 8601)"),
      invoice_type: z
        .enum(["periodic", "purchase"])
        .optional()
        .describe("Type de facture (periodic = mensuelle, purchase = achat ponctuel)"),
      page: z.number().int().min(1).optional().describe("Numéro de page"),
      page_size: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Résultats par page (défaut: 20)"),
    },
    async (params) => {
      const result = await listInvoices({
        startedAfter: params.started_after,
        startedBefore: params.started_before,
        invoiceType: params.invoice_type,
        page: params.page,
        pageSize: params.page_size,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                total_count: result.total_count,
                count: result.invoices.length,
                invoices: result.invoices,
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
    "scaleway_download_invoice",
    "Obtient le lien de téléchargement d'une facture Scaleway en PDF",
    {
      invoice_id: z
        .string()
        .describe("ID de la facture Scaleway (UUID, obtenu via scaleway_list_invoices)"),
    },
    async (params) => {
      const result = await downloadInvoice(params.invoice_id);
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
    "scaleway_get_consumption",
    "Récupère la consommation Scaleway détaillée par ressource pour un mois donné",
    {
      month: z
        .string()
        .optional()
        .describe("Période de facturation au format YYYY-MM (ex: 2025-01). Par défaut: mois en cours"),
      project_id: z
        .string()
        .optional()
        .describe("Filtrer par projet Scaleway (UUID)"),
    },
    async (params) => {
      const result = await getConsumption({
        month: params.month,
        projectId: params.project_id,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                total_count: result.total_count,
                updated_at: result.updated_at,
                consumptions: result.consumptions,
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
