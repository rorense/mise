import { newId } from '@/lib/id';
import { llmCompletion } from '@/lib/llm';
import type { AiProvider } from '@/lib/secrets';
import type { Ingredient, Recipe, SourceType, Step } from '@/types/recipe';

const SYSTEM = `You are a recipe extraction engine. Output ONLY valid minified JSON matching this TypeScript shape (no markdown fences):
{
  "title": string,
  "baseServings": number,
  "cuisine": string | null,
  "tags": string[],
  "ingredients": { "quantity": number, "unit": string | null, "name": string, "notes": string | null, "scalable": boolean, "amountMode": "exact" | "to_taste" }[],
  "steps": { "instruction": string, "scalableQuantities"?: { "placeholder": string, "baseQuantity": number, "unit": string }[] }[]
}

Rules:
- All measurements MUST be metric only: g, kg, ml, l, cm, °C, tsp, tbsp, pinch. Never use imperial.
- Convert all amounts to metric in the numbers you output.
- Step instructions should be plain language without quantity placeholders.
- For eggs, cloves, sprigs use unit null and round-friendly base quantities; set scalable true unless item is salt, baking powder, yeast, or spice — then scalable false.
- Use amountMode "to_taste" when an ingredient is by feel (e.g., salt, pepper, chili flakes to taste). For "to_taste": quantity should be 0, unit should be null, and scalable should be false.
- Set scalableQuantities to [] for each step unless placeholders are already present in source text.
- tags: short lowercase tokens like "dinner", "vegetarian".`;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseIngredients(raw: unknown): Ingredient[] | null {
  if (!Array.isArray(raw)) return null;
  const out: Ingredient[] = [];
  let sortOrder = 0;
  for (const row of raw) {
    if (!isRecord(row)) return null;
    const quantity = Number(row.quantity);
    const name = typeof row.name === 'string' ? row.name : null;
    if (!Number.isFinite(quantity) || !name) return null;
    const unit = row.unit === null || row.unit === undefined ? null : String(row.unit);
    const notes =
      row.notes === null || row.notes === undefined
        ? undefined
        : String(row.notes);
    const amountMode = row.amountMode === 'to_taste' ? 'to_taste' : 'exact';
    const looksLikeToTasteText =
      /to taste/i.test(name) || /to taste/i.test(notes ?? '');
    const resolvedAmountMode = looksLikeToTasteText ? 'to_taste' : amountMode;
    out.push({
      id: newId(),
      quantity: resolvedAmountMode === 'to_taste' ? 0 : quantity,
      unit: resolvedAmountMode === 'to_taste' ? null : unit,
      name,
      notes,
      scalable: resolvedAmountMode === 'to_taste' ? false : row.scalable !== false,
      amountMode: resolvedAmountMode,
      sortOrder: sortOrder++,
    });
  }
  return out;
}

function parseSteps(raw: unknown): Step[] | null {
  if (!Array.isArray(raw)) return null;
  const out: Step[] = [];
  let order = 0;
  for (const row of raw) {
    if (!isRecord(row)) return null;
    const instruction =
      typeof row.instruction === 'string' ? row.instruction : null;
    if (!instruction) return null;
    const sqRaw = Array.isArray(row.scalableQuantities)
      ? row.scalableQuantities
      : [];
    const scalableQuantities: Step['scalableQuantities'] = [];
    for (const q of sqRaw) {
      if (!isRecord(q)) return null;
      const placeholder =
        typeof q.placeholder === 'string' ? q.placeholder : null;
      const baseQuantity = Number(q.baseQuantity);
      const unit = typeof q.unit === 'string' ? q.unit : '';
      if (!placeholder || !Number.isFinite(baseQuantity)) return null;
      scalableQuantities.push({ placeholder, baseQuantity, unit });
    }
    out.push({
      id: newId(),
      order: order++,
      instruction,
      scalableQuantities,
    });
  }
  return out;
}

export function parseRecipeJson(text: string): Omit<Recipe, 'cookLogs'> | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(data)) return null;
  const title = typeof data.title === 'string' ? data.title : null;
  const baseServings = Number(data.baseServings);
  if (!title || !Number.isFinite(baseServings) || baseServings <= 0) return null;
  const cuisine =
    data.cuisine === null || data.cuisine === undefined
      ? undefined
      : String(data.cuisine);
  const tags = Array.isArray(data.tags)
    ? data.tags.filter((t): t is string => typeof t === 'string')
    : [];
  const ingredients = parseIngredients(data.ingredients);
  const steps = parseSteps(data.steps);
  if (!ingredients || !steps) return null;
  const now = new Date().toISOString();
  return {
    id: newId(),
    title,
    sourceUrl: '',
    sourceType: 'manual',
    mainImageUri: undefined,
    baseServings,
    isFavorite: false,
    wantToCook: true,
    isArchived: false,
    cuisine,
    ingredients,
    steps,
    tags,
    createdAt: now,
    updatedAt: now,
  };
}

export async function extractRecipeFromText(
  provider: AiProvider,
  apiKey: string,
  payload: {
    sourceType: SourceType;
    sourceUrl: string;
    content: string;
  }
): Promise<Omit<Recipe, 'cookLogs'>> {
  const user = `Source type: ${payload.sourceType}
Source URL (may be empty): ${payload.sourceUrl}

Content:
${payload.content.slice(0, 24000)}`;

  const raw = await llmCompletion(
    provider,
    apiKey,
    [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: user },
    ],
    { temperature: 0.2 }
  );

  const cleaned = raw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
  const parsed = parseRecipeJson(cleaned);
  if (!parsed) {
    throw new Error('Could not parse recipe JSON from model output');
  }
  return {
    ...parsed,
    sourceUrl: payload.sourceUrl,
    sourceType: payload.sourceType,
  };
}
