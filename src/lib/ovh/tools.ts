import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listBills, getBill, getBillDetails, getMe } from "./client";

export function registerOvhTools(server: McpServer) {
  server.tool(
    "ovh_get_account",
    "Récupère les informations du compte OVH (nom, email, organisation, devise)",
    {},
    async () => {
      const me = await getMe();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(me, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "ovh_list_bills",
    "Liste toutes les factures OVH du compte (retourne les IDs de factures)",
    {},
    async () => {
      const bills = await listBills();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ count: bills.length, billIds: bills }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "ovh_get_bill",
    "Récupère les détails d'une facture OVH spécifique (montant, date, PDF)",
    {
      bill_id: z
        .string()
        .describe("ID de la facture OVH (ex: FR12345678, obtenu via ovh_list_bills)"),
    },
    async (params) => {
      const bill = await getBill(params.bill_id);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(bill, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "ovh_get_bill_details",
    "Récupère le détail des lignes d'une facture OVH (services facturés, quantités, prix)",
    {
      bill_id: z
        .string()
        .describe("ID de la facture OVH (obtenu via ovh_list_bills)"),
    },
    async (params) => {
      const detailIds = await getBillDetails(params.bill_id);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { count: detailIds.length, detailIds },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}
