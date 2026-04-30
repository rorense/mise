import { newId } from '@/lib/id';
import { chatCompletion } from '@/lib/openai';
import type { Ingredient, Recipe, SourceType, Step } from '@/types/recipe';

const SYSTEM = `You are a recipe extraction engine. Output ONLY valid minified JSON matching this TypeScript shape (no markdown fences):
{
  "title": string,
  "baseServings": number,
  "cuisine": string | null,
  "tags": string[],
  "ingredients": { "quantity": number, "unit": string | null, "name": string, "notes": string | null, "scalable": boolean }[],
  "steps": { "instruction": string, "scalableQuantities": { "placeholder": string, "baseQuantity": number, "unit": string }[] }[]
}

Rules:
- All measurements MUST be metric only: g, kg, ml, l, cm, °C, tsp, tbsp, pinch. Never use imperial.
- Convert all amounts to metric in the numbers you output.
- Each step "instruction" must include placeholders like {{qty_1}} for every scalable quantity in that step, and scalableQuantities must define each placeholder with baseQuantity at baseServings.
- For eggs, cloves, sprigs use unit null and round-friendly base quantities; set scalable true unless item is salt, baking powder, yeast, or spice — then scalable false.
- If a step has no numeric amount, scalableQuantities can be [] and instruction is plain text.
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
    const scalable = row.scalable !== false;
    out.push({
      id: newId(),
      quantity,
      unit,
      name,
      notes,
      scalable,
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
    const sqRaw = row.scalableQuantities;
    if (!Array.isArray(sqRaw)) return null;
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

function validateStepPlaceholders(steps: Step[]): boolean {
  for (const step of steps) {
    for (const sq of step.scalableQuantities) {
      if (!step.instruction.includes(sq.placeholder)) {
        return false;
      }
    }
  }
  return true;
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
  if (!validateStepPlaceholders(steps)) return null;
  const now = new Date().toISOString();
  return {
    id: newId(),
    title,
    sourceUrl: '',
    sourceType: 'manual',
    baseServings,
    cuisine,
    ingredients,
    steps,
    tags,
    createdAt: now,
    updatedAt: now,
  };
}

export async function extractRecipeFromText(
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

  const raw = await chatCompletion(apiKey, [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: user },
  ], { temperature: 0.2 });

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
