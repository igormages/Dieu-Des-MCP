import { createHash, randomBytes } from "crypto";
import { Redis } from "@upstash/redis";

const CREDENTIALS_KEY = "mcp:auth:credentials";

export interface McpCredentialsPublic {
  clientId: string;
  createdAt: string;
  createdBy: string;
}

interface StoredCredentials extends McpCredentialsPublic {
  secretHash: string;
}

let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  redis = new Redis({ url, token });
  return redis;
}

function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function generateMcpClientId(): string {
  return `dmcp_${randomBytes(12).toString("hex")}`;
}

export function generateMcpClientSecret(): string {
  return `dmcp_sec_${randomBytes(32).toString("base64url")}`;
}

export async function getMcpCredentials(): Promise<McpCredentialsPublic | null> {
  const kv = getRedis();
  if (kv) {
    const stored = await kv.get<StoredCredentials>(CREDENTIALS_KEY);
    if (stored) {
      return {
        clientId: stored.clientId,
        createdAt: stored.createdAt,
        createdBy: stored.createdBy,
      };
    }
  }

  const envClientId = process.env.MCP_CLIENT_ID;
  if (envClientId && process.env.MCP_CLIENT_SECRET) {
    return {
      clientId: envClientId,
      createdAt: "env",
      createdBy: "env",
    };
  }

  return null;
}

export async function saveMcpCredentials(
  clientId: string,
  secret: string,
  userId: string
): Promise<void> {
  const kv = getRedis();
  if (!kv) {
    throw new Error(
      "Redis non configuré — impossible de stocker les identifiants MCP."
    );
  }

  const payload: StoredCredentials = {
    clientId,
    secretHash: hashSecret(secret),
    createdAt: new Date().toISOString(),
    createdBy: userId,
  };

  await kv.set(CREDENTIALS_KEY, payload);
}

async function loadStored(): Promise<StoredCredentials | null> {
  const kv = getRedis();
  if (!kv) return null;
  return kv.get<StoredCredentials>(CREDENTIALS_KEY);
}

export async function verifyMcpClientSecret(
  secret: string,
  clientId?: string
): Promise<McpCredentialsPublic | null> {
  const stored = await loadStored();

  if (stored) {
    if (hashSecret(secret) !== stored.secretHash) return null;
    if (clientId && clientId !== stored.clientId) return null;
    return {
      clientId: stored.clientId,
      createdAt: stored.createdAt,
      createdBy: stored.createdBy,
    };
  }

  const envSecret = process.env.MCP_CLIENT_SECRET;
  const envClientId = process.env.MCP_CLIENT_ID;
  if (!envSecret || hashSecret(secret) !== hashSecret(envSecret)) return null;
  if (clientId && envClientId && clientId !== envClientId) return null;

  return {
    clientId: envClientId ?? "mcp-env",
    createdAt: "env",
    createdBy: "env",
  };
}
