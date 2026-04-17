import { getServiceKeys } from "@/lib/keys/store";

const BASE = "https://cloud.feedly.com/v3";

async function getToken(): Promise<string> {
  const keys = await getServiceKeys("feedly");
  if (!keys?.accessToken) throw new Error("Feedly access token non configuré. Rendez-vous sur /settings pour l'ajouter.");
  return keys.accessToken;
}

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { errorMessage?: string }).errorMessage ?? `Feedly error ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export interface FeedlyProfile {
  id: string;
  email: string;
  fullName: string;
  givenName: string;
  familyName: string;
  locale: string;
  plan: string;
}

export interface FeedlySubscription {
  id: string;
  title: string;
  website: string;
  updated: number;
  categories: { id: string; label: string }[];
}

export interface FeedlyCollection {
  id: string;
  label: string;
  feeds: { id: string; title: string }[];
}

export interface FeedlyArticle {
  id: string;
  title?: { content: string };
  summary?: { content: string };
  content?: { content: string };
  published: number;
  updated?: number;
  author?: string;
  canonicalUrl?: string;
  alternate?: { href: string; type: string }[];
  origin?: { streamId: string; title: string; htmlUrl: string };
  unread?: boolean;
}

export interface FeedlyStreamContents {
  id: string;
  title: string;
  items: FeedlyArticle[];
  continuation?: string;
}

export function getProfile() {
  return req<FeedlyProfile>("/profile");
}

export function getSubscriptions() {
  return req<FeedlySubscription[]>("/subscriptions");
}

export function getCollections() {
  return req<FeedlyCollection[]>("/collections");
}

export function getStreamContents(streamId: string, count = 20, continuation?: string) {
  const params = new URLSearchParams({ streamId, count: String(count) });
  if (continuation) params.set("continuation", continuation);
  return req<FeedlyStreamContents>(`/streams/contents?${params}`);
}

export function createCollection(label: string) {
  return req<FeedlyCollection[]>("/collections", {
    method: "POST",
    body: JSON.stringify({ label }),
  });
}

export function markArticlesRead(articleIds: string[]) {
  return req<void>("/markers", {
    method: "POST",
    body: JSON.stringify({ action: "markAsRead", type: "entries", entryIds: articleIds }),
  });
}
