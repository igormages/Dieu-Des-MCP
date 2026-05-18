import { getServiceKeys, getKvClient } from "@/lib/keys/store";
import {
  parseBiocoopCookieImportRaw,
  summarizeBiocoopCookieJar,
} from "./cookie-import";
import {
  encodeMagentoUenc,
  extractFormKey,
  extractProductFromPage,
  extractSearchProducts,
  parseCartSection,
} from "./parsing";
import {
  BIOCOOP_ORIGIN,
  type BiocoopAddToCartResult,
  type BiocoopCartSummary,
  type BiocoopConfig,
  type BiocoopProductDetail,
  type BiocoopSearchProduct,
} from "./types";

const SESSION_KEY = "biocoop:session:default";
const SESSION_TTL_SECONDS = 60 * 60 * 4;

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";

const COMMON_HEADERS: Record<string, string> = {
  "user-agent": USER_AGENT,
  "accept-language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
  "accept-encoding": "gzip, deflate, br",
  "sec-ch-ua": '"Not/A)Brand";v="99", "Chromium";v="148"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"macOS"',
};

interface SessionState {
  cookies: Record<string, Record<string, string>>;
  formKey: string | null;
  expiresAt: number;
}

class CookieJar {
  private store: Record<string, Record<string, string>> = {};

  constructor(initial?: Record<string, Record<string, string>>) {
    if (initial) this.store = initial;
  }

  toJSON(): Record<string, Record<string, string>> {
    return this.store;
  }

  getCookieHeader(host: string): string {
    const parts: string[] = [];
    const seen = new Set<string>();
    for (const [storeHost, jar] of Object.entries(this.store)) {
      if (host === storeHost || host.endsWith(`.${storeHost}`)) {
        for (const [name, value] of Object.entries(jar)) {
          if (seen.has(name)) continue;
          seen.add(name);
          parts.push(`${name}=${value}`);
        }
      }
    }
    return parts.join("; ");
  }

  ingest(host: string, response: Response): void {
    for (const raw of extractSetCookies(response.headers)) {
      const parsed = parseSetCookie(raw);
      if (!parsed) continue;
      const cookieHost = (parsed.domain ?? host).replace(/^\./, "");
      if (!this.store[cookieHost]) this.store[cookieHost] = {};
      if (parsed.value === "" || parsed.expired) {
        delete this.store[cookieHost][parsed.name];
      } else {
        this.store[cookieHost][parsed.name] = parsed.value;
      }
    }
  }
}

function extractSetCookies(headers: Headers): string[] {
  const anyHeaders = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof anyHeaders.getSetCookie === "function") {
    return anyHeaders.getSetCookie();
  }
  const all: string[] = [];
  headers.forEach((value, name) => {
    if (name.toLowerCase() === "set-cookie") all.push(value);
  });
  return all;
}

function parseSetCookie(raw: string): {
  name: string;
  value: string;
  domain?: string;
  expired: boolean;
} | null {
  const segments = raw.split(";").map((s) => s.trim());
  const [first] = segments;
  if (!first) return null;
  const eqIdx = first.indexOf("=");
  if (eqIdx === -1) return null;
  const name = first.slice(0, eqIdx).trim();
  const value = first.slice(eqIdx + 1).trim();
  let domain: string | undefined;
  let expired = false;
  for (const seg of segments.slice(1)) {
    const lower = seg.toLowerCase();
    if (lower.startsWith("domain=")) domain = seg.slice(7).trim().toLowerCase();
    else if (lower.startsWith("max-age=")) {
      const ma = parseInt(seg.slice(8), 10);
      if (!Number.isNaN(ma) && ma <= 0) expired = true;
    } else if (lower.startsWith("expires=")) {
      const date = new Date(seg.slice(8));
      if (!Number.isNaN(date.getTime()) && date.getTime() < Date.now()) expired = true;
    }
  }
  return { name, value, domain, expired };
}

let memorySession: SessionState | null = null;
let configCache: BiocoopConfig | null = null;

export async function getBiocoopConfig(): Promise<BiocoopConfig> {
  if (configCache) return configCache;
  const keys = await getServiceKeys("biocoop");
  const storePath =
    keys?.storePath?.trim() ||
    process.env.BIOCOOP_STORE_PATH?.trim() ||
    "";
  if (!storePath) {
    throw new Error(
      "Configurez le chemin magasin Biocoop (ex. magasin-bio_golfe_luscanen) dans les réglages."
    );
  }
  configCache = {
    storePath: storePath.replace(/^\/+|\/+$/g, ""),
    browserCookies:
      keys?.browserCookies?.trim() || process.env.BIOCOOP_BROWSER_COOKIES?.trim(),
  };
  return configCache;
}

export function clearBiocoopConfigCache(): void {
  configCache = null;
}

function storeBaseUrl(config: BiocoopConfig): string {
  return `${BIOCOOP_ORIGIN}/${config.storePath}`;
}

async function loadSession(): Promise<SessionState | null> {
  if (memorySession && memorySession.expiresAt > Date.now()) {
    return memorySession;
  }
  const kv = getKvClient();
  if (!kv) return null;
  const raw = await kv.get<SessionState>(SESSION_KEY);
  if (!raw || raw.expiresAt <= Date.now()) return null;
  memorySession = raw;
  return raw;
}

async function saveSession(state: SessionState): Promise<void> {
  memorySession = state;
  const kv = getKvClient();
  if (!kv) return;
  await kv.set(SESSION_KEY, state, { ex: SESSION_TTL_SECONDS });
}

async function ensureSession(): Promise<SessionState> {
  const existing = await loadSession();
  if (existing) return existing;

  const config = await getBiocoopConfig();
  if (!config.browserCookies) {
    throw new Error(
      "Session Biocoop absente : importez les cookies du navigateur (réglages ou outil biocoop_set_browser_cookies)."
    );
  }

  const jar = parseBiocoopCookieImportRaw(config.browserCookies);
  if (Object.keys(jar).length === 0) {
    throw new Error("Cookies Biocoop invalides ou vides.");
  }

  const state: SessionState = {
    cookies: jar,
    formKey: Object.values(jar).find((c) => c.form_key)?.form_key ?? null,
    expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000,
  };
  await saveSession(state);
  return state;
}

async function refreshFormKey(session: SessionState, config: BiocoopConfig): Promise<string> {
  if (session.formKey) return session.formKey;

  const html = await biocoopFetchText(
    `${storeBaseUrl(config)}/`,
    session,
    { referer: BIOCOOP_ORIGIN }
  );
  const key = extractFormKey(html);
  if (!key) {
    throw new Error(
      "form_key introuvable — rechargez la page magasin dans le navigateur et réimportez les cookies."
    );
  }
  session.formKey = key;
  await saveSession(session);
  return key;
}

async function biocoopFetchText(
  url: string,
  session: SessionState,
  opts?: { referer?: string; ajax?: boolean }
): Promise<string> {
  const host = new URL(url).host;
  const headers: Record<string, string> = {
    ...COMMON_HEADERS,
    accept: opts?.ajax
      ? "application/json, text/javascript, */*; q=0.01"
      : "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    cookie: new CookieJar(session.cookies).getCookieHeader(host),
  };
  if (opts?.referer) headers.referer = opts.referer;
  if (opts?.ajax) {
    headers["x-requested-with"] = "XMLHttpRequest";
  }

  const res = await fetch(url, { method: "GET", headers, redirect: "follow" });
  new CookieJar(session.cookies).ingest(host, res);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Biocoop HTTP ${res.status} sur ${url}`);
  }
  await saveSession(session);
  return text;
}

async function biocoopFetchJson<T>(
  url: string,
  session: SessionState,
  opts?: { referer?: string }
): Promise<T> {
  const text = await biocoopFetchText(url, session, { ...opts, ajax: true });
  return JSON.parse(text) as T;
}

function buildMultipartBody(fields: Record<string, string>): {
  body: string;
  contentType: string;
} {
  const boundary = `----BiocoopMcp${Date.now().toString(16)}`;
  const lines: string[] = [];
  for (const [name, value] of Object.entries(fields)) {
    lines.push(`--${boundary}`);
    lines.push(`Content-Disposition: form-data; name="${name}"`);
    lines.push("");
    lines.push(value);
  }
  lines.push(`--${boundary}--`);
  lines.push("");
  return {
    body: lines.join("\r\n"),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

async function biocoopPostMultipart<T>(
  url: string,
  session: SessionState,
  fields: Record<string, string>,
  referer: string
): Promise<T> {
  const host = new URL(url).host;
  const { body, contentType } = buildMultipartBody(fields);
  const headers: Record<string, string> = {
    ...COMMON_HEADERS,
    accept: "application/json, text/javascript, */*; q=0.01",
    "content-type": contentType,
    "x-requested-with": "XMLHttpRequest",
    referer,
    cookie: new CookieJar(session.cookies).getCookieHeader(host),
  };

  const res = await fetch(url, { method: "POST", headers, body, redirect: "follow" });
  const jar = new CookieJar(session.cookies);
  jar.ingest(host, res);
  session.cookies = jar.toJSON();
  const text = await res.text();
  await saveSession(session);

  if (!res.ok) {
    throw new Error(`Biocoop HTTP ${res.status} : ${text.slice(0, 300)}`);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Réponse Biocoop non JSON : ${text.slice(0, 300)}`);
  }
}

export async function biocoopGetSessionStatus(): Promise<{
  storePath: string;
  storeUrl: string;
  hasSession: boolean;
  cookieSummary: ReturnType<typeof summarizeBiocoopCookieJar> | null;
  formKeyPresent: boolean;
}> {
  const config = await getBiocoopConfig();
  const session = await loadSession();
  return {
    storePath: config.storePath,
    storeUrl: storeBaseUrl(config),
    hasSession: Boolean(session),
    cookieSummary: session ? summarizeBiocoopCookieJar(session.cookies) : null,
    formKeyPresent: Boolean(session?.formKey),
  };
}

export async function biocoopSetBrowserCookies(raw: string): Promise<{
  ok: true;
  summary: ReturnType<typeof summarizeBiocoopCookieJar>;
}> {
  const jar = parseBiocoopCookieImportRaw(raw);
  if (Object.keys(jar).length === 0) {
    throw new Error(
      "Aucun cookie biocoop.fr trouvé. Exportez depuis Chrome/Arc (cookies.txt ou DevTools)."
    );
  }

  const keys = await getServiceKeys("biocoop");
  const storePath = keys?.storePath?.trim() || process.env.BIOCOOP_STORE_PATH?.trim();
  if (!storePath) {
    throw new Error("Configurez d'abord le chemin magasin Biocoop dans les réglages.");
  }

  const summary = summarizeBiocoopCookieJar(jar);
  const state: SessionState = {
    cookies: jar,
    formKey: Object.values(jar).find((c) => c.form_key)?.form_key ?? null,
    expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000,
  };
  await saveSession(state);
  clearBiocoopConfigCache();

  const kv = getKvClient();
  if (kv) {
    await kv.set(`${SESSION_KEY}:cookies-imported`, true, { ex: SESSION_TTL_SECONDS });
  }

  return { ok: true, summary };
}

export async function biocoopSearchProducts(
  query: string,
  limit = 20
): Promise<{ query: string; count: number; products: BiocoopSearchProduct[] }> {
  const config = await getBiocoopConfig();
  const session = await ensureSession();
  const url = `${storeBaseUrl(config)}/catalogsearch/result/?q=${encodeURIComponent(query)}`;
  const html = await biocoopFetchText(url, session, {
    referer: storeBaseUrl(config),
  });
  const key = extractFormKey(html);
  if (key) {
    session.formKey = key;
    await saveSession(session);
  }
  const products = extractSearchProducts(html).slice(0, limit);
  return { query, count: products.length, products };
}

export async function biocoopGetProduct(
  productIdOrUrl: string
): Promise<BiocoopProductDetail> {
  const config = await getBiocoopConfig();
  const session = await ensureSession();
  const base = storeBaseUrl(config);

  let url = productIdOrUrl.trim();
  if (/^\d+$/.test(url)) {
    const list = await biocoopSearchProducts(url, 5);
    const hit = list.products.find((p) => p.id === url);
    if (hit?.url) url = hit.url;
    else url = `${base}/catalog/product/view/id/${url}`;
  } else if (!url.startsWith("http")) {
    url = url.startsWith("/") ? `${BIOCOOP_ORIGIN}${url}` : `${base}/${url}`;
  }

  const html = await biocoopFetchText(url, session, { referer: base });
  const key = extractFormKey(html);
  if (key) {
    session.formKey = key;
    await saveSession(session);
  }
  const detail = extractProductFromPage(html, url);
  if (!detail.id) {
    throw new Error(`Produit introuvable sur ${url}`);
  }
  return detail;
}

export async function biocoopGetCart(): Promise<BiocoopCartSummary> {
  const config = await getBiocoopConfig();
  const session = await ensureSession();
  const url = `${storeBaseUrl(config)}/customer/section/load/?sections=cart%2Cdirectory-data%2Cmessages&force_new_section_timestamp=true&_=${Date.now()}`;
  const data = await biocoopFetchJson<Record<string, unknown>>(url, session, {
    referer: storeBaseUrl(config),
  });
  const cart = parseCartSection(data);
  return cart ?? { summary_count: 0, items: [] };
}

export async function biocoopAddToCart(
  productId: string,
  quantity: number,
  refererUrl?: string
): Promise<{ api: BiocoopAddToCartResult; cart: BiocoopCartSummary }> {
  const config = await getBiocoopConfig();
  const session = await ensureSession();
  const formKey = await refreshFormKey(session, config);
  const base = storeBaseUrl(config);
  const referer = refererUrl?.trim() || `${base}/`;
  const uenc = encodeMagentoUenc(referer);
  const url = `${base}/checkout/cart/add/uenc/${uenc}/product/${productId}/`;

  const api = await biocoopPostMultipart<BiocoopAddToCartResult>(
    url,
    session,
    {
      product: productId,
      qty: String(quantity),
      fromPage: "Product_list",
      form_key: formKey,
    },
    referer
  );

  if (!api.success) {
    throw new Error(api.message ?? "Ajout au panier refusé par Biocoop.");
  }

  const cart = await biocoopGetCart();
  return { api, cart };
}

export async function biocoopUpdateCartQuantity(
  productId: string,
  itemId: string,
  quantity: number,
  refererUrl?: string
): Promise<{ api: BiocoopAddToCartResult; cart: BiocoopCartSummary }> {
  const config = await getBiocoopConfig();
  const session = await ensureSession();
  const formKey = await refreshFormKey(session, config);
  const base = storeBaseUrl(config);
  const referer = refererUrl?.trim() || `${base}/`;
  const url = `${base}/checkout/sidebar/updateItemQty/`;

  const api = await biocoopPostMultipart<BiocoopAddToCartResult>(
    url,
    session,
    {
      product: productId,
      item_id: itemId,
      item_qty: String(quantity),
      fromPage: "Product_list",
      form_key: formKey,
    },
    referer
  );

  if (!api.success) {
    throw new Error(api.message ?? "Mise à jour panier refusée par Biocoop.");
  }

  const cart = await biocoopGetCart();
  return { api, cart };
}

export async function biocoopClearSession(): Promise<void> {
  memorySession = null;
  const kv = getKvClient();
  if (kv) await kv.del(SESSION_KEY);
}

export async function importBiocoopCookies(
  raw: string
): Promise<ReturnType<typeof summarizeBiocoopCookieJar>> {
  const res = await biocoopSetBrowserCookies(raw);
  return res.summary;
}
