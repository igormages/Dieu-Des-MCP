import { createSign } from "crypto";
import { getServiceKeys } from "@/lib/keys/store";

const BILLING_BASE_URL = "https://cloudbilling.googleapis.com/v1";

interface GoogleCloudConfig {
  clientEmail: string;
  privateKey: string;
}

async function getConfig(): Promise<GoogleCloudConfig> {
  const keys = await getServiceKeys("googlecloud");
  const clientEmail = keys?.clientEmail;
  const privateKey = keys?.privateKey;

  if (!clientEmail || !privateKey) {
    throw new Error(
      "Les clés Google Cloud ne sont pas configurées. Rendez-vous sur /settings pour les ajouter."
    );
  }

  const normalizedKey = privateKey.replace(/\\n/g, "\n");
  return { clientEmail, privateKey: normalizedKey };
}

function createServiceAccountJWT(config: GoogleCloudConfig, scope: string): string {
  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", typ: "JWT" })
  ).toString("base64url");

  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      iss: config.clientEmail,
      scope,
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    })
  ).toString("base64url");

  const signingInput = `${header}.${payload}`;
  const sign = createSign("SHA256");
  sign.update(signingInput);
  const signature = sign.sign(config.privateKey).toString("base64url");

  return `${signingInput}.${signature}`;
}

async function getAccessToken(): Promise<string> {
  const config = await getConfig();
  const jwt = createServiceAccountJWT(
    config,
    "https://www.googleapis.com/auth/cloud-billing.readonly"
  );

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }).toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google OAuth error ${response.status}: ${text}`);
  }

  const data = await response.json() as { access_token: string };
  return data.access_token;
}

async function gcpFetch<T>(path: string, params?: Record<string, string>): Promise<T> {
  const token = await getAccessToken();
  const url = new URL(`${BILLING_BASE_URL}${path}`);

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
    throw new Error(`Google Cloud Billing API error ${response.status}: ${text}`);
  }

  return response.json() as Promise<T>;
}

export interface GcpBillingAccount {
  name: string;
  open: boolean;
  displayName: string;
  masterBillingAccount: string;
  currencyCode: string;
}

export interface GcpBillingAccountsResponse {
  billingAccounts: GcpBillingAccount[];
  nextPageToken?: string;
}

export async function listBillingAccounts(params?: {
  pageSize?: number;
  pageToken?: string;
}): Promise<GcpBillingAccountsResponse> {
  const queryParams: Record<string, string> = {};
  if (params?.pageSize) queryParams["pageSize"] = String(params.pageSize);
  if (params?.pageToken) queryParams["pageToken"] = params.pageToken;

  return gcpFetch<GcpBillingAccountsResponse>("/billingAccounts", queryParams);
}

export interface GcpInvoice {
  name: string;
  issueDate: string;
  dueDate: string;
  currencyCode: string;
  subtotalAmount?: { currencyCode: string; units: string; nanos: number };
  taxAmount?: { currencyCode: string; units: string; nanos: number };
  totalAmount?: { currencyCode: string; units: string; nanos: number };
  correctedInvoice?: string;
  replacedByInvoice?: string;
  invoiceType?: string;
  servicePeriod?: { startDate: string; endDate: string };
}

export interface GcpInvoicesResponse {
  invoices: GcpInvoice[];
  nextPageToken?: string;
}

export async function listInvoices(params: {
  billingAccountName: string;
  pageSize?: number;
  pageToken?: string;
}): Promise<GcpInvoicesResponse> {
  const queryParams: Record<string, string> = {};
  if (params.pageSize) queryParams["pageSize"] = String(params.pageSize);
  if (params.pageToken) queryParams["pageToken"] = params.pageToken;

  return gcpFetch<GcpInvoicesResponse>(
    `/${params.billingAccountName}/invoices`,
    queryParams
  );
}

export interface GcpProjectBillingInfo {
  name: string;
  projectId: string;
  billingAccountName: string;
  billingEnabled: boolean;
}

export async function listProjectsForBillingAccount(params: {
  billingAccountName: string;
  pageSize?: number;
  pageToken?: string;
}): Promise<{ projectBillingInfo: GcpProjectBillingInfo[]; nextPageToken?: string }> {
  const queryParams: Record<string, string> = {};
  if (params.pageSize) queryParams["pageSize"] = String(params.pageSize);
  if (params.pageToken) queryParams["pageToken"] = params.pageToken;

  return gcpFetch(
    `/${params.billingAccountName}/projects`,
    queryParams
  );
}
