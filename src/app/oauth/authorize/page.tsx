import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getMcpCredentials } from "@/lib/auth/mcp-credentials";
import { isAllowedRedirectUri } from "@/lib/auth/mcp-oauth";
import { OAuthConsentForm } from "./consent-form";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function param(
  params: Record<string, string | string[] | undefined>,
  key: string
): string {
  const value = params[key];
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function OAuthAuthorizePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const clientId = param(params, "client_id");
  const redirectUri = param(params, "redirect_uri");
  const codeChallenge = param(params, "code_challenge");
  const codeChallengeMethod = param(params, "code_challenge_method");
  const state = param(params, "state");
  const responseType = param(params, "response_type");
  const resource = param(params, "resource");

  if (
    responseType !== "code" ||
    !clientId ||
    !redirectUri ||
    !codeChallenge ||
    codeChallengeMethod !== "S256" ||
    !state
  ) {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-xl font-bold text-red-700">Requête OAuth invalide</h1>
        <p className="mt-2 text-sm text-gray-600">
          Paramètres manquants ou incorrects.
        </p>
      </main>
    );
  }

  if (!isAllowedRedirectUri(redirectUri)) {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-xl font-bold text-red-700">Redirect URI refusée</h1>
        <p className="mt-2 text-sm text-gray-600">
          Seule l&apos;URI Claude Desktop est autorisée.
        </p>
      </main>
    );
  }

  const creds = await getMcpCredentials();
  if (!creds || creds.clientId !== clientId) {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-xl font-bold text-red-700">Client ID inconnu</h1>
        <p className="mt-2 text-sm text-gray-600">
          Générez vos identifiants MCP dans{" "}
          <a href="/settings" className="underline">
            /settings
          </a>
          .
        </p>
      </main>
    );
  }

  const { userId } = await auth();
  if (!userId) {
    const returnParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      const v = Array.isArray(value) ? value[0] : value;
      if (v) returnParams.set(key, v);
    }
    redirect(`/sign-in?redirect_url=${encodeURIComponent(`/oauth/authorize?${returnParams}`)}`);
  }

  if (creds.createdBy !== "env" && creds.createdBy !== userId) {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-xl font-bold text-red-700">Accès refusé</h1>
        <p className="mt-2 text-sm text-gray-600">
          Seul le compte qui a généré ces identifiants peut autoriser Claude.
        </p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <OAuthConsentForm
        clientId={clientId}
        redirectUri={redirectUri}
        codeChallenge={codeChallenge}
        codeChallengeMethod={codeChallengeMethod}
        state={state}
        resource={resource || undefined}
      />
    </main>
  );
}
