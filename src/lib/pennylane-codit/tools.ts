import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  pennylaneCoditCustomerInvoiceUrl,
  pennylaneCoditDownloadPdfAsBase64,
  pennylaneCoditQuoteByIdUrl,
  pennylaneCoditRequestAbsolute,
  pennylaneCoditRequestBase,
  pennylaneCoditSendInvoiceByEmail,
  pennylaneCoditV2CustomerInvoicesRoot,
  pennylaneCoditV2QuotesRoot,
  requirePennylaneCoditConfig,
} from "./client";

const lineItemSchema = z.object({
  label: z.string(),
  quantity: z.number(),
  unit: z.string(),
  /** Montant HT unitaire (v2: `raw_currency_unit_price`) ; avec qté 1 = montant ligne FactoFrance. */
  currency_amount_before_tax: z.union([z.number(), z.string()]),
  vat_rate: z.string(),
});

function textJson(data: unknown): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

export function registerPennylaneCoditTools(server: McpServer) {
  server.tool(
    "pennylane_codit_create_customer_invoice",
    `Pennylane (COD'IT) : crée une facture client (POST customer_invoices).
Compat FactoFrance (API v1) : enveloppe invoice + customer.source_id + line_items (HT).
Ou API v2 plate : passer customer_id (nombre) et lignes converties en invoice_lines (prix HT unitaire en string).
Ou invoice_json pour envoyer le JSON Pennylane tel quel. Pour modifier une facture ou un brouillon : pennylane_codit_update_customer_invoice.`,
    {
      invoice_json: z
        .string()
        .optional()
        .describe(
          "Si renseigné : corps POST brut JSON (prioritaire). Ex. payload complet documenté Pennylane."
        ),
      customer_source_id: z
        .string()
        .optional()
        .describe("ID source client Pennylane (API v1, ex. PENNYLANE_CUSTOMER_SOURCE_ID FactoFrance)."),
      customer_id: z.number().optional().describe("ID client numérique (API v2, voir doc Pennylane)."),
      invoice_date: z.string().optional().describe("Date facture ISO (YYYY-MM-DD)."),
      deadline_date: z.string().optional().describe("Échéance ISO (YYYY-MM-DD)."),
      draft: z
        .boolean()
        .optional()
        .describe("true = brouillon (recommandé par défaut en test)."),
      special_mention: z.string().optional().describe("Mention libre sur PDF (v1 invoice)."),
      create_customer: z.boolean().optional().describe("v1 uniquement ; défaut false."),
      create_products: z.boolean().optional().describe("v1 uniquement ; défaut false."),
      external_reference: z.string().optional().describe("Référence externe (souvent v2)."),
      line_items: z
        .array(lineItemSchema)
        .optional()
        .describe("Lignes de facturation (requis si pas invoice_json)."),
    },
    async (args) => {
      if (args.invoice_json) {
        let body: unknown;
        try {
          body = JSON.parse(args.invoice_json) as unknown;
        } catch {
          throw new Error("invoice_json n’est pas un JSON valide.");
        }
        const res = await pennylaneCoditRequestBase<unknown>("POST", "/customer_invoices", body);
        return textJson(res);
      }

      const draft = args.draft ?? true;
      const date = args.invoice_date;
      const deadline = args.deadline_date;
      const lines = args.line_items;
      if (!date || !deadline) {
        throw new Error("invoice_date et deadline_date sont requis (sauf si invoice_json).");
      }
      if (!lines?.length) {
        throw new Error("line_items requis (ou invoice_json).");
      }

      if (args.customer_id != null) {
        const invoice_lines = lines.map((li) => ({
          label: li.label,
          quantity: li.quantity,
          unit: li.unit,
          raw_currency_unit_price: String(li.currency_amount_before_tax),
          vat_rate: li.vat_rate,
        }));
        const v2Body: Record<string, unknown> = {
          customer_id: args.customer_id,
          date,
          deadline,
          draft,
          invoice_lines,
          use_2026_api_changes: true,
        };
        if (args.external_reference) v2Body.external_reference = args.external_reference;
        const { baseUrl } = await requirePennylaneCoditConfig();
        const url = pennylaneCoditV2CustomerInvoicesRoot(baseUrl);
        const res = await pennylaneCoditRequestAbsolute<unknown>("POST", url, v2Body);
        return textJson(res);
      }

      if (!args.customer_source_id) {
        throw new Error("customer_source_id (v1) ou customer_id (v2), ou invoice_json.");
      }

      const v1Body = {
        create_customer: args.create_customer ?? false,
        create_products: args.create_products ?? false,
        use_2026_api_changes: true,
        invoice: {
          date,
          deadline,
          draft,
          customer: { source_id: args.customer_source_id },
          special_mention: args.special_mention ?? "",
          line_items: lines.map((li) => ({
            label: li.label,
            quantity: li.quantity,
            unit: li.unit,
            currency_amount_before_tax:
              typeof li.currency_amount_before_tax === "number"
                ? li.currency_amount_before_tax
                : Number(li.currency_amount_before_tax),
            vat_rate: li.vat_rate,
          })),
        },
      };

      const res = await pennylaneCoditRequestBase<unknown>("POST", "/customer_invoices", v1Body);
      return textJson(res);
    }
  );

  server.tool(
    "pennylane_codit_get_customer_invoice",
    "Pennylane (COD'IT) : récupère une facture client (id Pennylane), incluant souvent file_url pour le PDF.",
    {
      invoice_id: z.union([z.string(), z.number()]).describe("Identifiant retourné par Pennylane à la création."),
    },
    async ({ invoice_id }) => {
      const res = await pennylaneCoditRequestBase<unknown>(
        "GET",
        `/customer_invoices/${encodeURIComponent(String(invoice_id))}`
      );
      return textJson(res);
    }
  );

  server.tool(
    "pennylane_codit_finalize_customer_invoice",
    "Pennylane (COD'IT) : finalise une facture brouillon (PUT …/finalize).",
    {
      invoice_id: z.union([z.string(), z.number()]),
    },
    async ({ invoice_id }) => {
      await pennylaneCoditRequestBase<unknown>(
        "PUT",
        `/customer_invoices/${encodeURIComponent(String(invoice_id))}/finalize`,
        {}
      );
      return textJson({ ok: true, invoice_id: String(invoice_id), finalized: true });
    }
  );

  server.tool(
    "pennylane_codit_send_customer_invoice_by_email",
    "Pennylane (COD'IT) : envoie la facture par email (POST …/send_by_email). Retry automatique si 409. API v2 : renseigner recipients pour une liste précise.",
    {
      invoice_id: z.union([z.string(), z.number()]),
      recipients: z
        .array(z.string())
        .optional()
        .describe("Optionnel (v2). Ex. [\"client@domaine.fr\"] ; sinon corps {} comme FactoFrance v1."),
    },
    async ({ invoice_id, recipients }) => {
      const path = `/customer_invoices/${encodeURIComponent(String(invoice_id))}/send_by_email`;
      const body = recipients?.length ? { recipients } : {};
      await pennylaneCoditSendInvoiceByEmail(path, body);
      return textJson({ ok: true, invoice_id: String(invoice_id), sent_by_email: true });
    }
  );

  server.tool(
    "pennylane_codit_get_customer_invoice_pdf",
    "Pennylane (COD'IT) : obtient file_url puis télécharge le PDF ; retourne l’URL et optionnellement le base64 (fichiers lourds = réponse volumineuse).",
    {
      invoice_id: z.union([z.string(), z.number()]),
      include_base64: z
        .boolean()
        .optional()
        .describe("Si true, inclut le PDF encodé base64 (attention taille)."),
    },
    async ({ invoice_id, include_base64 }) => {
      const inv = await pennylaneCoditRequestBase<{ file_url?: string }>(
        "GET",
        `/customer_invoices/${encodeURIComponent(String(invoice_id))}`
      );
      const fileUrl = inv.file_url;
      if (!fileUrl) {
        throw new Error("Pas de file_url sur cette facture (brouillon non généré ?). Réponse vide côté PDF.");
      }
      const out: Record<string, unknown> = { invoice_id: String(invoice_id), file_url: fileUrl };
      if (include_base64) {
        out.pdf_base64 = await pennylaneCoditDownloadPdfAsBase64(fileUrl);
      }
      return textJson(out);
    }
  );

  server.tool(
    "pennylane_codit_create_quote",
    "Pennylane (COD'IT) : crée un devis (POST API v2 /quotes). Scope typique quotes:all. Utiliser quote_json pour un corps conforme à la doc, ou champs simplifiés.",
    {
      quote_json: z.string().optional().describe("Corps POST JSON brut pour /v2/quotes (prioritaire)."),
      customer_id: z.number().optional().describe("ID client Pennylane (requis si pas quote_json)."),
      quote_date: z.string().optional().describe("YYYY-MM-DD"),
      deadline_date: z.string().optional().describe("Fin de validité YYYY-MM-DD"),
      invoice_lines: z
        .string()
        .optional()
        .describe("JSON array invoice_lines (voir doc Pennylane Create quote)."),
    },
    async (args) => {
      const { baseUrl } = await requirePennylaneCoditConfig();
      const url = pennylaneCoditV2QuotesRoot(baseUrl);
      if (args.quote_json) {
        let body: unknown;
        try {
          body = JSON.parse(args.quote_json) as unknown;
        } catch {
          throw new Error("quote_json invalide.");
        }
        const res = await pennylaneCoditRequestAbsolute<unknown>("POST", url, body);
        return textJson(res);
      }
      if (
        args.customer_id == null ||
        !args.quote_date ||
        !args.deadline_date ||
        !args.invoice_lines
      ) {
        throw new Error("quote_json OU (customer_id, quote_date, deadline_date, invoice_lines JSON).");
      }
      let lines: unknown[];
      try {
        lines = JSON.parse(args.invoice_lines) as unknown[];
      } catch {
        throw new Error("invoice_lines doit être un tableau JSON valide.");
      }
      const body = {
        date: args.quote_date,
        deadline: args.deadline_date,
        customer_id: args.customer_id,
        invoice_lines: lines,
        use_2026_api_changes: true,
      };
      const res = await pennylaneCoditRequestAbsolute<unknown>("POST", url, body);
      return textJson(res);
    }
  );

  server.tool(
    "pennylane_codit_create_credit_note",
    `Pennylane (COD'IT) : crée un avoir via POST customer_invoices (souvent API v2) — montants HT négatifs pour annulation partielle / totale, ou credit_note_json pour reprendre la doc officielle.`,
    {
      credit_note_json: z
        .string()
        .optional()
        .describe("Corps POST JSON brut (prioritaire), ex. avoir avec lignes négatives ou champ crédité selon votre version API."),
      customer_id: z.number().optional(),
      credit_date: z.string().optional().describe("YYYY-MM-DD"),
      deadline_date: z.string().optional().describe("YYYY-MM-DD"),
      draft: z.boolean().optional(),
      invoice_lines: z.string().optional().describe("JSON array de lignes (souvent raw_currency_unit_price négatif)."),
    },
    async (args) => {
      const { baseUrl } = await requirePennylaneCoditConfig();
      const urlRoot = pennylaneCoditV2CustomerInvoicesRoot(baseUrl);
      if (args.credit_note_json) {
        let body: unknown;
        try {
          body = JSON.parse(args.credit_note_json) as unknown;
        } catch {
          throw new Error("credit_note_json invalide.");
        }
        const res = await pennylaneCoditRequestAbsolute<unknown>("POST", urlRoot, body);
        return textJson(res);
      }
      if (
        args.customer_id == null ||
        !args.credit_date ||
        !args.deadline_date ||
        !args.invoice_lines
      ) {
        throw new Error(
          "credit_note_json OU (customer_id, credit_date, deadline_date, invoice_lines en JSON)."
        );
      }
      let lines: unknown[];
      try {
        lines = JSON.parse(args.invoice_lines) as unknown[];
      } catch {
        throw new Error("invoice_lines doit être un tableau JSON valide.");
      }
      const body: Record<string, unknown> = {
        customer_id: args.customer_id,
        date: args.credit_date,
        deadline: args.deadline_date,
        draft: args.draft ?? true,
        invoice_lines: lines,
        use_2026_api_changes: true,
      };
      const res = await pennylaneCoditRequestAbsolute<unknown>("POST", urlRoot, body);
      return textJson(res);
    }
  );

  server.tool(
    "pennylane_codit_link_credit_note_to_invoice",
    "Pennylane (COD'IT) : lie un avoir à une facture (POST v2 …/customer_invoices/{id}/link_credit_note).",
    {
      customer_invoice_id: z.union([z.string(), z.number()]).describe("Facture à créditer."),
      credit_note_id: z.union([z.string(), z.number()]).describe("ID de l’avoir créé."),
    },
    async ({ customer_invoice_id, credit_note_id }) => {
      const { baseUrl } = await requirePennylaneCoditConfig();
      const root = pennylaneCoditV2CustomerInvoicesRoot(baseUrl);
      const url = `${root}/${encodeURIComponent(String(customer_invoice_id))}/link_credit_note`;
      const cnId = Number(credit_note_id);
      if (Number.isNaN(cnId)) {
        throw new Error("credit_note_id doit être numérique pour link_credit_note.");
      }
      const body = { credit_note_id: cnId };
      const res = await pennylaneCoditRequestAbsolute<unknown>("POST", url, body);
      return textJson(res);
    }
  );

  server.tool(
    "pennylane_codit_update_customer_invoice",
    `Pennylane (COD'IT) : modifie une facture ou un avoir (endpoint « Update customer invoice », doc Pennylane). Souvent réservé aux brouillons ; une facture finalisée peut être verrouillée — utiliser un avoir si besoin.`,
    {
      invoice_id: z.union([z.string(), z.number()]).describe("ID Pennylane de la facture à mettre à jour."),
      invoice_update_json: z
        .string()
        .describe(
          "Corps JSON Pennylane (date, deadline, invoice_lines, special_mention, draft, …). Voir référence « Update a customer invoice »."
        ),
      api_version: z
        .enum(["v2", "v1"])
        .optional()
        .describe(
          "v2 recommandé. v1 si ton instance n’expose pas encore la mise à jour sur v2 (même host, chemin /api/external/v1/...)."
        ),
      http_method: z
        .enum(["PUT", "PATCH"])
        .optional()
        .describe(
          "PUT par défaut. Si Pennylane renvoie 405, réessaie avec PATCH (selon ta version de doc / OpenAPI)."
        ),
    },
    async ({ invoice_id, invoice_update_json, api_version, http_method }) => {
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(invoice_update_json) as Record<string, unknown>;
      } catch {
        throw new Error("invoice_update_json invalide.");
      }
      body.use_2026_api_changes = body.use_2026_api_changes ?? true;

      const { baseUrl } = await requirePennylaneCoditConfig();
      const ver = api_version === "v1" ? "1" : "2";
      const url = pennylaneCoditCustomerInvoiceUrl(baseUrl, invoice_id, ver);
      const method = http_method ?? "PUT";
      const res = await pennylaneCoditRequestAbsolute<unknown>(method, url, body);
      return textJson(res);
    }
  );

  server.tool(
    "pennylane_codit_update_quote",
    `Pennylane (COD'IT) : modifie un devis (PUT/PATCH « Update a quote » API v2, doc Pennylane).`,
    {
      quote_id: z.union([z.string(), z.number()]),
      quote_update_json: z
        .string()
        .describe(
          "Corps JSON (date, deadline, customer_id, invoice_lines avec add/update/delete, …). Voir référence « Update a quote »."
        ),
      http_method: z.enum(["PUT", "PATCH"]).optional().describe("PUT par défaut ; PATCH si 405."),
    },
    async ({ quote_id, quote_update_json, http_method }) => {
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(quote_update_json) as Record<string, unknown>;
      } catch {
        throw new Error("quote_update_json invalide.");
      }
      body.use_2026_api_changes = body.use_2026_api_changes ?? true;

      const { baseUrl } = await requirePennylaneCoditConfig();
      const url = pennylaneCoditQuoteByIdUrl(baseUrl, quote_id);
      const method = http_method ?? "PUT";
      const res = await pennylaneCoditRequestAbsolute<unknown>(method, url, body);
      return textJson(res);
    }
  );
}
