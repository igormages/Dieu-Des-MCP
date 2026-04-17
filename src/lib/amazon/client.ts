import { getServiceKeys } from "@/lib/keys/store";

const LWA_TOKEN_URL = "https://api.amazon.com/auth/o2/token";
const SP_API_BASE_EU = "https://sellingpartnerapi-eu.amazon.com";

interface AmazonConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  marketplace?: string;
}

async function getConfig(): Promise<AmazonConfig> {
  const keys = await getServiceKeys("amazon");
  const clientId = keys?.clientId;
  const clientSecret = keys?.clientSecret;
  const refreshToken = keys?.refreshToken;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Les clés Amazon Business ne sont pas configurées. Rendez-vous sur /settings pour les ajouter."
    );
  }

  return {
    clientId,
    clientSecret,
    refreshToken,
    marketplace: keys?.marketplace ?? "A1F83G8C2ARO7P",
  };
}

async function getLwaToken(): Promise<string> {
  const config = await getConfig();

  const response = await fetch(LWA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
    }).toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Amazon LWA token error ${response.status}: ${text}`);
  }

  const data = await response.json() as { access_token: string };
  return data.access_token;
}

async function amazonFetch<T>(path: string, params?: Record<string, string>): Promise<T> {
  const token = await getLwaToken();
  const url = new URL(`${SP_API_BASE_EU}${path}`);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url.toString(), {
    headers: {
      "x-amz-access-token": token,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Amazon SP-API error ${response.status}: ${text}`);
  }

  return response.json() as Promise<T>;
}

export interface AmazonOrder {
  AmazonOrderId: string;
  SellerOrderId?: string;
  PurchaseDate: string;
  LastUpdateDate: string;
  OrderStatus: string;
  FulfillmentChannel: string;
  SalesChannel?: string;
  ShipServiceLevel?: string;
  OrderTotal?: { CurrencyCode: string; Amount: string };
  NumberOfItemsShipped: number;
  NumberOfItemsUnshipped: number;
  PaymentMethod?: string;
  MarketplaceId: string;
  BuyerInfo?: { BuyerEmail?: string; BuyerName?: string };
}

export interface AmazonOrdersResponse {
  payload: {
    Orders: AmazonOrder[];
    NextToken?: string;
    LastUpdatedBefore: string;
    CreatedBefore: string;
  };
}

export async function listOrders(params: {
  marketplaceIds?: string[];
  createdAfter?: string;
  createdBefore?: string;
  lastUpdatedAfter?: string;
  orderStatuses?: string[];
  maxResultsPerPage?: number;
  nextToken?: string;
}): Promise<AmazonOrdersResponse> {
  const config = await getConfig();
  const queryParams: Record<string, string> = {
    MarketplaceIds: (params.marketplaceIds ?? [config.marketplace!]).join(","),
  };

  if (params.createdAfter) queryParams["CreatedAfter"] = params.createdAfter;
  if (params.createdBefore) queryParams["CreatedBefore"] = params.createdBefore;
  if (params.lastUpdatedAfter) queryParams["LastUpdatedAfter"] = params.lastUpdatedAfter;
  if (params.orderStatuses?.length) queryParams["OrderStatuses"] = params.orderStatuses.join(",");
  if (params.maxResultsPerPage) queryParams["MaxResultsPerPage"] = String(params.maxResultsPerPage);
  if (params.nextToken) queryParams["NextToken"] = params.nextToken;

  return amazonFetch<AmazonOrdersResponse>("/orders/v0/orders", queryParams);
}

export interface AmazonInvoice {
  InvoiceId: string;
  InvoiceType: string;
  TransactionId: string;
  InvoiceDate: string;
  InvoiceCurrencyCode: string;
  InvoiceTotal: { CurrencyCode: string; Amount: string };
  InvoiceUrl?: string;
}

export async function listInvoices(params: {
  marketplaceId?: string;
  dateStart?: string;
  dateEnd?: string;
  nextToken?: string;
  pageSize?: number;
}): Promise<{ invoices: AmazonInvoice[]; nextToken?: string }> {
  const config = await getConfig();
  const queryParams: Record<string, string> = {
    marketplaceId: params.marketplaceId ?? config.marketplace!,
  };

  if (params.dateStart) queryParams["dateStart"] = params.dateStart;
  if (params.dateEnd) queryParams["dateEnd"] = params.dateEnd;
  if (params.nextToken) queryParams["nextToken"] = params.nextToken;
  if (params.pageSize) queryParams["pageSize"] = String(params.pageSize);

  return amazonFetch<{ invoices: AmazonInvoice[]; nextToken?: string }>(
    "/vendor/invoices/v1/invoices",
    queryParams
  );
}
