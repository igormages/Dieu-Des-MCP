/** Décode les entités HTML courantes renvoyées par l'API Leclerc Drive. */
export function decodeLeclercHtml(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export interface LeclercSearchProduct {
  id: string;
  name: string;
  slug: string;
  url: string;
  price?: string;
}

/** Extrait les produits d'une page recherche ou rayon (liens fiche-produits). */
export function extractSearchProducts(html: string, baseUrl: string): LeclercSearchProduct[] {
  const seen = new Set<string>();
  const products: LeclercSearchProduct[] = [];
  const linkRe =
    /href="([^"]*\/fiche-produits-(\d+)-([^"?#]+)\.aspx[^"]*)"/gi;
  for (const m of html.matchAll(linkRe)) {
    const id = m[2];
    if (seen.has(id)) continue;
    seen.add(id);
    const slug = decodeLeclercHtml(m[3].replace(/\.aspx.*$/, ""));
    const href = m[1].startsWith("http") ? m[1] : new URL(m[1], baseUrl).toString();
    const name = slug.replace(/-/g, " ");
    products.push({ id, name, slug, url: href });
  }
  return products;
}

export interface LeclercCartProductLight {
  iIdProduit: number;
  iQtePanier: number;
  iQteDisponible?: number;
  rTotalAPayer?: number;
}

export interface LeclercCartSummary {
  sNoPointLivraison: string;
  iQuantitePanier: number;
  sTotalAPayer?: string;
  sTotalHorsReductions?: string;
  lstProduitsLight: LeclercCartProductLight[];
}

export interface LeclercPanierEvent {
  eTypeEvenement?: number;
  sIdUnique?: string;
  objElement?: Record<string, unknown>;
}

/** Parse la réponse op=12 ou un bloc JSON embarqué dans detail-panier.aspx. */
export function parseCartFromPanierResponse(
  data: unknown
): LeclercCartSummary | null {
  if (!data) return null;

  if (Array.isArray(data)) {
    for (const event of data as LeclercPanierEvent[]) {
      const el = event.objElement;
      if (!el) continue;
      const lst = el.lstPanier as Array<Record<string, unknown>> | undefined;
      if (lst?.[0]) return normalizeCartPanier(lst[0]);
      if (el.lstProduitsLight) return normalizeCartPanier(el);
    }
    return null;
  }

  if (typeof data === "object" && data !== null) {
    const obj = data as Record<string, unknown>;
    const donnees = obj.objDonneesReponse as Record<string, unknown> | undefined;
    if (donnees) return parseCartFromPanierResponse(donnees);
    if (obj.lstPanier) {
      const lst = obj.lstPanier as Array<Record<string, unknown>>;
      if (lst[0]) return normalizeCartPanier(lst[0]);
    }
    if (obj.lstProduitsLight) return normalizeCartPanier(obj);
  }

  return null;
}

function normalizeCartPanier(raw: Record<string, unknown>): LeclercCartSummary {
  const lst = (raw.lstProduitsLight as Array<Record<string, unknown>> | undefined) ?? [];
  return {
    sNoPointLivraison: String(raw.sNoPointLivraison ?? ""),
    iQuantitePanier: Number(raw.iQuantitePanier ?? 0),
    sTotalAPayer: raw.sTotalAPayer != null ? String(raw.sTotalAPayer) : undefined,
    sTotalHorsReductions:
      raw.sTotalHorsReductions != null ? String(raw.sTotalHorsReductions) : undefined,
    lstProduitsLight: lst.map((p) => ({
      iIdProduit: Number(p.iIdProduit),
      iQtePanier: Number(p.iQtePanier),
      iQteDisponible: p.iQteDisponible != null ? Number(p.iQteDisponible) : undefined,
      rTotalAPayer: p.rTotalAPayer != null ? Number(p.rTotalAPayer) : undefined,
    })),
  };
}

/** Extrait le JSON panier embarqué dans detail-panier.aspx (lstPanier). */
export function extractCartFromDetailPanierHtml(html: string): LeclercCartSummary | null {
  const match = html.match(/"lstPanier":\s*(\[\{[\s\S]*?\}\])\s*,\s*"rMontantTel"/);
  if (!match) return null;
  try {
    const lst = JSON.parse(match[1]) as Array<Record<string, unknown>>;
    if (!lst[0]) return null;
    return normalizeCartPanier(lst[0]);
  } catch {
    return null;
  }
}

export interface LeclercProductZone {
  fpLibelleProduit?: { lblLg1?: string; lblLg2?: string };
  fpPrixProduit?: {
    ttc?: string;
    mesure?: string;
    promo?: boolean;
  };
  fpVisuelProduit?: { image?: string };
}

/** Parse la réponse fiche-produit-zones.ashz. */
export function parseProductZonesResponse(raw: {
  objDonneesReponse?: { sResponse?: string };
}): LeclercProductZone | null {
  const inner = raw.objDonneesReponse?.sResponse;
  if (!inner) return null;
  try {
    return JSON.parse(inner) as LeclercProductZone;
  } catch {
    return null;
  }
}

export function formatProductZones(zones: LeclercProductZone, productId: string) {
  const lib = zones.fpLibelleProduit;
  const prix = zones.fpPrixProduit;
  return {
    id: productId,
    title: lib?.lblLg1 ? decodeLeclercHtml(lib.lblLg1) : undefined,
    subtitle: lib?.lblLg2 ? decodeLeclercHtml(lib.lblLg2) : undefined,
    price: prix?.ttc ? decodeLeclercHtml(prix.ttc) : undefined,
    pricePerUnit: prix?.mesure ? decodeLeclercHtml(prix.mesure) : undefined,
    onPromotion: prix?.promo,
    image: zones.fpVisuelProduit?.image,
  };
}
