import { createSign } from "crypto";
import { getServiceKeys } from "@/lib/keys/store";

const ASC_BASE_URL = "https://api.appstoreconnect.apple.com/v1";

interface AppleConfig {
  keyId: string;
  issuerId: string;
  privateKey: string;
}

async function getConfig(): Promise<AppleConfig> {
  const keys = await getServiceKeys("apple");
  const keyId = keys?.keyId;
  const issuerId = keys?.issuerId;
  const privateKey = keys?.privateKey;

  if (!keyId || !issuerId || !privateKey) {
    throw new Error(
      "Les clés Apple App Store Connect ne sont pas configurées. Rendez-vous sur /settings pour les ajouter."
    );
  }

  return { keyId, issuerId, privateKey };
}

function createJWT(config: AppleConfig): string {
  const header = Buffer.from(
    JSON.stringify({ alg: "ES256", kid: config.keyId, typ: "JWT" })
  ).toString("base64url");

  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      iss: config.issuerId,
      iat: now,
      exp: now + 1200,
      aud: "appstoreconnect-v1",
    })
  ).toString("base64url");

  const signingInput = `${header}.${payload}`;
  const sign = createSign("SHA256");
  sign.update(signingInput);
  const signature = sign
    .sign({ key: config.privateKey, dsaEncoding: "ieee-p1363" })
    .toString("base64url");

  return `${signingInput}.${signature}`;
}

async function appleFetch<T>(path: string, params?: Record<string, string>): Promise<T> {
  const config = await getConfig();
  const token = createJWT(config);
  const url = new URL(`${ASC_BASE_URL}${path}`);

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
    throw new Error(`Apple App Store Connect API error ${response.status}: ${text}`);
  }

  return response.json() as Promise<T>;
}

export interface AppleSalesReportParams {
  vendorNumber: string;
  reportType: "SALES" | "SUBSCRIPTION" | "SUBSCRIPTION_EVENT" | "SUBSCRIBER";
  reportSubType: "SUMMARY" | "DETAILED";
  frequency: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  reportDate: string;
  version?: string;
}

export interface AppleApp {
  id: string;
  type: string;
  attributes: {
    name: string;
    bundleId: string;
    sku: string;
    primaryLocale: string;
  };
}

export interface AppleAppsResponse {
  data: AppleApp[];
  meta?: { paging?: { total: number; limit: number } };
}

export async function listApps(params?: { limit?: number }): Promise<AppleAppsResponse> {
  const queryParams: Record<string, string> = {};
  if (params?.limit) queryParams["limit"] = String(params.limit);
  return appleFetch<AppleAppsResponse>("/apps", queryParams);
}

export interface AppleFinanceReport {
  vendorNumber: string;
  reportType: string;
  frequency: string;
  reportDate: string;
  data: string;
}

export async function getSalesReport(params: AppleSalesReportParams): Promise<string> {
  const config = await getConfig();
  const token = createJWT(config);

  const url = new URL(`${ASC_BASE_URL}/salesReports`);
  url.searchParams.set("filter[vendorNumber]", params.vendorNumber);
  url.searchParams.set("filter[reportType]", params.reportType);
  url.searchParams.set("filter[reportSubType]", params.reportSubType);
  url.searchParams.set("filter[frequency]", params.frequency);
  url.searchParams.set("filter[reportDate]", params.reportDate);
  if (params.version) url.searchParams.set("filter[version]", params.version);

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      "Accept-Encoding": "gzip",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Apple Sales Report error ${response.status}: ${text}`);
  }

  return response.text();
}

export interface AppleFinanceReportSummary {
  vendorNumber: string;
  reportDate: string;
  reportType: string;
  frequency: string;
}

export async function getFinanceReport(params: {
  vendorNumber: string;
  regionCode: string;
  reportType: "FINANCIAL_REPORT" | "FINANCE_DETAIL";
  fiscalYear: string;
  fiscalPeriod: string;
}): Promise<string> {
  const config = await getConfig();
  const token = createJWT(config);

  const url = new URL(`${ASC_BASE_URL}/financeReports`);
  url.searchParams.set("filter[vendorNumber]", params.vendorNumber);
  url.searchParams.set("filter[regionCode]", params.regionCode);
  url.searchParams.set("filter[reportType]", params.reportType);
  url.searchParams.set("filter[fiscalYear]", params.fiscalYear);
  url.searchParams.set("filter[fiscalPeriod]", params.fiscalPeriod);

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      "Accept-Encoding": "gzip",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Apple Finance Report error ${response.status}: ${text}`);
  }

  return response.text();
}
