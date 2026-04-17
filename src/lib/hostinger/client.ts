import { getServiceKeys } from "@/lib/keys/store";

const HOSTINGER_BASE_URL = "https://api.hostinger.com/v1";

async function getApiToken(): Promise<string> {
  const keys = await getServiceKeys("hostinger");
  const apiToken = keys?.apiToken;

  if (!apiToken) {
    throw new Error(
      "Le token API Hostinger n'est pas configuré. Rendez-vous sur /settings pour l'ajouter."
    );
  }

  return apiToken;
}

async function hostingerFetch<T>(path: string, params?: Record<string, string>): Promise<T> {
  const token = await getApiToken();
  const url = new URL(`${HOSTINGER_BASE_URL}${path}`);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Hostinger API error ${response.status}: ${text}`);
  }

  return response.json() as Promise<T>;
}

export interface HostingerInvoice {
  id: number;
  number: string;
  date: string;
  due_date: string;
  status: string;
  subtotal: string;
  tax: string;
  total: string;
  currency: string;
  download_url?: string;
  items: Array<{
    id: number;
    description: string;
    quantity: number;
    unit_price: string;
    total: string;
  }>;
}

export interface HostingerInvoicesResponse {
  data: HostingerInvoice[];
  meta?: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
  };
}

export async function listInvoices(params?: {
  page?: number;
  perPage?: number;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<HostingerInvoicesResponse> {
  const queryParams: Record<string, string> = {};
  if (params?.page) queryParams["page"] = String(params.page);
  if (params?.perPage) queryParams["per_page"] = String(params.perPage);
  if (params?.status) queryParams["status"] = params.status;
  if (params?.dateFrom) queryParams["date_from"] = params.dateFrom;
  if (params?.dateTo) queryParams["date_to"] = params.dateTo;

  return hostingerFetch<HostingerInvoicesResponse>("/billing/invoices", queryParams);
}

export interface HostingerSubscription {
  id: number;
  name: string;
  status: string;
  billing_period: string;
  next_billing_date: string;
  price: string;
  currency: string;
  auto_renew: boolean;
  domain?: string;
}

export interface HostingerSubscriptionsResponse {
  data: HostingerSubscription[];
  meta?: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
  };
}

export async function listSubscriptions(params?: {
  page?: number;
  perPage?: number;
  status?: string;
}): Promise<HostingerSubscriptionsResponse> {
  const queryParams: Record<string, string> = {};
  if (params?.page) queryParams["page"] = String(params.page);
  if (params?.perPage) queryParams["per_page"] = String(params.perPage);
  if (params?.status) queryParams["status"] = params.status;

  return hostingerFetch<HostingerSubscriptionsResponse>("/billing/subscriptions", queryParams);
}

export interface HostingerOrder {
  id: number;
  status: string;
  created_at: string;
  total: string;
  currency: string;
  items: Array<{
    name: string;
    quantity: number;
    price: string;
  }>;
}

export async function listOrders(params?: {
  page?: number;
  perPage?: number;
}): Promise<{ data: HostingerOrder[]; meta?: { total: number } }> {
  const queryParams: Record<string, string> = {};
  if (params?.page) queryParams["page"] = String(params.page);
  if (params?.perPage) queryParams["per_page"] = String(params.perPage);

  return hostingerFetch<{ data: HostingerOrder[]; meta?: { total: number } }>(
    "/billing/orders",
    queryParams
  );
}
