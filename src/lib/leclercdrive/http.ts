import type { Dispatcher } from "undici";

let proxyDispatcher: Dispatcher | undefined;

/** Proxy HTTP optionnel (VPS Cod'iT / résidentiel). */
export function getLeclercHttpProxy(): string | undefined {
  const raw = process.env.LECLERCDRIVE_HTTP_PROXY?.trim();
  if (!raw) return undefined;
  const cleaned = raw.replace(/^["']|["']$/g, "");
  try {
    const u = new URL(cleaned);
    if (u.protocol !== "http:" && u.protocol !== "https:") return undefined;
    return cleaned;
  } catch {
    return undefined;
  }
}

/** URL masquée pour logs / diagnostic. */
export function getLeclercHttpProxyForLogs(): string | null {
  const proxy = getLeclercHttpProxy();
  if (!proxy) return null;
  try {
    const u = new URL(proxy);
    const auth = u.username
      ? `${encodeURIComponent(u.username)}:***@`
      : "";
    const port = u.port || (u.protocol === "https:" ? "443" : "80");
    return `${u.protocol}//${auth}${u.hostname}:${port}`;
  } catch {
    return "(LECLERCDRIVE_HTTP_PROXY invalide)";
  }
}

async function createProxyDispatcher(proxyUrl: string): Promise<Dispatcher> {
  const { ProxyAgent } = await import("undici");
  return new ProxyAgent({
    uri: proxyUrl,
    connect: { timeout: 20_000 },
    bodyTimeout: 120_000,
    headersTimeout: 45_000,
  });
}

export interface LeclercProxyProbeResult {
  configured: boolean;
  proxyPreview: string | null;
  ok: boolean;
  latencyMs?: number;
  httpStatus?: number;
  error?: string;
  hint?: string;
}

/** Teste la connectivité proxy → Leclerc (à appeler depuis le même runtime que le MCP). */
export async function probeLeclercHttpProxy(): Promise<LeclercProxyProbeResult> {
  const proxy = getLeclercHttpProxy();
  if (!proxy) {
    return { configured: false, proxyPreview: null, ok: true };
  }

  const preview = getLeclercHttpProxyForLogs();
  const start = Date.now();

  try {
    const dispatcher = await createProxyDispatcher(proxy);
    const res = await fetch("https://www.leclercdrive.fr/", {
      method: "GET",
      redirect: "manual",
      dispatcher,
      signal: AbortSignal.timeout(30_000),
      headers: { "user-agent": "Mozilla/5.0 (compatible; dieudesmcp-proxy-probe/1.0)" },
    } as RequestInit);
    await res.text().catch(() => undefined);

    return {
      configured: true,
      proxyPreview: preview,
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
      msg.includes("fetch failed") || cause.includes("fetch failed");

    return {
      configured: true,
      proxyPreview: preview,
      ok: false,
      latencyMs: Date.now() - start,
      error: cause || msg,
      hint: isFetchFailed
        ? "Depuis ce serveur (Vercel), le proxy est injoignable : vérifiez l’URL (http://user:pass@51.159.164.44:3128), le mot de passe URL-encodé si caractères spéciaux, et le pare-feu Scaleway (TCP 3128 entrant). Le conteneur Squid sur le VPS peut être UP tout de même."
        : "Vérifiez LECLERCDRIVE_HTTP_PROXY et redéployez après modification.",
    };
  }
}

function formatProxyNetworkError(e: unknown): Error {
  const proxy = getLeclercHttpProxyForLogs();
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
      "Vérifiez que Squid tourne sur le VPS, que le port 3128 est ouvert, et lancez leclercdrive_diagnose.",
    { cause: base }
  );
}

export async function leclercFetch(
  url: string,
  init?: RequestInit
): Promise<Response> {
  const proxy = getLeclercHttpProxy();
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
    throw formatProxyNetworkError(e);
  }
}
