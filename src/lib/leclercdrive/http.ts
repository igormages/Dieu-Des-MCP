import { ProxyAgent, type Dispatcher } from "undici";

let proxyDispatcher: Dispatcher | undefined;

/** Proxy résidentiel optionnel (ex. http://user:pass@host:port). */
export function getLeclercHttpProxy(): string | undefined {
  return process.env.LECLERCDRIVE_HTTP_PROXY?.trim() || undefined;
}

export function getLeclercFetchDispatcher(): Dispatcher | undefined {
  const proxy = getLeclercHttpProxy();
  if (!proxy) return undefined;
  if (!proxyDispatcher) {
    proxyDispatcher = new ProxyAgent(proxy);
  }
  return proxyDispatcher;
}

export function leclercFetch(
  url: string,
  init?: RequestInit
): Promise<Response> {
  const dispatcher = getLeclercFetchDispatcher();
  if (!dispatcher) return fetch(url, init);
  return fetch(url, { ...init, dispatcher } as RequestInit);
}
