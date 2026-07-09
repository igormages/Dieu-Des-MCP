"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

function copyText(text: string, onDone: () => void) {
  void navigator.clipboard.writeText(text).then(onDone);
}

interface OAuthClientInfo {
  configured: boolean;
  clientId?: string;
  redirectUri?: string;
}

export function McpConnectionPanel({ mcpUrl }: { mcpUrl: string }) {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [oauthClient, setOauthClient] = useState<OAuthClientInfo | null>(null);
  const [loadingKey, setLoadingKey] = useState(false);
  const [loadingOAuth, setLoadingOAuth] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cursorConfig = useMemo(
    () =>
      JSON.stringify(
        {
          mcpServers: {
            dieudesmcp: {
              url: mcpUrl,
              headers: apiKey
                ? { Authorization: `Bearer ${apiKey}` }
                : { Authorization: "Bearer <votre clé API MCP>" },
            },
          },
        },
        null,
        2
      ),
    [mcpUrl, apiKey]
  );

  const markCopied = useCallback((key: string) => {
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }, []);

  const ensureOAuthClient = useCallback(async () => {
    setLoadingOAuth(true);
    setError(null);
    try {
      const res = await fetch("/api/mcp/oauth-client", { method: "POST" });
      const data = (await res.json()) as OAuthClientInfo & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Impossible de préparer le client OAuth.");
        return;
      }
      setOauthClient(data);
    } catch {
      setError("Erreur réseau lors de la préparation OAuth.");
    } finally {
      setLoadingOAuth(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/mcp/oauth-client");
      if (res.ok) {
        const data = (await res.json()) as OAuthClientInfo;
        setOauthClient(data);
      }
    })();
  }, []);

  const createApiKey = useCallback(async () => {
    setLoadingKey(true);
    setError(null);
    try {
      const res = await fetch("/api/mcp/api-key", { method: "POST" });
      const data = (await res.json()) as { secret?: string; error?: string };
      if (!res.ok || !data.secret) {
        setError(data.error ?? "Impossible de créer la clé API.");
        setApiKey(null);
        return;
      }
      setApiKey(data.secret);
    } catch {
      setError("Erreur réseau lors de la création de la clé.");
      setApiKey(null);
    } finally {
      setLoadingKey(false);
    }
  }, []);

  return (
    <section className="mb-10 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-4">
        <h2 className="text-xl font-bold text-gray-900">Connexion MCP</h2>
        <p className="mt-1 text-sm text-gray-500">
          Claude Desktop utilise OAuth (client ID). Cursor utilise une clé API
          longue durée.
        </p>
      </div>

      <div className="space-y-6">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400">
            URL du serveur
          </label>
          <div className="flex gap-2">
            <code className="flex-1 overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-sm text-gray-800">
              {mcpUrl}
            </code>
            <button
              type="button"
              onClick={() => copyText(mcpUrl, () => markCopied("url"))}
              className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              {copied === "url" ? "Copié" : "Copier"}
            </button>
          </div>
        </div>

        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <h3 className="text-sm font-semibold text-green-900">
            Claude Desktop
          </h3>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-green-900">
            <li>
              <strong>Réglages → Connecteurs → Ajouter un connecteur personnalisé</strong>
            </li>
            <li>
              Nom : <code className="rounded bg-green-100 px-1">dieudesmcp</code>
            </li>
            <li>
              URL : <code className="rounded bg-green-100 px-1">{mcpUrl}</code>
            </li>
            <li>
              Ouvrez <strong>Paramètres avancés</strong> et collez l&apos;
              <strong>identifiant client OAuth</strong> ci-dessous (obligatoire si
              l&apos;enregistrement automatique n&apos;est pas activé).
            </li>
            <li>Validez — Claude ouvre la connexion Clerk.</li>
          </ol>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void ensureOAuthClient()}
              disabled={loadingOAuth}
              className="rounded-lg bg-green-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
            >
              {loadingOAuth
                ? "Préparation…"
                : oauthClient?.clientId
                  ? "Rafraîchir le client OAuth"
                  : "Préparer le client OAuth Claude"}
            </button>
            {oauthClient?.clientId && (
              <button
                type="button"
                onClick={() =>
                  copyText(oauthClient.clientId!, () => markCopied("oauth"))
                }
                className="rounded-lg border border-green-300 bg-white px-3 py-1.5 text-sm font-medium text-green-900 hover:bg-green-100"
              >
                {copied === "oauth" ? "Copié" : "Copier le Client ID"}
              </button>
            )}
          </div>

          {oauthClient?.clientId ? (
            <p className="mt-3 font-mono text-sm text-green-900 break-all">
              Client ID : {oauthClient.clientId}
            </p>
          ) : (
            <p className="mt-3 text-xs text-green-800">
              Cliquez sur « Préparer le client OAuth Claude » pour créer
              l&apos;application OAuth Clerk avec la redirect URI{" "}
              <code className="rounded bg-green-100 px-1">
                https://claude.ai/api/mcp/auth_callback
              </code>
              .
            </p>
          )}
        </div>

        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <h3 className="text-sm font-semibold text-gray-900">Cursor</h3>
          <p className="mt-1 text-sm text-gray-600">
            Générez une clé API sans expiration pour{" "}
            <code className="rounded bg-gray-200 px-1 text-xs">~/.cursor/mcp.json</code>.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void createApiKey()}
              disabled={loadingKey}
              className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {loadingKey ? "Création…" : apiKey ? "Créer une nouvelle clé" : "Générer une clé API MCP"}
            </button>
            {apiKey && (
              <button
                type="button"
                onClick={() => copyText(apiKey, () => markCopied("apikey"))}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                {copied === "apikey" ? "Copié" : "Copier la clé"}
              </button>
            )}
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-gray-500">Config Cursor</span>
            <button
              type="button"
              onClick={() => copyText(cursorConfig, () => markCopied("cursor"))}
              className="rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-white"
            >
              {copied === "cursor" ? "Copié" : "Copier JSON"}
            </button>
          </div>
          <pre className="mt-2 max-h-40 overflow-auto rounded-lg border border-gray-200 bg-white p-3 font-mono text-xs text-gray-800">
            {cursorConfig}
          </pre>
        </div>

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <strong>Erreur 404 sur accounts.dieumcp.mages.pro ?</strong>
          <p className="mt-1">
            L&apos;OAuth Claude redirige vers le portail Clerk{" "}
            <code className="rounded bg-red-100 px-1 text-xs">accounts.dieumcp.mages.pro</code>.
            Si cette URL renvoie 404, le domaine n&apos;est pas correctement activé sur
            l&apos;instance Clerk <strong>production</strong> :
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
            <li>
              Clerk Dashboard → <strong>Configure → Domains</strong>
            </li>
            <li>
              Vérifiez que{" "}
              <code className="rounded bg-red-100 px-1 text-xs">clerk.dieumcp.mages.pro</code>{" "}
              et{" "}
              <code className="rounded bg-red-100 px-1 text-xs">accounts.dieumcp.mages.pro</code>{" "}
              sont <strong>Verified</strong> (pas seulement le domaine principal)
            </li>
            <li>
              Si « Pending », ajoutez les enregistrements DNS CNAME indiqués par Clerk
            </li>
            <li>
              En attendant, connectez-vous d&apos;abord sur{" "}
              <a href="/sign-in" className="underline">
                dieumcp.mages.pro/sign-in
              </a>{" "}
              puis réessayez le connecteur Claude
            </li>
          </ol>
        </div>

        <p className="text-xs text-gray-500">
          Option avancée : activez aussi l&apos;
          <strong>enregistrement dynamique des clients OAuth</strong> dans le
          dashboard Clerk (OAuth applications) pour que Claude s&apos;enregistre
          sans Client ID manuel.
        </p>
      </div>
    </section>
  );
}
