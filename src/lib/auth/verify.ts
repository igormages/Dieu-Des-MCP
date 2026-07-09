import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { verifyMcpClientSecret } from "./mcp-credentials";
import { verifyAccessToken } from "./mcp-oauth";

const MCP_SCOPES = [
  "read:qonto",
  "write:qonto",
  "read:github",
  "write:github",
  "read:anthropic",
  "write:anthropic",
  "read:microsoft",
  "write:microsoft",
  "read:apple",
  "write:apple",
  "read:googlecloud",
  "write:googlecloud",
  "read:openai",
  "write:openai",
  "read:vercel",
  "write:vercel",
  "read:ovh",
  "write:ovh",
  "read:scaleway",
  "write:scaleway",
  "read:hostinger",
  "write:hostinger",
  "read:webflow",
  "write:webflow",
  "read:feedly",
  "write:feedly",
  "read:elevenlabs",
  "write:elevenlabs",
] as const;

function toAuthInfo(clientId: string, token: string): AuthInfo {
  return {
    token,
    scopes: [...MCP_SCOPES],
    clientId,
    extra: { clientId },
  };
}

function parseBasicAuth(
  authHeader: string
): { clientId: string; secret: string } | null {
  const encoded = authHeader.slice(6).trim();
  if (!encoded) return null;

  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  const separator = decoded.indexOf(":");
  if (separator <= 0) return null;

  const clientId = decoded.slice(0, separator);
  const secret = decoded.slice(separator + 1);
  if (!clientId || !secret) return null;

  return { clientId, secret };
}

export async function verifyBearerToken(
  req: Request,
  bearerToken?: string
): Promise<AuthInfo | undefined> {
  const authHeader = req.headers.get("Authorization");

  if (authHeader?.toLowerCase().startsWith("basic ")) {
    const basic = parseBasicAuth(authHeader);
    if (!basic) return undefined;

    const creds = await verifyMcpClientSecret(basic.secret, basic.clientId);
    if (!creds) return undefined;
    return toAuthInfo(creds.clientId, basic.secret);
  }

  const token =
    bearerToken ??
    (authHeader?.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : undefined);

  if (!token) return undefined;

  const oauthToken = await verifyAccessToken(token);
  if (oauthToken) {
    return toAuthInfo(oauthToken.clientId, token);
  }

  const creds = await verifyMcpClientSecret(token);
  if (!creds) return undefined;

  return toAuthInfo(creds.clientId, token);
}
