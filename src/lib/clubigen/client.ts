import Parser from "rss-parser";
import { takeClubigenRssSlot } from "./rate-limit";

const DEFAULT_FEED_URL = "https://rss.clubigen.fr/31026";

export interface ClubigenArticle {
  title: string | undefined;
  link: string | undefined;
  pubDate: string | undefined;
  contentSnippet: string | undefined;
  guid: string | undefined;
}

export async function fetchClubigenArticles(options: {
  limit?: number;
}): Promise<{ articles: ClubigenArticle[]; feedTitle?: string }> {
  const slot = await takeClubigenRssSlot();
  if (!slot.allowed) {
    throw new Error(
      `Limite Clubigen RSS atteinte (10 requêtes / 5 min). Réessayez dans ${slot.retryAfterSeconds} s.`
    );
  }

  const url = process.env.CLUBIGEN_RSS_URL ?? DEFAULT_FEED_URL;
  const parser = new Parser();

  try {
    const feed = await parser.parseURL(url);
    const limit = options.limit ?? 50;
    const items = (feed.items ?? []).slice(0, limit);
    const articles: ClubigenArticle[] = items.map((item) => ({
      title: item.title,
      link: item.link,
      pubDate: item.pubDate,
      contentSnippet: item.contentSnippet,
      guid: item.guid,
    }));

    return { articles, feedTitle: feed.title };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    throw new Error(`Échec lecture flux Clubigen RSS : ${message}`);
  }
}
