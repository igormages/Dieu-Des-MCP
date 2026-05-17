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
