import { getServiceKeys } from "@/lib/keys/store";

const ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1";
const ANTHROPIC_VERSION = "2023-06-01";

interface AnthropicConfig {
  apiKey: string;
  adminKey?: string;
}

async function getConfig(): Promise<AnthropicConfig> {
  const keys = await getServiceKeys("anthropic");
  const apiKey = keys?.apiKey;
  if (!apiKey) {
    throw new Error(
      "La clé API Anthropic n'est pas configurée. Rendez-vous sur /settings pour l'ajouter."
    );
  }
  return { apiKey, adminKey: keys?.adminKey };
}

async function anthropicFetch<T>(
  path: string,
  options: { method?: string; body?: object; useAdmin?: boolean } = {}
): Promise<T> {
  const config = await getConfig();
  const key = options.useAdmin && config.adminKey ? config.adminKey : config.apiKey;

  const response = await fetch(`${ANTHROPIC_BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "x-api-key": key,
      "anthropic-version": ANTHROPIC_VERSION,
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `Anthropic API error ${response.status}`);
  }

  return response.json() as Promise<T>;
}

// ── Models ──────────────────────────────────────────────────────────────────

export interface AnthropicModel {
  id: string;
  display_name: string;
  created_at: string;
  type: string;
}

export async function listModels(): Promise<{ data: AnthropicModel[]; has_more: boolean }> {
  return anthropicFetch("/models");
}

// ── Usage ───────────────────────────────────────────────────────────────────

export interface AnthropicUsageBucket {
  start_time: string;
  end_time: string;
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
}

export interface AnthropicUsageResponse {
  data: AnthropicUsageBucket[];
  has_more: boolean;
  first_id: string | null;
  last_id: string | null;
}

export async function getUsage(params?: {
  startTime?: string;
  endTime?: string;
  granularity?: "day" | "month";
  workspaceId?: string;
  modelId?: string;
  limit?: number;
}): Promise<AnthropicUsageResponse> {
  const url = new URL(`${ANTHROPIC_BASE_URL}/usage`);
  if (params?.startTime) url.searchParams.set("start_time", params.startTime);
  if (params?.endTime) url.searchParams.set("end_time", params.endTime);
  if (params?.granularity) url.searchParams.set("granularity", params.granularity);
  if (params?.workspaceId) url.searchParams.set("workspace_id", params.workspaceId);
  if (params?.modelId) url.searchParams.set("model_id", params.modelId);
  if (params?.limit) url.searchParams.set("limit", String(params.limit));

  const config = await getConfig();
  const key = config.adminKey ?? config.apiKey;

  const response = await fetch(url.toString(), {
    headers: {
      "x-api-key": key,
      "anthropic-version": ANTHROPIC_VERSION,
    },
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `Erreur ${response.status}`);
  }

  return response.json() as Promise<AnthropicUsageResponse>;
}

// ── Workspaces ──────────────────────────────────────────────────────────────

export interface AnthropicWorkspace {
  id: string;
  name: string;
  created_at: string;
  archived_at: string | null;
  display_color: string;
  type: string;
}

export async function listWorkspaces(params?: {
  limit?: number;
  afterId?: string;
  includeArchived?: boolean;
}): Promise<{ data: AnthropicWorkspace[]; has_more: boolean }> {
  const url = new URL(`${ANTHROPIC_BASE_URL}/workspaces`);
  if (params?.limit) url.searchParams.set("limit", String(params.limit));
  if (params?.afterId) url.searchParams.set("after_id", params.afterId);
  if (params?.includeArchived) url.searchParams.set("include_archived", "true");

  const config = await getConfig();
  const key = config.adminKey ?? config.apiKey;

  const response = await fetch(url.toString(), {
    headers: { "x-api-key": key, "anthropic-version": ANTHROPIC_VERSION },
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `Erreur ${response.status}`);
  }

  return response.json() as Promise<{ data: AnthropicWorkspace[]; has_more: boolean }>;
}

// ── API Keys ─────────────────────────────────────────────────────────────────

export interface AnthropicApiKey {
  id: string;
  name: string;
  status: "active" | "disabled" | "archived";
  created_at: string;
  workspace_id: string;
  partial_key_hint: string;
  type: string;
}

export async function listApiKeys(params?: {
  limit?: number;
  workspaceId?: string;
  status?: "active" | "disabled" | "archived";
}): Promise<{ data: AnthropicApiKey[]; has_more: boolean }> {
  const url = new URL(`${ANTHROPIC_BASE_URL}/api_keys`);
  if (params?.limit) url.searchParams.set("limit", String(params.limit));
  if (params?.workspaceId) url.searchParams.set("workspace_id", params.workspaceId);
  if (params?.status) url.searchParams.set("status", params.status);

  const config = await getConfig();
  const key = config.adminKey ?? config.apiKey;

  const response = await fetch(url.toString(), {
    headers: { "x-api-key": key, "anthropic-version": ANTHROPIC_VERSION },
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `Erreur ${response.status}`);
  }

  return response.json() as Promise<{ data: AnthropicApiKey[]; has_more: boolean }>;
}

// ── Messages ─────────────────────────────────────────────────────────────────

export interface AnthropicMessage {
  id: string;
  type: string;
  role: string;
  content: Array<{ type: string; text: string }>;
  model: string;
  stop_reason: string;
  usage: { input_tokens: number; output_tokens: number };
}

export async function createMessage(params: {
  model: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  maxTokens?: number;
  system?: string;
  temperature?: number;
}): Promise<AnthropicMessage> {
  return anthropicFetch<AnthropicMessage>("/messages", {
    method: "POST",
    body: {
      model: params.model,
      messages: params.messages,
      max_tokens: params.maxTokens ?? 1024,
      ...(params.system ? { system: params.system } : {}),
      ...(params.temperature !== undefined ? { temperature: params.temperature } : {}),
    },
  });
}
