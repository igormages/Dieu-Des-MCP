"use client";

interface OAuthConsentFormProps {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  state: string;
  resource?: string;
}

export function OAuthConsentForm({
  clientId,
  redirectUri,
  codeChallenge,
  codeChallengeMethod,
  state,
  resource,
}: OAuthConsentFormProps) {
  return (
    <section className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h1 className="text-xl font-bold text-gray-900">Autoriser Claude Desktop</h1>
      <p className="mt-2 text-sm text-gray-600">
        Claude demande l&apos;accès à votre serveur MCP Dieu des MCP.
      </p>

      <dl className="mt-4 space-y-2 rounded-lg bg-gray-50 p-3 text-sm">
        <div>
          <dt className="text-xs font-semibold uppercase text-gray-400">Client ID</dt>
          <dd className="font-mono break-all text-gray-800">{clientId}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase text-gray-400">Application</dt>
          <dd className="text-gray-800">Claude Desktop (claude.ai)</dd>
        </div>
      </dl>

      <form action="/api/oauth/approve" method="POST" className="mt-6 space-y-3">
        <input type="hidden" name="client_id" value={clientId} />
        <input type="hidden" name="redirect_uri" value={redirectUri} />
        <input type="hidden" name="code_challenge" value={codeChallenge} />
        <input type="hidden" name="code_challenge_method" value={codeChallengeMethod} />
        <input type="hidden" name="state" value={state} />
        {resource ? <input type="hidden" name="resource" value={resource} /> : null}

        <button
          type="submit"
          className="w-full rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800"
        >
          Autoriser
        </button>
        <a
          href="/settings"
          className="block text-center text-sm text-gray-500 hover:text-gray-700"
        >
          Annuler
        </a>
      </form>
    </section>
  );
}
