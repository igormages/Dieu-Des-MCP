import { auth, createClerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});

export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const apiKey = await clerk.apiKeys.create({
    name: "MCP Client",
    subject: userId,
    createdBy: userId,
    description: "Clé longue durée pour clients MCP (Cursor, scripts, etc.)",
    scopes: ["mcp:access"],
    secondsUntilExpiration: null,
  });

  if (!apiKey.secret) {
    return NextResponse.json(
      {
        error:
          "Impossible de récupérer le secret. Vérifiez que les API Keys Clerk sont activées dans le dashboard.",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    id: apiKey.id,
    secret: apiKey.secret,
    masked: `${apiKey.secret.slice(0, 10)}…`,
  });
}
