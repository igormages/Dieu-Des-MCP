"use client";

import { useCallback, useMemo, useState } from "react";

function copyText(text: string, onDone: () => void) {
  void navigator.clipboard.writeText(text).then(onDone);
}

export function McpConnectionPanel({ mcpUrl }: { mcpUrl: string }) {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
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

  const createApiKey = useCallback(async () => {
    setLoading(true);
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
      setLoading(false);
    }
  }, []);

  return (
    <section className="mb-10 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-4">
        <h2 className="text-xl font-bold text-gray-900">Connexion MCP</h2>
        <p className="mt-1 text-sm text-gray-500">
          Deux méthodes selon votre client : OAuth (recommandé pour Claude) ou clé
          API longue durée (pour Cursor et les configs fichier).
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
            Claude Desktop — méthode recommandée
          </h3>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-green-900">
            <li>Ouvrez Claude Desktop (version récente).</li>
            <li>
              Allez dans <strong>Réglages → Connecteurs</strong>.
            </li>
            <li>
              Cliquez sur <strong>Ajouter un connecteur personnalisé</strong>.
            </li>
            <li>
              Nom : <code className="rounded bg-green-100 px-1">dieudesmcp</code> — URL :{" "}
              <code className="rounded bg-green-100 px-1">{mcpUrl}</code>
            </li>
            <li>
              Claude ouvre une fenêtre de connexion Clerk (OAuth) : aucun token à
              coller, le renouvellement est automatique.
            </li>
          </ol>
          <p className="mt-3 text-xs text-green-800">
            Ne pas utiliser <code>claude_desktop_config.json</code> pour ce serveur
            distant : ce fichier sert aux serveurs MCP locaux (commande), pas aux URL
            HTTPS avec OAuth.
          </p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <h3 className="text-sm font-semibold text-gray-900">
            Cursor — clé API longue durée
          </h3>
          <p className="mt-1 text-sm text-gray-600">
            Cursor ne gère pas encore l&apos;OAuth MCP comme Claude. Générez une clé
            API Clerk (sans expiration) à coller dans{" "}
            <code className="rounded bg-gray-200 px-1 text-xs">~/.cursor/mcp.json</code>.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void createApiKey()}
              disabled={loading}
              className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {loading ? "Création…" : apiKey ? "Créer une nouvelle clé" : "Générer une clé API MCP"}
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
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          {apiKey && (
            <p className="mt-2 font-mono text-xs text-gray-700 break-all">
              {apiKey.slice(0, 14)}… (secret affiché une seule fois — copiez-le maintenant)
            </p>
          )}
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

        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>Grok</strong> — pas de support des connecteurs MCP distants pour
          l&apos;instant. Utilisez Claude Desktop (OAuth) ou Cursor (clé API).
        </div>

        <p className="text-xs text-gray-500">
          Prérequis Clerk : activez le <strong>serveur OAuth</strong> et les{" "}
          <strong>API Keys</strong> dans le dashboard Clerk pour que l&apos;OAuth
          Claude et les clés Cursor fonctionnent.
        </p>
      </div>
    </section>
  );
}
