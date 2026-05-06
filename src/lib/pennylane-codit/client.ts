import { getServiceKeys } from "@/lib/keys/store";

const DEFAULT_BASE_URL = "https://app.pennylane.com/api/external/v1";

export interface PennylaneCoditCredentials {
  apiKey: string;
  baseUrl: string;
}

/** Extrait https://app.pennylane.com depuis une base API external/v1. */
export function pennylaneCoditOriginFromBase(baseUrl: string): string {
  return new URL(baseUrl.replace(/\/$/, "")).origin;
}

export async function requirePennylaneCoditConfig(): Promise<PennylaneCoditCredentials> {
  const cfg = await getServiceKeys("pennylaneCodit");
  const apiKey = cfg?.apiKey as string | undefined;
  if (!apiKey?.trim()) {
    throw new Error(
      "Pennylane (COD’IT) : configure la clé API (réglages MCP ou variable PENNYLANE_CODIT_API_KEY)."
    );
  }
  const rawBase =
    (cfg?.baseUrl as string | undefined)?.trim() ||
    process.env.PENNYLANE_CODIT_BASE_URL?.trim() ||
    "";
  const baseUrl = (rawBase || DEFAULT_BASE_URL).replace(/\/$/, "");
  return { apiKey: apiKey.trim(), baseUrl };
}

function headers(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-Use-2026-API-Changes": "true",
  };
}

async function parseJsonSafe(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { _raw: text.slice(0, 2000) };
  }
}

export async function pennylaneCoditRequest<T>(
  method: string,
  url: string,
  body?: unknown
): Promise<T> {
  const { apiKey } = await requirePennylaneCoditConfig();
  const res = await fetch(url, {
    method,
    headers: headers(apiKey),
    body:
      body !== undefined &&
      method !== "GET" &&
      method !== "HEAD"
        ? JSON.stringify(body)
        : undefined,
  });
  const data = await parseJsonSafe(res);
  if (!res.ok) {
    throw new Error(
      `Pennylane (${res.status}) ${url}: ${typeof data === "object" ? JSON.stringify(data).slice(0, 2400) : String(data)}`
    );
  }
  return data as T;
}

/** Requête sous `baseUrl` (ex. .../external/v1). */
export async function pennylaneCoditRequestBase<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const { baseUrl } = await requirePennylaneCoditConfig();
  const p = path.startsWith("/") ? path : `/${path}`;
  return pennylaneCoditRequest<T>(method, `${baseUrl}${p}`, body);
}

/** URL absolue (ex. v2 quotes ou link_credit_note). */
export async function pennylaneCoditRequestAbsolute<T>(
  method: string,
  absoluteUrl: string,
  body?: unknown
): Promise<T> {
  return pennylaneCoditRequest<T>(method, absoluteUrl, body);
}

export function pennylaneCoditV2CustomerInvoicesRoot(baseUrl: string): string {
  return `${pennylaneCoditOriginFromBase(baseUrl)}/api/external/v2/customer_invoices`;
}

export function pennylaneCoditV2QuotesRoot(baseUrl: string): string {
  return `${pennylaneCoditOriginFromBase(baseUrl)}/api/external/v2/quotes`;
}

export async function pennylaneCoditDownloadPdfAsBase64(fileUrl: string): Promise<string> {
  const res = await fetch(fileUrl);
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Téléchargement PDF (${res.status}): ${t.slice(0, 500)}`);
  }
  const buf = await res.arrayBuffer();
  return uint8ArrayToBase64(new Uint8Array(buf));
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/**
 * Envoi mail facture avec retry comme FactoFrance (409 = conflit transitoire).
 */
export async function pennylaneCoditSendInvoiceByEmail(
  invoiceUrlPath: string,
  emailBody: Record<string, unknown>
): Promise<void> {
  const { apiKey, baseUrl } = await requirePennylaneCoditConfig();
  const url = invoiceUrlPath.startsWith("http")
    ? invoiceUrlPath
    : `${baseUrl}${invoiceUrlPath.startsWith("/") ? "" : "/"}${invoiceUrlPath}`;
  const maxRetries = 5;
  const baseDelayMs = 10_000;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: headers(apiKey),
      body: JSON.stringify(emailBody),
    });
    const data = await parseJsonSafe(res);
    if (res.ok) return;
    if (res.status === 409 && attempt < maxRetries - 1) {
      await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** attempt));
      continue;
    }
    throw new Error(
      `send_by_email (${res.status}): ${typeof data === "object" ? JSON.stringify(data).slice(0, 1600) : String(data)}`
    );
  }
}
