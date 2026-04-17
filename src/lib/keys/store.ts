import { Redis } from "@upstash/redis";

export interface ServiceConfig {
  [key: string]: string;
}

export const SERVICE_DEFINITIONS: Record<
  string,
  { label: string; fields: { key: string; label: string; placeholder: string }[] }
> = {
  github: {
    label: "GitHub",
    fields: [
      {
        key: "personalAccessToken",
        label: "Personal Access Token",
        placeholder: "ghp_...",
      },
    ],
  },
  qonto: {
    label: "Qonto",
    fields: [
      {
        key: "organizationSlug",
        label: "Organization Slug",
        placeholder: "my-company-1234",
      },
      {
        key: "secretKey",
        label: "Secret Key",
        placeholder: "votre-cle-secrete",
      },
    ],
  },
};

let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  redis = new Redis({ url, token });
  return redis;
}

function getFromEnv(service: string): ServiceConfig | null {
  switch (service) {
    case "github": {
      const t = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
      return t ? { personalAccessToken: t } : null;
    }
    case "qonto": {
      const slug = process.env.QONTO_ORGANIZATION_SLUG;
      const key = process.env.QONTO_SECRET_KEY;
      return slug && key ? { organizationSlug: slug, secretKey: key } : null;
    }
    default:
      return null;
  }
}

const KEYS_PREFIX = "mcp:keys:";

export async function getServiceKeys(
  service: string
): Promise<ServiceConfig | null> {
  const kv = getRedis();
  if (!kv) return getFromEnv(service);

  const stored = await kv.get<ServiceConfig>(`${KEYS_PREFIX}${service}`);
  return stored ?? getFromEnv(service);
}

export async function setServiceKeys(
  service: string,
  config: ServiceConfig
): Promise<void> {
  const kv = getRedis();
  if (!kv) {
    throw new Error(
      "KV_REST_API_URL et KV_REST_API_TOKEN doivent être configurés pour utiliser l'interface de gestion des clés."
    );
  }
  await kv.set(`${KEYS_PREFIX}${service}`, config);
}

export async function deleteServiceKeys(service: string): Promise<void> {
  const kv = getRedis();
  if (!kv) return;
  await kv.del(`${KEYS_PREFIX}${service}`);
}

export async function getAllServiceStatuses(): Promise<
  Record<string, { configured: boolean; source: "kv" | "env" | "none" }>
> {
  const result: Record<
    string,
    { configured: boolean; source: "kv" | "env" | "none" }
  > = {};
  const kv = getRedis();

  for (const service of Object.keys(SERVICE_DEFINITIONS)) {
    if (kv) {
      const stored = await kv.get<ServiceConfig>(`${KEYS_PREFIX}${service}`);
      if (stored && Object.values(stored).every(Boolean)) {
        result[service] = { configured: true, source: "kv" };
        continue;
      }
    }

    const env = getFromEnv(service);
    if (env && Object.values(env).every(Boolean)) {
      result[service] = { configured: true, source: "env" };
    } else {
      result[service] = { configured: false, source: "none" };
    }
  }

  return result;
}

export function isKvConfigured(): boolean {
  return getRedis() !== null;
}
