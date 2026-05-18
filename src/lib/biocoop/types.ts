export const BIOCOOP_ORIGIN = "https://www.biocoop.fr";
export const BIOCOOP_LOGIN_URL = `${BIOCOOP_ORIGIN}/customer/account/login/`;
export const BIOCOOP_LOGIN_POST_URL = `${BIOCOOP_ORIGIN}/customer/account/loginPost/`;

export interface BiocoopConfig {
  storePath: string;
}

export interface BiocoopSearchProduct {
  id: string;
  sku?: string;
  name: string;
  url: string;
  price?: string;
  brand?: string;
}

export interface BiocoopProductDetail {
  id: string;
  sku?: string;
  name?: string;
  url: string;
  price?: string;
  breadcrumbs?: Array<{ label: string; link?: string }>;
}

export interface BiocoopCartItem {
  item_id: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  product_url: string;
  qty: number;
  price?: string;
}

export interface BiocoopCartSummary {
  summary_count: number;
  subtotal?: string;
  subtotalAmount?: number;
  items: BiocoopCartItem[];
}

export interface BiocoopAddToCartResult {
  success: boolean;
  product_id: string;
  quote_item_id?: string;
  quote_item_qty?: number;
  sku?: string;
  message?: string;
}
