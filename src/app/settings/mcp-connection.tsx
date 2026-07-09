"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback, useMemo, useState } from "react";

function copyText(text: string, onDone: () => void) {
  void navigator.clipboard.writeText(text).then(onDone);
}

export function McpConnectionPanel({ mcpUrl }: { mcpUrl: string }) {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cursorConfig = useMemo(
    () =>
      JSON.stringify(
        {
          mcpServers: {
            "dieudesmcp": {
              url: mcpUrl,
              headers: token
                ? { Authorization: `Bearer ${token}` }
                : { Authorization: "Bearer <collez votre token>" },
            },
          },
        },
        null,
        2
      ),
    [mcpUrl, token]
  );

  const claudeConfig = useMemo(
    () =>
      JSON.stringify(
        {
          mcpServers: {
            "dieudesmcp": {
              url: mcpUrl,
              headers: token
                ? { Authorization: `Bearer ${token}` }
                : { Authorization: "Bearer <collez votre token>" },
            },
          },
        },
        null,
        2
      ),
    [mcpUrl, token]
  );

  const markCopied = useCallback((key: string) => {
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }, []);

  const loadToken = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const value = await getToken();
      if (!value) {
        setError("Impossible de générer un token. Reconnectez-vous.");
        setToken(null);
        return;
      }
      setToken(value);
    } catch {
      setError("Erreur lors de la génération du token.");
      setToken(null);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  if (!isLoaded) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
        Chargement de la connexion MCP…
      </div>
    );
  }

  if (!isSignedIn) {
    return null;
  }

  return (
    <section className="mb-10 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-4">
        <h2 className="text-xl font-bold text-gray-900">Connexion MCP</h2>
        <p className="mt-1 text-sm text-gray-500">
          URL et token Bearer pour connecter Claude Desktop, Cursor ou tout client
          MCP compatible. Les clés des services (Qonto, GitHub…) se configurent
          plus bas — ici il s&apos;agit uniquement d&apos;accéder à votre serveur MCP.
        </p>
      </div>

      <div className="space-y-4">
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

        <div>
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Token Bearer (session Clerk)
            </label>
            <button
              type="button"
              onClick={() => void loadToken()}
              disabled={loading}
              className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {loading ? "Génération…" : token ? "Régénérer" : "Générer un token"}
            </button>
          </div>
          {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <code className="flex-1 overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-xs text-gray-800">
              {token ?? "Cliquez sur « Générer un token » (valide ~1 h, régénérez si expiré)"}
            </code>
            {token && (
              <button
                type="button"
                onClick={() => copyText(token, () => markCopied("token"))}
                className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                {copied === "token" ? "Copié" : "Copier"}
              </button>
            )}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-gray-900">Cursor</h3>
              <button
                type="button"
                onClick={() => copyText(cursorConfig, () => markCopied("cursor"))}
                className="rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                {copied === "cursor" ? "Copié" : "Copier JSON"}
              </button>
            </div>
            <p className="mb-2 text-xs text-gray-500">
              Fichier <code className="rounded bg-gray-100 px-1">~/.cursor/mcp.json</code>{" "}
              ou Réglages → MCP → Ajouter un serveur (HTTP).
            </p>
            <pre className="max-h-48 overflow-auto rounded-lg border border-gray-200 bg-gray-50 p-3 font-mono text-xs text-gray-800">
              {cursorConfig}
            </pre>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-gray-900">Claude Desktop</h3>
              <button
                type="button"
                onClick={() => copyText(claudeConfig, () => markCopied("claude"))}
                className="rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                {copied === "claude" ? "Copié" : "Copier JSON"}
              </button>
            </div>
            <p className="mb-2 text-xs text-gray-500">
              Fichier{" "}
              <code className="rounded bg-gray-100 px-1">
                ~/Library/Application Support/Claude/claude_desktop_config.json
              </code>{" "}
              (macOS). Redémarrez Claude après modification.
            </p>
            <pre className="max-h-48 overflow-auto rounded-lg border border-gray-200 bg-gray-50 p-3 font-mono text-xs text-gray-800">
              {claudeConfig}
            </pre>
          </div>
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>Grok</strong> — pas de support officiel des serveurs MCP distants pour
          l&apos;instant. Utilisez Cursor ou Claude Desktop, ou un client MCP en ligne de
          commande (<code className="rounded bg-amber-100 px-1 text-xs">mcp-remote</code>).
        </div>
      </div>
    </section>
  );
}
