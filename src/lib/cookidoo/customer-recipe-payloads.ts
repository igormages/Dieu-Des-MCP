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
      };
      position: { offset: number; length: number };
    };

export type InstructionStepPayload = {
  type: "STEP";
  text: string;
  annotations?: StepAnnotation[];
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

/** Normalise une unité d’ingrédient vers codes API (`unit` / `unitText`). */
export function normalizeIngredientUnit(unit?: string | null): { unit: string; unitText: string } {
  const raw = (unit ?? "").trim();
  if (!raw) return { unit: "", unitText: "" };
  const lower = raw.toLowerCase();
  const map: Record<string, string> = {
    g: "g",
    gr: "g",
    gramme: "g",
    grammes: "g",
    kg: "kg",
    kilogramme: "kg",
    kilogrammes: "kg",
    ml: "ml",
    millilitre: "ml",
    millilitres: "ml",
    l: "l",
    litre: "l",
    litres: "l",
    cl: "cl",
    dl: "dl",
    "c. à café": "tsp",
    "c.a.c": "tsp",
    "c.à.c": "tsp",
    cac: "tsp",
    tsp: "tsp",
    "c. à soupe": "tbsp",
    "c.a.s": "tbsp",
    "c.à.s": "tbsp",
    cas: "tbsp",
    tbsp: "tbsp",
    pincée: "pinch",
    pincee: "pinch",
    pinch: "pinch",
    pièce: "piece",
    piece: "piece",
    pièces: "piece",
    pieces: "piece",
  };
  const code = map[lower] ?? raw;
  return { unit: code, unitText: code };
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
  return data;
}

function appendChip(text: string, chip: string): { text: string; offset: number; length: number } {
  const trimmed = text.replace(/\s+$/u, "");
  const prefix = trimmed.length === 0 ? "" : /[\s\u00A0]$/u.test(text) ? text : `${trimmed}\u00A0`;
  const full = `${prefix}${chip}`;
  return { text: full, offset: prefix.length, length: chip.length };
}

function findSubstringPosition(
  haystack: string,
  needle: string
): { offset: number; length: number } | null {
  if (!needle) return null;
  const offset = haystack.indexOf(needle);
  if (offset < 0) return null;
  return { offset, length: needle.length };
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
 */
export function buildIngredientLine(i: IngredientInput): IngredientPayload {
  const qtyParts: string[] = [];
  if (i.quantity !== undefined) {
    if (i.quantityMax !== undefined && i.quantityMax !== i.quantity) {
      qtyParts.push(`${i.quantity}-${i.quantityMax}`);
    } else {
      qtyParts.push(String(i.quantity));
    }
  }
  const { unit, unitText } = normalizeIngredientUnit(i.unit);
  if (unit) qtyParts.push(unitText || unit);

  const qtyPrefix = qtyParts.join(" ");
  const rest: string[] = [i.name];
  if (i.preparation) rest.push(`(${i.preparation})`);
  if (i.optional) rest.push("(facultatif)");
  const text = [qtyPrefix, ...rest].filter(Boolean).join(" ").trim();

  const item: IngredientPayload = { type: "INGREDIENT", text };
  if (i.quantity !== undefined) {
    const volumeData: VolumeAnnotation["data"] = {
      amount: i.quantity,
      unit: unit || "",
      unitText: unitText || unit || "",
    };
    if (i.quantityMax !== undefined) volumeData.amountMax = i.quantityMax;
    item.annotations = [
      {
        type: "VOLUME",
        data: volumeData,
        position: { offset: 0, length: qtyPrefix.length || String(i.quantity).length },
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

/** Index texte → payload ingrédient (pour enrichir les liens d’étapes). */
export function indexIngredientsByText(
  ingredients: IngredientPayload[]
): Map<string, IngredientPayload> {
  const map = new Map<string, IngredientPayload>();
  for (const ing of ingredients) {
    map.set(ing.text, ing);
  }
  return map;
}

function buildIngredientLinkDescription(
  linkedText: string,
  ingredientIndex?: Map<string, IngredientPayload>
): StepAnnotation & { type: "INGREDIENT" } {
  const source = ingredientIndex?.get(linkedText);
  const volume = source?.annotations?.find((a) => a.type === "VOLUME");
  if (volume) {
    return {
      type: "INGREDIENT",
      data: {
        description: {
          text: linkedText,
          annotations: [volume],
        },
      },
      position: { offset: 0, length: linkedText.length },
    };
  }
  return {
    type: "INGREDIENT",
    data: { description: linkedText },
    position: { offset: 0, length: linkedText.length },
  };
}

/**
 * Convertit nos étapes structurées vers `instructions` avec annotations
 * TTS / MODE / INGREDIENT (HAR cookidoo.fr.har août 2026).
 */
export function buildInstructionsPayload(
  steps: StepInput[],
  ingredientIndex?: Map<string, IngredientPayload>
): InstructionStepPayload[] {
  return steps.map((s) => buildOneInstruction(s, ingredientIndex));
}

function buildOneInstruction(
  step: StepInput,
  ingredientIndex?: Map<string, IngredientPayload>
): InstructionStepPayload {
  let text = step.text ?? "";
  const annotations: StepAnnotation[] = [];

  const manual = resolveManual(step);
  if (manual && hasManualContent(manual)) {
    const chip = formatTtsChip(manual);
    if (chip) {
      let pos = findSubstringPosition(text, chip);
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
      annotations.push({ type: "TTS", data, position: pos });
    }
  }

  if (step.mode) {
    const chip = formatModeChip(step.mode);
    let pos = findSubstringPosition(text, chip);
    if (!pos) {
      const appended = appendChip(text, chip);
      text = appended.text;
      pos = { offset: appended.offset, length: appended.length };
    }
    annotations.push({
      type: "MODE",
      name: step.mode.name,
      data: buildModeData(step.mode),
      position: pos,
    });
  }

  // Compat accessoire seul sans mode/manual : pas d’annotation dédiée dans le HAR ;
  // si steaming via mode.accessory c’est déjà dans MODE data.

  for (const linked of step.linkedIngredients ?? []) {
    const needle = linked.trim();
    if (!needle) continue;
    let pos = findSubstringPosition(text, needle);
    if (!pos) {
      const appended = appendChip(text, needle);
      text = appended.text;
      pos = { offset: appended.offset, length: appended.length };
    }
    const link = buildIngredientLinkDescription(needle, ingredientIndex);
    link.position = pos;
    annotations.push(link);
  }

  const out: InstructionStepPayload = { type: "STEP", text };
  if (annotations.length) out.annotations = annotations;
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
