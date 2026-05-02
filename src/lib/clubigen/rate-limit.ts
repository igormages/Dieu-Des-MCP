import { getKvClient } from "@/lib/keys/store";

/** Limite imposée par le fournisseur du flux (10 appels / 5 minutes). */
const WINDOW_MS = 5 * 60 * 1000;
const MAX_REQUESTS = 10;
const REDIS_KEY = "mcp:clubigen-rss:rl";

const memoryTimestamps: number[] = [];

export type ClubigenRateResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

/**
 * Réserve un « créneau » pour un appel au flux RSS (fenêtre glissante 5 min, max 10).
 * Utilise Redis Upstash si configuré, sinon compteur en mémoire (instance unique).
 */
export async function takeClubigenRssSlot(): Promise<ClubigenRateResult> {
  const now = Date.now();
  const kv = getKvClient();

  if (kv) {
    const member = `${now}-${Math.random().toString(36).slice(2)}`;
    await kv.zadd(REDIS_KEY, { score: now, member });
    await kv.zremrangebyscore(REDIS_KEY, 0, now - WINDOW_MS);
    const count = await kv.zcard(REDIS_KEY);

    if (count > MAX_REQUESTS) {
      await kv.zrem(REDIS_KEY, member);
      const oldestRank = await kv.zrange<string[]>(REDIS_KEY, 0, 0, {
        withScores: true,
      });
      let oldestScore = now - WINDOW_MS;
      if (
        Array.isArray(oldestRank) &&
        oldestRank.length >= 2 &&
        typeof oldestRank[1] === "string"
      ) {
        const parsed = Number(oldestRank[1]);
        if (!Number.isNaN(parsed)) oldestScore = parsed;
      }
      const retryAfterMs = Math.max(0, oldestScore + WINDOW_MS - now);
      await kv.expire(REDIS_KEY, 600);
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
      };
    }

    await kv.expire(REDIS_KEY, 600);
    return { allowed: true };
  }

  while (
    memoryTimestamps.length > 0 &&
    memoryTimestamps[0]! < now - WINDOW_MS
  ) {
    memoryTimestamps.shift();
  }
  if (memoryTimestamps.length >= MAX_REQUESTS) {
    const oldest = memoryTimestamps[0]!;
    const retryAfterMs = oldest + WINDOW_MS - now;
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
    };
  }
  memoryTimestamps.push(now);
  return { allowed: true };
}
