/**
 * Corps JSON pour PATCH /created-recipes/{lang}/{id} (ingrédients + étapes Thermomix).
 */

/**
 * Convertit nos groupes d'ingrédients structurés vers le body PATCH `ingredients`.
 *
 * Vérifié par smoke test sur l’API réelle (mai 2026) : le `oneOf` ne reconnaît
 * **que** `{ type: "INGREDIENT", text: string }` pour chaque entrée du tableau.
 */
export function buildIngredientsPayload(
  groups: Array<{
    name?: string;
    ingredients: Array<{
      name: string;
      quantity?: number;
      unit?: string;
      preparation?: string;
      optional?: boolean;
    }>;
  }>
): Array<{ type: "INGREDIENT"; text: string }> {
  const items: Array<{ type: "INGREDIENT"; text: string }> = [];
  for (const g of groups) {
    if (g.name?.trim()) items.push({ type: "INGREDIENT", text: g.name.trim() });
    for (const i of g.ingredients) {
      const parts: string[] = [];
      if (i.quantity !== undefined) parts.push(String(i.quantity));
      if (i.unit) parts.push(i.unit);
      parts.push(i.name);
      if (i.preparation) parts.push(`(${i.preparation})`);
      if (i.optional) parts.push("(facultatif)");
      items.push({ type: "INGREDIENT", text: parts.join(" ") });
    }
  }
  return items;
}

/**
 * Convertit nos étapes structurées vers le format attendu par PATCH /created-recipes/{lang}/{id}.
 * Les annotations MODE exigent `name` + `position` (validation API Cookidoo).
 */
function stepHasThermomixSettings(s: {
  time?: number;
  temperature?: number | "Varoma" | "Ebullition";
  speed?: number | "Mijotage" | "Petrir";
  direction?: "normal" | "reverse";
  accessory?: string;
}): boolean {
  if (s.time !== undefined && s.time !== null) return true;
  if (s.temperature !== undefined && s.temperature !== null) return true;
  if (s.speed !== undefined && s.speed !== null) return true;
  if (s.direction !== undefined && s.direction !== null) return true;
  if (s.accessory !== undefined && s.accessory !== null && String(s.accessory).trim() !== "")
    return true;
  return false;
}

function inferThermomixModeName(s: {
  temperature?: number | "Varoma" | "Ebullition";
  speed?: number | "Mijotage" | "Petrir";
}): string {
  if (s.speed === "Petrir") return "KNEAD";
  if (s.speed === "Mijotage") return "COOK";
  if (s.temperature === "Varoma" || s.temperature === "Ebullition") return "STEAM";
  if (typeof s.speed === "number" && s.speed >= 8) return "TURBO";
  return "COOK";
}

export function buildInstructionsPayload(
  steps: Array<{
    text: string;
    time?: number;
    temperature?: number | "Varoma" | "Ebullition";
    speed?: number | "Mijotage" | "Petrir";
    direction?: "normal" | "reverse";
    accessory?: string;
  }>
): Array<{
  type: "STEP";
  text: string;
  annotations?: Array<{
    type: "MODE";
    name: string;
    position: { offset: number; length: number };
    data: Record<string, unknown>;
  }>;
}> {
  return steps.map((s) => {
    const hasSettings = stepHasThermomixSettings(s);
    const step: ReturnType<typeof buildInstructionsPayload>[number] = {
      type: "STEP",
      text: s.text,
    };
    if (hasSettings) {
      const textLen = s.text.length;
      step.annotations = [
        {
          type: "MODE",
          name: inferThermomixModeName(s),
          position: { offset: 0, length: textLen },
          data: {
            time: s.time ?? null,
            temperature: s.temperature ?? null,
            speed: s.speed ?? null,
            direction: s.direction ?? null,
            accessory: s.accessory ?? null,
            pulseCount: null,
            pulseCountMax: null,
            power: null,
          },
        },
      ];
    }
    return step;
  });
}
