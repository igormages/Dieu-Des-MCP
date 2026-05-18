import type {
  BiocoopCartItem,
  BiocoopCartSummary,
  BiocoopProductDetail,
  BiocoopSearchProduct,
} from "./types";

export function decodeBiocoopHtml(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function extractFormKey(html: string): string | null {
  const m = html.match(/name="form_key"\s+type="hidden"\s+value="([^"]+)"/i);
  return m?.[1] ?? null;
}

/** Encode une URL pour le paramètre uenc Magento (base64 URL-safe, = → ~). */
export function encodeMagentoUenc(url: string): string {
  return Buffer.from(url, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, (pad) => "~".repeat(pad.length));
}

export function extractSearchProducts(html: string): BiocoopSearchProduct[] {
  const seen = new Set<string>();
  const products: BiocoopSearchProduct[] = [];
  const itemRe =
    /<li[^>]*class="[^"]*\bproduct-item\b[^"]*"[^>]*>[\s\S]*?<\/li>/gi;

  for (const block of html.matchAll(itemRe)) {
    const chunk = block[0];
    const id = chunk.match(/data-product-id="(\d+)"/i)?.[1];
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const photo = chunk.match(
      /<a[^>]*class="[^"]*product-item-photo[^"]*"[^>]*>/i
    )?.[0];
    const name = decodeBiocoopHtml(
      photo?.match(/data-name="([^"]+)"/i)?.[1] ??
        chunk.match(/alt="([^"]+)"/i)?.[1] ??
        ""
    ).trim();
    const sku = photo?.match(/data-id="([^"]+)"/i)?.[1];
    const price = photo?.match(/data-price="([^"]+)"/i)?.[1];
    const brand = photo?.match(/data-brand="([^"]+)"/i)?.[1];
    const href = photo?.match(/href="([^"]+\.html)"/i)?.[1];
    if (!href) continue;

    products.push({
      id,
      sku,
      name: name || `Produit ${id}`,
      url: href,
      price,
      brand: brand ? decodeBiocoopHtml(brand) : undefined,
    });
  }

  return products;
}

export function extractProductFromPage(
  html: string,
  url: string
): BiocoopProductDetail {
  const id =
    html.match(/data-product-id="(\d+)"/i)?.[1] ??
    html.match(/"productId"\s*:\s*(\d+)/)?.[1] ??
    "";
  const sku = html.match(/data-product-sku="([^"]+)"/i)?.[1];
  const name = decodeBiocoopHtml(
    html.match(/<h1[^>]*class="[^"]*page-title[^"]*"[^>]*>\s*<span[^>]*>([^<]+)/i)?.[1] ??
      html.match(/<title>([^<|]+)/i)?.[1]?.trim() ??
      ""
  );
  const price = html.match(/data-price-amount="([^"]+)"/i)?.[1];

  return {
    id,
    sku,
    name: name || undefined,
    url,
    price,
  };
}

export function parseCartSection(data: unknown): BiocoopCartSummary | null {
  if (!data || typeof data !== "object") return null;
  const cart = (data as Record<string, unknown>).cart;
  if (!cart || typeof cart !== "object") return null;
  const c = cart as Record<string, unknown>;
  const rawItems = (c.items as Array<Record<string, unknown>> | undefined) ?? [];

  const items: BiocoopCartItem[] = rawItems.map((item) => ({
    item_id: String(item.item_id ?? ""),
    product_id: String(item.product_id ?? ""),
    product_name: decodeBiocoopHtml(String(item.product_name ?? "")),
    product_sku: String(item.product_sku ?? ""),
    product_url: String(item.product_url ?? ""),
    qty: Number(item.qty ?? 0),
    price:
      typeof item.product_price === "string"
        ? item.product_price.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
        : undefined,
  }));

  return {
    summary_count: Number(c.summary_count ?? 0),
    subtotal: typeof c.subtotal === "string" ? c.subtotal.replace(/<[^>]+>/g, "").trim() : undefined,
    subtotalAmount:
      c.subtotalAmount != null ? Number(c.subtotalAmount) : undefined,
    items,
  };
}
