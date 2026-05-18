import { getKvClient } from "@/lib/keys/store";

const FINGERPRINT_KEY_PREFIX = "leclercdrive:fingerprint:";

/** Empreinte Chrome 148 / Arc (macOS arm) — alignée sur les requêtes navigateur réelles. */
export interface LeclercBrowserFingerprint {
  userAgent: string;
  secChUa: string;
  secChUaMobile: string;
  secChUaPlatform: string;
  secChUaArch?: string;
  secChUaFullVersionList?: string;
  secChUaModel?: string;
  secChDeviceMemory?: string;
}

export const DEFAULT_LECLERC_FINGERPRINT: LeclercBrowserFingerprint = {
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
  secChUa: '"Not/A)Brand";v="99", "Chromium";v="148"',
  secChUaMobile: "?0",
  secChUaPlatform: '"macOS"',
  secChUaArch: '"arm"',
  secChUaFullVersionList:
    '"Not/A)Brand";v="99.0.0.0", "Chromium";v="148.0.7778.168"',
  secChUaModel: '""',
  secChDeviceMemory: "16",
};

let cachedFingerprint: LeclercBrowserFingerprint | null = null;

function fingerprintKey(username: string): string {
  return `${FINGERPRINT_KEY_PREFIX}${username.toLowerCase()}`;
}

export function clientHintHeaders(
  fp: LeclercBrowserFingerprint = DEFAULT_LECLERC_FINGERPRINT
): Record<string, string> {
  const headers: Record<string, string> = {
    "user-agent": fp.userAgent,
    "sec-ch-ua": fp.secChUa,
    "sec-ch-ua-mobile": fp.secChUaMobile,
    "sec-ch-ua-platform": fp.secChUaPlatform,
    "accept-language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
  };
  if (fp.secChUaArch) headers["sec-ch-ua-arch"] = fp.secChUaArch;
  if (fp.secChUaFullVersionList) {
    headers["sec-ch-ua-full-version-list"] = fp.secChUaFullVersionList;
  }
  if (fp.secChUaModel !== undefined) headers["sec-ch-ua-model"] = fp.secChUaModel;
  if (fp.secChDeviceMemory) headers["sec-ch-device-memory"] = fp.secChDeviceMemory;
  return headers;
}

/** En-têtes XHR / fetch API Leclerc (panier, connecter, etc.). */
export function apiRequestHeaders(
  fp: LeclercBrowserFingerprint = DEFAULT_LECLERC_FINGERPRINT
): Record<string, string> {
  return {
    ...clientHintHeaders(fp),
    accept: "application/json, text/javascript, */*; q=0.01",
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-site",
  };
}

/** Navigation document (pages HTML courses / www). */
export function documentNavigationHeaders(
  fp: LeclercBrowserFingerprint = DEFAULT_LECLERC_FINGERPRINT,
  options?: { referer?: string; secFetchSite?: "none" | "same-origin" | "same-site" }
): Record<string, string> {
  return {
    ...clientHintHeaders(fp),
    accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "cache-control": "max-age=0",
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": options?.secFetchSite ?? (options?.referer ? "same-site" : "none"),
    "sec-fetch-user": "?1",
    "upgrade-insecure-requests": "1",
    ...(options?.referer ? { referer: options.referer } : {}),
  };
}

export async function loadBrowserFingerprint(
  username: string
): Promise<LeclercBrowserFingerprint> {
  const kv = getKvClient();
  if (!kv) return DEFAULT_LECLERC_FINGERPRINT;
  const stored = await kv.get<LeclercBrowserFingerprint>(fingerprintKey(username));
  if (stored?.userAgent?.trim()) return stored;
  return DEFAULT_LECLERC_FINGERPRINT;
}

export async function persistBrowserFingerprint(
  username: string,
  fingerprint: LeclercBrowserFingerprint
): Promise<void> {
  const kv = getKvClient();
  if (!kv) return;
  await kv.set(fingerprintKey(username), fingerprint);
  cachedFingerprint = fingerprint;
}

export async function resolveBrowserFingerprint(
  username?: string
): Promise<LeclercBrowserFingerprint> {
  if (cachedFingerprint) return cachedFingerprint;
  if (username) {
    cachedFingerprint = await loadBrowserFingerprint(username);
    return cachedFingerprint;
  }
  return DEFAULT_LECLERC_FINGERPRINT;
}

export function getCachedBrowserFingerprint(): LeclercBrowserFingerprint {
  return cachedFingerprint ?? DEFAULT_LECLERC_FINGERPRINT;
}

export function clearBrowserFingerprintCache(): void {
  cachedFingerprint = null;
}
