import { getServiceKeys } from "@/lib/keys/store";

const ORANGE_TOKEN_URL = "https://api.orange.com/oauth/v3/token";
const ORANGE_API_BASE = "https://api.orange.com";

interface OrangeConfig {
  clientId: string;
  clientSecret: string;
}

async function getConfig(): Promise<OrangeConfig> {
  const keys = await getServiceKeys("orange");
  const clientId = keys?.clientId;
  const clientSecret = keys?.clientSecret;

  if (!clientId || !clientSecret) {
    throw new Error(
      "Les clés Orange Business ne sont pas configurées. Rendez-vous sur /settings pour les ajouter."
    );
  }

  return { clientId, clientSecret };
}

async function getAccessToken(): Promise<string> {
  const config = await getConfig();
  const credentials = Buffer.from(
    `${config.clientId}:${config.clientSecret}`
  ).toString("base64");

  const response = await fetch(ORANGE_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }).toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Orange OAuth error ${response.status}: ${text}`);
  }

  const data = await response.json() as { access_token: string };
  return data.access_token;
}

async function orangeFetch<T>(path: string, params?: Record<string, string>): Promise<T> {
  const token = await getAccessToken();
  const url = new URL(`${ORANGE_API_BASE}${path}`);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Orange Business API error ${response.status}: ${text}`);
  }

  return response.json() as Promise<T>;
}

export interface OrangeInvoice {
  id: string;
  href: string;
  invoiceDate: string;
  dueDate?: string;
  amountDue: { unit: string; value: number };
  taxExcludedAmount: { unit: string; value: number };
  taxIncludedAmount: { unit: string; value: number };
  state: string;
  category: string;
  financialAccount?: { id: string; name: string };
  pdfUrl?: string;
}

export interface OrangeInvoicesResponse {
  invoice: OrangeInvoice[];
  totalResults?: number;
}

export async function listInvoices(params?: {
  fields?: string;
  offset?: number;
  limit?: number;
  invoiceDateFrom?: string;
  invoiceDateTo?: string;
  state?: string;
}): Promise<OrangeInvoicesResponse> {
  const queryParams: Record<string, string> = {};
  if (params?.fields) queryParams["fields"] = params.fields;
  if (params?.offset !== undefined) queryParams["offset"] = String(params.offset);
  if (params?.limit) queryParams["limit"] = String(params.limit);
  if (params?.invoiceDateFrom) queryParams["invoiceDate.gte"] = params.invoiceDateFrom;
  if (params?.invoiceDateTo) queryParams["invoiceDate.lte"] = params.invoiceDateTo;
  if (params?.state) queryParams["state"] = params.state;

  return orangeFetch<OrangeInvoicesResponse>("/invoice/v1/invoice", queryParams);
}

export interface OrangeCustomerAccount {
  id: string;
  href: string;
  name: string;
  status: string;
  accountType: string;
  currency?: { isoCode: string };
}

export async function listCustomerAccounts(params?: {
  offset?: number;
  limit?: number;
}): Promise<OrangeCustomerAccount[]> {
  const queryParams: Record<string, string> = {};
  if (params?.offset !== undefined) queryParams["offset"] = String(params.offset);
  if (params?.limit) queryParams["limit"] = String(params.limit);

  return orangeFetch<OrangeCustomerAccount[]>(
    "/billing/v1/customerAccount",
    queryParams
  );
}
