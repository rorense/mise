import type { Ingredient, Step } from '@/types/recipe';

const COUNTABLE_UNITS = new Set(
  [
    '',
    'piece',
    'pieces',
    'whole',
    'clove',
    'cloves',
    'leaf',
    'leaves',
    'sprig',
    'sprigs',
    'strip',
    'strips',
  ].map((u) => u.toLowerCase())
);

const EGG_PATTERN = /egg/i;

export function scaleQuantity(
  baseQty: number,
  baseServings: number,
  currentServings: number
): number {
  if (baseServings <= 0) return baseQty;
  const raw = (baseQty / baseServings) * currentServings;
  return Math.round(raw * 10) / 10;
}

export function scaleForIngredient(
  ingredient: Ingredient,
  baseServings: number,
  currentServings: number
): number {
  if (!ingredient.scalable) return ingredient.quantity;
  let q = scaleQuantity(ingredient.quantity, baseServings, currentServings);
  const u = ingredient.unit?.toLowerCase() ?? '';
  if (
    COUNTABLE_UNITS.has(u) ||
    ((u === null || u === '') && EGG_PATTERN.test(ingredient.name))
  ) {
    q = Math.max(0, Math.round(q));
  }
  return q;
}

export function friendlySmallAmount(
  quantity: number,
  unit: string | null
): string | null {
  const u = unit?.toLowerCase() ?? '';
  if (quantity > 0 && quantity < 0.5 && (u === 'ml' || u === '')) {
    return 'a few drops';
  }
  if (quantity > 0 && quantity <= 0.25 && (u === 'tsp' || u === 'teaspoon')) {
    return 'a pinch';
  }
  if (quantity > 0 && quantity < 0.05 && u === 'g') {
    return 'a pinch';
  }
  return null;
}

export function formatQuantity(quantity: number, unit: string | null): string {
  const friendly = friendlySmallAmount(quantity, unit);
  if (friendly) return friendly;
  const rounded = Number.isInteger(quantity) ? String(quantity) : String(quantity);
  return unit ? `${rounded} ${unit}` : rounded;
}

export function renderStepInstruction(
  step: Step,
  baseServings: number,
  currentServings: number
): string {
  let text = step.instruction;
  for (const sq of step.scalableQuantities) {
    const scaled =
      Math.round(scaleQuantity(sq.baseQuantity, baseServings, currentServings) * 10) /
      10;
    const replacement = formatQuantity(scaled, sq.unit || null);
    text = text.split(sq.placeholder).join(replacement);
  }
  return text;
}

export function buildChatIngredientLines(
  ingredients: Ingredient[],
  baseServings: number,
  currentServings: number
): string {
  return ingredients
    .map((i) => {
      const q = scaleForIngredient(i, baseServings, currentServings);
      const qty = formatQuantity(q, i.unit);
      const notes = i.notes ? ` (${i.notes})` : '';
      const hint = !i.scalable ? ' [adjust to taste]' : '';
      return `- ${qty} ${i.name}${notes}${hint}`;
    })
    .join('\n');
}

export function buildSystemPrompt(
  recipeTitle: string,
  baseServings: number,
  currentServings: number,
  ingredientsBlock: string,
  stepsBlock: string
): string {
  return `You are a helpful cooking assistant. The user is cooking this recipe:

Title: ${recipeTitle}
Servings: ${currentServings} (recipe written for ${baseServings})

Ingredients:
${ingredientsBlock}

Steps:
${stepsBlock}

Answer questions about this recipe concisely and practically. All measurements should remain in metric.`;
}
