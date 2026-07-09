import { createClerkClient } from "@clerk/nextjs/server";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
  publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
});

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

function requestWithBearer(req: Request, bearerToken: string): Request {
  if (req.headers.get("Authorization")?.toLowerCase().startsWith("bearer ")) {
    return req;
  }

  const headers = new Headers(req.headers);
  headers.set("Authorization", `Bearer ${bearerToken}`);
  return new Request(req.url, { method: req.method, headers });
}

export async function verifyBearerToken(
  req: Request,
  bearerToken?: string
): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;

  const state = await clerk.authenticateRequest(
    requestWithBearer(req, bearerToken),
    { acceptsToken: ["session_token", "oauth_token"] }
  );

  if (!state.isAuthenticated) return undefined;

  const auth = state.toAuth();
  if (!auth.userId) return undefined;

  return {
    token: bearerToken,
    scopes: [...MCP_SCOPES],
    clientId: auth.userId,
    extra: {
      userId: auth.userId,
    },
  };
}
