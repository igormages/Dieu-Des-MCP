import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getServiceKeys } from "@/lib/keys/store";
import {
  CODIT_STANDARD_PAYMENT_TERMS_FR,
  CODIT_TRANCHE_LINE_TITLES,
} from "./devis-total-ht";
import {
  coditTrancheTitle,
  loadCoditPresentationSlides,
  pennylaneStyleLineItem,
  type CoditPresentationSlide,
  type CoditTrancheIndex,
} from "./presentation";

async function requireCoditPresentationSource(): Promise<string> {
  const cfg = await getServiceKeys("coditVentePres");
  const fromKv = cfg?.presentationSource?.trim();
  const fromEnv = process.env.CODIT_VENTEPRES_PRESENTATION_SOURCE?.trim();
  const src = fromKv || fromEnv;
  if (!src) {
    throw new Error(
      "CoditVentePres : définir « Source présentation » dans les réglages MCP ou CODIT_VENTEPRES_PRESENTATION_SOURCE (URL du presentation.json ou chemin dossier commercial/)."
    );
  }
  return src;
}

function textJson(data: unknown): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

function slideSummary(s: CoditPresentationSlide): Record<string, unknown> {
  return {
    pdf_index: s.pdf_index,
    title: s.title,
    hide_pdf_link: s.hide_pdf_link,
    total_ht_estimated: s.total_ht_estimated,
    has_tranches: Boolean(s.tranches_ht),
    points_preview: s.points.slice(0, 3),
  };
}

export function registerCoditVentePresTools(server: McpServer) {
  server.tool(
    "codit_ventepres_standard_billing_terms",
    `CoditVentePres (COD'IT) : texte officiel des conditions de paiement (3 × 30 %), libellés de lignes Pennylane / Qonto, et rappel du flux MCP Pennylane (COD'IT) pour les factures brouillon.`,
    {},
    async () =>
      textJson({
        payment_terms_full_text_fr: CODIT_STANDARD_PAYMENT_TERMS_FR,
        tranche_indices: [
          {
            index: 0,
            label: CODIT_TRANCHE_LINE_TITLES[0],
            milestone: "à la signature",
          },
          {
            index: 1,
            label: CODIT_TRANCHE_LINE_TITLES[1],
            milestone: "à la livraison de la première maquette",
          },
          {
            index: 2,
            label: CODIT_TRANCHE_LINE_TITLES[2],
            milestone: "à la livraison",
          },
        ],
        workflow_for_claude: [
          "1. Lister ou lire les devis avec codit_ventepres_list_devis / codit_ventepres_get_devis.",
          "2. Choisir tranche_index 0=signature, 1=1re maquette, 2=livraison.",
          "3. Utiliser codit_ventepres_pennylane_line_items_* pour obtenir line_items.",
          "4. Appeler pennylane_codit_create_customer_invoice avec draft:true et ces lignes (v1 FactoFrance : customer_source_id + line_items, ou invoice_json).",
        ],
      })
  );

  server.tool(
    "codit_ventepres_list_devis",
    "CoditVentePres (COD'IT) : liste tous les devis depuis presentation.json (ordre des PDF CoditVentePres-2) avec titre, estimation forfait HT et aperçu.",
    {},
    async () => {
      const src = await requireCoditPresentationSource();
      const slides = await loadCoditPresentationSlides(src);
      return textJson({
        count: slides.length,
        presentation_source_preview: /^https?:/i.test(src) ? src : "[chemin fichier]",
        quotes: slides.map(slideSummary),
      });
    }
  );

  server.tool(
    "codit_ventepres_get_devis",
    "CoditVentePres (COD'IT) : détail d’un devis (pdf_index aligné sur CoditVentePres-2) : points, bloc commercial, délais, chronologie et montants calculés pour facturation.",
    {
      pdf_index: z.number().int().min(0).describe("Index 0-based = même ordre que les PDF dans commercial/."),
    },
    async ({ pdf_index }) => {
      const src = await requireCoditPresentationSource();
      const slides = await loadCoditPresentationSlides(src);
      const slide = slides.find((s) => s.pdf_index === pdf_index);
      if (!slide) {
        throw new Error(`Devis pdf_index=${pdf_index} introuvable (0…${slides.length - 1}).`);
      }

      const tranches = slide.tranches_ht
        ? {
            ht_signature: slide.tranches_ht[0],
            ht_first_mockup: slide.tranches_ht[1],
            ht_delivery: slide.tranches_ht[2],
            labels: [...CODIT_TRANCHE_LINE_TITLES],
          }
        : null;

      return textJson({
        pdf_index: slide.pdf_index,
        title: slide.title,
        hide_pdf_link: slide.hide_pdf_link,
        points: slide.points,
        commercial: slide.commercial,
        condition_delay: slide.condition_delay,
        timeline: slide.timeline,
        total_ht_estimated: slide.total_ht_estimated,
        standard_payment_terms: CODIT_STANDARD_PAYMENT_TERMS_FR,
        billing_tranches: tranches,
        note_si_total_null:
          slide.total_ht_estimated === null
            ? "Aucun montant € HT exploitable automatiquement : compléter le champ commercial avec un forfait explicite ou fixer les montants à la main pour Pennylane."
            : undefined,
      });
    }
  );

  server.tool(
    "codit_ventepres_pennylane_line_items_for_tranche",
    "CoditVentePres : produit une ligne facture Pennylane (FACTOFrance / v1 line_items ou v2 invoice_lines une ligne) pour UNE tranche d’UN devis.",
    {
      pdf_index: z.number().int().min(0),
      tranche_index: z.union([z.literal(0), z.literal(1), z.literal(2)]),
      vat_rate: z.string().optional().describe("Code TVA Pennylane, défaut FR_200."),
    },
    async ({ pdf_index, tranche_index, vat_rate }) => {
      const vat = vat_rate ?? "FR_200";
      const src = await requireCoditPresentationSource();
      const slides = await loadCoditPresentationSlides(src);
      const slide = slides.find((s) => s.pdf_index === pdf_index);
      if (!slide) {
        throw new Error(`pdf_index inconnu (${pdf_index}).`);
      }
      const idx = tranche_index as CoditTrancheIndex;
      if (!slide.tranches_ht) {
        throw new Error(
          "Montants tranches indisposables : pas de total HT estimé depuis le bloc « commercial »."
        );
      }
      const amt = slide.tranches_ht[idx]!;
      const trancheLib = coditTrancheTitle(idx);
      const lineLabel = `${slide.title.slice(0, 120)} — ${trancheLib}`;

      return textJson({
        pdf_index,
        title: slide.title,
        tranche_index,
        tranche_label: trancheLib,
        amount_ht_eur: amt,
        terms_for_pdf: CODIT_STANDARD_PAYMENT_TERMS_FR,
        pennylane_v1_line_item: pennylaneStyleLineItem(lineLabel, amt, vat),
        pennylane_v2_invoice_lines: [
          {
            label: lineLabel.slice(0, 200),
            quantity: 1,
            unit: "unité",
            raw_currency_unit_price: amt.toFixed(2),
            vat_rate: vat,
          },
        ],
        suggested_invoice_special_mention: CODIT_STANDARD_PAYMENT_TERMS_FR.slice(0, 500),
      });
    }
  );

  server.tool(
    "codit_ventepres_pennylane_line_items_all_devis_one_tranche",
    "CoditVentePres : pour une même tranche (ex. livraison 1re maquette → index 1), génère les lignes Pennylane pour tous les devis dont le total HT a pu être déduit — utile pour « crée tous les brouillons » en une passe.",
    {
      tranche_index: z.union([z.literal(0), z.literal(1), z.literal(2)]),
      pdf_indices: z
        .array(z.number().int().min(0))
        .optional()
        .describe("Sous-ensemble ; si absent tous les devis avec total HT."),
      vat_rate: z.string().optional().describe("TVA Pennylane, défaut FR_200."),
    },
    async ({ tranche_index, pdf_indices, vat_rate }) => {
      const vat = vat_rate ?? "FR_200";
      const idx = tranche_index as CoditTrancheIndex;
      const src = await requireCoditPresentationSource();
      const slides = await loadCoditPresentationSlides(src);

      let list = slides;
      if (pdf_indices?.length) {
        const set = new Set(pdf_indices);
        list = slides.filter((s) => set.has(s.pdf_index));
      }

      const pennylane_v1_line_items: ReturnType<typeof pennylaneStyleLineItem>[] = [];
      const skipped: number[] = [];
      for (const s of list) {
        if (!s.tranches_ht) {
          skipped.push(s.pdf_index);
          continue;
        }
        const amt = s.tranches_ht[idx]!;
        const lineLabel = `${s.title.slice(0, 120)} — ${coditTrancheTitle(idx)}`;
        pennylane_v1_line_items.push(pennylaneStyleLineItem(lineLabel, amt, vat));
      }

      return textJson({
        tranche_index: idx,
        tranche_title: coditTrancheTitle(idx),
        payments_terms: CODIT_STANDARD_PAYMENT_TERMS_FR,
        count_line_items: pennylane_v1_line_items.length,
        skipped_pdf_indices_no_ht: skipped,
        pennylane_v1_line_items,
        pennylane_v2_invoice_lines: pennylane_v1_line_items.map((li) => ({
          label: li.label.slice(0, 220),
          quantity: li.quantity,
          unit: li.unit,
          raw_currency_unit_price: li.currency_amount_before_tax.toFixed(2),
          vat_rate: vat,
        })),
      });
    }
  );
}
