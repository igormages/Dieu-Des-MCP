import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  generateMcpClientId,
  generateMcpClientSecret,
  getMcpCredentials,
  saveMcpCredentials,
} from "@/lib/auth/mcp-credentials";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const creds = await getMcpCredentials();
  if (!creds) {
    return NextResponse.json({ configured: false });
  }

  return NextResponse.json({
    configured: true,
    clientId: creds.clientId,
    createdAt: creds.createdAt,
  });
}

export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const clientId = generateMcpClientId();
  const clientSecret = generateMcpClientSecret();

  await saveMcpCredentials(clientId, clientSecret, userId);

  return NextResponse.json({
    configured: true,
    clientId,
    clientSecret,
    hint: "Le secret n'est affiché qu'une seule fois — copiez-le maintenant.",
  });
}
