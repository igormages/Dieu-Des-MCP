import {
  documentNavigationHeaders as buildDocumentHeaders,
  getCachedBrowserFingerprint,
} from "./browser-fingerprint";
import type { LeclercDriveConfig } from "./types";

/** Entrée officielle Leclerc Drive (pas fd9 direct). */
export const LECLERC_PORTAL_URL = "https://www.leclercdrive.fr/";

export function documentNavigationHeaders(options?: {
  referer?: string;
  secFetchSite?: "none" | "same-origin" | "same-site";
}): Record<string, string> {
  return buildDocumentHeaders(getCachedBrowserFingerprint(), options);
}

export function storePageUrl(config: LeclercDriveConfig): string {
  return `https://${config.coursesHost}/${config.storePath}-${config.storeSlug}.aspx`;
}
