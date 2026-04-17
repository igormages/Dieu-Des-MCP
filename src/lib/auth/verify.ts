import { createClerkClient } from "@clerk/nextjs/server";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});

export async function verifyBearerToken(
  _req: Request,
  bearerToken?: string
): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;

  const session = await clerk.sessions.verifySession("", bearerToken).catch(
    () => null
  );

  if (!session) return undefined;

  return {
    token: bearerToken,
    scopes: [
      "read:qonto", "write:qonto",
      "read:github", "write:github",
      "read:microsoft", "write:microsoft",
      "read:apple", "write:apple",
      "read:aws", "write:aws",
      "read:googlecloud", "write:googlecloud",
      "read:openai", "write:openai",
      "read:vercel", "write:vercel",
      "read:ovh", "write:ovh",
      "read:amazon", "write:amazon",
      "read:scaleway", "write:scaleway",
      "read:hostinger", "write:hostinger",
      "read:orange", "write:orange",
      "read:webflow", "write:webflow",
      "read:setapp", "write:setapp",
    ],
    clientId: session.userId,
    extra: {
      userId: session.userId,
    },
  };
}
