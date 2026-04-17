"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface FieldDef {
  key: string;
  label: string;
  placeholder: string;
  maskedValue: string | null;
}

interface ServiceInfo {
  label: string;
  configured: boolean;
  source: string;
  fields: FieldDef[];
}

interface ApiResponse {
  services: Record<string, ServiceInfo>;
  kvReady: boolean;
}

interface HelpStep {
  text: string;
  code?: string;
}

interface HelpInfo {
  url: string;
  urlLabel: string;
  steps: HelpStep[];
}

const SERVICE_HELP: Record<string, HelpInfo> = {
  microsoft: {
    url: "https://portal.azure.com/#view/Microsoft_AAD_IAM/ActiveDirectoryMenuBlade/~/Overview",
    urlLabel: "Ouvrir Microsoft Entra ID",
    steps: [
      { text: "Dans le portail Azure, ouvre Microsoft Entra ID (ex-Azure Active Directory)." },
      { text: "Sur la page d'accueil, copie l'ID de locataire (Tenant ID)." },
      { text: "Va dans App registrations → New registration, donne un nom (ex: MCP Billing)." },
      { text: "Copie l'Application (client) ID affiché après création." },
      { text: "Va dans Certificates & secrets → New client secret, copie la valeur immédiatement." },
      { text: "Va dans API permissions → Add permission → Microsoft Graph → Application → cherche InvoiceRead.All, accorde le consentement admin." },
    ],
  },
  apple: {
    url: "https://appstoreconnect.apple.com/access/integrations/api",
    urlLabel: "Ouvrir App Store Connect API",
    steps: [
      { text: "Connecte-toi sur App Store Connect avec un compte Admin." },
      { text: "Va dans Users and Access → Integrations → App Store Connect API." },
      { text: "Clique sur Generate API Key, note l'Issuer ID affiché en haut de la page." },
      { text: "Copie le Key ID de la clé créée." },
      { text: "Télécharge le fichier .p8 (une seule fois possible) et colle son contenu entier dans Private Key." },
    ],
  },
  googlecloud: {
    url: "https://console.cloud.google.com/iam-admin/serviceaccounts",
    urlLabel: "Ouvrir Service Accounts GCP",
    steps: [
      { text: "Dans la console GCP, va dans IAM & Admin → Service Accounts." },
      { text: "Crée un service account ou sélectionne un existant." },
      { text: "Attribue le rôle Billing Account Viewer au niveau du compte de facturation." },
      { text: "Dans l'onglet Keys du service account, crée une clé JSON." },
      { text: "Ouvre le JSON, copie client_email dans Service Account Email et private_key dans Private Key.", code: "client_email / private_key" },
    ],
  },
  openai: {
    url: "https://platform.openai.com/api-keys",
    urlLabel: "Ouvrir OpenAI API Keys",
    steps: [
      { text: "Connecte-toi sur platform.openai.com." },
      { text: "Va dans API Keys → Create new secret key." },
      { text: "Copie la clé (commence par sk-...). Pour les coûts organisation, la clé doit avoir le scope admin." },
    ],
  },
  vercel: {
    url: "https://vercel.com/account/tokens",
    urlLabel: "Ouvrir Vercel Tokens",
    steps: [
      { text: "Va sur vercel.com → Settings → Tokens." },
      { text: "Crée un token avec le scope Full Account, copie la valeur." },
      { text: "Le Team ID est optionnel : va dans ton équipe → Settings, copie le Team ID (commence par team_...).", code: "team_xxxxxxxxx" },
    ],
  },
  ovh: {
    url: "https://eu.api.ovh.com/createApp/",
    urlLabel: "Créer une application OVH",
    steps: [
      { text: "Va sur eu.api.ovh.com/createApp/ et connecte-toi avec ton compte OVH." },
      { text: "Remplis le nom et la description de l'application, valide. Copie l'Application Key et l'Application Secret." },
      { text: "Pour le Consumer Key, va sur eu.api.ovh.com/createToken/ et génère un token avec les droits GET /me/bill et GET /me/bill/*." },
      { text: "L'endpoint est ovh-eu pour l'Europe (défaut).", code: "ovh-eu" },
    ],
  },
  scaleway: {
    url: "https://console.scaleway.com/iam/api-keys",
    urlLabel: "Ouvrir Scaleway IAM API Keys",
    steps: [
      { text: "Dans la console Scaleway, va dans IAM → API Keys → Generate an API key." },
      { text: "Copie la Secret Key (affichée une seule fois)." },
      { text: "L'Organization ID se trouve dans IAM → Overview ou dans les paramètres de l'organisation.", code: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" },
    ],
  },
  hostinger: {
    url: "https://hpanel.hostinger.com/api",
    urlLabel: "Ouvrir Hostinger API",
    steps: [
      { text: "Connecte-toi sur hpanel.hostinger.com." },
      { text: "Va dans Account → API ou dans les paramètres du compte." },
      { text: "Génère un Personal Access Token et copie la valeur." },
    ],
  },
  webflow: {
    url: "https://webflow.com/dashboard/account/integrations",
    urlLabel: "Ouvrir Webflow Integrations",
    steps: [
      { text: "Dans le Dashboard Webflow, va dans Account Settings → Integrations → API Access." },
      { text: "Génère un API Token avec les scopes nécessaires (sites:read, authorized_user:read)." },
      { text: "Copie le token généré." },
    ],
  },
  github: {
    url: "https://github.com/settings/tokens",
    urlLabel: "Ouvrir GitHub Tokens",
    steps: [
      { text: "Va dans GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)." },
      { text: "Clique sur Generate new token, sélectionne les scopes repo et read:org selon tes besoins." },
      { text: "Copie le token (commence par ghp_...).", code: "ghp_..." },
    ],
  },
  qonto: {
    url: "https://app.qonto.com/settings/api",
    urlLabel: "Ouvrir Qonto API Settings",
    steps: [
      { text: "Connecte-toi sur app.qonto.com → Settings → API." },
      { text: "Copie l'Organization Slug (identifiant de ton organisation, ex: ma-societe-1234)." },
      { text: "Génère une clé secrète et copie la valeur.", code: "ma-societe-1234" },
    ],
  },
};

function HelpModal({
  serviceKey,
  label,
  fields,
  kvReady,
  onClose,
  onSave,
}: {
  serviceKey: string;
  label: string;
  fields: FieldDef[];
  kvReady: boolean;
  onClose: () => void;
  onSave: (values: Record<string, string>) => Promise<void>;
}) {
  const help = SERVICE_HELP[serviceKey];
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "ok" | "error">("idle");
  const [testError, setTestError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSave() {
    setTestError(null);
    setTestStatus("testing");

    const testRes = await fetch("/api/keys/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ service: serviceKey, keys: values }),
    });
    const testData = await testRes.json();

    if (!testData.ok) {
      setTestStatus("error");
      setTestError(testData.error ?? "Connexion échouée");
      return;
    }

    setTestStatus("ok");
    setSaving(true);
    await onSave(values);
    setSaving(false);
    setTestStatus("idle");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-gray-100 bg-white px-6 py-4">
          <h3 className="font-semibold text-gray-900">Configurer {label}</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Steps */}
          {help && (
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Comment obtenir les clés</p>
              <ol className="space-y-2.5">
                {help.steps.map((step, i) => (
                  <li key={i} className="flex gap-3 text-sm text-gray-700">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-900 text-xs font-bold text-white">
                      {i + 1}
                    </span>
                    <span>
                      {step.text}
                      {step.code && (
                        <code className="ml-1 rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-700">
                          {step.code}
                        </code>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
              <a
                href={help.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                {help.urlLabel}
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          )}

          {/* Divider */}
          <div className="border-t border-gray-100" />

          {/* Fields */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Vos clés</p>
            {fields.map((field) => (
              <div key={field.key}>
                <label className="mb-1 block text-xs font-medium text-gray-700">{field.label}</label>
                <input
                  type="password"
                  placeholder={field.maskedValue ? `Actuel : ${field.maskedValue}` : field.placeholder}
                  value={values[field.key] || ""}
                  onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition-colors placeholder:text-gray-400 focus:border-gray-900 focus:ring-1 focus:ring-gray-900"
                  disabled={!kvReady}
                />
              </div>
            ))}

            {testStatus === "error" && testError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                <span className="font-semibold">Connexion échouée —</span> {testError}
              </div>
            )}
            {testStatus === "ok" && (
              <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
                Connexion vérifiée ✓
              </div>
            )}

            <button
              onClick={handleSave}
              disabled={saving || testStatus === "testing" || !kvReady}
              className="w-full rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {testStatus === "testing" ? "Vérification..." : saving ? "Enregistrement..." : "Vérifier et enregistrer"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SettingsForm() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [formValues, setFormValues] = useState<Record<string, Record<string, string>>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [helpOpen, setHelpOpen] = useState<string | null>(null);
  const [recentlySaved, setRecentlySaved] = useState<Set<string>>(new Set());
  const moveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const fetchData = useCallback(async () => {
    const res = await fetch("/api/keys");
    if (res.ok) {
      const json = (await res.json()) as ApiResponse;
      setData(json);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const timers = moveTimers.current;
    return () => { Object.values(timers).forEach(clearTimeout); };
  }, []);

  function showMessage(type: "success" | "error", text: string) {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  }

  function toggleExpanded(serviceKey: string) {
    setExpanded((prev) => ({ ...prev, [serviceKey]: !prev[serviceKey] }));
  }

  function updateField(service: string, key: string, value: string) {
    setFormValues((prev) => ({ ...prev, [service]: { ...prev[service], [key]: value } }));
  }

  async function handleSave(service: string) {
    const fields = data?.services[service]?.fields;
    if (!fields) return;

    const keys: Record<string, string> = {};
    for (const f of fields) {
      const val = formValues[service]?.[f.key]?.trim();
      if (!val) { showMessage("error", `Le champ "${f.label}" est requis`); return; }
      keys[f.key] = val;
    }

    setSaving(service);
    const res = await fetch("/api/keys", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ service, keys }),
    });

    if (res.ok) {
      showMessage("success", `${data?.services[service].label} configuré`);
      setFormValues((prev) => ({ ...prev, [service]: {} }));
      await fetchData();

      setRecentlySaved((prev) => new Set(prev).add(service));
      clearTimeout(moveTimers.current[service]);
      moveTimers.current[service] = setTimeout(() => {
        setRecentlySaved((prev) => { const next = new Set(prev); next.delete(service); return next; });
        setExpanded((prev) => ({ ...prev, [service]: false }));
      }, 10000);
    } else {
      const err = await res.json();
      showMessage("error", err.error || "Erreur lors de la sauvegarde");
    }
    setSaving(null);
  }

  async function handleDelete(service: string) {
    setDeleting(service);
    const res = await fetch(`/api/keys?service=${service}`, { method: "DELETE" });
    if (res.ok) {
      showMessage("success", `Clés ${data?.services[service].label} supprimées`);
      await fetchData();
    }
    setDeleting(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
        Impossible de charger la configuration.
      </div>
    );
  }

  const entries = Object.entries(data.services);
  const unconfigured = entries.filter(([key, svc]) => !svc.configured || recentlySaved.has(key));
  const configured = entries.filter(([key, svc]) => svc.configured && !recentlySaved.has(key));
  const sorted = [...unconfigured, ...configured];

  return (
    <>
      {helpOpen && data.services[helpOpen] && (
        <HelpModal
          serviceKey={helpOpen}
          label={data.services[helpOpen].label}
          fields={data.services[helpOpen].fields}
          kvReady={data.kvReady}
          onClose={() => setHelpOpen(null)}
          onSave={async (values) => {
            const fields = data.services[helpOpen].fields;
            for (const f of fields) {
              if (!values[f.key]?.trim()) {
                showMessage("error", `Le champ "${f.label}" est requis`);
                return;
              }
            }
            setSaving(helpOpen);
            const res = await fetch("/api/keys", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ service: helpOpen, keys: values }),
            });
            if (res.ok) {
              showMessage("success", `${data.services[helpOpen].label} configuré`);
              await fetchData();
              setHelpOpen(null);
              const key = helpOpen;
              setRecentlySaved((prev) => new Set(prev).add(key));
              clearTimeout(moveTimers.current[key]);
              moveTimers.current[key] = setTimeout(() => {
                setRecentlySaved((prev) => { const next = new Set(prev); next.delete(key); return next; });
                setExpanded((prev) => ({ ...prev, [key]: false }));
              }, 10000);
            } else {
              const err = await res.json();
              showMessage("error", err.error || "Erreur lors de la sauvegarde");
            }
            setSaving(null);
          }}
        />
      )}

      <div className="space-y-6">
        {message && (
          <div
            className={`rounded-lg border px-4 py-3 text-sm ${
              message.type === "success"
                ? "border-green-200 bg-green-50 text-green-700"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {message.text}
          </div>
        )}

        {!data.kvReady && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <strong>Mode env vars</strong> — Configurez{" "}
            <code className="rounded bg-amber-100 px-1 font-mono text-xs">KV_REST_API_URL</code>{" "}
            et{" "}
            <code className="rounded bg-amber-100 px-1 font-mono text-xs">KV_REST_API_TOKEN</code>{" "}
            (Upstash Redis via Vercel Marketplace) pour activer la gestion des clés depuis cette interface.
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map(([serviceKey, service]) => {
            const isOpen = expanded[serviceKey] ?? false;
            const isConfigured = service.configured;

            return (
              <div key={serviceKey} className="rounded-xl border border-gray-200 bg-white shadow-sm">
                {/* Header */}
                <div className="flex items-center gap-1 px-4 py-3">
                  {/* Toggle (tout sauf le bouton info) */}
                  <button
                    type="button"
                    onClick={() => toggleExpanded(serviceKey)}
                    className="flex flex-1 items-center gap-3 text-left min-w-0"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 font-mono text-xs font-bold text-gray-600">
                      {serviceKey.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold leading-tight">{service.label}</p>
                      <p className="text-xs text-gray-500">
                        {isConfigured
                          ? `Configuré (${service.source === "kv" ? "interface" : "env vars"})`
                          : "Non configuré"}
                      </p>
                    </div>
                  </button>

                  {/* Info button */}
                  <button
                    type="button"
                    onClick={() => setHelpOpen(serviceKey)}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                    title="Comment obtenir les clés"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20A10 10 0 0012 2z" />
                    </svg>
                  </button>

                  {/* Status dot + chevron */}
                  <button
                    type="button"
                    onClick={() => toggleExpanded(serviceKey)}
                    className="flex shrink-0 items-center gap-1.5 pl-1"
                  >
                    <span className={`inline-flex h-2 w-2 rounded-full ${isConfigured ? "bg-green-500" : "bg-gray-300"}`} />
                    <svg
                      className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>

                {/* Collapsible body */}
                {isOpen && (
                  <div className="border-t border-gray-100 px-5 py-4 space-y-3">
                    {service.fields.map((field) => (
                      <div key={field.key}>
                        <label className="mb-1 block text-xs font-medium text-gray-700">
                          {field.label}
                        </label>
                        <input
                          type="password"
                          placeholder={field.maskedValue ? `Actuel : ${field.maskedValue}` : field.placeholder}
                          value={formValues[serviceKey]?.[field.key] || ""}
                          onChange={(e) => updateField(serviceKey, field.key, e.target.value)}
                          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition-colors placeholder:text-gray-400 focus:border-gray-900 focus:ring-1 focus:ring-gray-900"
                          disabled={!data.kvReady}
                        />
                      </div>
                    ))}

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => handleSave(serviceKey)}
                        disabled={saving === serviceKey || !data.kvReady}
                        className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {saving === serviceKey ? "Enregistrement..." : "Enregistrer"}
                      </button>
                      {isConfigured && service.source === "kv" && (
                        <button
                          onClick={() => handleDelete(serviceKey)}
                          disabled={deleting === serviceKey}
                          className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                        >
                          {deleting === serviceKey ? "Suppression..." : "Supprimer"}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
