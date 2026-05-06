import { readFile } from "fs/promises";
import { join } from "path";

import {
  CODIT_TRANCHE_LINE_TITLES,
  inferDevisTotalHtEur,
  splitTotalHtInThreeTranches,
} from "./devis-total-ht";

export type CoditTimelineStep = { label: string; date: string; description: string };

export type CoditPresentationSlide = {
  pdf_index: number;
  title: string;
  points: string[];
  commercial: string;
  condition_delay: string;
  timeline: CoditTimelineStep[];
  hide_pdf_link: boolean;
  total_ht_estimated: number | null;
  /** Montants HT des 3 acomptes 30 % si total_ht_estimated est connu. */
  tranches_ht: [number, number, number] | null;
};

type RawJson = {
  slides?: Array<{
    title?: unknown;
    points?: unknown;
    commercial?: unknown;
    conditionDelay?: unknown;
    timeline?: unknown;
    hidePdfLink?: unknown;
  }>;
};

function normalizeTimelineSteps(raw: unknown): CoditTimelineStep[] {
  if (!Array.isArray(raw)) return [];
  const out: CoditTimelineStep[] = [];
  for (const item of raw) {
    if (out.length >= 24) break;
    if (item === null || typeof item !== "object" || Array.isArray(item)) continue;
    const o = item as Record<string, unknown>;
    const labelRaw =
      typeof o.label === "string" ? o.label : typeof o.title === "string" ? o.title : "";
    out.push({
      label: String(labelRaw).slice(0, 200),
      date: typeof o.date === "string" ? o.date.slice(0, 120) : "",
      description: typeof o.description === "string" ? o.description.slice(0, 4000) : "",
    });
  }
  return out;
}

function normalizePoints(raw: unknown): string[] {
  const arr = Array.isArray(raw)
    ? raw.map((x) => String(x).trim()).filter(Boolean)
    : [];
  if (arr.length === 0) return ["À personnaliser dans presentation.json", ""];
  if (arr.length === 1) return [arr[0]!];
  if (arr.length === 2) return [arr[0]!, arr[1]!];
  return [arr[0]!, arr[1]!, arr[2]!];
}

function parsePresentationPayload(parsed: RawJson): Omit<CoditPresentationSlide, "pdf_index">[] {
  const slides = parsed.slides;
  if (!Array.isArray(slides)) return [];

  return slides.map((s) => {
    const title =
      typeof s.title === "string" && s.title.trim() ? s.title.trim() : "Sans titre";
    const commercial =
      typeof s.commercial === "string" && s.commercial.trim()
        ? s.commercial.trim()
        : "Prix et proposition — à renseigner (champ commercial)";
    const conditionDelay =
      typeof s.conditionDelay === "string" && s.conditionDelay.trim()
        ? s.conditionDelay.trim()
        : "Délai de mise en place : à préciser selon le périmètre.";

    const totalHt = inferDevisTotalHtEur(commercial);
    const tranches =
      totalHt !== null && totalHt > 0 ? splitTotalHtInThreeTranches(totalHt) : null;

    return {
      title,
      points: normalizePoints(s.points),
      commercial,
      condition_delay: conditionDelay,
      timeline: normalizeTimelineSteps(s.timeline),
      hide_pdf_link: s.hidePdfLink === true,
      total_ht_estimated: totalHt,
      tranches_ht: tranches,
    };
  });
}

let cache: { source: string; slides: CoditPresentationSlide[]; at: number } | null = null;
const CACHE_MS = 45_000;

function isHttpSource(source: string): boolean {
  return /^https?:\/\//i.test(source.trim());
}

async function readPresentationFromUrl(url: string): Promise<RawJson> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`Impossible de télécharger presentation.json (${res.status}).`);
  }
  return (await res.json()) as RawJson;
}

async function readPresentationFromDir(commercialDir: string): Promise<RawJson> {
  const path = join(commercialDir.trim(), "presentation.json");
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw) as RawJson;
}

/**
 * `source` : URL https vers un `presentation.json` exporté du dépôt CoditVentePres-2,
 * ou chemin absolu du dossier `commercial` (contenant presentation.json).
 */
export async function loadCoditPresentationSlides(
  source: string
): Promise<CoditPresentationSlide[]> {
  const key = source.trim();
  if (!key) {
    throw new Error("Source CoditVentePres vide (URL ou dossier commercial).");
  }

  const now = Date.now();
  if (cache && cache.source === key && now - cache.at < CACHE_MS) {
    return cache.slides;
  }

  const raw = isHttpSource(key)
    ? await readPresentationFromUrl(key)
    : await readPresentationFromDir(key);

  const base = parsePresentationPayload(raw);
  const slides: CoditPresentationSlide[] = base.map((s, i) => ({
    ...s,
    pdf_index: i,
  }));

  cache = { source: key, slides, at: now };
  return slides;
}

export function pennylaneStyleLineItem(
  label: string,
  amountHt: number,
  vatRate: string,
  quantity = 1,
  unit = "unité"
): {
  label: string;
  quantity: number;
  unit: string;
  currency_amount_before_tax: number;
  vat_rate: string;
} {
  return {
    label,
    quantity,
    unit,
    currency_amount_before_tax: Math.round(amountHt * 100) / 100,
    vat_rate: vatRate,
  };
}

export type CoditTrancheIndex = 0 | 1 | 2;

export function coditTrancheTitle(index: CoditTrancheIndex): (typeof CODIT_TRANCHE_LINE_TITLES)[CoditTrancheIndex] {
  return CODIT_TRANCHE_LINE_TITLES[index];
}
