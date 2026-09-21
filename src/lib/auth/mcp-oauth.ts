import { createHash, randomBytes } from "crypto";
import { Redis } from "@upstash/redis";

const AUTH_CODE_PREFIX = "mcp:auth:code:";
const TOKEN_PREFIX = "mcp:auth:token:";
const OAUTH_CLIENT_PREFIX = "mcp:auth:client:";
const AUTH_CODE_TTL_SEC = 600;
const TOKEN_TTL_SEC = 365 * 24 * 3600;

export interface PendingAuthCode {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  state: string;
  resource?: string;
  createdBy: string;
}

export interface StoredAccessToken {
  clientId: string;
  createdBy: string;
}

export interface RegisteredOAuthClient {
  clientId: string;
  clientName: string;
  redirectUris: string[];
  createdAt: number;
}

let redis: Redis | null = null;

function getRedis(): Redis {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new Error("Redis non configuré.");
  }
  if (!redis) redis = new Redis({ url, token });
  return redis;
}

export function generateAuthCode(): string {
  return randomBytes(24).toString("base64url");
}

export function generateAccessToken(): string {
  return `dmcp_tok_${randomBytes(32).toString("base64url")}`;
}

export function pkceChallengeS256(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function verifyPkce(
  verifier: string,
  challenge: string,
  method: string
): boolean {
  if (method !== "S256") return false;
  return pkceChallengeS256(verifier) === challenge;
}

export async function saveAuthCode(
  code: string,
  payload: PendingAuthCode
): Promise<void> {
  const kv = getRedis();
  await kv.set(`${AUTH_CODE_PREFIX}${code}`, payload, {
    ex: AUTH_CODE_TTL_SEC,
  });
}

export async function consumeAuthCode(
  code: string
): Promise<PendingAuthCode | null> {
  const kv = getRedis();
  const key = `${AUTH_CODE_PREFIX}${code}`;
  const payload = await kv.get<PendingAuthCode>(key);
  if (!payload) return null;
  await kv.del(key);
  return payload;
}

export async function saveAccessToken(
  token: string,
  payload: StoredAccessToken
): Promise<void> {
  const kv = getRedis();
  await kv.set(`${TOKEN_PREFIX}${token}`, payload, { ex: TOKEN_TTL_SEC });
}

export async function verifyAccessToken(
  token: string
): Promise<StoredAccessToken | null> {
  if (!token.startsWith("dmcp_tok_")) return null;
  const kv = getRedis();
  return kv.get<StoredAccessToken>(`${TOKEN_PREFIX}${token}`);
}

export async function registerOAuthClient(
  clientName: string,
  redirectUris: string[]
): Promise<RegisteredOAuthClient> {
  const client = {
    clientId: `dmcp_client_${randomBytes(24).toString("base64url")}`,
    clientName,
    redirectUris,
    createdAt: Date.now(),
  };
  const kv = getRedis();
  await kv.set(`${OAUTH_CLIENT_PREFIX}${client.clientId}`, client);
  return client;
}

export async function getRegisteredOAuthClient(
  clientId: string
): Promise<RegisteredOAuthClient | null> {
  const kv = getRedis();
  return kv.get<RegisteredOAuthClient>(`${OAUTH_CLIENT_PREFIX}${clientId}`);
}

export const CLAUDE_REDIRECT_URI = "https://claude.ai/api/mcp/auth_callback";

export function isValidOAuthRedirectUri(uri: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return false;
  }

  if (parsed.protocol === "https:") return true;
  return (
    parsed.protocol === "http:" &&
    (parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "localhost" ||
      parsed.hostname === "[::1]")
  );
}

function redirectUriMatchesRegistered(
  registeredUris: string[],
  uri: string
): boolean {
  if (registeredUris.includes(uri)) return true;

  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return false;
  }

  const isLoopback =
    parsed.protocol === "http:" &&
    (parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "localhost" ||
      parsed.hostname === "[::1]");
  if (!isLoopback) return false;

  return registeredUris.some((registered) => {
    try {
      const reg = new URL(registered);
      if (reg.origin !== parsed.origin) return false;
      const regPath = reg.pathname.replace(/\/$/, "") || "/";
      const uriPath = parsed.pathname;
      return uriPath === regPath || uriPath.startsWith(`${regPath}/`);
    } catch {
      return false;
    }
  });
}

export function isExpectedMcpResource(resource: string | null | undefined): boolean {
  if (!resource) return true;
  try {
    const url = new URL(resource);
    const path = url.pathname.replace(/\/$/, "");
    return path === "/api/mcp";
  } catch {
    return false;
  }
}

export async function isAllowedRedirectUri(
  clientId: string,
  uri: string
): Promise<boolean> {
  const client = await getRegisteredOAuthClient(clientId);
  if (client) return redirectUriMatchesRegistered(client.redirectUris, uri);

  if (uri !== CLAUDE_REDIRECT_URI) return false;
  const { getMcpCredentials } = await import("./mcp-credentials");
  const credentials = await getMcpCredentials();
  return credentials?.clientId === clientId;
}
