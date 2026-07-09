import { auth, createClerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  fetchClerkAuthorizationServerMetadata,
  corsHeaders,
} from "@clerk/mcp-tools/server";

const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});

const CLAUDE_REDIRECT_URI = "https://claude.ai/api/mcp/auth_callback";
const OAUTH_APP_NAME = "Dieu des MCP - Claude Desktop";

async function findMcpOAuthApp() {
  const list = await clerk.oauthApplications.list({ limit: 100 });
  return list.data.find((app) => app.name === OAUTH_APP_NAME) ?? null;
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const app = await findMcpOAuthApp();
  if (!app) {
    return NextResponse.json({ configured: false });
  }

  return NextResponse.json({
    configured: true,
    clientId: app.clientId,
    name: app.name,
    redirectUri: CLAUDE_REDIRECT_URI,
  });
}

export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const existing = await findMcpOAuthApp();
  if (existing) {
    return NextResponse.json({
      configured: true,
      clientId: existing.clientId,
      name: existing.name,
      redirectUri: CLAUDE_REDIRECT_URI,
      created: false,
    });
  }

  const app = await clerk.oauthApplications.create({
    name: OAUTH_APP_NAME,
    redirectUris: [CLAUDE_REDIRECT_URI],
    scopes: "openid profile email",
    public: true,
  });

  return NextResponse.json({
    configured: true,
    clientId: app.clientId,
    name: app.name,
    redirectUri: CLAUDE_REDIRECT_URI,
    created: true,
  });
}
