/**
 * Décodage HTML et extraction des tuiles recettes (listes Cookidoo).
 */

export function decodeHtml(s: string): string {
  return s
    .replace(/&#39;/g, "'")
    .replace(/&#34;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#xA0;/g, " ")
    .replace(/&nbsp;/g, " ");
}

function extractTileImageFromBlock(blockHtml: string): string | null {
  return (
    blockHtml.match(/data-src="([^"]+)"/)?.[1] ??
    blockHtml.match(/<img[^>]+src="([^"]+)"/)?.[1] ??
    null
  );
}

/**
 * Extrait les tuiles liste type « Mes créations » / favoris.
 * Sur `/created-recipes/{lang}`, Cookidoo utilise `id="cr-{ULID}"` sans `data-recipe-id`
 * (les recettes officielles gardent `data-recipe-id="r…"`).
 */
export function extractAllRecipeTiles(html: string): Array<{
  id: string;
  title: string;
  image: string | null;
  duration: string | null;
}> {
  type Tile = { id: string; title: string; image: string | null; duration: string | null };
  const tiles: Tile[] = [];
  const seen = new Set<string>();

  function pushTile(id: string, title: string, block: string, duration: string | null) {
    if (seen.has(id)) return;
    seen.add(id);
    tiles.push({
      id,
      title,
      image: extractTileImageFromBlock(block),
      duration,
    });
  }

  const legacyRegex =
    /<core-tile[^>]+data-recipe-id="(r\d+|[A-Z0-9]+)"[\s\S]*?<p class="core-tile__description-text">([\s\S]*?)<\/p>[\s\S]*?(?:<p class="core-tile__description-subline">([\s\S]*?)<\/p>)?[\s\S]*?<\/core-tile>/g;
  for (const match of html.matchAll(legacyRegex)) {
    const block = match[0];
    const id = match[1];
    const title = decodeHtml(match[2].trim());
    const duration = match[3] ? decodeHtml(match[3].trim()) : null;
    pushTile(id, title, block, duration);
  }

  const customerRegex =
    /<core-tile[^>]*\bid="cr-(01[A-Za-z0-9]{24})"[^>]*>[\s\S]*?<p class="core-tile__description-text">([\s\S]*?)<\/p>[\s\S]*?(?:<p class="core-tile__description-subline">([\s\S]*?)<\/p>)?[\s\S]*?<\/core-tile>/g;
  for (const match of html.matchAll(customerRegex)) {
    const block = match[0];
    const id = match[1];
    const title = decodeHtml(match[2].trim());
    const duration = match[3] ? decodeHtml(match[3].trim()) : null;
    pushTile(id, title, block, duration);
  }

  return tiles;
}
