import { leclercFetch } from "./http";

/** IP publique vue par Leclerc (même chemin réseau que les requêtes drive). */
export async function fetchPublicIp(): Promise<string | null> {
  try {
    const res = await leclercFetch("https://api.ipify.org?format=json", {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { ip?: string };
    return data.ip?.trim() || null;
  } catch {
    return null;
  }
}
