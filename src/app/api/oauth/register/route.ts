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

const ALLOWED_GRANT_TYPES = new Set(["authorization_code", "refresh_token"]);

function isValidGrantTypes(grantTypes: unknown): boolean {
  if (grantTypes === undefined) return true;
  if (!Array.isArray(grantTypes) || grantTypes.length === 0) return false;
  if (!grantTypes.includes("authorization_code")) return false;
  return grantTypes.every(
    (grant) => typeof grant === "string" && ALLOWED_GRANT_TYPES.has(grant)
  );
}

function isValidResponseTypes(responseTypes: unknown): boolean {
  if (responseTypes === undefined) return true;
  if (!Array.isArray(responseTypes) || responseTypes.length === 0) return false;
  return responseTypes.every(
    (response) => typeof response === "string" && response === "code"
  );
}

function normalizeAuthMethod(authMethod: unknown): string {
  if (authMethod === undefined || authMethod === null || authMethod === "") {
    return "none";
  }
  return typeof authMethod === "string" ? authMethod : "";
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

  if (!isValidGrantTypes(body.grant_types)) {
    return registrationError(
      "grant_types doit inclure authorization_code (refresh_token optionnel)."
    );
  }

  if (!isValidResponseTypes(body.response_types)) {
    return registrationError('response_types doit être ["code"].');
  }

  const authMethod = normalizeAuthMethod(body.token_endpoint_auth_method);
  if (authMethod !== "none") {
    return registrationError(
      "Seuls les clients publics PKCE (token_endpoint_auth_method=none) sont supportés."
    );
  }

  const grantTypes = Array.isArray(body.grant_types)
    ? [...new Set(body.grant_types.filter((g) => typeof g === "string"))]
    : ["authorization_code"];

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
      grant_types: grantTypes,
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
