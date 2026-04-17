import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listBillingAccounts, listInvoices, listProjectsForBillingAccount } from "./client";

export function registerGoogleCloudTools(server: McpServer) {
  server.tool(
    "googlecloud_list_billing_accounts",
    "Liste les comptes de facturation Google Cloud associés au compte de service",
    {
      page_size: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Nombre de comptes par page (défaut: 20)"),
      page_token: z
        .string()
        .optional()
        .describe("Token de pagination pour la page suivante"),
    },
    async (params) => {
      const result = await listBillingAccounts({
        pageSize: params.page_size,
        pageToken: params.page_token,
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
    "googlecloud_list_invoices",
    "Liste les factures Google Cloud pour un compte de facturation donné",
    {
      billing_account_name: z
        .string()
        .describe("Nom du compte de facturation (ex: billingAccounts/012345-567890-ABCDEF, obtenu via googlecloud_list_billing_accounts)"),
      page_size: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Nombre de factures par page"),
      page_token: z
        .string()
        .optional()
        .describe("Token de pagination"),
    },
    async (params) => {
      const result = await listInvoices({
        billingAccountName: params.billing_account_name,
        pageSize: params.page_size,
        pageToken: params.page_token,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { count: result.invoices?.length ?? 0, invoices: result.invoices ?? [], nextPageToken: result.nextPageToken },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.tool(
    "googlecloud_list_projects",
    "Liste les projets Google Cloud associés à un compte de facturation",
    {
      billing_account_name: z
        .string()
        .describe("Nom du compte de facturation (ex: billingAccounts/012345-567890-ABCDEF)"),
      page_size: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Nombre de projets par page"),
    },
    async (params) => {
      const result = await listProjectsForBillingAccount({
        billingAccountName: params.billing_account_name,
        pageSize: params.page_size,
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
