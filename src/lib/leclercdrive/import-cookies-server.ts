import {
  parseCookieImportRaw,
  summarizeCookieJar,
  type CookieImportSummary,
} from "./cookie-import";
import { persistBrowserCookies, persistHarvestedSession } from "./client";

export async function importLeclercdriveCookies(
  username: string,
  raw: string
): Promise<CookieImportSummary> {
  const jar = parseCookieImportRaw(raw);
  if (Object.keys(jar).length === 0) {
    throw new Error(
      "Aucun cookie leclercdrive trouvé. Exportez depuis Arc (extension « Get cookies.txt LOCALLY »)."
    );
  }

  await persistBrowserCookies(username, jar);
  await persistHarvestedSession(jar);
  return summarizeCookieJar(jar);
}
