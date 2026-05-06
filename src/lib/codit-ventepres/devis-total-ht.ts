/**
 * Aligné sur CoditVentePres-2 (devis-total-ht.ts) pour estimer le forfait HT
 * et répartir en trois acomptes 30 % / 30 % / 30 %.
 */

const EUR_HT_REGEX = /(\d[\d\s]*(?:,\d+)?)\s*€\s*HT/gi;

function parseFrenchAmountToNumber(raw: string): number | null {
  const compact = raw.replace(/\s/g, "").replace(",", ".");
  const n = Number.parseFloat(compact);
  return Number.isFinite(n) ? n : null;
}

export function extractAllHtAmountsEur(commercial: string): number[] {
  const out: number[] = [];
  EUR_HT_REGEX.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = EUR_HT_REGEX.exec(commercial)) !== null) {
    const n = parseFrenchAmountToNumber(m[1] ?? "");
    if (n !== null) out.push(n);
  }
  return out;
}

export function inferDevisTotalHtEur(commercial: string): number | null {
  const lines = commercial
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of lines) {
    if (
      /TOTAL\b|Total\b|tarif\s+global|forfait\s+(développement|developpement)\s*&?\s*intégration/i.test(line)
    ) {
      EUR_HT_REGEX.lastIndex = 0;
      const fromLine: number[] = [];
      let m: RegExpExecArray | null;
      while ((m = EUR_HT_REGEX.exec(line)) !== null) {
        const n = parseFrenchAmountToNumber(m[1] ?? "");
        if (n !== null) fromLine.push(n);
      }
      if (fromLine.length) return Math.max(...fromLine);
    }
  }
  const all = extractAllHtAmountsEur(commercial);
  return all.length ? Math.max(...all) : null;
}

export function splitTotalHtInThreeTranches(totalHt: number): [number, number, number] {
  const totalCents = Math.round(totalHt * 100);
  if (totalCents <= 0) return [0, 0, 0];
  const base = Math.floor(totalCents / 3);
  const remainder = totalCents - base * 3;
  const cents = [base, base, base];
  for (let i = 0; i < remainder; i += 1) {
    cents[2 - i] += 1;
  }
  return [cents[0]! / 100, cents[1]! / 100, cents[2]! / 100];
}

export const CODIT_TRANCHE_LINE_TITLES = [
  "Acompte 30 % — signature",
  "Acompte 30 % — 1re maquette",
  "Acompte 30 % — livraison",
] as const;

export const CODIT_STANDARD_PAYMENT_TERMS_FR =
  "Accompte de 30 % à la signature, 30 % à la livraison de la première maquette, 30 % à la livraison.";
