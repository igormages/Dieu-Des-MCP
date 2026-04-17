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
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // Keys that were just saved and are pending move to the bottom after 10s
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

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Clean up timers on unmount
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

      // Mark as recently saved; after 10s collapse and move to bottom
      setRecentlySaved((prev) => new Set(prev).add(service));
      clearTimeout(moveTimers.current[service]);
      moveTimers.current[service] = setTimeout(() => {
        setRecentlySaved((prev) => {
          const next = new Set(prev);
          next.delete(service);
          return next;
        });
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

  // Unconfigured (or just saved but pending move) on top; configured on bottom
  const entries = Object.entries(data.services);
  const unconfigured = entries.filter(
    ([key, svc]) => !svc.configured || recentlySaved.has(key)
  );
  const configured = entries.filter(
    ([key, svc]) => svc.configured && !recentlySaved.has(key)
  );
  const sorted = [...unconfigured, ...configured];

  return (
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map(([serviceKey, service]) => {
          const isOpen = expanded[serviceKey] ?? false;
          const isConfigured = service.configured;

          return (
            <div
              key={serviceKey}
              className="rounded-xl border border-gray-200 bg-white shadow-sm"
            >
              {/* Header — always visible, click to toggle */}
              <button
                type="button"
                onClick={() => toggleExpanded(serviceKey)}
                className="flex w-full items-center justify-between px-5 py-4 text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 font-mono text-xs font-bold text-gray-600">
                    {serviceKey.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-semibold leading-tight">
                      {service.label}
                    </p>
                    <p className="text-xs text-gray-500">
                      {isConfigured
                        ? `Configuré (${service.source === "kv" ? "interface" : "env vars"})`
                        : "Non configuré"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 shrink-0">
                  <span
                    className={`inline-flex h-2 w-2 rounded-full ${
                      isConfigured ? "bg-green-500" : "bg-gray-300"
                    }`}
                  />
                  <svg
                    className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${
                      isOpen ? "rotate-180" : ""
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

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
  );
}
