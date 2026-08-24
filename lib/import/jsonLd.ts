/**
 * Pulling a recipe out of a web page.
 *
 * Almost every recipe site publishes a schema.org `Recipe` block containing the
 * publisher's own ingredient strings and method steps. That block is worth far
 * more than anything a model can recover from the rendered page, so it is
 * extracted in full and handed over as the authoritative source; the page text
 * is kept only as a fallback and to fill gaps.
 */

const JSON_LD_RE =
  /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ensp: ' ',
  emsp: ' ',
  thinsp: ' ',
  shy: '',
  deg: '°',
  ndash: '–',
  mdash: '—',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  hellip: '…',
  times: '×',
  // Decoded to the glyph rather than straight to "1/2", so `normalizeFractions`
  // is the single place that decides spacing. Going direct produced "11/2 tsp"
  // out of "1&frac12; tsp".
  frac12: '½',
  frac13: '⅓',
  frac14: '¼',
  frac23: '⅔',
  frac34: '¾',
};

/** Vulgar fractions the model and `parseQuantityValue` both read better as ASCII. */
const VULGAR_FRACTIONS: Record<string, string> = {
  '¼': '1/4',
  '½': '1/2',
  '¾': '3/4',
  '⅐': '1/7',
  '⅑': '1/9',
  '⅒': '1/10',
  '⅓': '1/3',
  '⅔': '2/3',
  '⅕': '1/5',
  '⅖': '2/5',
  '⅗': '3/5',
  '⅘': '4/5',
  '⅙': '1/6',
  '⅚': '5/6',
  '⅛': '1/8',
  '⅜': '3/8',
  '⅝': '5/8',
  '⅞': '7/8',
};

export function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (whole, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    })
    .replace(/&#(\d+);/g, (whole, digits: string) => {
      const code = Number.parseInt(digits, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    })
    .replace(/&([a-z][a-z0-9]*);/gi, (whole, name: string) => {
      const replacement = NAMED_ENTITIES[name.toLowerCase()];
      return replacement === undefined ? whole : replacement;
    });
}

/**
 * "1½ cups" is a single glyph away from being unreadable to anything that
 * parses numbers, so fractions are spelled out and separated from a leading
 * whole number.
 */
export function normalizeFractions(text: string): string {
  let out = text;
  for (const [glyph, ascii] of Object.entries(VULGAR_FRACTIONS)) {
    out = out.split(glyph).join(` ${ascii} `);
  }
  return out.replace(/(\d)\s+(\d+\/\d+)/g, '$1 $2').replace(/[ \t]{2,}/g, ' ');
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, ' ');
}

/** Cleans one string that came out of a JSON-LD field or an HTML fragment. */
function cleanText(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return normalizeFractions(decodeEntities(stripTags(raw)))
    .replace(/\s+/g, ' ')
    .trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasType(node: Record<string, unknown>, wanted: string): boolean {
  const raw = node['@type'];
  const types = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
  return types.some(
    (type) => typeof type === 'string' && type.toLowerCase() === wanted.toLowerCase()
  );
}

/**
 * Walks the whole parsed document looking for a Recipe node.
 *
 * Publishers nest these arbitrarily — inside `@graph`, inside arrays, inside a
 * WebPage's `mainEntity` — so a shallow look at the top level misses a good
 * share of real pages. The depth cap keeps a pathological document from
 * spinning.
 */
function findRecipeNode(
  value: unknown,
  depth = 0
): Record<string, unknown> | null {
  if (depth > 8) return null;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findRecipeNode(entry, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (!isRecord(value)) return null;
  if (hasType(value, 'Recipe')) return value;
  for (const child of Object.values(value)) {
    if (Array.isArray(child) || isRecord(child)) {
      const found = findRecipeNode(child, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function firstString(value: unknown): string {
  if (typeof value === 'string') return cleanText(value);
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    for (const entry of value) {
      const text = firstString(entry);
      if (text) return text;
    }
    return '';
  }
  if (isRecord(value)) {
    // `{ "@value": "4 servings" }` and `{ "name": "Italian" }` both appear.
    return firstString(value['@value'] ?? value.name ?? value.text);
  }
  return '';
}

function stringList(value: unknown): string[] {
  if (typeof value === 'string') {
    // Some sites put a comma-joined keyword string here.
    return value
      .split(',')
      .map((entry) => cleanText(entry))
      .filter(Boolean);
  }
  if (!Array.isArray(value)) return [];
  return value.map((entry) => firstString(entry)).filter(Boolean);
}

/**
 * Flattens `recipeInstructions`, which is the least consistent field in the
 * whole vocabulary: a plain string, an array of strings, `HowToStep` objects,
 * or `HowToSection` objects wrapping their own step lists.
 */
function flattenInstructions(value: unknown, depth = 0): string[] {
  if (depth > 4) return [];
  if (typeof value === 'string') {
    const text = cleanText(value);
    if (!text) return [];
    // A single blob is common; split it back into sentences-per-step only when
    // the publisher used explicit numbering, which is safe to trust.
    const numbered = text.split(/(?=(?:^|\s)\d{1,2}[.)]\s+[A-Z])/g);
    return numbered.map((entry) => entry.trim()).filter(Boolean);
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry) => flattenInstructions(entry, depth + 1));
  }
  if (!isRecord(value)) return [];
  if (hasType(value, 'HowToSection')) {
    const name = firstString(value.name);
    const children = flattenInstructions(
      value.itemListElement ?? value.steps,
      depth + 1
    );
    return name ? [`[${name}]`, ...children] : children;
  }
  if (value.itemListElement !== undefined) {
    return flattenInstructions(value.itemListElement, depth + 1);
  }
  const text = firstString(value.text ?? value.name ?? value.description);
  return text ? [text] : [];
}

export interface JsonLdRecipe {
  title?: string;
  description?: string;
  recipeYield?: string;
  cuisine?: string;
  category?: string;
  keywords: string[];
  ingredients: string[];
  instructions: string[];
  prepTime?: string;
  cookTime?: string;
  totalTime?: string;
}

/** True when the block carries the two fields that actually matter. */
export function isUsableJsonLdRecipe(recipe: JsonLdRecipe | null): recipe is JsonLdRecipe {
  return !!recipe && recipe.ingredients.length > 0 && recipe.instructions.length > 0;
}

export function extractJsonLdRecipe(html: string): JsonLdRecipe | null {
  let match: RegExpExecArray | null;
  JSON_LD_RE.lastIndex = 0;
  let best: JsonLdRecipe | null = null;
  while ((match = JSON_LD_RE.exec(html)) !== null) {
    let parsed: unknown;
    try {
      // Publishers occasionally leave a trailing comma or an HTML comment
      // wrapper around the payload; neither is worth a parser, but both are
      // worth not throwing the whole page away for.
      parsed = JSON.parse(match[1].trim().replace(/^<!--/, '').replace(/-->$/, ''));
    } catch {
      continue;
    }
    const node = findRecipeNode(parsed);
    if (!node) continue;
    const recipe: JsonLdRecipe = {
      title: firstString(node.name) || undefined,
      description: firstString(node.description) || undefined,
      recipeYield: firstString(node.recipeYield ?? node.yield) || undefined,
      cuisine: firstString(node.recipeCuisine) || undefined,
      category: firstString(node.recipeCategory) || undefined,
      keywords: stringList(node.keywords),
      ingredients: stringList(node.recipeIngredient ?? node.ingredients),
      instructions: flattenInstructions(node.recipeInstructions),
      prepTime: firstString(node.prepTime) || undefined,
      cookTime: firstString(node.cookTime) || undefined,
      totalTime: firstString(node.totalTime) || undefined,
    };
    if (isUsableJsonLdRecipe(recipe)) return recipe;
    // Keep the first partial block in case no complete one turns up.
    if (!best) best = recipe;
  }
  return best;
}

/** ISO-8601 durations read badly in a prompt; "PT1H30M" becomes "1 h 30 min". */
function humanDuration(iso?: string): string | null {
  if (!iso) return null;
  const match = iso.match(/^P(?:\d+D)?T?(?:(\d+)H)?(?:(\d+)M)?/i);
  if (!match || (!match[1] && !match[2])) return iso.trim() || null;
  const parts: string[] = [];
  if (match[1]) parts.push(`${Number(match[1])} h`);
  if (match[2]) parts.push(`${Number(match[2])} min`);
  return parts.join(' ');
}

/**
 * Renders the structured block as the plain, line-per-item text the extraction
 * prompt treats as authoritative.
 */
export function formatJsonLdRecipe(recipe: JsonLdRecipe): string {
  const lines: string[] = ['PUBLISHER RECIPE DATA (authoritative)'];
  if (recipe.title) lines.push(`Title: ${recipe.title}`);
  if (recipe.recipeYield) lines.push(`Yield: ${recipe.recipeYield}`);
  if (recipe.cuisine) lines.push(`Cuisine: ${recipe.cuisine}`);
  if (recipe.category) lines.push(`Category: ${recipe.category}`);
  const prep = humanDuration(recipe.prepTime);
  const cook = humanDuration(recipe.cookTime);
  if (prep) lines.push(`Prep time: ${prep}`);
  if (cook) lines.push(`Cook time: ${cook}`);
  if (recipe.keywords.length) lines.push(`Keywords: ${recipe.keywords.join(', ')}`);
  if (recipe.description) lines.push(`Description: ${recipe.description}`);
  if (recipe.ingredients.length) {
    lines.push('', `Ingredients (${recipe.ingredients.length} lines, verbatim):`);
    recipe.ingredients.forEach((line) => lines.push(`- ${line}`));
  }
  if (recipe.instructions.length) {
    lines.push('', `Method (${recipe.instructions.length} steps, verbatim):`);
    recipe.instructions.forEach((line, index) => lines.push(`${index + 1}. ${line}`));
  }
  return lines.join('\n');
}

/** Kept for callers that only ever wanted the title and blurb. */
export interface JsonLdRecipeHint {
  title?: string;
  description?: string;
}

export function extractJsonLdRecipeHint(html: string): JsonLdRecipeHint | null {
  const recipe = extractJsonLdRecipe(html);
  if (!recipe) return null;
  return { title: recipe.title, description: recipe.description };
}

/** Wrappers that never contain recipe content and always contain link soup. */
const NOISE_BLOCK_RE =
  /<(script|style|noscript|svg|template|iframe|nav|footer|aside|form|select|button)\b[^>]*>[\s\S]*?<\/\1>/gi;

/**
 * Block-level elements whose boundaries carry meaning. An ingredient list is
 * only legible as a list; flattening `<li>` into spaces turns "2 cups flour"
 * and "1 tsp salt" into one run-on line the model has to re-segment by guess.
 */
const BLOCK_TAG_RE =
  /<\/?(?:address|article|blockquote|br|dd|div|dl|dt|figcaption|figure|h[1-6]|hr|li|main|ol|p|pre|section|table|tbody|td|tfoot|th|thead|tr|ul)\b[^>]*>/gi;

/** Text that reliably marks page furniture rather than recipe content. */
const FURNITURE_RE =
  /\b(subscribe|newsletter|privacy policy|terms of use|cookie|advertisement|sign\s?up|log\s?in|share on|follow us|related recipes?|you may also like|leave a comment|post navigation|all rights reserved)\b/i;

const QUANTITY_LINE_RE =
  /^\s*(?:[-*•]\s*)?(?:\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?)\s*(?:g|kg|ml|l|oz|lb|lbs|cups?|tsp|tbsp|teaspoons?|tablespoons?|pounds?|ounces?|cloves?|cans?|pinch|sprigs?|slices?|sticks?)?\b/i;

const SECTION_WORD_RE = /\b(ingredients?|method|instructions?|directions?|steps)\b/i;

const COOKING_VERB_RE =
  /\b(preheat|bake|boil|simmer|stir|whisk|fold|saut|roast|fry|grill|knead|marinate|chill|garnish|season|minutes?|hours?|°|degrees)\b/i;

function scoreLine(line: string): number {
  const trimmed = line.trim();
  if (!trimmed) return 0;
  let score = 0;
  if (QUANTITY_LINE_RE.test(trimmed)) score += 3;
  if (SECTION_WORD_RE.test(trimmed)) score += 2;
  if (COOKING_VERB_RE.test(trimmed)) score += 2;
  if (trimmed.length >= 20 && trimmed.length <= 400) score += 1;
  if (FURNITURE_RE.test(trimmed)) score -= 3;
  return score;
}

/**
 * Picks the `maxChars` window of `lines` with the most recipe-looking content.
 *
 * The old behaviour — take the first N characters — fails on the common
 * food-blog layout, where the recipe card sits below a long personal preamble
 * and a wall of navigation. On those pages the model was never shown the
 * ingredients at all.
 */
function densestWindow(lines: string[], maxChars: number): string {
  const weights = lines.map(scoreLine);
  const lengths = lines.map((line) => line.length + 1);
  let bestStart = 0;
  let bestEnd = 0;
  let bestScore = -Infinity;
  let start = 0;
  let chars = 0;
  let score = 0;
  for (let end = 0; end < lines.length; end += 1) {
    chars += lengths[end];
    score += weights[end];
    while (chars > maxChars && start < end) {
      chars -= lengths[start];
      score -= weights[start];
      start += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestStart = start;
      bestEnd = end;
    }
  }
  return lines.slice(bestStart, bestEnd + 1).join('\n');
}

/**
 * Turns a page into plain text that still has line structure, then keeps the
 * most recipe-dense `maxChars` of it.
 */
export function excerptHtml(html: string, maxChars: number): string {
  const text = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(NOISE_BLOCK_RE, '\n')
    .replace(BLOCK_TAG_RE, '\n')
    .replace(/<[^>]*>/g, ' ');
  const decoded = normalizeFractions(decodeEntities(text));
  const lines = decoded
    .split('\n')
    .map((line) => line.replace(/[ \t ]+/g, ' ').trim())
    .filter(Boolean);
  const joined = lines.join('\n');
  if (joined.length <= maxChars) return joined;
  return densestWindow(lines, maxChars);
}
