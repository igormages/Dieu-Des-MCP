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
  anthropic: {
    label: "Anthropic (Claude)",
    fields: [
      {
        key: "apiKey",
        label: "API Key",
        placeholder: "sk-ant-api03-...",
      },
      {
        key: "adminKey",
        label: "Admin API Key (optionnel, pour usage & workspaces)",
        placeholder: "sk-ant-admin-...",
      },
    ],
  },
  microsoft: {
    label: "Microsoft 365",
    fields: [
      {
        key: "tenantId",
        label: "Tenant ID (Azure AD)",
        placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      },
      {
        key: "clientId",
        label: "Client ID (App Registration)",
        placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      },
      {
        key: "clientSecret",
        label: "Client Secret",
        placeholder: "votre-client-secret",
      },
    ],
  },
  apple: {
    label: "Apple (App Store Connect)",
    fields: [
      {
        key: "keyId",
        label: "Key ID",
        placeholder: "XXXXXXXXXX",
      },
      {
        key: "issuerId",
        label: "Issuer ID",
        placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      },
      {
        key: "privateKey",
        label: "Private Key (.p8)",
        placeholder: "-----BEGIN EC PRIVATE KEY-----\n...",
      },
    ],
  },
  googlecloud: {
    label: "Google Cloud",
    fields: [
      {
        key: "clientEmail",
        label: "Service Account Email",
        placeholder: "my-sa@my-project.iam.gserviceaccount.com",
      },
      {
        key: "privateKey",
        label: "Private Key (Service Account)",
        placeholder: "-----BEGIN RSA PRIVATE KEY-----\n...",
      },
    ],
  },
  openai: {
    label: "ChatGPT (OpenAI)",
    fields: [
      {
        key: "apiKey",
        label: "API Key",
        placeholder: "sk-...",
      },
    ],
  },
  vercel: {
    label: "Vercel",
    fields: [
      {
        key: "apiToken",
        label: "API Token",
        placeholder: "votre-api-token",
      },
      {
        key: "teamId",
        label: "Team ID (optionnel)",
        placeholder: "team_xxxxxxxxxxxxxxxxx",
      },
    ],
  },
  ovh: {
    label: "OVH",
    fields: [
      {
        key: "appKey",
        label: "Application Key",
        placeholder: "votre-app-key",
      },
      {
        key: "appSecret",
        label: "Application Secret",
        placeholder: "votre-app-secret",
      },
      {
        key: "consumerKey",
        label: "Consumer Key",
        placeholder: "votre-consumer-key",
      },
      {
        key: "endpoint",
        label: "Endpoint (optionnel)",
        placeholder: "ovh-eu",
      },
    ],
  },
  scaleway: {
    label: "Scaleway",
    fields: [
      {
        key: "secretKey",
        label: "Secret Key",
        placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      },
      {
        key: "organizationId",
        label: "Organization ID",
        placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      },
    ],
  },
  hostinger: {
    label: "Hostinger",
    fields: [
      {
        key: "apiToken",
        label: "API Token",
        placeholder: "votre-api-token",
      },
    ],
  },
  webflow: {
    label: "Webflow",
    fields: [
      {
        key: "apiToken",
        label: "API Token",
        placeholder: "votre-api-token",
      },
    ],
  },
  feedly: {
    label: "Feedly",
    fields: [
      {
        key: "accessToken",
        label: "Access Token (Developer Token)",
        placeholder: "A...",
      },
    ],
  },
  elevenlabs: {
    label: "ElevenLabs",
    fields: [
      {
        key: "apiKey",
        label: "API Key",
        placeholder: "sk_...",
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
    case "anthropic": {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      const adminKey = process.env.ANTHROPIC_ADMIN_KEY;
      return apiKey ? { apiKey, ...(adminKey ? { adminKey } : {}) } : null;
    }
    case "microsoft": {
      const tenantId = process.env.MICROSOFT_TENANT_ID;
      const clientId = process.env.MICROSOFT_CLIENT_ID;
      const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
      return tenantId && clientId && clientSecret
        ? { tenantId, clientId, clientSecret }
        : null;
    }
    case "apple": {
      const keyId = process.env.APPLE_KEY_ID;
      const issuerId = process.env.APPLE_ISSUER_ID;
      const privateKey = process.env.APPLE_PRIVATE_KEY;
      return keyId && issuerId && privateKey ? { keyId, issuerId, privateKey } : null;
    }
    case "googlecloud": {
      const clientEmail = process.env.GOOGLECLOUD_CLIENT_EMAIL;
      const privateKey = process.env.GOOGLECLOUD_PRIVATE_KEY;
      return clientEmail && privateKey ? { clientEmail, privateKey } : null;
    }
    case "openai": {
      const apiKey = process.env.OPENAI_API_KEY;
      return apiKey ? { apiKey } : null;
    }
    case "vercel": {
      const apiToken = process.env.VERCEL_API_TOKEN;
      const teamId = process.env.VERCEL_TEAM_ID;
      return apiToken ? { apiToken, ...(teamId ? { teamId } : {}) } : null;
    }
    case "ovh": {
      const appKey = process.env.OVH_APP_KEY;
      const appSecret = process.env.OVH_APP_SECRET;
      const consumerKey = process.env.OVH_CONSUMER_KEY;
      const endpoint = process.env.OVH_ENDPOINT ?? "ovh-eu";
      return appKey && appSecret && consumerKey
        ? { appKey, appSecret, consumerKey, endpoint }
        : null;
    }
    case "scaleway": {
      const secretKey = process.env.SCALEWAY_SECRET_KEY;
      const organizationId = process.env.SCALEWAY_ORGANIZATION_ID;
      return secretKey && organizationId ? { secretKey, organizationId } : null;
    }
    case "hostinger": {
      const apiToken = process.env.HOSTINGER_API_TOKEN;
      return apiToken ? { apiToken } : null;
    }
    case "webflow": {
      const apiToken = process.env.WEBFLOW_API_TOKEN;
      return apiToken ? { apiToken } : null;
    }
    case "feedly": {
      const accessToken = process.env.FEEDLY_ACCESS_TOKEN;
      return accessToken ? { accessToken } : null;
    }
    case "elevenlabs": {
      const apiKey = process.env.ELEVENLABS_API_KEY;
      return apiKey ? { apiKey } : null;
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

/** Redis Upstash partagé (KV) si les variables d’environnement sont définies. */
export function getKvClient(): Redis | null {
  return getRedis();
}
