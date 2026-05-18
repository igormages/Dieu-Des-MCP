import type { Dispatcher } from "undici";
import { getServiceKeys } from "@/lib/keys/store";

let proxyDispatcher: Dispatcher | undefined;
/** undefined = pas encore résolu ; null = pas de proxy */
let cachedProxyUrl: string | null | undefined;

export function normalizeLeclercHttpProxyUrl(
  raw: string | undefined
): string | undefined {
  if (!raw?.trim()) return undefined;
  const cleaned = raw.trim().replace(/^["']|["']$/g, "");
  try {
    const u = new URL(cleaned);
    if (u.protocol !== "http:" && u.protocol !== "https:") return undefined;
    return cleaned;
  } catch {
    return undefined;
  }
}

export function maskHttpProxyUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = "••••••••";
    return u.toString();
  } catch {
    if (url.length <= 12) return "••••••••";
    return `${url.slice(0, 8)}…${url.slice(-6)}`;
  }
}

/** Proxy : KV (/settings) prioritaire, puis LECLERCDRIVE_HTTP_PROXY. */
export async function resolveLeclercHttpProxy(): Promise<string | undefined> {
  if (cachedProxyUrl !== undefined) {
    return cachedProxyUrl ?? undefined;
  }

  const keys = await getServiceKeys("leclercdrive");
  const fromKv = normalizeLeclercHttpProxyUrl(
    typeof keys?.httpProxy === "string" ? keys.httpProxy : undefined
  );
  if (fromKv) {
    cachedProxyUrl = fromKv;
    return fromKv;
  }

  const fromEnv = normalizeLeclercHttpProxyUrl(process.env.LECLERCDRIVE_HTTP_PROXY);
  cachedProxyUrl = fromEnv ?? null;
  return fromEnv;
}

export function clearLeclercHttpProxyCache(): void {
  cachedProxyUrl = undefined;
  proxyDispatcher = undefined;
}

/** @deprecated Préférer resolveLeclercHttpProxy() après ensureSession. */
export function getLeclercHttpProxy(): string | undefined {
  if (cachedProxyUrl !== undefined) return cachedProxyUrl ?? undefined;
  return normalizeLeclercHttpProxyUrl(process.env.LECLERCDRIVE_HTTP_PROXY);
}

/** URL masquée pour logs / diagnostic. */
export function getLeclercHttpProxyForLogs(proxy?: string): string | null {
  const p = proxy ?? getLeclercHttpProxy();
  if (!p) return null;
  return maskHttpProxyUrl(p);
}

async function createProxyDispatcher(proxyUrl: string): Promise<Dispatcher> {
  const { ProxyAgent } = await import("undici");
  return new ProxyAgent({
    uri: proxyUrl,
    connect: { timeout: 25_000 },
    bodyTimeout: 120_000,
    headersTimeout: 45_000,
  });
}

export interface LeclercProxyProbeResult {
  configured: boolean;
  proxyPreview: string | null;
  source?: "kv" | "env";
  ok: boolean;
  latencyMs?: number;
  httpStatus?: number;
  error?: string;
  hint?: string;
}

/** Teste la connectivité proxy → Leclerc (même runtime que le MCP / settings). */
export async function probeLeclercHttpProxy(): Promise<LeclercProxyProbeResult> {
  const keys = await getServiceKeys("leclercdrive");
  const fromKv = normalizeLeclercHttpProxyUrl(
    typeof keys?.httpProxy === "string" ? keys.httpProxy : undefined
  );
  const fromEnv = normalizeLeclercHttpProxyUrl(process.env.LECLERCDRIVE_HTTP_PROXY);
  const proxy = fromKv ?? fromEnv;
  const source = fromKv ? "kv" : fromEnv ? "env" : undefined;

  if (!proxy) {
    return { configured: false, proxyPreview: null, ok: true };
  }

  cachedProxyUrl = proxy;
  const preview = maskHttpProxyUrl(proxy);
  const start = Date.now();

  try {
    const dispatcher = await createProxyDispatcher(proxy);
    const res = await fetch("https://www.leclercdrive.fr/", {
      method: "GET",
      redirect: "manual",
      dispatcher,
      signal: AbortSignal.timeout(35_000),
      headers: { "user-agent": "Mozilla/5.0 (compatible; dieudesmcp-proxy-probe/1.0)" },
    } as RequestInit);
    await res.text().catch(() => undefined);

    return {
      configured: true,
      proxyPreview: preview,
      source,
      ok: true,
      latencyMs: Date.now() - start,
      httpStatus: res.status,
      hint:
        res.status >= 400
          ? "Proxy joignable ; Leclerc répond (session/cookies à part)."
          : undefined,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const cause =
      e instanceof Error && e.cause instanceof Error ? e.cause.message : "";

    const isFetchFailed =
      msg.includes("fetch failed") ||
      cause.includes("fetch failed") ||
      cause.includes("Connect Timeout");

    return {
      configured: true,
      proxyPreview: preview,
      source,
      ok: false,
      latencyMs: Date.now() - start,
      error: cause || msg,
      hint: isFetchFailed
        ? "Connexion proxy impossible (timeout). Utilisez le port 443 : http://user:pass@51.159.164.44:443 (Vercel bloque souvent le 3128)."
        : "Vérifiez l’URL proxy dans /settings (http://user:pass@IP:443).",
    };
  }
}

function formatProxyNetworkError(e: unknown, proxy: string | null): Error {
  const base = e instanceof Error ? e : new Error(String(e));
  const cause =
    base.cause instanceof Error
      ? base.cause.message
      : base.message.includes("fetch failed")
        ? base.message
        : "";

  const detail = cause || base.message;
  return new Error(
    `Réseau Leclerc Drive (proxy ${proxy ?? "?"}): ${detail}. ` +
      "Réglages → Leclerc → Tester le proxy, ou leclercdrive_diagnose.",
    { cause: base }
  );
}

export async function leclercFetch(
  url: string,
  init?: RequestInit
): Promise<Response> {
  const proxy = await resolveLeclercHttpProxy();
  if (!proxy) return fetch(url, init);

  try {
    if (!proxyDispatcher) {
      proxyDispatcher = await createProxyDispatcher(proxy);
    }
    return await fetch(url, {
      ...init,
      dispatcher: proxyDispatcher,
    } as RequestInit);
  } catch (e) {
    proxyDispatcher = undefined;
    throw formatProxyNetworkError(e, getLeclercHttpProxyForLogs(proxy));
  }
}
