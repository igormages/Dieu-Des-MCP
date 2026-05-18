import {
  DEFAULT_LECLERC_FINGERPRINT,
  type LeclercBrowserFingerprint,
} from "./browser-fingerprint";

/** Conversion cookies Playwright / DevTools → jar interne. */

export interface PlaywrightCookie {
  name: string;
  value: string;
  domain: string;
}

export function playwrightCookiesToJar(
  cookies: PlaywrightCookie[]
): Record<string, Record<string, string>> {
  const jar: Record<string, Record<string, string>> = {};
  for (const c of cookies) {
    if (!c.domain.includes("leclercdrive")) continue;
    const host = c.domain.replace(/^\./, "").toLowerCase();
    if (!jar[host]) jar[host] = {};
    jar[host][c.name] = c.value;
  }
  return jar;
}

/** Copie les cookies du host courses vers le host secure du même silo (fd9). */
export function spreadRegionalSessionCookies(
  jar: Record<string, Record<string, string>>
): Record<string, Record<string, string>> {
  const coursesHost = Object.keys(jar).find((h) => h.includes("-courses.leclercdrive.fr"));
  if (!coursesHost) return jar;
  const secureHost = coursesHost.replace("-courses.", "-secure.");
  const coursesCookies = jar[coursesHost];
  if (!coursesCookies) return jar;

  const out: Record<string, Record<string, string>> = {};
  for (const [host, cookies] of Object.entries(jar)) {
    out[host] = { ...cookies };
  }
  out[secureHost] = { ...(out[secureHost] ?? {}), ...coursesCookies };
  return out;
}

/** Lit l’empreinte Client Hints depuis une page navigateur (harvest CDP). */
export async function captureBrowserFingerprint(page: {
  evaluate: <T>(fn: () => T | Promise<T>) => Promise<T>;
}): Promise<LeclercBrowserFingerprint> {
  const captured = await page.evaluate(async () => {
    const ua = navigator.userAgent;
    const uad = (
      navigator as Navigator & {
        userAgentData?: {
          brands: Array<{ brand: string; version: string }>;
          mobile: boolean;
          platform: string;
          getHighEntropyValues: (
            hints: string[]
          ) => Promise<Record<string, string>>;
        };
      }
    ).userAgentData;

    if (!uad) return { userAgent: ua } as Partial<LeclercBrowserFingerprint>;

    const secChUa = uad.brands
      .map((b) => `"${b.brand}";v="${b.version}"`)
      .join(", ");
    const base: Partial<LeclercBrowserFingerprint> = {
      userAgent: ua,
      secChUa,
      secChUaMobile: uad.mobile ? "?1" : "?0",
      secChUaPlatform: `"${uad.platform}"`,
    };

    try {
      const hi = await uad.getHighEntropyValues([
        "architecture",
        "model",
        "fullVersionList",
        "deviceMemory",
      ]);
      if (hi.architecture) base.secChUaArch = `"${hi.architecture}"`;
      if (hi.model !== undefined) base.secChUaModel = `"${hi.model}"`;
      const fullList = hi.fullVersionList as unknown;
      if (Array.isArray(fullList)) {
        base.secChUaFullVersionList = (
          fullList as Array<{ brand: string; version: string }>
        )
          .map((b) => `"${b.brand}";v="${b.version}"`)
          .join(", ");
      }
      if (hi.deviceMemory) base.secChDeviceMemory = String(hi.deviceMemory);
    } catch {
      /* getHighEntropyValues peut être restreint */
    }
    return base;
  });

  return { ...DEFAULT_LECLERC_FINGERPRINT, ...captured };
}

export function jarToPlaywrightCookies(
  jar: Record<string, Record<string, string>>
): PlaywrightCookie[] {
  const out: PlaywrightCookie[] = [];
  for (const [host, cookies] of Object.entries(jar)) {
    const domain = host.startsWith("www.") ? host : `.${host}`;
    for (const [name, value] of Object.entries(cookies)) {
      out.push({ name, value, domain });
    }
  }
  return out;
}
