import { createHash, randomBytes } from "crypto";
import { Redis } from "@upstash/redis";

const AUTH_CODE_PREFIX = "mcp:auth:code:";
const TOKEN_PREFIX = "mcp:auth:token:";
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

export const CLAUDE_REDIRECT_URI = "https://claude.ai/api/mcp/auth_callback";

export function isAllowedRedirectUri(uri: string): boolean {
  return uri === CLAUDE_REDIRECT_URI;
}
