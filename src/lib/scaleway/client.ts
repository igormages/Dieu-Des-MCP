import { getServiceKeys } from "@/lib/keys/store";

const SCALEWAY_API_BASE = "https://api.scaleway.com";

interface ScalewayConfig {
  secretKey: string;
  organizationId: string;
}

async function getConfig(): Promise<ScalewayConfig> {
  const keys = await getServiceKeys("scaleway");
  const secretKey = keys?.secretKey;
  const organizationId = keys?.organizationId;

  if (!secretKey || !organizationId) {
    throw new Error(
      "Les clés Scaleway ne sont pas configurées. Rendez-vous sur /settings pour les ajouter."
    );
  }

  return { secretKey, organizationId };
}

async function scalewayFetch<T>(path: string, params?: Record<string, string>): Promise<T> {
  const config = await getConfig();
  const url = new URL(`${SCALEWAY_API_BASE}${path}`);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url.toString(), {
    headers: {
      "X-Auth-Token": config.secretKey,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Scaleway API error ${response.status}: ${text}`);
  }

  return response.json() as Promise<T>;
}

export interface ScalewayInvoice {
  id: string;
  organization_id: string;
  start_date: string;
  stop_date: string;
  billing_period: string;
  invoice_type: string;
  number: number;
  state: string;
  total_untaxed: string;
  total_taxed: string;
  total_tax: string;
  currency: string;
  issued_date: string;
  due_date: string;
  seller_name: string;
  buyer_name: string;
}

export interface ScalewayInvoicesResponse {
  invoices: ScalewayInvoice[];
  total_count: number;
}

export async function listInvoices(params?: {
  organizationId?: string;
  startedAfter?: string;
  startedBefore?: string;
  invoiceType?: "periodic" | "purchase";
  page?: number;
  pageSize?: number;
}): Promise<ScalewayInvoicesResponse> {
  const config = await getConfig();
  const queryParams: Record<string, string> = {
    organization_id: params?.organizationId ?? config.organizationId,
  };

  if (params?.startedAfter) queryParams["started_after"] = params.startedAfter;
  if (params?.startedBefore) queryParams["started_before"] = params.startedBefore;
  if (params?.invoiceType) queryParams["invoice_type"] = params.invoiceType;
  if (params?.page) queryParams["page"] = String(params.page);
  if (params?.pageSize) queryParams["page_size"] = String(params.pageSize);

  return scalewayFetch<ScalewayInvoicesResponse>(
    "/billing/v1alpha1/invoices",
    queryParams
  );
}

export async function downloadInvoice(invoiceId: string): Promise<{ download_url: string }> {
  return scalewayFetch<{ download_url: string }>(
    `/billing/v1alpha1/invoices/${invoiceId}/download`
  );
}

export interface ScalewayConsumption {
  resource_name: string;
  resource_type: string;
  category_name: string;
  sku: string;
  unit: string;
  billed_quantity: string;
  project_id: string;
  value: { currency_code: string; units: string; nanos: number };
  description: string;
}

export interface ScalewayConsumptionResponse {
  consumptions: ScalewayConsumption[];
  total_count: number;
  updated_at: string;
}

export async function getConsumption(params?: {
  organizationId?: string;
  projectId?: string;
  month?: string;
}): Promise<ScalewayConsumptionResponse> {
  const config = await getConfig();
  const queryParams: Record<string, string> = {
    organization_id: params?.organizationId ?? config.organizationId,
  };

  if (params?.projectId) queryParams["project_id"] = params.projectId;
  if (params?.month) queryParams["billing_period"] = params.month;

  return scalewayFetch<ScalewayConsumptionResponse>(
    "/billing/v1alpha1/consumptions",
    queryParams
  );
}
