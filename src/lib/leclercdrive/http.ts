import type { Dispatcher } from "undici";

let proxyDispatcher: Dispatcher | undefined;
let proxyLoadFailed = false;

/** Proxy HTTP optionnel (résidentiel recommandé sur Vercel). */
export function getLeclercHttpProxy(): string | undefined {
  return process.env.LECLERCDRIVE_HTTP_PROXY?.trim() || undefined;
}

async function getLeclercFetchDispatcher(): Promise<Dispatcher | undefined> {
  const proxy = getLeclercHttpProxy();
  if (!proxy || proxyLoadFailed) return undefined;
  if (proxyDispatcher) return proxyDispatcher;

  try {
    const { ProxyAgent } = await import("undici");
    proxyDispatcher = new ProxyAgent(proxy);
    return proxyDispatcher;
  } catch {
    proxyLoadFailed = true;
    return undefined;
  }
}

export async function leclercFetch(
  url: string,
  init?: RequestInit
): Promise<Response> {
  const dispatcher = await getLeclercFetchDispatcher();
  if (!dispatcher) return fetch(url, init);
  return fetch(url, { ...init, dispatcher } as RequestInit);
}
