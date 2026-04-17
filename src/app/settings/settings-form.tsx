"use client";

import { useCallback, useEffect, useState } from "react";

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

const SERVICE_ICONS: Record<string, string> = {
  github: "GH",
  qonto: "QT",
};

export function SettingsForm() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [formValues, setFormValues] = useState<
    Record<string, Record<string, string>>
  >({});

  const fetchData = useCallback(async () => {
    const res = await fetch("/api/keys");
    if (res.ok) {
      const json = (await res.json()) as ApiResponse;
      setData(json);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function showMessage(type: "success" | "error", text: string) {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  }

  function updateField(service: string, key: string, value: string) {
    setFormValues((prev) => ({
      ...prev,
      [service]: { ...prev[service], [key]: value },
    }));
  }

  async function handleSave(service: string) {
    const fields = data?.services[service]?.fields;
    if (!fields) return;

    const keys: Record<string, string> = {};
    for (const f of fields) {
      const val = formValues[service]?.[f.key]?.trim();
      if (!val) {
        showMessage("error", `Le champ "${f.label}" est requis`);
        return;
      }
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
    } else {
      const err = await res.json();
      showMessage("error", err.error || "Erreur lors de la sauvegarde");
    }
    setSaving(null);
  }

  async function handleDelete(service: string) {
    setDeleting(service);
    const res = await fetch(`/api/keys?service=${service}`, {
      method: "DELETE",
    });
    if (res.ok) {
      showMessage(
        "success",
        `Clés ${data?.services[service].label} supprimées`
      );
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

  return (
    <div className="space-y-6">
      {message && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm transition-all ${
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
          <code className="rounded bg-amber-100 px-1 font-mono text-xs">
            KV_REST_API_URL
          </code>{" "}
          et{" "}
          <code className="rounded bg-amber-100 px-1 font-mono text-xs">
            KV_REST_API_TOKEN
          </code>{" "}
          (Upstash Redis via Vercel Marketplace) pour activer la gestion des
          clés depuis cette interface.
        </div>
      )}

      {Object.entries(data.services).map(([serviceKey, service]) => (
        <div
          key={serviceKey}
          className="rounded-xl border border-gray-200 bg-white shadow-sm"
        >
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 font-mono text-sm font-bold text-gray-600">
                {SERVICE_ICONS[serviceKey] || serviceKey.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <h2 className="font-semibold">{service.label}</h2>
                <p className="text-xs text-gray-500">
                  {service.configured
                    ? `Configuré (${service.source === "kv" ? "interface" : "env vars"})`
                    : "Non configuré"}
                </p>
              </div>
            </div>
            <span
              className={`inline-flex h-2.5 w-2.5 rounded-full ${
                service.configured ? "bg-green-500" : "bg-gray-300"
              }`}
            />
          </div>

          <div className="space-y-4 px-6 py-5">
            {service.fields.map((field) => (
              <div key={field.key}>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  {field.label}
                </label>
                <input
                  type="password"
                  placeholder={
                    field.maskedValue
                      ? `Actuel : ${field.maskedValue}`
                      : field.placeholder
                  }
                  value={formValues[serviceKey]?.[field.key] || ""}
                  onChange={(e) =>
                    updateField(serviceKey, field.key, e.target.value)
                  }
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition-colors placeholder:text-gray-400 focus:border-gray-900 focus:ring-1 focus:ring-gray-900"
                  disabled={!data.kvReady}
                />
              </div>
            ))}

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => handleSave(serviceKey)}
                disabled={saving === serviceKey || !data.kvReady}
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving === serviceKey ? "Enregistrement..." : "Enregistrer"}
              </button>
              {service.configured && service.source === "kv" && (
                <button
                  onClick={() => handleDelete(serviceKey)}
                  disabled={deleting === serviceKey}
                  className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                >
                  {deleting === serviceKey ? "Suppression..." : "Supprimer"}
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
