import { getPublicOrigin } from "mcp-handler";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Cache-Control": "max-age=3600",
  "Content-Type": "application/json",
};

export function GET(req: Request) {
  const origin = getPublicOrigin(req);

  return Response.json(
    {
      issuer: origin,
      authorization_endpoint: `${origin}/oauth/authorize`,
      token_endpoint: `${origin}/api/oauth/token`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["client_secret_post", "none"],
      scopes_supported: ["openid", "profile", "email", "offline_access"],
    },
    { headers: corsHeaders }
  );
}

export function OPTIONS() {
  return new Response(null, { status: 200, headers: corsHeaders });
}
