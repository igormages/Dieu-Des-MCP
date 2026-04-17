import { getServiceKeys } from "@/lib/keys/store";

const OPENAI_BASE_URL = "https://api.openai.com/v1";

async function getApiKey(): Promise<string> {
  const keys = await getServiceKeys("openai");
  const apiKey = keys?.apiKey;

  if (!apiKey) {
    throw new Error(
      "La clé API OpenAI n'est pas configurée. Rendez-vous sur /settings pour l'ajouter."
    );
  }

  return apiKey;
}

async function openaiFetch<T>(path: string, params?: Record<string, string>): Promise<T> {
  const apiKey = await getApiKey();
  const url = new URL(`${OPENAI_BASE_URL}${path}`);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${text}`);
  }

  return response.json() as Promise<T>;
}

export interface OpenAIUsageData {
  object: string;
  daily_costs: Array<{
    timestamp: number;
    line_items: Array<{
      name: string;
      cost: number;
    }>;
  }>;
  total_usage: number;
}

export async function getUsage(params: {
  date: string;
  subscriptionId?: string;
}): Promise<OpenAIUsageData> {
  const queryParams: Record<string, string> = { date: params.date };
  if (params.subscriptionId) queryParams["subscription_id"] = params.subscriptionId;

  return openaiFetch<OpenAIUsageData>("/usage", queryParams);
}

export interface OpenAIOrganizationCosts {
  object: string;
  data: Array<{
    aggregation_timestamp: number;
    amount: { value: number; currency: string };
    line_item: string | null;
    project_id: string | null;
    organization_id: string;
  }>;
  has_more: boolean;
  next_page: string | null;
  total_cost: number;
}

export async function getOrganizationCosts(params?: {
  startTime?: number;
  endTime?: number;
  bucketWidth?: string;
  limit?: number;
  page?: string;
}): Promise<OpenAIOrganizationCosts> {
  const queryParams: Record<string, string> = {};
  if (params?.startTime) queryParams["start_time"] = String(params.startTime);
  if (params?.endTime) queryParams["end_time"] = String(params.endTime);
  if (params?.bucketWidth) queryParams["bucket_width"] = params.bucketWidth;
  if (params?.limit) queryParams["limit"] = String(params.limit);
  if (params?.page) queryParams["page"] = params.page;

  return openaiFetch<OpenAIOrganizationCosts>("/organization/costs", queryParams);
}

export interface OpenAIOrganizationUsage {
  object: string;
  data: Array<{
    aggregation_timestamp: number;
    results: Array<{
      input_tokens: number;
      output_tokens: number;
      num_model_requests: number;
      source: string;
      operation: string;
      model_id: string | null;
      project_id: string | null;
    }>;
  }>;
  has_more: boolean;
  next_page: string | null;
}

export async function getOrganizationUsage(params?: {
  startTime?: number;
  endTime?: number;
  bucketWidth?: string;
  limit?: number;
  page?: string;
}): Promise<OpenAIOrganizationUsage> {
  const queryParams: Record<string, string> = {};
  if (params?.startTime) queryParams["start_time"] = String(params.startTime);
  if (params?.endTime) queryParams["end_time"] = String(params.endTime);
  if (params?.bucketWidth) queryParams["bucket_width"] = params.bucketWidth;
  if (params?.limit) queryParams["limit"] = String(params.limit);
  if (params?.page) queryParams["page"] = params.page;

  return openaiFetch<OpenAIOrganizationUsage>("/organization/usage/completions", queryParams);
}
