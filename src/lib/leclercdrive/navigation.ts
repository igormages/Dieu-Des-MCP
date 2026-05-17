import type { LeclercDriveConfig } from "./types";

/** Entrée officielle Leclerc Drive (pas fd9 direct). */
export const LECLERC_PORTAL_URL = "https://www.leclercdrive.fr/";

export function documentNavigationHeaders(options?: {
  referer?: string;
}): Record<string, string> {
  return {
    accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "accept-language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": options?.referer ? "same-site" : "none",
    "sec-fetch-user": "?1",
    "upgrade-insecure-requests": "1",
    ...(options?.referer ? { referer: options.referer } : {}),
  };
}

export function storePageUrl(config: LeclercDriveConfig): string {
  return `https://${config.coursesHost}/${config.storePath}-${config.storeSlug}.aspx`;
}
