import { getServiceKeys } from "@/lib/keys/store";

const BASE = "https://openrouter.ai/api/v1";
const HTTP_REFERER = "https://dieudesmcp.local";
const X_TITLE = "EasyDashboard MCP";

async function getApiKey(): Promise<string> {
  const keys = await getServiceKeys("openrouter");
  const apiKey = keys?.apiKey;
  if (!apiKey) {
    throw new Error(
      "Clé API OpenRouter non configurée. Rendez-vous sur /settings pour l'ajouter (sk-or-v1-...)."
    );
  }
  return apiKey;
}

interface RequestOpts {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

async function openrouterFetch<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const apiKey = await getApiKey();
  const url = new URL(`${BASE}${path}`);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }
  }

  const response = await fetch(url.toString(), {
    method: opts.method ?? "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": HTTP_REFERER,
      "X-Title": X_TITLE,
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenRouter ${response.status}: ${text.slice(0, 500)}`);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/* ------------------------------------------------------------------ */
/* Types publics                                                      */
/* ------------------------------------------------------------------ */

export interface OpenRouterPricing {
  prompt?: string;
  completion?: string;
  image?: string;
  request?: string;
  input_cache_read?: string;
}

export interface OpenRouterModel {
  id: string;
  name: string;
  created?: number;
  description?: string;
  context_length?: number;
  max_output_length?: number;
  input_modalities?: string[];
  output_modalities?: string[];
  pricing?: OpenRouterPricing | OpenRouterPricing[];
  supported_features?: string[];
  supported_sampling_parameters?: string[];
  deprecation_date?: string;
}

export interface OpenRouterModelsResponse {
  data: OpenRouterModel[];
}

export interface OpenRouterKeyResponse {
  data: {
    label?: string;
    limit?: number | null;
    limit_reset?: string | null;
    limit_remaining?: number | null;
    include_byok_in_limit?: boolean;
    usage?: number;
    usage_daily?: number;
    usage_weekly?: number;
    usage_monthly?: number;
    byok_usage?: number;
    is_free_tier?: boolean;
  };
}

export interface OpenRouterCreditsResponse {
  data: {
    total_credits: number;
    total_usage: number;
  };
}

export interface OpenRouterChatMessage {
  role: "system" | "user" | "assistant";
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      >;
}

export interface OpenRouterChatResponse {
  id: string;
  model: string;
  created: number;
  choices: Array<{
    index: number;
    finish_reason?: string;
    message: {
      role: string;
      content: string | null;
      images?: Array<{
        type?: string;
        image_url?: { url: string };
      }>;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    cost?: number;
  };
}

export interface OpenRouterGenerationResponse {
  data: {
    id: string;
    model: string;
    streamed: boolean;
    created_at: string;
    finish_reason?: string;
    native_tokens_prompt?: number;
    native_tokens_completion?: number;
    total_cost?: number;
    upstream_id?: string;
    cache_discount?: number;
    app_id?: number;
    [key: string]: unknown;
  };
}

/* ------------------------------------------------------------------ */
/* API publique                                                       */
/* ------------------------------------------------------------------ */

export async function listModels(params?: {
  inputModalities?: string;
  outputModalities?: string;
  category?: string;
}): Promise<OpenRouterModelsResponse> {
  return openrouterFetch<OpenRouterModelsResponse>("/models", {
    query: {
      input_modalities: params?.inputModalities,
      output_modalities: params?.outputModalities,
      category: params?.category,
    },
  });
}

export async function getKeyInfo(): Promise<OpenRouterKeyResponse> {
  return openrouterFetch<OpenRouterKeyResponse>("/key");
}

export async function getCredits(): Promise<OpenRouterCreditsResponse> {
  return openrouterFetch<OpenRouterCreditsResponse>("/credits");
}

export async function getGeneration(id: string): Promise<OpenRouterGenerationResponse> {
  return openrouterFetch<OpenRouterGenerationResponse>("/generation", {
    query: { id },
  });
}

export interface ChatCompletionParams {
  model: string;
  messages: OpenRouterChatMessage[];
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  /** Si true, demande aussi une génération d'image en plus du texte. */
  withImage?: boolean;
  /** Configuration image (taille, ratio) si modèle multimodal d'image. */
  imageConfig?: {
    aspectRatio?: string;
    imageSize?: string;
  };
  /** Routage / fallback / preferences OpenRouter. */
  provider?: Record<string, unknown>;
  reasoning?: Record<string, unknown>;
}

export async function chatCompletion(
  params: ChatCompletionParams
): Promise<OpenRouterChatResponse> {
  const body: Record<string, unknown> = {
    model: params.model,
    messages: params.messages,
  };
  if (params.temperature !== undefined) body.temperature = params.temperature;
  if (params.maxTokens !== undefined) body.max_tokens = params.maxTokens;
  if (params.topP !== undefined) body.top_p = params.topP;
  if (params.withImage) body.modalities = ["image", "text"];
  if (params.imageConfig) body.image_config = params.imageConfig;
  if (params.provider) body.provider = params.provider;
  if (params.reasoning) body.reasoning = params.reasoning;

  return openrouterFetch<OpenRouterChatResponse>("/chat/completions", {
    method: "POST",
    body,
  });
}

/**
 * Décode un dataURL (`data:image/png;base64,xxx`) en bytes + mime.
 */
export function decodeDataUrl(
  dataUrl: string
): { mimeType: string; bytes: Uint8Array } | null {
  const match = dataUrl.match(/^data:([^;,]+)(?:;base64)?,(.+)$/);
  if (!match) return null;
  const mimeType = match[1];
  const isBase64 = dataUrl.includes(";base64,");
  if (isBase64) {
    return { mimeType, bytes: new Uint8Array(Buffer.from(match[2], "base64")) };
  }
  return { mimeType, bytes: new Uint8Array(Buffer.from(decodeURIComponent(match[2]))) };
}
