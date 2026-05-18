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
