import { getPublicOrigin } from "mcp-handler";

export function GET(req: Request) {
  const origin = getPublicOrigin(req);

  return Response.json(
    {
      resource: `${origin}/api/mcp`,
      bearer_methods_supported: ["header", "body"],
    },
    {
      headers: {
        "Cache-Control": "max-age=3600",
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    }
  );
}

export function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
