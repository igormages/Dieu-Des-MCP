import { getServiceKeys } from "@/lib/keys/store";

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";

interface MicrosoftConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

async function getConfig(): Promise<MicrosoftConfig> {
  const keys = await getServiceKeys("microsoft");
  const tenantId = keys?.tenantId;
  const clientId = keys?.clientId;
  const clientSecret = keys?.clientSecret;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error(
      "Les clés Microsoft ne sont pas configurées. Rendez-vous sur /settings pour les ajouter."
    );
  }

  return { tenantId, clientId, clientSecret };
}

async function getAccessToken(): Promise<string> {
  const config = await getConfig();
  const tokenUrl = `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`;

  const params = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    scope: "https://graph.microsoft.com/.default",
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Microsoft OAuth error ${response.status}: ${text}`);
  }

  const data = await response.json() as { access_token: string };
  return data.access_token;
}

async function graphFetch<T>(path: string, params?: Record<string, string>): Promise<T> {
  const token = await getAccessToken();
  const url = new URL(`${GRAPH_BASE_URL}${path}`);

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
    throw new Error(`Microsoft Graph API error ${response.status}: ${text}`);
  }

  return response.json() as Promise<T>;
}

export interface MicrosoftInvoice {
  id: string;
  invoiceDate: string;
  dueDate: string;
  status: string;
  totalAmount: number;
  currency: string;
  documentType: string;
  invoiceType: string;
}

export interface MicrosoftInvoiceListResponse {
  value: MicrosoftInvoice[];
  "@odata.nextLink"?: string;
}

export async function listInvoices(params?: {
  periodStartDate?: string;
  periodEndDate?: string;
  top?: number;
}): Promise<MicrosoftInvoiceListResponse> {
  const queryParams: Record<string, string> = {};
  if (params?.top) queryParams["$top"] = String(params.top);
  if (params?.periodStartDate || params?.periodEndDate) {
    const filters: string[] = [];
    if (params.periodStartDate) filters.push(`invoiceDate ge ${params.periodStartDate}`);
    if (params.periodEndDate) filters.push(`invoiceDate le ${params.periodEndDate}`);
    queryParams["$filter"] = filters.join(" and ");
  }

  return graphFetch<MicrosoftInvoiceListResponse>("/solutions/billing/invoices", queryParams);
}

export interface MicrosoftInvoiceDocument {
  id: string;
  kind: string;
  url: string;
}

export async function getInvoiceDocuments(invoiceId: string): Promise<MicrosoftInvoiceDocument[]> {
  const data = await graphFetch<{ value: MicrosoftInvoiceDocument[] }>(
    `/solutions/billing/invoices/${invoiceId}/documents`
  );
  return data.value;
}
