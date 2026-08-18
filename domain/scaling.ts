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

/**
 * True when the text right after a placeholder already spells out the unit, as
 * in "Add {{qty_1}} g sugar" — in which case substituting the number alone
 * avoids "50 g g sugar".
 */
function beginsWithUnit(text: string, unit: string): boolean {
  const canonical = normalizeUnit(unit);
  if (!canonical) return false;
  const aliases = UNIT_ALIASES[canonical] ?? [canonical];
  return aliases.some((alias) =>
    new RegExp(
      String.raw`^\s*${escapeRegExp(alias)}(?=$|[\s)\]}.,;:!?])`,
      'i'
    ).test(text)
  );
}

function substitutePlaceholder(
  instruction: string,
  placeholder: string,
  quantity: number,
  unit: string
): string {
  const segments = instruction.split(placeholder);
  if (segments.length === 1) return instruction;
  let out = segments[0];
  for (let i = 1; i < segments.length; i += 1) {
    const following = segments[i];
    const rendered = beginsWithUnit(following, unit)
      ? formatQuantityValue(quantity, unit)
      : formatQuantity(quantity, unit || null);
    out += rendered + following;
  }
  return out;
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
  // A missing unit normalises to '', which is itself a countable unit — so the
  // unitless cases (eggs, cloves) are already covered by this one check.
  const u = ingredient.unit?.toLowerCase() ?? '';
  if (COUNTABLE_UNITS.has(u)) {
    q = Math.max(0, Math.round(q));
  }
  return q;
}

/** The number on its own, rounded the way its unit calls for. */
function formatQuantityValue(quantity: number, unit: string | null): string {
  const canonicalUnit = normalizeUnit(unit);
  return canonicalUnit && FRACTIONAL_DISPLAY_UNITS.has(canonicalUnit)
    ? toKitchenFraction(quantity)
    : formatNumericQuantity(quantity);
}

export function formatQuantity(
  quantity: number,
  unit: string | null
): string {
  const rounded = formatQuantityValue(quantity, unit);
  return unit ? `${rounded} ${unit}` : rounded;
}

/** UI/chat suffix: only for ingredients explicitly marked to taste, not for exact amounts that do not scale. */
export function ingredientShowsAdjustToTasteHint(ingredient: Ingredient): boolean {
  return ingredient.amountMode === 'to_taste';
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

function looksLikeTitleCaseHeading(name: string): boolean {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length < 2) return false;
  let uppercaseWordCount = 0;
  for (const word of words) {
    const lettersOnly = word.replace(/[^A-Za-z]/g, '');
    if (!lettersOnly) continue;
    const startsUppercase = /^[A-Z]/.test(lettersOnly);
    if (startsUppercase) uppercaseWordCount += 1;
  }
  return uppercaseWordCount >= 2;
}

/**
 * Signals that only a heading would carry: a trailing colon or dash, a leading
 * "For …", or step/part numbering. Deliberately excludes title case, which any
 * ordinary ingredient can have.
 */
function isStrongSectionHeadingLabel(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;
  if (/to taste/i.test(trimmed)) return false;
  if (/^\d+\s*[).:-]/.test(trimmed)) return true;
  if (/^(step|part|section)\s*\d+\b/i.test(trimmed)) return true;
  if (/[:\-–—]\s*$/.test(trimmed)) return true;
  if (/^for\b/i.test(trimmed)) return true;
  return false;
}

/**
 * Used at import time, where the model has also told us the row is a heading
 * and title case is a useful extra hint. Not safe to use on its own for display
 * — see isIngredientSectionHeading.
 */
export function isLikelySectionHeadingLabel(name: string): boolean {
  if (isStrongSectionHeadingLabel(name)) return true;
  const trimmed = name.trim();
  if (!trimmed || /to taste/i.test(trimmed)) return false;
  return looksLikeTitleCaseHeading(trimmed);
}

export function isIngredientSectionHeading(ingredient: Ingredient): boolean {
  if (ingredient.isSectionHeading === true) return true;
  const name = ingredient.name.trim();
  if (!name) return false;
  if (ingredient.amountMode !== 'exact') return false;
  if (ingredient.quantity > 0) return false;
  if (ingredient.unit) return false;
  // Only strong signals here. Inferring from title case alone silently hid
  // real ingredients — "Olive Oil" with no amount rendered as a header.
  return isStrongSectionHeadingLabel(name);
}

function normalizeSectionTitle(raw: string): string {
  return raw.replace(/[:\-–—]\s*$/, '').trim();
}

export function splitIngredientSections(ingredients: Ingredient[]): {
  title: string | null;
  ingredients: Ingredient[];
}[] {
  const sorted = [...ingredients].sort((a, b) => a.sortOrder - b.sortOrder);
  const sections: { title: string | null; ingredients: Ingredient[] }[] = [];
  let pendingTitle: string | null = null;
  let currentIngredients: Ingredient[] = [];

  for (const ingredient of sorted) {
    if (isIngredientSectionHeading(ingredient)) {
      if (currentIngredients.length > 0) {
        sections.push({ title: pendingTitle, ingredients: currentIngredients });
        currentIngredients = [];
      }
      pendingTitle = normalizeSectionTitle(ingredient.name);
      continue;
    }
    currentIngredients.push(ingredient);
  }

  if (currentIngredients.length > 0 || sections.length === 0) {
    sections.push({ title: pendingTitle, ingredients: currentIngredients });
  }

  return sections;
}

/**
 * Renders a step with its quantities scaled to the current serving count, so
 * "Whisk in {{qty_1}}." reads "Whisk in 60 ml." at double the base servings.
 */
export function renderStepInstruction(
  step: Step,
  baseServings: number,
  currentServings: number
): string {
  let text = step.instruction;
  for (const sq of step.scalableQuantities) {
    const scaled = scaleQuantity(sq.baseQuantity, baseServings, currentServings);
    text = substitutePlaceholder(text, sq.placeholder, scaled, sq.unit);
  }
  // A placeholder with no matching entry — from a hand-edited step, or a model
  // response that lost one — would otherwise render as raw {{qty_1}} text.
  text = text.replace(/\{\{[^{}]*\}\}/g, '');
  return cleanInstructionSpacing(text);
}

export function buildChatIngredientLines(
  ingredients: Ingredient[],
  baseServings: number,
  currentServings: number
): string {
  const lines: string[] = [];
  const sections = splitIngredientSections(ingredients);
  sections.forEach((section, sectionIdx) => {
    if (sectionIdx > 0 && lines.length > 0) {
      lines.push('');
    }
    if (section.title) {
      lines.push(`${section.title}:`);
    }
    section.ingredients.forEach((ingredient) => {
      const qty = formatIngredientAmount(ingredient, baseServings, currentServings);
      const notes = ingredient.notes ? ` (${ingredient.notes})` : '';
      const hint = ingredientShowsAdjustToTasteHint(ingredient) ? ' [adjust to taste]' : '';
      lines.push(`- ${qty} ${ingredient.name}${notes}${hint}`);
    });
  });
  return lines.join('\n');
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
