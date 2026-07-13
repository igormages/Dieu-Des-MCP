/**
 * Décodage HTML et extraction des tuiles recettes (listes Cookidoo).
 */

export function decodeHtml(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
      String.fromCodePoint(parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&frac12;/g, "½")
    .replace(/&frac14;/g, "¼")
    .replace(/&frac34;/g, "¾")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\u00A0/g, " ");
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
  // La page rend les items « à acheter » deux fois (onglets par recette / par
  // rayon) avec le même ULID : on déduplique sur l'ID.
  const seen = new Set<string>();
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
    const id = extractShoppingItemId(block);
    const key = id ?? `text:${text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      text,
      checked: detectCheckedState(block),
      id,
    });
  }
  return items;
}

/**
 * Extrait les ingrédients ajoutés manuellement (additional-items, non liés à
 * une recette). Leur markup diffère des ingrédients de recettes : on tente
 * plusieurs stratégies (li dédié, web component, formulaire d'édition).
 */
export function extractAdditionalItems(html: string): ShoppingListHtmlItem[] {
  const items: ShoppingListHtmlItem[] = [];
  const seen = new Set<string>();

  const push = (block: string, id: string | null) => {
    let text = decodeHtml(
      block
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    );
    if (!text) {
      // Item éditable : le nom peut n'exister que dans la value d'un input.
      const value = block.match(/<input[^>]*\bvalue="([^"]+)"/i)?.[1];
      if (value?.trim()) text = decodeHtml(value.trim());
    }
    const resolvedId = id ?? extractShoppingItemId(block);
    const key = resolvedId ?? `text:${text}`;
    if (!text || seen.has(key)) return;
    seen.add(key);
    items.push({ text, checked: detectCheckedState(block), id: resolvedId });
  };

  // Stratégie 1 : li dont la classe mentionne "additional".
  for (const m of html.matchAll(
    /<li\b[^>]*class="[^"]*additional[^"]*"[^>]*>[\s\S]*?<\/li>/gi
  )) {
    push(m[0], null);
  }
  // Stratégie 2 : web component dédié.
  if (items.length === 0) {
    for (const m of html.matchAll(
      /<([a-z]+-additional-item[a-z-]*)\b[\s\S]*?<\/\1>/gi
    )) {
      push(m[0], null);
    }
  }
  // Stratégie 3 : formulaires d'édition additional-item/{id}/edit — le nom est
  // dans un input value ou le texte du bloc.
  if (items.length === 0) {
    for (const m of html.matchAll(
      /<form\b[^>]*additional-item\/(01[0-9A-HJKMNP-TV-Z]{24})[^>]*>([\s\S]*?)<\/form>/gi
    )) {
      const id = m[1];
      const inner = m[2];
      const nameValue =
        inner.match(/<input[^>]*name="name"[^>]*value="([^"]*)"/i)?.[1] ??
        inner.match(/<input[^>]*value="([^"]*)"[^>]*name="name"/i)?.[1];
      const block = m[0];
      if (nameValue) {
        const key = id;
        if (!seen.has(key) && nameValue.trim()) {
          seen.add(key);
          items.push({
            text: decodeHtml(nameValue.trim()),
            checked: detectCheckedState(block),
            id,
          });
        }
      } else {
        push(block, id);
      }
    }
  }
  return items;
}

/**
 * Échantillon brut autour de la première occurrence d'"additional-item" dans le
 * HTML, pour diagnostiquer le markup des items manuels sans redéployer.
 */
export function sampleAdditionalItemHtml(html: string, window = 2500): string | null {
  const idx = html.indexOf("additional-item");
  if (idx === -1) return null;
  return html
    .slice(Math.max(0, idx - window / 2), idx + window)
    .replace(/\s+/g, " ");
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
