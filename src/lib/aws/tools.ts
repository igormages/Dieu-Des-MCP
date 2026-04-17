import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getCostAndUsage, getCostForecast, getDimensionValues } from "./client";

export function registerAwsTools(server: McpServer) {
  server.tool(
    "aws_get_cost_and_usage",
    "Récupère les coûts et consommations AWS via Cost Explorer (nécessite la permission ce:GetCostAndUsage)",
    {
      start_date: z
        .string()
        .describe("Date de début au format YYYY-MM-DD (ex: 2025-01-01)"),
      end_date: z
        .string()
        .describe("Date de fin au format YYYY-MM-DD (ex: 2025-12-31, non incluse)"),
      granularity: z
        .enum(["DAILY", "MONTHLY", "HOURLY"])
        .optional()
        .describe("Granularité des résultats (défaut: MONTHLY)"),
      group_by_dimension: z
        .string()
        .optional()
        .describe("Dimension de regroupement (ex: SERVICE, LINKED_ACCOUNT, REGION)"),
      metrics: z
        .array(z.string())
        .optional()
        .describe("Métriques à inclure (défaut: UnblendedCost, UsageQuantity)"),
    },
    async (params) => {
      const result = await getCostAndUsage({
        startDate: params.start_date,
        endDate: params.end_date,
        granularity: params.granularity,
        groupBy: params.group_by_dimension
          ? [{ type: "DIMENSION", key: params.group_by_dimension }]
          : undefined,
        metrics: params.metrics,
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
    "aws_get_cost_forecast",
    "Obtient une prévision de coûts AWS pour une période future",
    {
      start_date: z
        .string()
        .describe("Date de début de la prévision (YYYY-MM-DD, doit être dans le futur)"),
      end_date: z
        .string()
        .describe("Date de fin de la prévision (YYYY-MM-DD)"),
      granularity: z
        .enum(["DAILY", "MONTHLY"])
        .optional()
        .describe("Granularité (défaut: MONTHLY)"),
      metric: z
        .enum(["UNBLENDED_COST", "BLENDED_COST", "AMORTIZED_COST", "NET_AMORTIZED_COST", "NET_UNBLENDED_COST"])
        .optional()
        .describe("Métrique de coût (défaut: UNBLENDED_COST)"),
    },
    async (params) => {
      const result = await getCostForecast({
        startDate: params.start_date,
        endDate: params.end_date,
        granularity: params.granularity,
        metric: params.metric,
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
    "aws_list_services",
    "Liste tous les services AWS utilisés sur une période donnée",
    {
      start_date: z.string().describe("Date de début (YYYY-MM-DD)"),
      end_date: z.string().describe("Date de fin (YYYY-MM-DD)"),
    },
    async (params) => {
      const result = await getDimensionValues({
        startDate: params.start_date,
        endDate: params.end_date,
        dimension: "SERVICE",
      });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { count: result.DimensionValues.length, services: result.DimensionValues },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}
