import Parser from "rss-parser";
import { takeClubigenRssSlot } from "./rate-limit";

const DEFAULT_FEED_URL = "https://rss.clubigen.fr/31026";

type FeedItem = {
  title?: string;
  link?: string;
  pubDate?: string;
  content?: string;
  "content:encoded"?: string;
  guid?: string;
  categories?: string[];
  author?: string;
  creator?: string;
  isoDate?: string;
};

export interface ClubigenArticle {
  title: string | undefined;
  link: string | undefined;
  pubDate: string | undefined;
  isoDate: string | undefined;
  content: string | undefined;
  author: string | undefined;
  categories: string[] | undefined;
  guid: string | undefined;
}

export async function fetchClubigenArticles(options: {
  limit?: number;
}): Promise<{ articles: ClubigenArticle[]; feedTitle?: string; feedDescription?: string }> {
  const slot = await takeClubigenRssSlot();
  if (!slot.allowed) {
    throw new Error(
      `Limite Clubigen RSS atteinte (10 requêtes / 5 min). Réessayez dans ${slot.retryAfterSeconds} s.`
    );
  }

  const url = process.env.CLUBIGEN_RSS_URL ?? DEFAULT_FEED_URL;
  const parser = new Parser<object, FeedItem>({
    customFields: {
      item: [["content:encoded", "content:encoded"]],
    },
  });

  try {
    const feed = await parser.parseURL(url);
    const limit = options.limit ?? 50;
    const items = (feed.items ?? []).slice(0, limit) as FeedItem[];
    const articles: ClubigenArticle[] = items.map((item) => ({
      title: item.title,
      link: item.link,
      pubDate: item.pubDate,
      isoDate: item.isoDate,
      // content:encoded contient le HTML complet ; content est le fallback
      content: item["content:encoded"] ?? item.content,
      author: item.author ?? item.creator,
      categories: item.categories,
      guid: item.guid,
    }));

    return { articles, feedTitle: feed.title, feedDescription: (feed as { description?: string }).description };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    throw new Error(`Échec lecture flux Clubigen RSS : ${message}`);
  }
}
