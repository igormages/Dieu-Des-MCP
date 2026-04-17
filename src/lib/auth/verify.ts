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
    scopes: ["read:qonto", "write:qonto", "read:github", "write:github"],
    clientId: session.userId,
    extra: {
      userId: session.userId,
    },
  };
}
