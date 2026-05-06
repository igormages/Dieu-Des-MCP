/** Aligné sur CoditVentePres-2 `src/app/api/qonto-invoice/route.ts`. */
export const CODIT_STANDARD_PAYMENT_TERMS_FR =
  "Accompte de 30 % à la signature, 30 % à la livraison de la première maquette, 30 % à la livraison.";

export const CODIT_TRANCHE_LABELS = [
  "Acompte 30 % — signature",
  "Acompte 30 % — 1re maquette",
  "Acompte 30 % — livraison",
] as const;

export type CoditTrancheIndex = 0 | 1 | 2;

export const CODIT_TRANCHE_KEYS = ["signature", "first_mockup", "delivery"] as const;
