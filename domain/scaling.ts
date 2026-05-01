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
const UNIT_ALIASES: Record<string, string[]> = {
  g: ['g', 'gram', 'grams'],
  kg: ['kg', 'kilogram', 'kilograms'],
  ml: ['ml', 'milliliter', 'milliliters', 'millilitre', 'millilitres'],
  l: ['l', 'liter', 'liters', 'litre', 'litres'],
  tsp: ['tsp', 'teaspoon', 'teaspoons'],
  tbsp: ['tbsp', 'tbs', 'tablespoon', 'tablespoons'],
  cup: ['cup', 'cups'],
  x: ['x'],
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatNumericQuantity(quantity: number): string {
  if (Number.isInteger(quantity)) {
    return String(quantity);
  }
  return String(Number(quantity.toFixed(2)));
}

function hasUnitAdjacentToPlaceholder(
  instruction: string,
  placeholder: string,
  unit: string
): boolean {
  const normalizedUnit = unit.trim().toLowerCase();
  if (!normalizedUnit) return false;
  const aliases = UNIT_ALIASES[normalizedUnit] ?? [normalizedUnit];
  const escapedPlaceholder = escapeRegExp(placeholder);
  const separatorPattern = String.raw`[\s\-–—(){}\[\],.:;]*`;

  return aliases.some((alias) => {
    const token = escapeRegExp(alias);
    const afterPattern = new RegExp(
      `${escapedPlaceholder}${separatorPattern}${token}(?=$|\\s|[\\],.:;!?])`,
      'i'
    );
    const beforePattern = new RegExp(
      `(^|\\s|[\\[(,])${token}${separatorPattern}${escapedPlaceholder}`,
      'i'
    );
    return afterPattern.test(instruction) || beforePattern.test(instruction);
  });
}

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
  if (ingredient.amountMode === 'to_taste') return 0;
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

export function formatQuantity(
  quantity: number,
  unit: string | null
): string {
  const rounded = formatNumericQuantity(quantity);
  return unit ? `${rounded} ${unit}` : rounded;
}

export function formatIngredientAmount(
  ingredient: Ingredient,
  baseServings: number,
  currentServings: number
): string {
  if (ingredient.amountMode === 'to_taste') {
    return 'to taste';
  }
  const quantity = scaleForIngredient(ingredient, baseServings, currentServings);
  return formatQuantity(quantity, ingredient.unit);
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
    const hasAdjacentUnit =
      !!sq.unit && hasUnitAdjacentToPlaceholder(text, sq.placeholder, sq.unit);
    const replacement = hasAdjacentUnit
      ? formatNumericQuantity(scaled)
      : formatQuantity(scaled, sq.unit || null);
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
      const qty = formatIngredientAmount(i, baseServings, currentServings);
      const notes = i.notes ? ` (${i.notes})` : '';
      const hint = !i.scalable && i.amountMode !== 'to_taste' ? ' [adjust to taste]' : '';
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
