import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getMcpCredentials } from "@/lib/auth/mcp-credentials";
import {
  CLAUDE_REDIRECT_URI,
  generateAuthCode,
  isAllowedRedirectUri,
  saveAuthCode,
} from "@/lib/auth/mcp-oauth";

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const form = await req.formData();
  const clientId = String(form.get("client_id") ?? "");
  const redirectUri = String(form.get("redirect_uri") ?? "");
  const codeChallenge = String(form.get("code_challenge") ?? "");
  const codeChallengeMethod = String(form.get("code_challenge_method") ?? "");
  const state = String(form.get("state") ?? "");
  const resource = form.get("resource")
    ? String(form.get("resource"))
    : undefined;

  if (
    !clientId ||
    !redirectUri ||
    !codeChallenge ||
    codeChallengeMethod !== "S256" ||
    !state
  ) {
    return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 });
  }

  if (!isAllowedRedirectUri(redirectUri)) {
    return NextResponse.json({ error: "Redirect URI non autorisée" }, { status: 400 });
  }

  const creds = await getMcpCredentials();
  if (!creds || creds.clientId !== clientId) {
    return NextResponse.json({ error: "Client ID inconnu" }, { status: 400 });
  }

  if (creds.createdBy !== "env" && creds.createdBy !== userId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const code = generateAuthCode();
  await saveAuthCode(code, {
    clientId,
    redirectUri,
    codeChallenge,
    codeChallengeMethod,
    state,
    resource,
    createdBy: userId,
  });

  const target = new URL(redirectUri);
  target.searchParams.set("code", code);
  target.searchParams.set("state", state);

  // 303 obligatoire : NextResponse.redirect() utilise 307 par défaut, ce qui
  // conserve POST vers le callback Claude (GET uniquement) → "Method Not Allowed".
  return NextResponse.redirect(target.toString(), 303);
}
