import { newId } from '@/lib/id';
import { llmCompletion } from '@/lib/llm';
import type { AiProvider } from '@/lib/secrets';
import { isLikelySectionHeadingLabel } from '@/domain/scaling';
import type { Ingredient, Recipe, SourceType, Step } from '@/types/recipe';

const SYSTEM = `You are a recipe extraction engine. Output ONLY valid minified JSON matching this TypeScript shape (no markdown fences):
{
  "title": string,
  "baseServings": number,
  "cuisine": string | null,
  "tags": string[],
  "ingredients": { "quantity": number, "unit": string | null, "name": string, "notes": string | null, "scalable": boolean, "amountMode": "exact" | "to_taste", "section"?: string | null }[],
  "steps": { "instruction": string, "scalableQuantities"?: { "placeholder": string, "baseQuantity": number, "unit": string }[] }[]
}

Rules:
- Use only these units: g, kg, ml, l, cm, °C, cup, cups, tsp, tbsp, pinch. Never use imperial.
- Preserve cup/cups/tsp/tbsp/pinch from the source when present; do NOT convert these to ml.
- Convert other non-metric units to metric in the numbers you output.
- Step instructions should be plain language without quantity placeholders, but still include timing, heat level, and doneness cues from the source in the step text.
- For eggs, cloves, sprigs use unit null and round-friendly base quantities.
- Default scalable to true for exact ingredients; only use scalable false for explicit non-scaling entries and heading rows.
- Salt and pepper ingredients should always use amountMode "to_taste".
- Use amountMode "to_taste" when an ingredient is by feel (e.g., chili flakes to taste). For "to_taste": quantity should be 0, unit should be null, and scalable should be false.
- If ingredients are split into components/parts (e.g. "Sponge Cake", "Simple Syrup", "Whipping Cream"), set each ingredient item's "section" field to that component title.
- If component headings appear as standalone lines, include them as dedicated heading rows with quantity: 0, unit: null, notes: null, scalable: false, amountMode: "exact".
- Do NOT turn an ingredient into a heading just because quantity is unknown/missing. If unsure, keep it as an ingredient row.
- Where a step names an ingredient amount that should scale with servings, replace the number with a placeholder like {{qty_1}} (numbered per step) and list it in that step's scalableQuantities with its baseQuantity and unit. Keep the unit in the sentence: "Add {{qty_1}} g flour".
- Do NOT use placeholders for anything that does not scale: times, temperatures, tin sizes, counts of equipment.
- If a step has no scalable amount, set scalableQuantities to [].
- Method quality is critical: keep steps specific and practical. Preserve actionable details from source text including heat level, timing, temperatures, texture/visual cues, mixing order, and doneness checks.
- Do not collapse multiple distinct actions into vague single lines.
- Avoid vague instructions like "cook until done" unless the source gives no better detail. Prefer concrete wording.
- tags: short lowercase tokens like "dinner", "vegetarian".`;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseQuantityValue(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw;
  }
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!value) return null;
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const mixed = value.match(/^(-?\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) {
    const whole = Number(mixed[1]);
    const numerator = Number(mixed[2]);
    const denominator = Number(mixed[3]);
    if (denominator !== 0) {
      const sign = whole < 0 ? -1 : 1;
      const absWhole = Math.abs(whole);
      return sign * (absWhole + numerator / denominator);
    }
  }
  const fraction = value.match(/^(-?\d+)\/(\d+)$/);
  if (fraction) {
    const numerator = Number(fraction[1]);
    const denominator = Number(fraction[2]);
    if (denominator !== 0) {
      return numerator / denominator;
    }
  }
  const numericPrefix = value.match(/^-?\d+(\.\d+)?/);
  if (numericPrefix) {
    const parsed = Number(numericPrefix[0]);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseInlineIngredientText(text: string): {
  quantity: number;
  unit: string | null;
  name: string;
} | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const qtyMatch = trimmed.match(
    /^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)\s+(.+)$/
  );
  if (!qtyMatch) return null;
  const quantity = parseQuantityValue(qtyMatch[1]);
  if (quantity === null || quantity <= 0) return null;
  let rest = qtyMatch[2].trim();
  let unit: string | null = null;
  if (/^batch(?:es)?\b/i.test(rest)) {
    rest = rest
      .replace(/^batch(?:es)?\s+of\s+/i, '')
      .replace(/^batch(?:es)?\s+/i, '')
      .trim();
  }
  if (!rest) return null;
  return { quantity, unit, name: rest };
}

function isSaltOrPepperIngredient(name: string): boolean {
  return /\bsalt\b/i.test(name) || /\bpeppers?\b/i.test(name);
}

function parseIngredients(raw: unknown): Ingredient[] | null {
  if (!Array.isArray(raw)) return null;
  const out: Ingredient[] = [];
  let sortOrder = 0;
  let activeSection: string | null = null;
  for (let index = 0; index < raw.length; index += 1) {
    const row = raw[index];
    if (!isRecord(row)) return null;
    const rawName = typeof row.name === 'string' ? row.name.trim() : '';
    if (!rawName) return null;
    const quantityRaw = parseQuantityValue(row.quantity);
    const unit = row.unit === null || row.unit === undefined ? null : String(row.unit).trim() || null;
    const notes =
      row.notes === null || row.notes === undefined
        ? undefined
        : String(row.notes);
    const sectionRaw = typeof row.section === 'string' ? row.section.trim() : '';
    const section = sectionRaw || null;
    if (section && section !== activeSection) {
      out.push({
        id: newId(),
        quantity: 0,
        unit: null,
        name: section,
        notes: undefined,
        scalable: false,
        amountMode: 'exact',
        isSectionHeading: true,
        sortOrder: sortOrder++,
      });
      activeSection = section;
    }
    if (quantityRaw === null) return null;
    const amountMode = row.amountMode === 'to_taste' ? 'to_taste' : 'exact';
    const looksLikeToTasteText =
      /to taste/i.test(rawName) || /to taste/i.test(notes ?? '');
    const shouldForceToTaste = isSaltOrPepperIngredient(rawName);
    const resolvedAmountMode =
      looksLikeToTasteText || shouldForceToTaste ? 'to_taste' : amountMode;
    const recoveredFromNotes =
      typeof notes === 'string' ? parseInlineIngredientText(notes) : null;
    const nextRow = index + 1 < raw.length ? raw[index + 1] : null;
    const nextRowSection =
      isRecord(nextRow) && typeof nextRow.section === 'string'
        ? nextRow.section.trim()
        : '';
    const isReferencedByNextSection =
      !!nextRowSection &&
      nextRowSection.localeCompare(rawName, undefined, { sensitivity: 'accent' }) === 0;
    const looksLikeSectionHeading =
      quantityRaw <= 0 &&
      !unit &&
      resolvedAmountMode === 'exact' &&
      row.scalable === false &&
      (isLikelySectionHeadingLabel(rawName) ||
        isReferencedByNextSection ||
        recoveredFromNotes !== null);
    const quantity = looksLikeSectionHeading ? 0 : quantityRaw;
    if (looksLikeSectionHeading) {
      if (rawName !== activeSection) {
        out.push({
          id: newId(),
          quantity: 0,
          unit: null,
          name: rawName,
          notes: undefined,
          scalable: false,
          amountMode: 'exact',
          isSectionHeading: true,
          sortOrder: sortOrder++,
        });
      }
      activeSection = rawName;
      if (recoveredFromNotes) {
        out.push({
          id: newId(),
          quantity: recoveredFromNotes.quantity,
          unit: recoveredFromNotes.unit,
          name: recoveredFromNotes.name,
          notes: undefined,
          scalable: true,
          amountMode: 'exact',
          isSectionHeading: false,
          sortOrder: sortOrder++,
        });
      }
      continue;
    }
    out.push({
      id: newId(),
      quantity: resolvedAmountMode === 'to_taste' ? 0 : quantity,
      unit: resolvedAmountMode === 'to_taste' ? null : unit,
      name: rawName,
      notes,
      scalable: resolvedAmountMode === 'to_taste' ? false : !looksLikeSectionHeading,
      amountMode: resolvedAmountMode,
      isSectionHeading: false,
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

function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

export function analyzeSourceMethod(content: string): {
  hasSubstantialMethod: boolean;
  numberedStepCount: number;
  methodWordCount: number;
} {
  const normalized = content.replace(/\r\n/g, '\n');
  const methodSection =
    normalized.match(
      /(?:^|\n)\s*(?:method|instructions|directions|steps)\s*:?\s*\n([\s\S]*?)(?=\n\s*(?:notes|tips|nutrition|ingredients|to serve)\s*:|\s*$)/i
    )?.[1] ?? normalized;
  const numberedStepCount = (
    methodSection.match(/(?:^|\n)\s*\d+[\.\):\-]\s+\S/g) ?? []
  ).length;
  const methodWordCount = countWords(methodSection);
  const hasSubstantialMethod =
    numberedStepCount >= 2 ||
    (numberedStepCount >= 1 && methodWordCount >= 25) ||
    methodWordCount >= 50;
  return { hasSubstantialMethod, numberedStepCount, methodWordCount };
}

function isVagueMethodStep(step: string): boolean {
  const text = step.trim();
  if (!text) return true;
  if (
    /\b(cook|bake|fry|simmer|boil|mix|stir)\s+until\s+(done|ready)\b/i.test(text)
  ) {
    return true;
  }
  if (/\b(as needed|as desired|to preference)\b/i.test(text)) {
    return true;
  }
  return false;
}

function stepHasConcreteDetail(step: string): boolean {
  const text = step.trim();
  if (!text) return false;
  if (/\d/.test(text)) return true;
  if (
    /\b(minute|minutes|hour|hours|second|seconds|°c|celsius|fahrenheit|°f|oven|preheat|low(?:\s|-)?heat|medium(?:\s|-)?heat|high(?:\s|-)?heat|simmer|boil|golden|browned|brown|translucent|thickened|softened|fragrant|tender|crisp|al dente|sear|shred|drain)\b/i.test(
      text
    )
  ) {
    return true;
  }
  return false;
}

export function stepsAreDetailedEnough(
  steps: Step[],
  options?: { sourceHasSubstantialMethod?: boolean }
): boolean {
  const instructions = steps.map((step) => step.instruction.trim()).filter(Boolean);
  if (instructions.length === 0) return false;

  if (options?.sourceHasSubstantialMethod) {
    const totalWords = instructions.reduce((sum, line) => sum + countWords(line), 0);
    const vagueCount = instructions.filter(isVagueMethodStep).length;
    if (vagueCount === instructions.length && totalWords < 20) {
      return false;
    }
    return totalWords >= 12;
  }

  const shortCount = instructions.filter((line) => countWords(line) < 4).length;
  if (shortCount > Math.max(1, Math.floor(instructions.length / 3))) {
    return false;
  }
  const nonVagueCount = instructions.filter((line) => !isVagueMethodStep(line)).length;
  if (nonVagueCount < Math.max(1, Math.ceil(instructions.length * 0.7))) {
    return false;
  }
  const concreteCount = instructions.filter(stepHasConcreteDetail).length;
  if (instructions.length === 1) {
    return concreteCount === 1 && countWords(instructions[0]) >= 10;
  }
  return concreteCount >= Math.max(1, Math.ceil(instructions.length * 0.34));
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
  const baseUser = `Source type: ${payload.sourceType}
Source URL (may be empty): ${payload.sourceUrl}

Content:
${payload.content.slice(0, 24000)}`;
  const sourceMethod = analyzeSourceMethod(payload.content);
  let methodFeedback = '';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const user = methodFeedback
      ? `${baseUser}

Additional instruction:
${methodFeedback}`
      : baseUser;

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
      if (attempt === 2) {
        throw new Error('Could not parse recipe JSON from model output');
      }
      methodFeedback =
        'Return valid JSON only and ensure method steps are fully detailed and specific.';
      continue;
    }
    if (
      !stepsAreDetailedEnough(parsed.steps, {
        sourceHasSubstantialMethod: sourceMethod.hasSubstantialMethod,
      })
    ) {
      if (attempt === 2) {
        throw new Error(
          sourceMethod.hasSubstantialMethod
            ? 'Could not extract a usable method from this recipe. Check the source text and try again.'
            : 'Imported method is too brief. Add numbered steps with timing, heat, and doneness cues, then try again.'
        );
      }
      methodFeedback =
        'The method was too brief. Rewrite steps with concrete detail: include timing, heat/temperature, sequence, and doneness cues for each major action.';
      continue;
    }
    return {
      ...parsed,
      sourceUrl: payload.sourceUrl,
      sourceType: payload.sourceType,
    };
  }
  throw new Error('Could not extract recipe method details');
}
