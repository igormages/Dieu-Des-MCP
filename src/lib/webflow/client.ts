import { getServiceKeys } from "@/lib/keys/store";

const WEBFLOW_BASE_URL = "https://api.webflow.com/v2";

async function getApiToken(): Promise<string> {
  const keys = await getServiceKeys("webflow");
  const apiToken = keys?.apiToken;

  if (!apiToken) {
    throw new Error(
      "Le token API Webflow n'est pas configuré. Rendez-vous sur /settings pour l'ajouter."
    );
  }

  return apiToken;
}

async function webflowFetch<T>(path: string, params?: Record<string, string>): Promise<T> {
  const token = await getApiToken();
  const url = new URL(`${WEBFLOW_BASE_URL}${path}`);

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
    throw new Error(`Webflow API error ${response.status}: ${text}`);
  }

  return response.json() as Promise<T>;
}

export interface WebflowSite {
  id: string;
  workspaceId: string;
  displayName: string;
  shortName: string;
  lastPublished: string | null;
  createdOn: string;
  lastUpdated: string;
  previewUrl: string | null;
  timeZone: string;
}

export interface WebflowSitesResponse {
  sites: WebflowSite[];
  pagination?: { limit: number; offset: number; total: number };
}

export async function listSites(): Promise<WebflowSitesResponse> {
  return webflowFetch<WebflowSitesResponse>("/sites");
}

export interface WebflowWorkspace {
  id: string;
  displayName: string;
  shortName: string;
}

export interface WebflowWorkspacesResponse {
  workspaces: WebflowWorkspace[];
}

export async function listWorkspaces(): Promise<WebflowWorkspacesResponse> {
  return webflowFetch<WebflowWorkspacesResponse>("/workspaces");
}

export interface WebflowUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: string;
  createdOn: string;
  lastUpdated: string;
}

export async function getAuthorizedUser(): Promise<WebflowUser> {
  return webflowFetch<WebflowUser>("/token/introspect");
}

export interface WebflowEcommerceOrder {
  orderId: string;
  status: string;
  receiptUrl?: string;
  purchasedOn: string;
  customerInfo: { fullName: string; email: string };
  totals: {
    subtotal: { value: string; unit: string };
    extras: unknown[];
    total: { value: string; unit: string };
  };
  allAddresses: unknown[];
}

export interface WebflowEcommerceOrdersResponse {
  orders: WebflowEcommerceOrder[];
  pagination?: { limit: number; offset: number; total: number };
}

export async function listEcommerceOrders(params: {
  siteId: string;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<WebflowEcommerceOrdersResponse> {
  const queryParams: Record<string, string> = {};
  if (params.status) queryParams["status"] = params.status;
  if (params.limit) queryParams["limit"] = String(params.limit);
  if (params.offset) queryParams["offset"] = String(params.offset);

  return webflowFetch<WebflowEcommerceOrdersResponse>(
    `/sites/${params.siteId}/orders`,
    queryParams
  );
}
