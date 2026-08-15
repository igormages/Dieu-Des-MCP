/** ULID recette perso Cookidoo (26 caractères, préfixe 01). */
export function isCookidooCustomerRecipeId(id: string): boolean {
  return /^01[A-Za-z0-9]{24}$/.test(id.trim());
}

const YIELD_UNITS = new Set([
  "portion",
  "piece",
  "glass",
  "gram",
  "jar",
  "litre",
  "ounce",
  "slice",
  "cup",
  "bottle",
]);

/**
 * `unitText` du PATCH `yield` : ensemble fermé côté Cookidoo.
 */
export function normalizeCookidooYieldUnitText(userUnit?: string | null): string {
  const raw = (userUnit ?? "").trim().toLowerCase();
  if (!raw || raw === "portions" || raw === "personnes" || raw === "personne" || raw === "pers")
    return "portion";
  if (
    raw === "morceaux" ||
    raw === "morceau" ||
    raw === "pièces" ||
    raw === "pièce" ||
    raw === "pieces"
  )
    return "piece";
  if (raw === "verres" || raw === "verre") return "glass";
  if (raw === "grammes" || raw === "gramme" || raw === "g") return "gram";
  if (raw === "bocaux" || raw === "bocal") return "jar";
  if (raw === "litres" || raw === "liter" || raw === "liters" || raw === "l") return "litre";
  if (raw === "onces" || raw === "once" || raw === "oz") return "ounce";
  if (raw === "tranches" || raw === "tranche" || raw === "slices") return "slice";
  if (raw === "tasses" || raw === "tasse" || raw === "cups") return "cup";
  if (raw === "bouteilles" || raw === "bouteille" || raw === "bottles") return "bottle";
  if (YIELD_UNITS.has(raw)) return raw;
  return (userUnit ?? "").trim() || "portion";
}

/** Icônes Private Use du bundle pl-customer-recipes (chips TTS / MODE). */
export const COOKIDOO_ICONS = {
  dough: "\uE001",
  softSpeed: "\uE002",
  reverse: "\uE003",
  steaming: "\uE008",
  turbo: "\uE00B",
  riceCooker: "\uE00D",
  warmUp: "\uE019",
  blend: "\uE01E",
  browning: "\uE026",
} as const;

export type CookidooModeName =
  | "dough"
  | "browning"
  | "turbo"
  | "steaming"
  | "blend"
  | "warm_up"
  | "rice_cooker";

export type VolumeAnnotation = {
  type: "VOLUME";
  data: {
    amount: number;
    /** Toujours émis côté écriture (= `amount` sans fourchette). */
    amountMax?: number;
    unit: string;
    unitText: string;
  };
  position: { offset: number; length: number };
};

export type IngredientPayload = {
  type: "INGREDIENT";
  text: string;
  annotations?: VolumeAnnotation[];
};

export type StepAnnotation =
  | {
      type: "TTS";
      data: {
        time?: number;
        temperature?: { value: string; unit?: string };
        speed?: string;
        direction?: "CW" | "CCW";
      };
      position: { offset: number; length: number };
    }
  | {
      type: "MODE";
      name: CookidooModeName;
      data: Record<string, unknown>;
      position: { offset: number; length: number };
    }
  | {
      type: "INGREDIENT";
      data: {
        description:
          | string
          | {
              text: string;
              annotations: VolumeAnnotation[];
            };
        /** Obligatoire côté éditeur : liste vide quand il n'y a pas de note. */
        notes: string[];
      };
      position: { offset: number; length: number };
    };

export type InstructionStepPayload = {
  type: "STEP";
  text: string;
  annotations?: StepAnnotation[];
  /**
   * Usages détectés mais non rattachés. On n'en émet jamais : tout ingrédient
   * lié est ancré dans le texte (sinon il est rendu en texte traînant sur TM7).
   */
  missedUsages: never[];
};

export type ManualSettings = {
  time?: number;
  temperature?: number | "Varoma" | "varoma" | "Ebullition" | "OFF";
  speed?: number | "soft" | "Mijotage" | "Petrir";
  direction?: "CW" | "CCW" | "normal" | "reverse";
};

export type ModeSettings = {
  name: CookidooModeName;
  time?: number;
  temperature?: number | "Varoma" | "varoma" | "OFF";
  speed?: number | "soft";
  direction?: "CW" | "CCW" | "normal" | "reverse";
  accessory?: string;
  power?: string;
  pulseCount?: number;
};

export type IngredientInput = {
  name: string;
  quantity?: number;
  quantityMax?: number;
  unit?: string;
  preparation?: string;
  optional?: boolean;
};

export type StepInput = {
  text: string;
  linkedIngredients?: string[];
  manual?: ManualSettings;
  mode?: ModeSettings;
  /** Compat anciens champs plats → mappés vers `manual` (TTS). */
  time?: number;
  temperature?: number | "Varoma" | "Ebullition";
  speed?: number | "Mijotage" | "Petrir" | "soft";
  direction?: "normal" | "reverse" | "CW" | "CCW";
  accessory?: string;
};

const MODE_LABELS_FR: Record<CookidooModeName, string> = {
  dough: "Pétrin",
  browning: "Rissoler",
  turbo: "Turbo",
  steaming: "Cuisson vapeur",
  blend: "Mixage",
  warm_up: "Réchauffer",
  rice_cooker: "Rice cooker",
};

const MODE_ICONS: Record<CookidooModeName, string> = {
  dough: COOKIDOO_ICONS.dough,
  browning: COOKIDOO_ICONS.browning,
  turbo: COOKIDOO_ICONS.turbo,
  steaming: COOKIDOO_ICONS.steaming,
  blend: COOKIDOO_ICONS.blend,
  warm_up: COOKIDOO_ICONS.warmUp,
  rice_cooker: COOKIDOO_ICONS.riceCooker,
};

/**
 * Unité par défaut quand une quantité est fournie sans unité.
 *
 * Cookidoo répond `500 unexpectederrors` sur le PATCH dès qu'une annotation
 * VOLUME porte une unité vide : une quantité nue doit donc toujours être
 * comptée en pièces.
 */
export const DEFAULT_INGREDIENT_UNIT = "piece";

/** Code API → notation affichée (référentiel éditeur fr-FR). */
const UNIT_NOTATIONS_FR: Record<string, string> = {
  g: "g",
  kg: "kg",
  mg: "mg",
  ml: "ml",
  cl: "cl",
  dl: "dl",
  l: "l",
  tsp: "c. à café",
  tbsp: "c. à soupe",
  pinch: "pincée",
  piece: "pièce",
};

const UNIT_ALIASES: Record<string, string> = {
  g: "g",
  gr: "g",
  gramme: "g",
  grammes: "g",
  mg: "mg",
  kg: "kg",
  kilo: "kg",
  kilos: "kg",
  kilogramme: "kg",
  kilogrammes: "kg",
  ml: "ml",
  millilitre: "ml",
  millilitres: "ml",
  l: "l",
  litre: "l",
  litres: "l",
  liter: "l",
  liters: "l",
  cl: "cl",
  dl: "dl",
  "c. à café": "tsp",
  "c. a café": "tsp",
  "c. a cafe": "tsp",
  "cuillère à café": "tsp",
  "cuillere a cafe": "tsp",
  "c.a.c": "tsp",
  "c.à.c": "tsp",
  cac: "tsp",
  tsp: "tsp",
  "c. à soupe": "tbsp",
  "c. a soupe": "tbsp",
  "cuillère à soupe": "tbsp",
  "cuillere a soupe": "tbsp",
  "c.a.s": "tbsp",
  "c.à.s": "tbsp",
  cas: "tbsp",
  tbsp: "tbsp",
  pincée: "pinch",
  pincee: "pinch",
  pincées: "pinch",
  pinch: "pinch",
  pièce: "piece",
  piece: "piece",
  pièces: "piece",
  pieces: "piece",
  morceau: "piece",
  morceaux: "piece",
};

/**
 * Normalise une unité d’ingrédient : `unit` = code API, `unitText` = notation
 * affichée dans la ligne d’ingrédient et sur la puce de pesée (fr-FR).
 * Une unité inconnue est transmise telle quelle sur les deux champs.
 */
export function normalizeIngredientUnit(unit?: string | null): { unit: string; unitText: string } {
  const raw = (unit ?? "").trim();
  if (!raw) return { unit: "", unitText: "" };
  const code = UNIT_ALIASES[raw.toLowerCase()] ?? raw;
  return { unit: code, unitText: UNIT_NOTATIONS_FR[code] ?? code };
}

export function formatCookidooTime(seconds: number): string {
  const t = Math.max(0, Math.floor(seconds));
  const min = Math.floor(t / 60);
  const sec = t % 60;
  const parts: string[] = [];
  if (min) parts.push(`${min} min`);
  if (sec) parts.push(`${sec} sec`);
  return parts.join(" ").trim() || "0 sec";
}

function normalizeDirection(
  direction?: ManualSettings["direction"]
): "CW" | "CCW" | undefined {
  if (!direction) return undefined;
  if (direction === "reverse" || direction === "CCW") return "CCW";
  if (direction === "normal" || direction === "CW") return "CW";
  return undefined;
}

function normalizeSpeed(speed?: ManualSettings["speed"]): string | undefined {
  if (speed === undefined || speed === null) return undefined;
  if (speed === "soft" || speed === "Mijotage") return "soft";
  if (speed === "Petrir") return "soft";
  return String(speed);
}

function buildTemperatureData(
  temperature?: ManualSettings["temperature"]
): { value: string; unit?: string } | undefined {
  if (temperature === undefined || temperature === null) return undefined;
  if (temperature === "Varoma" || temperature === "varoma") return { value: "varoma" };
  if (temperature === "Ebullition") return { value: "100", unit: "C" };
  if (temperature === "OFF") return { value: "OFF" };
  return { value: String(temperature), unit: "C" };
}

function formatTemperatureChip(temp: { value: string; unit?: string }): string {
  if (temp.value === "varoma") return "Varoma";
  if (temp.value === "OFF") return "ARRÊT";
  if (temp.unit === "C" || !temp.unit) return `${temp.value}°C`;
  return `${temp.value}°${temp.unit}`;
}

function formatSpeedChip(speed: string): string {
  if (speed === "soft") return `vitesse ${COOKIDOO_ICONS.softSpeed}`;
  return `vitesse ${speed}`;
}

/** Chip texte TTS (FR), aligné sur le HAR / pl-customer-recipes. */
export function formatTtsChip(manual: ManualSettings): string {
  const parts: string[] = [];
  if (manual.time !== undefined && manual.time !== null) {
    parts.push(formatCookidooTime(manual.time));
  }
  const temp = buildTemperatureData(manual.temperature);
  if (temp) parts.push(formatTemperatureChip(temp));
  const dir = normalizeDirection(manual.direction);
  if (dir === "CCW") parts.push(COOKIDOO_ICONS.reverse);
  const speed = normalizeSpeed(manual.speed);
  if (speed) parts.push(formatSpeedChip(speed));
  return parts.filter(Boolean).join("/");
}

function formatModeChip(mode: ModeSettings): string {
  const label = MODE_LABELS_FR[mode.name];
  const icon = MODE_ICONS[mode.name];
  switch (mode.name) {
    case "dough":
      return mode.time !== undefined
        ? `${label} ${icon}/${formatCookidooTime(mode.time)}`
        : `${label} ${icon}`;
    case "rice_cooker":
      return `${label} ${icon}`;
    case "browning":
      return `${label} ${icon}`;
    case "turbo":
      return mode.time !== undefined
        ? `${label} ${icon}/${formatCookidooTime(mode.time)}`
        : `${label} ${icon}`;
    case "steaming":
      return mode.time !== undefined
        ? `${label} ${icon}/${formatCookidooTime(mode.time)}`
        : `${label} ${icon}`;
    case "blend":
      return mode.time !== undefined
        ? `${label} ${icon}/${formatCookidooTime(mode.time)}`
        : `${label} ${icon}`;
    case "warm_up": {
      const temp = buildTemperatureData(mode.temperature);
      return temp
        ? `${label} ${icon}/${formatTemperatureChip(temp)}`
        : `${label} ${icon}`;
    }
    default:
      return `${label} ${icon}`;
  }
}

type ModeDataKey =
  | "time"
  | "temperature"
  | "speed"
  | "direction"
  | "accessory"
  | "power"
  | "pulseCount";

/**
 * Contrat `data` de chaque MODE, relevé sur les 400 `validationError` de
 * l'API (le `oneOf` a une branche par mode, avec ses `required`).
 *
 * `defaults` ne couvre que les valeurs figées par le programme machine
 * (vapeur = vitesse 1 / sens horaire / Varoma, rissoler = 160 °C, turbo =
 * impulsion d'1 s) : elles sont sûres à compléter. Les champs qui portent
 * l'intention de l'utilisateur (durée, température de réchauffage) restent
 * exigés, avec une erreur explicite plutôt qu'un 400 opaque.
 */
const MODE_CONTRACTS: Record<
  CookidooModeName,
  { required: ModeDataKey[]; defaults?: Partial<ModeSettings> }
> = {
  dough: { required: ["time"] },
  rice_cooker: { required: [] },
  blend: { required: ["time", "speed"], defaults: { speed: 5 } },
  browning: {
    required: ["time", "temperature", "power"],
    defaults: { temperature: 160, power: "Gentle" },
  },
  warm_up: { required: ["time", "temperature", "speed"], defaults: { speed: 1 } },
  turbo: { required: ["time", "pulseCount"], defaults: { time: 1, pulseCount: 1 } },
  steaming: {
    required: ["time", "speed", "direction", "accessory"],
    defaults: { speed: 1, direction: "CW", accessory: "Varoma" },
  },
};

/** Applique les valeurs figées du programme machine avant sérialisation. */
export function withModeDefaults(mode: ModeSettings): ModeSettings {
  return { ...MODE_CONTRACTS[mode.name]?.defaults, ...mode };
}

function buildModeData(mode: ModeSettings): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  if (mode.time !== undefined) data.time = mode.time;
  const temp = buildTemperatureData(mode.temperature);
  if (temp) data.temperature = temp;
  const speed = normalizeSpeed(mode.speed);
  if (speed) data.speed = speed;
  const dir = normalizeDirection(mode.direction);
  if (dir && mode.name === "steaming") data.direction = dir;
  if (mode.accessory?.trim()) data.accessory = mode.accessory.trim();
  if (mode.power?.trim()) data.power = mode.power.trim();
  if (mode.pulseCount !== undefined) data.pulseCount = mode.pulseCount;

  const missing = (MODE_CONTRACTS[mode.name]?.required ?? []).filter(
    (key) => data[key] === undefined
  );
  if (missing.length) {
    throw new Error(
      `Cookidoo : le mode « ${mode.name} » exige ${missing.join(", ")} dans data. ` +
        `Renseigne ${missing.map((m) => `mode.${m}`).join(", ")} sur cette étape.`
    );
  }
  return data;
}

function appendChip(
  text: string,
  chip: string,
  separator = "\u00A0"
): { text: string; offset: number; length: number } {
  const trimmed = text.replace(/\s+$/u, "");
  const prefix =
    trimmed.length === 0 ? "" : /[\s\u00A0]$/u.test(text) ? text : `${trimmed}${separator}`;
  const full = `${prefix}${chip}`;
  return { text: full, offset: prefix.length, length: chip.length };
}

type Span = { offset: number; length: number };

function overlaps(span: Span, used: Span[]): boolean {
  const end = span.offset + span.length;
  return used.some((u) => !(end <= u.offset || span.offset >= u.offset + u.length));
}

/**
 * Replie une cha\u00EEne pour la recherche approximative : minuscules, sans accents,
 * apostrophes et espaces ins\u00E9cables uniformis\u00E9s. La transformation est faite
 * caract\u00E8re par caract\u00E8re pour pr\u00E9server les offsets du texte d\u2019origine.
 */
function fold(input: string): string {
  let out = "";
  for (const ch of input) {
    if (ch === "\u2019" || ch === "\u2018" || ch === "\u02BC") {
      out += "'";
      continue;
    }
    if (ch === "\u00A0" || ch === "\u202F") {
      out += " ";
      continue;
    }
    const stripped = ch.normalize("NFD").replace(/\p{M}+/gu, "");
    const base = stripped.length === ch.length ? stripped : ch;
    const lower = base.toLowerCase();
    out += lower.length === ch.length ? lower : base;
  }
  return out;
}

const WORD_CHAR = /[\p{L}\p{N}]/u;

/** `indexOf` sur des fronti\u00E8res de mot (les deux cha\u00EEnes sont d\u00E9j\u00E0 repli\u00E9es). */
function indexOfWord(haystack: string, needle: string, from = 0): number {
  if (!needle) return -1;
  for (let i = haystack.indexOf(needle, from); i >= 0; i = haystack.indexOf(needle, i + 1)) {
    const before = i > 0 ? haystack[i - 1] : "";
    const after = haystack[i + needle.length] ?? "";
    const startsWord = !WORD_CHAR.test(needle[0]) || !WORD_CHAR.test(before);
    // Le pluriel/la flexion sont tol\u00E9r\u00E9s en fin de mot (\u00AB poivron \u00BB \u2192 \u00AB poivrons \u00BB).
    const endsWord = !WORD_CHAR.test(needle[needle.length - 1]) || !/[\p{N}]/u.test(after);
    if (startsWord && endsWord) return i;
  }
  return -1;
}

function containsWord(haystack: string, needle: string): boolean {
  return indexOfWord(haystack, needle) >= 0;
}

/** Fin du mot commencé avant `index` (pour couvrir « poivron » → « poivrons »). */
function wordEnd(text: string, index: number): number {
  let end = index;
  while (end < text.length && WORD_CHAR.test(text[end])) end++;
  return end;
}

/** Mots portants d\u2019un nom d\u2019ingr\u00E9dient (\u00AB filet de poulet, sans peau \u00BB \u2192 poulet, filet). */
const FR_STOPWORDS = new Set([
  "de", "des", "du", "la", "le", "les", "un", "une", "et", "ou", "en", "au", "aux",
  "sans", "avec", "pour", "dans", "sur", "bien", "gros", "grosse", "petit", "petite",
  "facultatif", "environ", "type", "frais", "fraiche", "fraiches", "surgele", "surgelee",
]);

function significantWords(name: string): string[] {
  // Seuil à 3 : beaucoup d'ingrédients courants sont des mots courts (riz, ail,
  // sel, thé, jus, vin). Les faux positifs sont écartés par la recherche sur
  // frontières de mot (« sel » ne s'ancre pas dans « conseil »).
  return Array.from(new Set(fold(name).split(/[^\p{L}\p{N}]+/u)))
    .filter((w) => w.length >= 3 && !FR_STOPWORDS.has(w))
    .sort((a, b) => b.length - a.length);
}

/**
 * Localise dans `text` la mention d\u2019un ingr\u00E9dient li\u00E9. On tente la ligne
 * compl\u00E8te, le texte fourni, le libell\u00E9, le nom nu, puis les mots portants
 * du nom \u2014 d\u2019abord tel quel, puis en comparaison repli\u00E9e (accents, casse,
 * \u00E9lision \u00AB d' \u00BB / \u00AB l' \u00BB).
 */
function findIngredientAnchor(
  text: string,
  linked: string,
  entry: IngredientIndexEntry | null,
  used: Span[]
): Span | null {
  const candidates = [entry?.text, linked, entry?.label, entry?.name].filter(
    (c): c is string => Boolean(c?.trim())
  );
  // `fold` conserve la longueur caractère par caractère : les offsets trouvés
  // dans le texte replié sont directement valables sur le texte d’origine.
  const passes = [
    { haystack: text, needles: candidates.map((c) => c.trim()) },
    {
      haystack: fold(text),
      needles: [...candidates, ...significantWords(entry?.name ?? linked)].map((c) =>
        fold(c).trim()
      ),
    },
  ];
  for (const { haystack, needles } of passes) {
    for (const needle of needles) {
      if (!needle) continue;
      for (let i = indexOfWord(haystack, needle); i >= 0; i = indexOfWord(haystack, needle, i + 1)) {
        const span = { offset: i, length: wordEnd(haystack, i + needle.length) - i };
        if (!overlaps(span, used)) return span;
      }
    }
  }
  return null;
}

function findSubstringPosition(haystack: string, needle: string, used: Span[] = []): Span | null {
  if (!needle) return null;
  for (let i = haystack.indexOf(needle); i >= 0; i = haystack.indexOf(needle, i + 1)) {
    const span = { offset: i, length: needle.length };
    if (!overlaps(span, used)) return span;
  }
  return null;
}

function resolveManual(step: StepInput): ManualSettings | undefined {
  if (step.manual) return step.manual;
  const hasFlat =
    step.time !== undefined ||
    step.temperature !== undefined ||
    step.speed !== undefined ||
    step.direction !== undefined;
  if (!hasFlat) return undefined;
  return {
    time: step.time,
    temperature: step.temperature,
    speed: step.speed,
    direction: step.direction,
  };
}

/**
 * Construit une ligne INGREDIENT + annotation VOLUME si quantité fournie.
 * `position` couvre le préfixe quantité (+ unité) dans le texte.
 *
 * Une quantité sans unité tombe sur {@link DEFAULT_INGREDIENT_UNIT} : Cookidoo
 * rejette (500) tout VOLUME dont l’unité est vide.
 */
export function buildIngredientLine(i: IngredientInput): IngredientPayload {
  const hasQuantity = i.quantity !== undefined;
  const normalized = normalizeIngredientUnit(i.unit);
  const { unit, unitText } =
    hasQuantity && !normalized.unit
      ? normalizeIngredientUnit(DEFAULT_INGREDIENT_UNIT)
      : normalized;

  const qtyParts: string[] = [];
  if (hasQuantity) {
    qtyParts.push(
      i.quantityMax !== undefined && i.quantityMax !== i.quantity
        ? `${i.quantity}-${i.quantityMax}`
        : String(i.quantity)
    );
  }
  if (unit) qtyParts.push(unitText || unit);

  const qtyPrefix = qtyParts.join(" ");
  // La préparation suit le nom après une virgule, comme les lignes d’ingrédients
  // officielles (« 80 g d'emmental, coupé en morceaux ») : le TM7 la rend alors
  // sur sa propre ligne sous la puce de pesée.
  let label = i.name.trim();
  if (i.preparation?.trim()) label += `, ${i.preparation.trim()}`;
  if (i.optional) label += " (facultatif)";
  const text = [qtyPrefix, label].filter(Boolean).join(" ").trim();

  const item: IngredientPayload = { type: "INGREDIENT", text };
  if (hasQuantity) {
    item.annotations = [
      {
        type: "VOLUME",
        data: {
          amount: i.quantity as number,
          amountMax: i.quantityMax ?? (i.quantity as number),
          unit,
          unitText: unitText || unit,
        },
        position: { offset: 0, length: qtyPrefix.length },
      },
    ];
  }
  return item;
}

/**
 * Convertit nos groupes d'ingrédients structurés vers le body PATCH `ingredients`
 * avec annotations VOLUME (JS pl-customer-recipes / structured-ingredients).
 */
export function buildIngredientsPayload(
  groups: Array<{
    name?: string;
    ingredients: IngredientInput[];
  }>
): IngredientPayload[] {
  const items: IngredientPayload[] = [];
  for (const g of groups) {
    if (g.name?.trim()) items.push({ type: "INGREDIENT", text: g.name.trim() });
    for (const i of g.ingredients) {
      items.push(buildIngredientLine(i));
    }
  }
  return items;
}

export type IngredientIndexEntry = {
  item: IngredientPayload;
  /** Ligne complète, ex. « 800 g eau, tiède ». */
  text: string;
  /** Ligne sans le préfixe quantité, ex. « eau, tiède ». */
  label: string;
  /** Nom nu, sans préparation ni mention facultative, ex. « eau ». */
  name: string;
};

/** Index des lignes d’ingrédients, utilisé pour ancrer les liens d’étapes. */
export type IngredientIndex = IngredientIndexEntry[];

/**
 * Construit l’index des lignes d’ingrédients à partir du payload envoyé à
 * Cookidoo. Le préfixe quantité est retiré via la `position` de l’annotation
 * VOLUME, ce qui donne le libellé puis le nom nu utilisés pour retrouver
 * l’ingrédient cité dans une étape.
 */
export function indexIngredientsByText(ingredients: IngredientPayload[]): IngredientIndex {
  return ingredients.map((item) => {
    const volume = item.annotations?.find((a) => a.type === "VOLUME");
    const label = (
      volume ? item.text.slice(volume.position.offset + volume.position.length) : item.text
    ).trim();
    const name = label
      .split(",")[0]
      .replace(/\((?:[^()]*)\)/gu, " ")
      .trim();
    return { item, text: item.text, label, name: name || label };
  });
}

/**
 * Retrouve la ligne d’ingrédient visée par un `linkedIngredients[i]`.
 * L’API MCP accepte aussi bien le texte exact de la ligne (« 800 g eau ») que
 * le simple nom (« eau ») : on compare sur le texte, le libellé et le nom, en
 * insensible à la casse, aux accents et à la ponctuation.
 */
function resolveLinkedIngredient(
  linked: string,
  index: IngredientIndex | undefined
): IngredientIndexEntry | null {
  if (!index?.length) return null;
  const needle = fold(linked).trim();
  if (!needle) return null;

  const exact = index.find((e) => e.text === linked);
  if (exact) return exact;

  const fields = (e: IngredientIndexEntry) => [e.text, e.label, e.name];
  const equal = index.find((e) => fields(e).some((f) => fold(f).trim() === needle));
  if (equal) return equal;

  // Correspondance partielle : on garde le candidat au nom le plus long, pour
  // éviter qu'« ail » ne capture « ail des ours » (ou l'inverse).
  let best: { entry: IngredientIndexEntry; score: number } | null = null;
  for (const entry of index) {
    for (const field of fields(entry)) {
      const hay = fold(field).trim();
      if (!hay) continue;
      if (!containsWord(hay, needle) && !containsWord(needle, hay)) continue;
      // Départage en faveur d’une vraie ligne pesable plutôt qu’un titre de groupe.
      const score = Math.min(hay.length, needle.length) + (entry.item.annotations?.length ? 0.5 : 0);
      if (!best || score > best.score) best = { entry, score };
    }
  }
  return best?.entry ?? null;
}

/** Construit l’annotation d’usage d’ingrédient (puce de pesée de l’étape). */
function buildIngredientUsage(
  linkedText: string,
  entry: IngredientIndexEntry | null,
  position: { offset: number; length: number }
): Extract<StepAnnotation, { type: "INGREDIENT" }> {
  const volume = entry?.item.annotations?.find((a) => a.type === "VOLUME");
  // La description porte la ligne d’ingrédient complète (quantité + unité +
  // préparation) : c'est elle qui fait apparaître le poids sur la puce et qui
  // déclenche la balance. Sans VOLUME (ligne sans quantité), on retombe sur la
  // forme texte simple acceptée par l'éditeur.
  if (entry && volume) {
    return {
      type: "INGREDIENT",
      data: {
        description: { text: entry.text, annotations: [volume] },
        notes: [],
      },
      position,
    };
  }
  return {
    type: "INGREDIENT",
    data: { description: entry?.text ?? linkedText, notes: [] },
    position,
  };
}

/**
 * Convertit nos étapes structurées vers `instructions` avec annotations
 * TTS / MODE / INGREDIENT (HAR cookidoo.fr.har août 2026).
 */
export function buildInstructionsPayload(
  steps: StepInput[],
  ingredientIndex?: IngredientIndex
): InstructionStepPayload[] {
  return steps.map((s) => buildOneInstruction(s, ingredientIndex));
}

function buildOneInstruction(
  step: StepInput,
  ingredientIndex?: IngredientIndex
): InstructionStepPayload {
  let text = step.text ?? "";
  const annotations: StepAnnotation[] = [];
  const used: Span[] = [];

  // Les usages d’ingrédients sont ancrés en premier : les chips TTS/MODE sont
  // ajoutés en fin de texte et ne doivent pas décaler les offsets déjà posés.
  for (const linked of step.linkedIngredients ?? []) {
    const needle = linked.trim();
    if (!needle) continue;
    const entry = resolveLinkedIngredient(needle, ingredientIndex);
    let pos = findIngredientAnchor(text, needle, entry, used);
    if (!pos) {
      // Aucune occurrence : on ancre le nom en fin d’étape plutôt que de le
      // laisser en `missedUsages` (rendu en texte traînant sur TM7).
      const appended = appendChip(text, entry?.name ?? needle, " ");
      text = appended.text;
      pos = { offset: appended.offset, length: appended.length };
    }
    used.push(pos);
    annotations.push(buildIngredientUsage(needle, entry, pos));
  }

  const manual = resolveManual(step);
  if (manual && hasManualContent(manual)) {
    const chip = formatTtsChip(manual);
    if (chip) {
      let pos = findSubstringPosition(text, chip, used);
      if (!pos) {
        const appended = appendChip(text, chip);
        text = appended.text;
        pos = { offset: appended.offset, length: appended.length };
      }
      const data: Extract<StepAnnotation, { type: "TTS" }>["data"] = {};
      if (manual.time !== undefined) data.time = manual.time;
      const temp = buildTemperatureData(manual.temperature);
      if (temp) data.temperature = temp;
      const speed = normalizeSpeed(manual.speed);
      if (speed) data.speed = speed;
      const dir = normalizeDirection(manual.direction);
      if (dir === "CCW") data.direction = "CCW";
      else if (dir === "CW") {
        /* CW souvent omis dans le HAR TTS ; on l’envoie seulement si explicitement utile */
      }
      used.push(pos);
      annotations.push({ type: "TTS", data, position: pos });
    }
  }

  if (step.mode) {
    const mode = withModeDefaults(step.mode);
    const chip = formatModeChip(mode);
    let pos = findSubstringPosition(text, chip, used);
    if (!pos) {
      const appended = appendChip(text, chip);
      text = appended.text;
      pos = { offset: appended.offset, length: appended.length };
    }
    used.push(pos);
    annotations.push({
      type: "MODE",
      name: mode.name,
      data: buildModeData(mode),
      position: pos,
    });
  }

  // Compat accessoire seul sans mode/manual : pas d’annotation dédiée dans le HAR ;
  // si steaming via mode.accessory c’est déjà dans MODE data.

  const out: InstructionStepPayload = { type: "STEP", text, missedUsages: [] };
  if (annotations.length) {
    // L’éditeur envoie les annotations dans l’ordre du texte.
    out.annotations = annotations.sort((a, b) => a.position.offset - b.position.offset);
  }
  return out;
}

function hasManualContent(m: ManualSettings): boolean {
  return (
    m.time !== undefined ||
    m.temperature !== undefined ||
    m.speed !== undefined ||
    m.direction !== undefined
  );
}

/**
 * Fusionne une annotation VOLUME renvoyée par `POST …/annotate/ingredients`
 * sur une ligne INGREDIENT texte libre.
 */
export function applyAnnotatedVolume(
  item: IngredientPayload,
  volume: VolumeAnnotation | null | undefined
): IngredientPayload {
  if (!volume || volume.type !== "VOLUME") return item;
  return {
    ...item,
    annotations: [volume],
  };
}

export type AnnotateIngredientsResponseItem = {
  text?: string;
  annotations?: VolumeAnnotation[];
};

/** Réponse de `GET /created-recipes/{lang}/{id}` (tout est sous `recipeContent`). */
export type CustomerRecipeResponse = {
  recipeId?: string;
  authorId?: string;
  status?: string;
  workStatus?: string;
  createdAt?: string;
  modifiedAt?: string;
  recipeContent?: Record<string, unknown>;
};

function asTextList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => {
      if (typeof v === "string") return v;
      if (v && typeof v === "object" && typeof (v as { text?: unknown }).text === "string") {
        return (v as { text: string }).text;
      }
      return "";
    })
    .filter((s) => s.trim().length > 0);
}

function firstOf(source: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

/**
 * Normalise une recette perso au format des recettes officielles (clés
 * schema.org du JSON-LD) pour que `cookidoo_get_recipe_detail` renvoie la même
 * forme quelle que soit la source. Les clés brutes varient selon les marchés
 * (`ingredients` / `recipeIngredient`), on accepte les deux.
 */
export function normalizeCustomerRecipe(
  recipeId: string,
  body: CustomerRecipeResponse
): Record<string, unknown> {
  const content = body.recipeContent ?? {};
  const ingredients = asTextList(firstOf(content, "recipeIngredient", "ingredients"));
  const instructionsRaw = firstOf(content, "recipeInstructions", "instructions");
  const instructions = asTextList(instructionsRaw);
  const recipeYield = firstOf(content, "recipeYield", "yield");

  return {
    "@type": "Recipe",
    identifier: body.recipeId ?? recipeId,
    name: firstOf(content, "name", "recipeName", "title") ?? null,
    description: firstOf(content, "description") ?? null,
    image: firstOf(content, "image") ?? null,
    recipeYield: recipeYield ?? null,
    prepTime: firstOf(content, "prepTime") ?? null,
    totalTime: firstOf(content, "totalTime") ?? null,
    tool: firstOf(content, "tool", "tools") ?? null,
    recipeCategory: firstOf(content, "recipeCategory", "tags") ?? null,
    recipeIngredient: ingredients,
    recipeInstructions: instructions,
    /**
     * Étapes brutes quand l'API les renvoie sous forme d'objets annotés. Cette
     * vue est la projection schema.org : sur fr-FR elle ne rend que du texte,
     * la liste est alors vide plutôt que de dupliquer `recipeInstructions`.
     */
    instructionsWithAnnotations: Array.isArray(instructionsRaw)
      ? instructionsRaw.filter((s) => s !== null && typeof s === "object")
      : [],
  };
}
