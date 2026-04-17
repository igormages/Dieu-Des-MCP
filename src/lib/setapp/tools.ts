import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listTransactions, listSubscriptions, listPayments } from "./client";

export function registerSetappTools(server: McpServer) {
  server.tool(
    "setapp_list_transactions",
    "Liste les transactions Paddle/Setapp (paiements reçus, achats)",
    {
      from: z
        .string()
        .optional()
        .describe("Date de début (YYYY-MM-DD)"),
      to: z
        .string()
        .optional()
        .describe("Date de fin (YYYY-MM-DD)"),
      subscription_id: z
        .number()
        .int()
        .optional()
        .describe("Filtrer par ID d'abonnement Paddle"),
      page: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe("Numéro de page"),
      results_per_page: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe("Résultats par page (défaut: 15, max: 200)"),
    },
    async (params) => {
      const result = await listTransactions({
        from: params.from,
        to: params.to,
        subscriptionId: params.subscription_id,
        page: params.page,
        resultsPerPage: params.results_per_page,
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
    "setapp_list_subscriptions",
    "Liste les abonnements Paddle/Setapp actifs ou passés",
    {
      state: z
        .enum(["active", "past_due", "trialing", "paused", "deleted"])
        .optional()
        .describe("Filtrer par état de l'abonnement"),
      plan: z
        .number()
        .int()
        .optional()
        .describe("Filtrer par ID de plan Paddle"),
      page: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe("Numéro de page"),
      results_per_page: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe("Résultats par page"),
    },
    async (params) => {
      const result = await listSubscriptions({
        state: params.state,
        plan: params.plan,
        page: params.page,
        resultsPerPage: params.results_per_page,
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
    "setapp_list_payments",
    "Liste les paiements d'abonnements Paddle (avec liens vers les reçus/factures)",
    {
      subscription_id: z
        .number()
        .int()
        .optional()
        .describe("Filtrer par ID d'abonnement Paddle"),
      is_paid: z
        .enum(["0", "1"])
        .optional()
        .describe("Filtrer par statut de paiement (1=payé, 0=en attente)"),
      from: z
        .string()
        .optional()
        .describe("Date de début du paiement (YYYY-MM-DD)"),
      to: z
        .string()
        .optional()
        .describe("Date de fin du paiement (YYYY-MM-DD)"),
    },
    async (params) => {
      const result = await listPayments({
        subscriptionId: params.subscription_id,
        isPaid: params.is_paid !== undefined ? (Number(params.is_paid) as 0 | 1) : undefined,
        from: params.from,
        to: params.to,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { count: result.length, payments: result },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}
