import { createHash } from "crypto";
import { getServiceKeys } from "@/lib/keys/store";

const OVH_ENDPOINTS: Record<string, string> = {
  "ovh-eu": "https://eu.api.ovh.com/1.0",
  "ovh-us": "https://api.us.ovhcloud.com/1.0",
  "ovh-ca": "https://ca.api.ovh.com/1.0",
  "kimsufi-eu": "https://eu.api.kimsufi.com/1.0",
  "kimsufi-ca": "https://ca.api.kimsufi.com/1.0",
  "soyoustart-eu": "https://eu.api.soyoustart.com/1.0",
  "soyoustart-ca": "https://ca.api.soyoustart.com/1.0",
};

interface OvhConfig {
  appKey: string;
  appSecret: string;
  consumerKey: string;
  endpoint: string;
}

async function getConfig(): Promise<OvhConfig> {
  const keys = await getServiceKeys("ovh");
  const appKey = keys?.appKey;
  const appSecret = keys?.appSecret;
  const consumerKey = keys?.consumerKey;
  const endpoint = keys?.endpoint ?? "ovh-eu";

  if (!appKey || !appSecret || !consumerKey) {
    throw new Error(
      "Les clés OVH ne sont pas configurées. Rendez-vous sur /settings pour les ajouter."
    );
  }

  return { appKey, appSecret, consumerKey, endpoint };
}

function ovhSignature(
  appSecret: string,
  consumerKey: string,
  method: string,
  url: string,
  body: string,
  timestamp: string
): string {
  const data = `${appSecret}+${consumerKey}+${method}+${url}+${body}+${timestamp}`;
  return "$1$" + createHash("sha1").update(data).digest("hex");
}

async function ovhFetch<T>(method: string, path: string, body?: object): Promise<T> {
  const config = await getConfig();
  const baseUrl = OVH_ENDPOINTS[config.endpoint] ?? OVH_ENDPOINTS["ovh-eu"];
  const url = `${baseUrl}${path}`;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const bodyStr = body ? JSON.stringify(body) : "";
  const signature = ovhSignature(
    config.appSecret,
    config.consumerKey,
    method,
    url,
    bodyStr,
    timestamp
  );

  const response = await fetch(url, {
    method,
    headers: {
      "X-Ovh-Application": config.appKey,
      "X-Ovh-Consumer": config.consumerKey,
      "X-Ovh-Signature": signature,
      "X-Ovh-Timestamp": timestamp,
      "Content-Type": "application/json",
    },
    body: body ? bodyStr : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OVH API error ${response.status}: ${text}`);
  }

  return response.json() as Promise<T>;
}

export async function listBills(): Promise<string[]> {
  return ovhFetch<string[]>("GET", "/me/bill");
}

export interface OvhBill {
  billId: string;
  date: string;
  url: string;
  htmlUrl?: string;
  orderId: number;
  password: string;
  pdfUrl: string;
  priceWithTax: { currencyCode: string; text: string; value: number };
  priceWithoutTax: { currencyCode: string; text: string; value: number };
  tax: { currencyCode: string; text: string; value: number };
}

export async function getBill(billId: string): Promise<OvhBill> {
  return ovhFetch<OvhBill>("GET", `/me/bill/${billId}`);
}

export interface OvhBillDetail {
  billDetailId: string;
  description: string;
  domain: string;
  periodEnd: string;
  periodStart: string;
  quantity: string;
  totalPrice: { currencyCode: string; text: string; value: number };
  unitPrice: { currencyCode: string; text: string; value: number };
}

export async function getBillDetails(billId: string): Promise<string[]> {
  return ovhFetch<string[]>("GET", `/me/bill/${billId}/details`);
}

export async function getBillDetail(billId: string, detailId: string): Promise<OvhBillDetail> {
  return ovhFetch<OvhBillDetail>("GET", `/me/bill/${billId}/details/${detailId}`);
}

export interface OvhMeInfo {
  firstname: string;
  name: string;
  email: string;
  organisation: string;
  nichandle: string;
  state: string;
  currency: { code: string; symbol: string };
}

export async function getMe(): Promise<OvhMeInfo> {
  return ovhFetch<OvhMeInfo>("GET", "/me");
}
