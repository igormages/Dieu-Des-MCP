import { getServiceKeys } from "@/lib/keys/store";

const BASE = "https://api.elevenlabs.io/v1";

async function getApiKey(): Promise<string> {
  const keys = await getServiceKeys("elevenlabs");
  if (!keys?.apiKey) throw new Error("ElevenLabs API key non configurée. Rendez-vous sur /settings pour l'ajouter.");
  return keys.apiKey;
}

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const apiKey = await getApiKey();
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = (err as { detail?: { message?: string } | string }).detail;
    throw new Error(
      typeof msg === "string" ? msg : (msg as { message?: string })?.message ?? `ElevenLabs error ${res.status}`
    );
  }
  return res.json() as Promise<T>;
}

export interface ElevenLabsSubscription {
  tier: string;
  character_count: number;
  character_limit: number;
  voice_limit: number;
  professional_voice_limit: number;
  next_character_count_reset_unix: number;
  status: string;
}

export interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  description?: string;
  labels?: Record<string, string>;
  preview_url?: string;
  category?: string;
}

export interface ElevenLabsModel {
  model_id: string;
  name: string;
  description: string;
  can_be_finetuned: boolean;
  can_do_text_to_speech: boolean;
  can_do_voice_conversion: boolean;
  languages: { language_id: string; name: string }[];
}

export interface ElevenLabsProject {
  project_id: string;
  name: string;
  create_unix_time: number;
  state: string;
  default_title_voice_id: string;
  default_paragraph_voice_id: string;
  default_model_id: string;
}

export async function getSubscription() {
  const data = await req<{ subscription: ElevenLabsSubscription }>("/user");
  return (data as unknown as { subscription: ElevenLabsSubscription }).subscription;
}

export function listVoices() {
  return req<{ voices: ElevenLabsVoice[] }>("/voices");
}

export function listModels() {
  return req<ElevenLabsModel[]>("/models");
}

export function listProjects() {
  return req<{ projects: ElevenLabsProject[] }>("/projects");
}

export async function textToSpeechMp3(
  voiceId: string,
  text: string,
  modelId = "eleven_multilingual_v2",
  stability = 0.5,
  similarityBoost = 0.75
): Promise<Uint8Array> {
  const apiKey = await getApiKey();
  const res = await fetch(`${BASE}/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: { stability, similarity_boost: similarityBoost },
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = (err as { detail?: { message?: string } | string }).detail;
    throw new Error(
      typeof msg === "string" ? msg : (msg as { message?: string })?.message ?? `ElevenLabs error ${res.status}`
    );
  }
  const buffer = await res.arrayBuffer();
  return new Uint8Array(buffer);
}

export function createProject(
  name: string,
  defaultTitleVoiceId: string,
  defaultParagraphVoiceId: string,
  defaultModelId = "eleven_multilingual_v2"
) {
  return req<{ project: ElevenLabsProject }>("/projects/add", {
    method: "POST",
    body: JSON.stringify({
      name,
      default_title_voice_id: defaultTitleVoiceId,
      default_paragraph_voice_id: defaultParagraphVoiceId,
      default_model_id: defaultModelId,
    }),
  });
}
