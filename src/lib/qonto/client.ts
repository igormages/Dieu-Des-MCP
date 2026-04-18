import { getServiceKeys } from "@/lib/keys/store";

const QONTO_BASE_URL = "https://thirdparty.qonto.com/v2";

interface QontoClientConfig {
  organizationSlug: string;
  secretKey: string;
}

async function getConfig(): Promise<QontoClientConfig> {
  const keys = await getServiceKeys("qonto");

  const organizationSlug = keys?.organizationSlug;
  const secretKey = keys?.secretKey;

  if (!organizationSlug || !secretKey) {
    throw new Error(
      "Les clés Qonto ne sont pas configurées. Rendez-vous sur /settings pour les ajouter."
    );
  }

  return { organizationSlug, secretKey };
}

async function getAuthHeader(): Promise<string> {
  const config = await getConfig();
  return `${config.organizationSlug}:${config.secretKey}`;
}

async function qontoFetch<T>(
  path: string,
  params?: Record<string, string>,
  arrayParams?: Record<string, string[]>
): Promise<T> {
  const authHeader = await getAuthHeader();
  const url = new URL(`${QONTO_BASE_URL}${path}`);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  if (arrayParams) {
    for (const [key, values] of Object.entries(arrayParams)) {
      for (const value of values) {
        url.searchParams.append(key, value);
      }
    }
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Qonto API error ${response.status}: ${text}`);
  }

  return response.json() as Promise<T>;
}

export interface QontoOrganization {
  slug: string;
  legal_name: string;
  bank_accounts: QontoBankAccount[];
}

export interface QontoBankAccount {
  slug: string;
  iban: string;
  bic: string;
  currency: string;
  balance: number;
  balance_cents: number;
  authorized_balance: number;
  authorized_balance_cents: number;
  name: string;
  status: string;
}

export interface QontoTransaction {
  transaction_id: string;
  amount: number;
  amount_cents: number;
  currency: string;
  local_amount: number;
  local_amount_cents: number;
  local_currency: string;
  side: "credit" | "debit";
  operation_type: string;
  label: string;
  settled_at: string | null;
  emitted_at: string;
  status: string;
  note: string | null;
  reference: string | null;
  category: string;
  attachment_ids: string[];
  attachment_required: boolean;
}

export interface QontoAttachment {
  id: string;
  created_at: string;
  file_name: string;
  file_size: string;
  file_content_type: string;
  url: string;
}

export interface QontoBeneficiary {
  id: string;
  name: string;
  iban: string;
  bic: string;
  currency: string;
  status: string;
  trusted: boolean;
}

export async function getOrganization(): Promise<QontoOrganization> {
  const config = await getConfig();
  const data = await qontoFetch<{ organization: QontoOrganization }>(
    `/organizations/${config.organizationSlug}`
  );
  return data.organization;
}

export async function listBankAccounts(): Promise<QontoBankAccount[]> {
  const org = await getOrganization();
  return org.bank_accounts;
}

export async function listTransactions(params: {
  bankAccountSlug: string;
  status?: string[];
  updatedAtFrom?: string;
  updatedAtTo?: string;
  settledAtFrom?: string;
  settledAtTo?: string;
  sortBy?: string;
  currentPage?: number;
  perPage?: number;
  includes?: ("attachments" | "labels" | "vat_details")[];
}): Promise<{ transactions: QontoTransaction[]; meta: { total_count: number; current_page: number; total_pages: number } }> {
  const queryParams: Record<string, string> = {
    slug: params.bankAccountSlug,
  };
  const arrayParams: Record<string, string[]> = {};

  if (params.status?.length) arrayParams["status[]"] = params.status;
  if (params.includes?.length) arrayParams["includes[]"] = params.includes;
  if (params.updatedAtFrom) queryParams["updated_at_from"] = params.updatedAtFrom;
  if (params.updatedAtTo) queryParams["updated_at_to"] = params.updatedAtTo;
  if (params.settledAtFrom) queryParams["settled_at_from"] = params.settledAtFrom;
  if (params.settledAtTo) queryParams["settled_at_to"] = params.settledAtTo;
  if (params.sortBy) queryParams["sort_by"] = params.sortBy;
  if (params.currentPage) queryParams["current_page"] = String(params.currentPage);
  if (params.perPage) queryParams["per_page"] = String(params.perPage);

  return qontoFetch<{
    transactions: QontoTransaction[];
    meta: { total_count: number; current_page: number; total_pages: number };
  }>("/transactions", queryParams, Object.keys(arrayParams).length ? arrayParams : undefined);
}

export async function listTransactionsWithoutAttachments(params: {
  bankAccountSlug: string;
  settledAtFrom?: string;
  settledAtTo?: string;
  currentPage?: number;
  perPage?: number;
}): Promise<{ transactions: QontoTransaction[]; meta: { total_count: number; current_page: number; total_pages: number } }> {
  const result = await listTransactions({
    bankAccountSlug: params.bankAccountSlug,
    status: ["completed"],
    settledAtFrom: params.settledAtFrom,
    settledAtTo: params.settledAtTo,
    perPage: params.perPage ?? 100,
    currentPage: params.currentPage,
    includes: ["attachments"],
  });

  const filtered = result.transactions.filter(
    (t) => !t.attachment_ids || t.attachment_ids.length === 0
  );

  return {
    transactions: filtered,
    meta: {
      ...result.meta,
      total_count: filtered.length,
    },
  };
}

export async function listAttachmentsForTransaction(
  transactionId: string
): Promise<QontoAttachment[]> {
  const data = await qontoFetch<{ attachments: QontoAttachment[] }>(
    `/transactions/${transactionId}/attachments`
  );
  return data.attachments;
}

export async function uploadAttachmentToTransaction(
  transactionId: string,
  fileBase64: string,
  fileName: string,
  contentType: string
): Promise<{ success: boolean }> {
  const bytes = Buffer.from(fileBase64, "base64");
  const blob = new Blob([bytes], { type: contentType });

  const formData = new FormData();
  formData.append("file", blob, fileName);

  const authHeader = await getAuthHeader();
  const response = await fetch(
    `${QONTO_BASE_URL}/transactions/${transactionId}/attachments`,
    {
      method: "POST",
      headers: { Authorization: authHeader },
      body: formData,
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Qonto upload error ${response.status}: ${text}`);
  }

  return { success: true };
}

function extractFileName(fileUrl: string, contentDisposition: string | null): string {
  if (contentDisposition) {
    const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
    if (match?.[1]) return match[1].replace(/['"]/g, "").trim();
  }
  try {
    const pathname = new URL(fileUrl).pathname;
    const segment = pathname.split("/").filter(Boolean).pop();
    if (segment) return decodeURIComponent(segment);
  } catch {
    // ignore
  }
  return "attachment.pdf";
}

export async function uploadAttachmentFromUrl(
  transactionId: string,
  fileUrl: string,
  fileName?: string,
  contentType?: string
): Promise<{ success: boolean; fileName: string; fileSize: number }> {
  const fileResponse = await fetch(fileUrl, { redirect: "follow" });
  if (!fileResponse.ok) {
    throw new Error(`Impossible de télécharger le fichier depuis l'URL (${fileResponse.status})`);
  }

  const detectedType = (contentType ?? fileResponse.headers.get("content-type") ?? "application/pdf").split(";")[0].trim();
  const detectedName = fileName ?? extractFileName(fileUrl, fileResponse.headers.get("content-disposition"));

  const buffer = await fileResponse.arrayBuffer();
  const blob = new Blob([buffer], { type: detectedType });

  const formData = new FormData();
  formData.append("file", blob, detectedName);

  const authHeader = await getAuthHeader();
  const response = await fetch(
    `${QONTO_BASE_URL}/transactions/${transactionId}/attachments`,
    {
      method: "POST",
      headers: { Authorization: authHeader },
      body: formData,
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Qonto upload error ${response.status}: ${text}`);
  }

  return { success: true, fileName: detectedName, fileSize: buffer.byteLength };
}

export async function deleteAttachment(attachmentId: string): Promise<{ success: boolean }> {
  const authHeader = await getAuthHeader();
  const response = await fetch(`${QONTO_BASE_URL}/attachments/${attachmentId}`, {
    method: "DELETE",
    headers: { Authorization: authHeader },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Qonto delete error ${response.status}: ${text}`);
  }

  return { success: true };
}

export async function listBeneficiaries(params?: {
  status?: string;
  updatedAtFrom?: string;
  updatedAtTo?: string;
  currentPage?: number;
  perPage?: number;
}): Promise<{ beneficiaries: QontoBeneficiary[]; meta: { total_count: number; current_page: number; total_pages: number } }> {
  const queryParams: Record<string, string> = {};

  if (params?.status) queryParams["status"] = params.status;
  if (params?.updatedAtFrom) queryParams["updated_at_from"] = params.updatedAtFrom;
  if (params?.updatedAtTo) queryParams["updated_at_to"] = params.updatedAtTo;
  if (params?.currentPage) queryParams["current_page"] = String(params.currentPage);
  if (params?.perPage) queryParams["per_page"] = String(params.perPage);

  return qontoFetch<{
    beneficiaries: QontoBeneficiary[];
    meta: { total_count: number; current_page: number; total_pages: number };
  }>("/beneficiaries", queryParams);
}
