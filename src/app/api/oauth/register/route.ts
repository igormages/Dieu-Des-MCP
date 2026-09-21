import { NextResponse } from "next/server";
import {
  isValidOAuthRedirectUri,
  registerOAuthClient,
} from "@/lib/auth/mcp-oauth";

interface RegistrationRequest {
  client_name?: unknown;
  redirect_uris?: unknown;
  grant_types?: unknown;
  response_types?: unknown;
  token_endpoint_auth_method?: unknown;
  application_type?: unknown;
}

function registrationError(description: string) {
  return NextResponse.json(
    { error: "invalid_client_metadata", error_description: description },
    { status: 400, headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(req: Request) {
  const body = (await req.json()) as RegistrationRequest;
  const redirectUris = body.redirect_uris;

  if (
    !Array.isArray(redirectUris) ||
    redirectUris.length === 0 ||
    !redirectUris.every(
      (uri): uri is string =>
        typeof uri === "string" && isValidOAuthRedirectUri(uri)
    )
  ) {
    return registrationError("redirect_uris doit contenir des URI HTTPS ou loopback valides.");
  }

  const grantTypes = body.grant_types ?? ["authorization_code"];
  const responseTypes = body.response_types ?? ["code"];
  const authMethod = body.token_endpoint_auth_method ?? "none";
  const applicationType = body.application_type ?? "native";
  if (
    !Array.isArray(grantTypes) ||
    grantTypes.some((grant) => grant !== "authorization_code") ||
    !Array.isArray(responseTypes) ||
    responseTypes.some((response) => response !== "code") ||
    authMethod !== "none" ||
    (applicationType !== "native" && applicationType !== "web")
  ) {
    return registrationError("Seul le flux public authorization_code avec PKCE est supporté.");
  }

  const clientName =
    typeof body.client_name === "string" && body.client_name.trim()
      ? body.client_name.trim().slice(0, 200)
      : "Client MCP";
  const client = await registerOAuthClient(clientName, [...new Set(redirectUris)]);

  return NextResponse.json(
    {
      client_id: client.clientId,
      client_name: client.clientName,
      redirect_uris: client.redirectUris,
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
    {
      status: 201,
      headers: {
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    }
  );
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
