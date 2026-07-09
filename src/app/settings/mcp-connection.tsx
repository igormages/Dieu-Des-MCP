"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

function copyText(text: string, onDone: () => void) {
  void navigator.clipboard.writeText(text).then(onDone);
}

interface McpCredentialsInfo {
  configured: boolean;
  clientId?: string;
  clientSecret?: string;
  createdAt?: string;
}

export function McpConnectionPanel({ mcpUrl }: { mcpUrl: string }) {
  const [creds, setCreds] = useState<McpCredentialsInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const bearerHeader = creds?.clientSecret
    ? `Bearer ${creds.clientSecret}`
    : "Bearer <votre secret MCP>";

  const cursorConfig = useMemo(
    () =>
      JSON.stringify(
        {
          mcpServers: {
            dieudesmcp: {
              url: mcpUrl,
              headers: {
                Authorization: bearerHeader,
              },
            },
          },
        },
        null,
        2
      ),
    [mcpUrl, bearerHeader]
  );

  const claudeHeaders = useMemo(
    () =>
      JSON.stringify(
        {
          Authorization: bearerHeader,
        },
        null,
        2
      ),
    [bearerHeader]
  );

  const markCopied = useCallback((key: string) => {
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }, []);

  const loadCredentials = useCallback(async () => {
    const res = await fetch("/api/mcp/credentials");
    if (res.ok) {
      const data = (await res.json()) as McpCredentialsInfo;
      setCreds(data);
    }
  }, []);

  useEffect(() => {
    void loadCredentials();
  }, [loadCredentials]);

  const generateCredentials = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/mcp/credentials", { method: "POST" });
      const data = (await res.json()) as McpCredentialsInfo & {
        error?: string;
      };
      if (!res.ok || !data.clientSecret) {
        setError(data.error ?? "Impossible de générer les identifiants MCP.");
        return;
      }
      setCreds(data);
    } catch {
      setError("Erreur réseau lors de la génération des identifiants.");
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <section className="mb-10 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-4">
        <h2 className="text-xl font-bold text-gray-900">Connexion MCP</h2>
        <p className="mt-1 text-sm text-gray-500">
          Identifiants générés par l&apos;app — pas d&apos;OAuth Clerk. Claude et
          Cursor envoient le secret dans l&apos;en-tête{" "}
          <code className="rounded bg-gray-100 px-1 text-xs">Authorization</code>.
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

        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <h3 className="text-sm font-semibold text-gray-900">
            Identifiants MCP
          </h3>
          <p className="mt-1 text-sm text-gray-600">
            Une paire client ID + secret (comme login/mot de passe). Le secret
            n&apos;est affiché qu&apos;une seule fois à la génération.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void generateCredentials()}
              disabled={loading}
              className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {loading
                ? "Génération…"
                : creds?.configured
                  ? "Régénérer les identifiants"
                  : "Générer les identifiants MCP"}
            </button>
          </div>

          {creds?.clientId && (
            <div className="mt-4 space-y-2 text-sm">
              <p className="font-mono break-all text-gray-800">
                Client ID : {creds.clientId}
              </p>
              {creds.clientSecret ? (
                <p className="font-mono break-all text-amber-900 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                  Secret (copiez maintenant) : {creds.clientSecret}
                </p>
              ) : (
                <p className="text-gray-500 text-xs">
                  Secret déjà généré — régénérez pour en obtenir un nouveau.
                </p>
              )}
            </div>
          )}
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
              <strong>Ne pas</strong> remplir les champs OAuth — ouvrez{" "}
              <strong>Paramètres avancés → En-têtes de requête</strong> et
              collez :
            </li>
          </ol>
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-green-800">
              En-têtes Claude
            </span>
            <button
              type="button"
              onClick={() => copyText(claudeHeaders, () => markCopied("claude"))}
              className="rounded border border-green-300 px-2 py-1 text-xs font-medium text-green-900 hover:bg-green-100"
            >
              {copied === "claude" ? "Copié" : "Copier JSON"}
            </button>
          </div>
          <pre className="mt-2 overflow-auto rounded-lg border border-green-200 bg-white p-3 font-mono text-xs text-green-900">
            {claudeHeaders}
          </pre>
        </div>

        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <h3 className="text-sm font-semibold text-gray-900">Cursor</h3>
          <p className="mt-1 text-sm text-gray-600">
            Même secret dans{" "}
            <code className="rounded bg-gray-200 px-1 text-xs">~/.cursor/mcp.json</code>.
          </p>
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

        <p className="text-xs text-gray-500">
          Auth optionnelle en Basic :{" "}
          <code className="rounded bg-gray-100 px-1">
            Authorization: Basic base64(clientId:secret)
          </code>
        </p>
      </div>
    </section>
  );
}
