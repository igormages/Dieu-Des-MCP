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

export interface ShoppingListHtmlItem {
  text: string;
  /** true = coché (possédé), false = à acheter, null = état non détectable dans le HTML. */
  checked: boolean | null;
  /** ID de l'ingrédient/item (ULID) si présent dans le markup — utilisable avec les outils owned-ingredients / additional-item. */
  id: string | null;
}

/** ULID Cookidoo (Crockford base32, 26 caractères commençant par 01). */
const ULID_REGEX = /\b(01[0-9A-HJKMNP-TV-Z]{24})\b/;

function detectCheckedState(block: string): boolean | null {
  // 1. Attribut checked / aria-checked sur la checkbox de l'item.
  const checkboxTags =
    block.match(/<(?:input|core-checkbox|pm-checkbox)\b[^>]*>/gi) ?? [];
  for (const tag of checkboxTags) {
    if (/\schecked(?:\s|=|\/|>)/i.test(tag) || /aria-checked="true"/i.test(tag)) {
      return true;
    }
  }
  if (/aria-checked="true"/i.test(block)) return true;
  // 2. Modificateurs BEM / classes d'état sur le li ou ses enfants.
  if (
    /class="[^"]*(?:--checked|--owned|--done|--striked|--strikethrough|is-checked|is-owned)[^"]*"/i.test(
      block
    )
  ) {
    return true;
  }
  // 3. Attributs data-* explicites.
  if (/data-(?:is-)?owned="true"/i.test(block)) return true;
  if (/data-(?:is-)?owned="false"/i.test(block)) return false;
  // 4. Une checkbox existe mais sans aucun marqueur "coché" → non coché.
  if (checkboxTags.length > 0 || /aria-checked="false"/i.test(block)) return false;
  return null;
}

function extractShoppingItemId(block: string): string | null {
  return (
    block.match(/data-(?:ingredient-|item-)?id="([^"]+)"/i)?.[1] ??
    block.match(ULID_REGEX)?.[1] ??
    null
  );
}

/**
 * Extrait les items de la liste de courses depuis le HTML server-rendered de
 * `/shopping/<lang>`, avec leur état coché/décoché et leur ID quand disponibles.
 */
export function extractShoppingListItems(html: string): ShoppingListHtmlItem[] {
  const items: ShoppingListHtmlItem[] = [];
  const liRegex =
    /<li\b[^>]*class="[^"]*pm-check-group__list-item[^"]*"[^>]*>[\s\S]*?<\/li>/g;
  for (const m of html.matchAll(liRegex)) {
    const block = m[0];
    const text = decodeHtml(
      block
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    );
    if (!text) continue;
    items.push({
      text,
      checked: detectCheckedState(block),
      id: extractShoppingItemId(block),
    });
  }
  return items;
}

/**
 * Renvoie les premiers blocs `<li>` bruts de la liste de courses (tronqués),
 * pour diagnostiquer un HTML dont la structure ne correspond plus au parsing.
 */
export function sampleShoppingListBlocks(html: string, count = 2, maxLen = 1500): string[] {
  const liRegex =
    /<li\b[^>]*class="[^"]*pm-check-group__list-item[^"]*"[^>]*>[\s\S]*?<\/li>/g;
  const samples: string[] = [];
  for (const m of html.matchAll(liRegex)) {
    samples.push(m[0].replace(/\s+/g, " ").slice(0, maxLen));
    if (samples.length >= count) break;
  }
  return samples;
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
