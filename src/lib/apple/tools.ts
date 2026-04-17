import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listApps, getSalesReport, getFinanceReport } from "./client";

export function registerAppleTools(server: McpServer) {
  server.tool(
    "apple_list_apps",
    "Liste les applications Apple dans App Store Connect",
    {
      limit: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe("Nombre maximum d'applications à retourner (défaut: 100)"),
    },
    async (params) => {
      const result = await listApps({ limit: params.limit });
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
    "apple_get_sales_report",
    "Télécharge un rapport de ventes Apple App Store Connect (données financières, achats in-app, abonnements)",
    {
      vendor_number: z
        .string()
        .describe("Numéro vendeur Apple (visible dans App Store Connect > Agreements, Tax, Banking)"),
      report_type: z
        .enum(["SALES", "SUBSCRIPTION", "SUBSCRIPTION_EVENT", "SUBSCRIBER"])
        .describe("Type de rapport"),
      report_sub_type: z
        .enum(["SUMMARY", "DETAILED"])
        .describe("Sous-type de rapport"),
      frequency: z
        .enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"])
        .describe("Fréquence du rapport"),
      report_date: z
        .string()
        .describe("Date du rapport (YYYY-MM pour mensuel, YYYY-MM-DD pour quotidien)"),
    },
    async (params) => {
      const data = await getSalesReport({
        vendorNumber: params.vendor_number,
        reportType: params.report_type,
        reportSubType: params.report_sub_type,
        frequency: params.frequency,
        reportDate: params.report_date,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: data,
          },
        ],
      };
    }
  );

  server.tool(
    "apple_get_finance_report",
    "Télécharge un rapport financier Apple (revenus, paiements) pour une période fiscale donnée",
    {
      vendor_number: z
        .string()
        .describe("Numéro vendeur Apple"),
      region_code: z
        .string()
        .describe("Code région (ex: US, GB, FR, Z1 pour le monde entier)"),
      report_type: z
        .enum(["FINANCIAL_REPORT", "FINANCE_DETAIL"])
        .describe("Type de rapport financier"),
      fiscal_year: z
        .string()
        .describe("Année fiscale Apple (ex: 2025)"),
      fiscal_period: z
        .string()
        .describe("Période fiscale Apple 01-13 (ex: 01 pour janvier)"),
    },
    async (params) => {
      const data = await getFinanceReport({
        vendorNumber: params.vendor_number,
        regionCode: params.region_code,
        reportType: params.report_type,
        fiscalYear: params.fiscal_year,
        fiscalPeriod: params.fiscal_period,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: data,
          },
        ],
      };
    }
  );
}
