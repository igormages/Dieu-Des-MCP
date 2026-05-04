/**
 * Corps JSON pour PATCH /created-recipes/{lang}/{id} (ingrédients + étapes Thermomix).
 *
 * Les annotations `{ type: "MODE", name, position, data }` sont rejetées par l’API web
 * (mai 2026 : enums `type` / `name` non reconnus). Le format attendu pour les réglages TM
 * est celui documenté pour les recettes perso : étapes `STEP` avec champs optionnels
 * `time`, `temperature`, `speed`, etc. au même niveau que `text` (voir cookidoo-api /
 * InstructionJSON côté Vorwerk).
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

export type InstructionStepPayload = {
  type: "STEP";
  text: string;
  time?: number;
  temperature?: number | "Varoma" | "Ebullition";
  speed?: number | "Mijotage" | "Petrir";
  direction?: "normal" | "reverse";
  accessory?: string;
};

/**
 * Convertit nos étapes structurées vers le tableau `instructions` du PATCH.
 * Pas de bloc `annotations` / MODE : l’API Cookidoo web attend les paramètres TM sur l’étape.
 */
export function buildInstructionsPayload(
  steps: Array<{
    text: string;
    time?: number;
    temperature?: number | "Varoma" | "Ebullition";
    speed?: number | "Mijotage" | "Petrir";
    direction?: "normal" | "reverse";
    accessory?: string;
  }>
): InstructionStepPayload[] {
  return steps.map((s) => {
    const step: InstructionStepPayload = {
      type: "STEP",
      text: s.text,
    };
    if (!stepHasThermomixSettings(s)) return step;

    if (s.time !== undefined && s.time !== null) step.time = s.time;
    if (s.temperature !== undefined && s.temperature !== null) step.temperature = s.temperature;
    if (s.speed !== undefined && s.speed !== null) step.speed = s.speed;
    if (s.direction !== undefined && s.direction !== null) step.direction = s.direction;
    const acc = s.accessory?.trim();
    if (acc) step.accessory = acc;

    return step;
  });
}
