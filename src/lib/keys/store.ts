import { Redis } from "@upstash/redis";

export interface ServiceConfig {
  [key: string]: string;
}

export const SERVICE_DEFINITIONS: Record<
  string,
  {
    label: string;
    fields: { key: string; label: string; placeholder: string; required?: boolean }[];
    /** Affiché dans les réglages comme disponible sans saisie de clés (ex. flux public). */
    noKeysRequired?: boolean;
  }
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
        required: false,
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
  openrouter: {
    label: "OpenRouter",
    fields: [
      {
        key: "apiKey",
        label: "API Key",
        placeholder: "sk-or-v1-...",
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
  clubigen: {
    label: "Club iGen",
    fields: [],
    noKeysRequired: true,
  },
  coditVentePres: {
    label: "CoditVentePres (COD'IT)",
    fields: [
      {
        key: "presentationSource",
        label: "URL ou dossier presentation.json",
        placeholder:
          "https://…/presentation.json ou chemin absolu …/CoditVentePres-2/commercial",
      },
    ],
  },
  pennylaneCodit: {
    label: "Pennylane (COD'IT)",
    fields: [
      {
        key: "apiKey",
        label: "Token API Pennylane (Bearer)",
        placeholder: "votre token entreprise Pennylane",
      },
    ],
  },
  cookidoo: {
    label: "Cookidoo (Thermomix)",
    fields: [
      {
        key: "username",
        label: "Email du compte Cookidoo",
        placeholder: "votre.email@example.com",
      },
      {
        key: "password",
        label: "Mot de passe",
        placeholder: "votre mot de passe",
      },
    ],
  },
  biocoop: {
    label: "Biocoop",
    fields: [
      {
        key: "username",
        label: "Email du compte Biocoop",
        placeholder: "votre.email@example.com",
      },
      {
        key: "password",
        label: "Mot de passe",
        placeholder: "votre mot de passe",
      },
      {
        key: "storePath",
        label: "Chemin magasin (slug URL)",
        placeholder: "magasin-bio_golfe_luscanen",
      },
    ],
  },
  octopus: {
    label: "Octopus Energy",
    fields: [
      {
        key: "email",
        label: "Email du compte Octopus",
        placeholder: "votre.email@example.com",
      },
      {
        key: "password",
        label: "Mot de passe",
        placeholder: "votre mot de passe",
      },
      {
        key: "accountNumber",
        label: "Numéro de compte (optionnel)",
        placeholder: "A-78F490A5",
        required: false,
      },
      {
        key: "browserCookies",
        label: "Cookies navigateur (si blocage Vercel)",
        placeholder: "session=...; autre=... (depuis DevTools octopusenergy.fr)",
        required: false,
      },
    ],
  },
  leclercdrive: {
    label: "Leclerc Drive",
    fields: [
      {
        key: "username",
        label: "Email du compte Leclerc",
        placeholder: "votre.email@example.com",
      },
      {
        key: "password",
        label: "Mot de passe",
        placeholder: "votre mot de passe",
      },
      {
        key: "datadomeCookie",
        label: "Cookie DataDome (une fois après captcha)",
        placeholder: "valeur datadome — change dans Chrome à chaque page, normal",
        required: false,
      },
      {
        key: "storeUrl",
        label: "URL magasin après redirection (optionnel)",
        placeholder: "URL fd9-courses… obtenue après connexion sur www.leclercdrive.fr",
        required: false,
      },
      {
        key: "httpProxy",
        label: "URL proxy HTTP (Vercel → VPS)",
        placeholder: "http://leclercdrive:motdepasse@51.159.164.44:443",
        required: false,
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
    case "openrouter": {
      const apiKey = process.env.OPENROUTER_API_KEY;
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
    case "coditVentePres": {
      const presentationSource = process.env.CODIT_VENTEPRES_PRESENTATION_SOURCE?.trim();
      return presentationSource ? { presentationSource } : null;
    }
    case "pennylaneCodit": {
      const apiKey = process.env.PENNYLANE_CODIT_API_KEY ?? process.env.PENNYLANE_API_KEY;
      const baseUrl = process.env.PENNYLANE_CODIT_BASE_URL;
      return apiKey
        ? { apiKey, ...(baseUrl?.trim() ? { baseUrl: baseUrl.trim() } : {}) }
        : null;
    }
    case "cookidoo": {
      const username = process.env.COOKIDOO_USERNAME;
      const password = process.env.COOKIDOO_PASSWORD;
      return username && password ? { username, password } : null;
    }
    case "biocoop": {
      const username = process.env.BIOCOOP_USERNAME;
      const password = process.env.BIOCOOP_PASSWORD;
      const storePath = process.env.BIOCOOP_STORE_PATH;
      if (!username || !password || !storePath?.trim()) return null;
      return {
        username,
        password,
        storePath: storePath.trim(),
      };
    }
    case "octopus": {
      const email = process.env.OCTOPUS_EMAIL;
      const password = process.env.OCTOPUS_PASSWORD;
      if (!email || !password) return null;
      return {
        email,
        password,
        ...(process.env.OCTOPUS_ACCOUNT_NUMBER
          ? { accountNumber: process.env.OCTOPUS_ACCOUNT_NUMBER }
          : {}),
        ...(process.env.OCTOPUS_BROWSER_COOKIES
          ? { browserCookies: process.env.OCTOPUS_BROWSER_COOKIES }
          : {}),
      };
    }
    case "leclercdrive": {
      const username = process.env.LECLERCDRIVE_USERNAME;
      const password = process.env.LECLERCDRIVE_PASSWORD;
      if (!username || !password) return null;
      return {
        username,
        password,
        ...(process.env.LECLERCDRIVE_POINT_LIVRAISON
          ? { pointLivraison: process.env.LECLERCDRIVE_POINT_LIVRAISON }
          : {}),
        ...(process.env.LECLERCDRIVE_STORE_PATH
          ? { storePath: process.env.LECLERCDRIVE_STORE_PATH }
          : {}),
        ...(process.env.LECLERCDRIVE_STORE_SLUG
          ? { storeSlug: process.env.LECLERCDRIVE_STORE_SLUG }
          : {}),
        ...(process.env.LECLERCDRIVE_COURSES_HOST
          ? { coursesHost: process.env.LECLERCDRIVE_COURSES_HOST }
          : {}),
        ...(process.env.LECLERCDRIVE_SECURE_HOST
          ? { secureHost: process.env.LECLERCDRIVE_SECURE_HOST }
          : {}),
        ...(process.env.LECLERCDRIVE_DATADOME_COOKIE
          ? { datadomeCookie: process.env.LECLERCDRIVE_DATADOME_COOKIE }
          : {}),
        ...(process.env.LECLERCDRIVE_BROWSER_COOKIES
          ? { browserCookies: process.env.LECLERCDRIVE_BROWSER_COOKIES }
          : {}),
        ...(process.env.LECLERCDRIVE_STORE_URL
          ? { storeUrl: process.env.LECLERCDRIVE_STORE_URL }
          : {}),
        ...(process.env.LECLERCDRIVE_HTTP_PROXY
          ? { httpProxy: process.env.LECLERCDRIVE_HTTP_PROXY }
          : {}),
      };
    }
    default:
      return null;
  }
}

function isServiceConfigured(service: string, stored: ServiceConfig): boolean {
  const def = SERVICE_DEFINITIONS[service];
  if (!def) return Object.values(stored).some(Boolean);
  const required = def.fields.filter((f) => f.required !== false);
  if (required.length === 0) return Object.values(stored).some(Boolean);
  return required.every((f) => Boolean(stored[f.key]?.trim()));
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
  Record<string, { configured: boolean; source: "kv" | "env" | "none" | "builtin" }>
> {
  const result: Record<
    string,
    { configured: boolean; source: "kv" | "env" | "none" | "builtin" }
  > = {};
  const kv = getRedis();

  for (const service of Object.keys(SERVICE_DEFINITIONS)) {
    const def = SERVICE_DEFINITIONS[service];
    if (def.noKeysRequired) {
      result[service] = { configured: true, source: "builtin" };
      continue;
    }

    if (kv) {
      const stored = await kv.get<ServiceConfig>(`${KEYS_PREFIX}${service}`);
      if (stored && isServiceConfigured(service, stored)) {
        result[service] = { configured: true, source: "kv" };
        continue;
      }
    }

    const env = getFromEnv(service);
    if (env && isServiceConfigured(service, env)) {
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
