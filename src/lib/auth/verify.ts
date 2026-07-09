import { auth } from "@clerk/nextjs/server";
import { verifyClerkToken } from "@clerk/mcp-tools/next";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

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

export async function verifyBearerToken(
  _req: Request,
  bearerToken?: string
): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;

  const clerkAuth = await auth({
    acceptsToken: ["oauth_token", "api_key"],
  });

  if (!clerkAuth.isAuthenticated) return undefined;

  if (clerkAuth.tokenType === "oauth_token") {
    return verifyClerkToken(clerkAuth, bearerToken);
  }

  if (clerkAuth.tokenType === "api_key") {
    const userId = clerkAuth.userId ?? clerkAuth.subject;
    if (!userId) return undefined;

    return {
      token: bearerToken,
      scopes: clerkAuth.scopes?.length ? [...clerkAuth.scopes] : [...MCP_SCOPES],
      clientId: userId,
      extra: { userId },
    };
  }

  return undefined;
}
