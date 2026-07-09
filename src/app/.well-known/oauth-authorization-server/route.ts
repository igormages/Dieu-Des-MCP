import {
  fetchClerkAuthorizationServerMetadata,
  corsHeaders,
} from "@clerk/mcp-tools/server";
import { metadataCorsOptionsRequestHandler } from "@clerk/mcp-tools/next";

async function handler() {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!publishableKey) {
    return Response.json(
      { error: "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY manquant" },
      { status: 500 }
    );
  }

  const metadata = await fetchClerkAuthorizationServerMetadata({
    publishableKey,
  });

  const issuer =
    typeof metadata.issuer === "string" ? metadata.issuer : null;

  return Response.json(
    {
      ...metadata,
      ...(issuer
        ? { registration_endpoint: `${issuer}/oauth/register` }
        : {}),
    },
    {
      headers: {
        "Cache-Control": "max-age=3600",
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    }
  );
}

const corsHandler = metadataCorsOptionsRequestHandler();

export { handler as GET, corsHandler as OPTIONS };
