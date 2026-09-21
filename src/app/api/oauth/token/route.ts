import { NextResponse } from "next/server";
import { verifyMcpClientSecret } from "@/lib/auth/mcp-credentials";
import {
  consumeAuthCode,
  generateAccessToken,
  getRegisteredOAuthClient,
  isAllowedRedirectUri,
  isExpectedMcpResource,
  saveAccessToken,
  verifyPkce,
} from "@/lib/auth/mcp-oauth";

function oauthError(
  error: string,
  description: string,
  status = 400
): NextResponse {
  return NextResponse.json(
    { error, error_description: description },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/json",
      },
    }
  );
}

export async function POST(req: Request) {
  const contentType = req.headers.get("content-type") ?? "";
  let params: URLSearchParams;

  if (contentType.includes("application/json")) {
    const json = (await req.json()) as Record<string, string>;
    params = new URLSearchParams(json);
  } else {
    const text = await req.text();
    params = new URLSearchParams(text);
  }

  const grantType = params.get("grant_type");
  if (grantType !== "authorization_code") {
    return oauthError("unsupported_grant_type", "Seul authorization_code est supporté.");
  }

  const code = params.get("code");
  const redirectUri = params.get("redirect_uri");
  const clientId = params.get("client_id");
  const codeVerifier = params.get("code_verifier");
  const clientSecret = params.get("client_secret");
  const resource = params.get("resource");

  if (!code || !clientId || !codeVerifier || !redirectUri) {
    return oauthError(
      "invalid_request",
      "code, client_id, redirect_uri et code_verifier requis."
    );
  }

  if (!(await isAllowedRedirectUri(clientId, redirectUri))) {
    return oauthError("invalid_request", "Redirect URI non autorisée.");
  }

  if (!isExpectedMcpResource(resource)) {
    return oauthError("invalid_target", "Resource MCP invalide.");
  }

  const pending = await consumeAuthCode(code);
  if (!pending) {
    return oauthError("invalid_grant", "Code d'autorisation invalide ou expiré.");
  }

  if (pending.clientId !== clientId || pending.redirectUri !== redirectUri) {
    return oauthError("invalid_grant", "Client ou redirect URI incorrect.");
  }

  if (pending.resource && !isExpectedMcpResource(pending.resource)) {
    return oauthError("invalid_grant", "Resource MCP incorrecte.");
  }

  if (!verifyPkce(codeVerifier, pending.codeChallenge, pending.codeChallengeMethod)) {
    return oauthError("invalid_grant", "Échec de vérification PKCE.");
  }

  if (clientSecret) {
    const creds = await verifyMcpClientSecret(clientSecret, clientId);
    if (!creds) {
      return oauthError("invalid_client", "Client secret invalide.");
    }
  } else {
    const publicClient = await getRegisteredOAuthClient(clientId);
    if (!publicClient) {
      return oauthError("invalid_client", "Un secret client est requis.", 401);
    }
  }

  const accessToken = generateAccessToken();
  await saveAccessToken(accessToken, {
    clientId: pending.clientId,
    createdBy: pending.createdBy,
  });

  return NextResponse.json(
    {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: 365 * 24 * 3600,
    },
    {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/json",
      },
    }
  );
}
