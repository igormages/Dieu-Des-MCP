import { getServiceKeys } from "@/lib/keys/store";

const VERCEL_BASE_URL = "https://api.vercel.com";

interface VercelConfig {
  apiToken: string;
  teamId?: string;
}

async function getConfig(): Promise<VercelConfig> {
  const keys = await getServiceKeys("vercel");
  const apiToken = keys?.apiToken;

  if (!apiToken) {
    throw new Error(
      "Le token API Vercel n'est pas configuré. Rendez-vous sur /settings pour l'ajouter."
    );
  }

  return { apiToken, teamId: keys?.teamId };
}

async function vercelFetch<T>(path: string, params?: Record<string, string>): Promise<T> {
  const config = await getConfig();
  const url = new URL(`${VERCEL_BASE_URL}${path}`);

  if (config.teamId) url.searchParams.set("teamId", config.teamId);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${config.apiToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Vercel API error ${response.status}: ${text}`);
  }

  return response.json() as Promise<T>;
}

export interface VercelInvoice {
  id: string;
  date: number;
  periodStart: number;
  periodEnd: number;
  total: number;
  currency: string;
  state: string;
  invoiceUrl?: string;
  pdfUrl?: string;
}

export interface VercelInvoicesResponse {
  invoices: VercelInvoice[];
  pagination?: { count: number; next: number | null; prev: number | null };
}

export async function listInvoices(params?: {
  limit?: number;
  next?: number;
}): Promise<VercelInvoicesResponse> {
  const queryParams: Record<string, string> = {};
  if (params?.limit) queryParams["limit"] = String(params.limit);
  if (params?.next) queryParams["next"] = String(params.next);

  return vercelFetch<VercelInvoicesResponse>("/v2/invoices", queryParams);
}

export interface VercelTeam {
  id: string;
  slug: string;
  name: string;
  createdAt: number;
  plan: string;
  periodStart?: number;
  periodEnd?: number;
}

export async function getTeam(): Promise<VercelTeam> {
  return vercelFetch<VercelTeam>("/v2/team");
}

export interface VercelProject {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  framework?: string;
  link?: { type: string; repo: string };
}

export interface VercelProjectsResponse {
  projects: VercelProject[];
  pagination?: { count: number; next: number | null; prev: number | null };
}

export async function listProjects(params?: {
  limit?: number;
}): Promise<VercelProjectsResponse> {
  const queryParams: Record<string, string> = {};
  if (params?.limit) queryParams["limit"] = String(params.limit);

  return vercelFetch<VercelProjectsResponse>("/v9/projects", queryParams);
}

export interface VercelUsageEvent {
  id: string;
  resourceId: string;
  action: string;
  createdAt: number;
  payload?: Record<string, unknown>;
}

export async function getSubscription(): Promise<Record<string, unknown>> {
  return vercelFetch<Record<string, unknown>>("/v2/subscriptions");
}
