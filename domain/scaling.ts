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
  if (Math.abs(quantity - Math.round(quantity)) < Number.EPSILON) {
    return String(Math.round(quantity));
  }
  return String(Number(quantity.toFixed(2)));
}

const KITCHEN_FRACTION_DENOMINATORS = [2, 3, 4, 8];
const FRACTIONAL_DISPLAY_UNITS = new Set(['tsp', 'tbsp', 'cup']);

function normalizeUnit(unit: string | null): string | null {
  if (!unit) return null;
  const normalizedUnit = unit.trim().toLowerCase();
  for (const [canonical, aliases] of Object.entries(UNIT_ALIASES)) {
    if (aliases.includes(normalizedUnit)) return canonical;
  }
  return normalizedUnit || null;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

function toKitchenFraction(quantity: number): string {
  const sign = quantity < 0 ? '-' : '';
  const abs = Math.abs(quantity);
  const whole = Math.floor(abs);
  const frac = abs - whole;
  if (frac < Number.EPSILON) return `${sign}${whole}`;

  let bestNumerator = 0;
  let bestDenominator = 1;
  let bestError = Number.POSITIVE_INFINITY;
  for (const denominator of KITCHEN_FRACTION_DENOMINATORS) {
    const numerator = Math.round(frac * denominator);
    const error = Math.abs(frac - numerator / denominator);
    if (error < bestError) {
      bestError = error;
      bestNumerator = numerator;
      bestDenominator = denominator;
    }
  }

  let nextWhole = whole;
  let numerator = bestNumerator;
  let denominator = bestDenominator;
  if (numerator === denominator) {
    nextWhole += 1;
    numerator = 0;
  }
  if (numerator === 0) return `${sign}${nextWhole}`;

  const divisor = gcd(numerator, denominator);
  numerator /= divisor;
  denominator /= divisor;

  if (nextWhole === 0) return `${sign}${numerator}/${denominator}`;
  return `${sign}${nextWhole} ${numerator}/${denominator}`;
}

function stripPlaceholderAndUnit(
  instruction: string,
  placeholder: string,
  unit: string
): string {
  let next = instruction.split(placeholder).join(' ');
  const normalizedUnit = unit.trim().toLowerCase();
  if (normalizedUnit) {
    const aliases = UNIT_ALIASES[normalizedUnit] ?? [normalizedUnit];
    for (const alias of aliases) {
      const escaped = escapeRegExp(alias);
      const standaloneUnit = new RegExp(
        String.raw`(^|[\s([{,])${escaped}(?=$|[\s)\]}.,;:!?])`,
        'gi'
      );
      next = next.replace(standaloneUnit, '$1');
    }
  }
  return next;
}

function cleanInstructionSpacing(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\(\s*\)/g, '')
    .replace(/\[\s*\]/g, '')
    .replace(/\{\s*\}/g, '')
    .trim();
}

export function scaleQuantity(
  baseQty: number,
  baseServings: number,
  currentServings: number
): number {
  if (baseServings <= 0) return baseQty;
  return (baseQty / baseServings) * currentServings;
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
  const canonicalUnit = normalizeUnit(unit);
  const rounded =
    canonicalUnit && FRACTIONAL_DISPLAY_UNITS.has(canonicalUnit)
      ? toKitchenFraction(quantity)
      : formatNumericQuantity(quantity);
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
  _baseServings: number,
  _currentServings: number
): string {
  let text = step.instruction;
  for (const sq of step.scalableQuantities) {
    const shouldStripUnit = !!sq.unit;
    text = shouldStripUnit
      ? stripPlaceholderAndUnit(text, sq.placeholder, sq.unit)
      : text.split(sq.placeholder).join(' ');
  }
  return cleanInstructionSpacing(text);
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
