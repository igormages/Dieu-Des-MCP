import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  getOrganization,
  listBankAccounts,
  listTransactions,
  listTransactionsWithoutAttachments,
  listAttachmentsForTransaction,
  uploadAttachmentToTransaction,
  listBeneficiaries,
} from "./client";

export function registerQontoTools(server: McpServer) {
  server.tool(
    "qonto_get_organization",
    "Récupère les informations de l'organisation Qonto (nom légal, comptes bancaires)",
    {},
    async () => {
      const org = await getOrganization();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(org, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "qonto_list_bank_accounts",
    "Liste tous les comptes bancaires Qonto avec leurs soldes, IBAN et statuts",
    {},
    async () => {
      const accounts = await listBankAccounts();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(accounts, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "qonto_list_transactions",
    "Liste les transactions d'un compte bancaire Qonto avec filtres optionnels (dates, statut, pagination)",
    {
      bank_account_slug: z
        .string()
        .describe("Slug du compte bancaire (obtenu via qonto_list_bank_accounts)"),
      status: z
        .array(z.enum(["pending", "reversed", "declined", "completed"]))
        .optional()
        .describe("Filtrer par statut"),
      settled_at_from: z
        .string()
        .optional()
        .describe("Date de début (ISO 8601, ex: 2025-01-01T00:00:00.000Z)"),
      settled_at_to: z
        .string()
        .optional()
        .describe("Date de fin (ISO 8601)"),
      sort_by: z
        .enum(["updated_at:asc", "updated_at:desc", "settled_at:asc", "settled_at:desc"])
        .optional()
        .describe("Tri des résultats"),
      current_page: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe("Page courante (défaut: 1)"),
      per_page: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Résultats par page (max 100, défaut: 25)"),
    },
    async (params) => {
      const result = await listTransactions({
        bankAccountSlug: params.bank_account_slug,
        status: params.status,
        settledAtFrom: params.settled_at_from,
        settledAtTo: params.settled_at_to,
        sortBy: params.sort_by,
        currentPage: params.current_page,
        perPage: params.per_page,
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
    "qonto_list_beneficiaries",
    "Liste les bénéficiaires enregistrés dans Qonto (IBAN, nom, statut, confiance)",
    {
      status: z
        .enum(["pending", "trusted", "untrusted"])
        .optional()
        .describe("Filtrer par statut"),
      current_page: z.number().int().min(1).optional(),
      per_page: z.number().int().min(1).max(100).optional(),
    },
    async (params) => {
      const result = await listBeneficiaries({
        status: params.status,
        currentPage: params.current_page,
        perPage: params.per_page,
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
    "qonto_list_transactions_without_attachments",
    "Liste les transactions Qonto complétées qui n'ont PAS de pièce jointe (facture/reçu manquant). Utile pour identifier les transactions à justifier.",
    {
      bank_account_slug: z
        .string()
        .describe("Slug du compte bancaire (obtenu via qonto_list_bank_accounts)"),
      settled_at_from: z
        .string()
        .optional()
        .describe("Date de début (ISO 8601, ex: 2025-01-01T00:00:00.000Z)"),
      settled_at_to: z
        .string()
        .optional()
        .describe("Date de fin (ISO 8601)"),
      current_page: z.number().int().min(1).optional(),
      per_page: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Résultats par page avant filtrage (défaut: 100)"),
    },
    async (params) => {
      const result = await listTransactionsWithoutAttachments({
        bankAccountSlug: params.bank_account_slug,
        settledAtFrom: params.settled_at_from,
        settledAtTo: params.settled_at_to,
        currentPage: params.current_page,
        perPage: params.per_page,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                count: result.transactions.length,
                transactions: result.transactions,
                meta: result.meta,
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
    "qonto_list_attachments",
    "Liste les pièces jointes (factures, reçus) d'une transaction Qonto spécifique",
    {
      transaction_id: z
        .string()
        .describe("ID de la transaction (UUID, obtenu via qonto_list_transactions)"),
    },
    async (params) => {
      const attachments = await listAttachmentsForTransaction(
        params.transaction_id
      );
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { count: attachments.length, attachments },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.tool(
    "qonto_upload_attachment",
    "Envoie une pièce jointe (facture, reçu) sur une transaction Qonto. Accepte JPEG, PNG ou PDF encodé en base64.",
    {
      transaction_id: z
        .string()
        .describe("ID de la transaction (UUID)"),
      file_base64: z
        .string()
        .describe("Contenu du fichier encodé en base64"),
      file_name: z
        .string()
        .describe("Nom du fichier avec extension (ex: facture-2025-03.pdf)"),
      content_type: z
        .enum(["image/jpeg", "image/png", "application/pdf"])
        .describe("Type MIME du fichier"),
    },
    async (params) => {
      const result = await uploadAttachmentToTransaction(
        params.transaction_id,
        params.file_base64,
        params.file_name,
        params.content_type
      );
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                success: result.success,
                message: `Pièce jointe "${params.file_name}" envoyée sur la transaction ${params.transaction_id}. Le traitement est asynchrone, la pièce jointe sera visible sous quelques secondes.`,
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
