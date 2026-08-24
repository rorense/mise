import { EXTRACTION_TIMEOUT_MS, VISION_TIMEOUT_MS } from '@/lib/http';
import { newId } from '@/lib/id';
import type { ScanImage } from '@/lib/import/scanImage';
import {
  convertIngredientAmount,
  convertMeasurementsInText,
} from '@/lib/import/units';
import { llmCompletion, type LlmContentPart } from '@/lib/llm';
import type { AiProvider } from '@/lib/secrets';
import { isLikelySectionHeadingLabel } from '@/domain/scaling';
import type { Ingredient, Recipe, SourceType, Step } from '@/types/recipe';

/** Extraction is transcription, so pay for care rather than for speed. */
const EXTRACTION_EFFORT = 'high' as const;

const SHAPE = `{
  "title": string,
  "baseServings": number,
  "cuisine": string | null,
  "tags": string[],
  "ingredients": { "quantity": number, "unit": string | null, "name": string, "notes": string | null, "scalable": boolean, "amountMode": "exact" | "to_taste", "section"?: string | null }[],
  "steps": { "instruction": string, "scalableQuantities"?: { "placeholder": string, "baseQuantity": number, "unit": string }[] }[]
}`;

const SYSTEM = `You are a recipe extraction engine. Output ONLY valid minified JSON matching this TypeScript shape (no markdown fences):
${SHAPE}

FIDELITY COMES FIRST. You are transcribing a recipe, not writing one. Never invent, improve, round, merge, reorder or drop anything the source states.
- If the input contains a block marked "PUBLISHER RECIPE DATA (authoritative)", that block is the truth. Every ingredient line in it must appear exactly once in your output, and every method step in it must appear as its own step, in the same order. Use the surrounding page text only to fill in things the block does not cover.
- Never merge two source ingredient lines into one row, and never split one into two.
- Never merge two numbered method steps into one, and never renumber them.
- If the source gives no servings, infer the most likely number and use it; never output 0.

UNITS — do not do arithmetic.
- Report the amount exactly as the source states it. The app converts to metric itself, correctly and consistently, so a conversion done here can only introduce an error.
- Allowed unit values: g, kg, ml, l, cup, cups, tsp, tbsp, pinch, oz, fl oz, lb, pint, quart, gallon, or null.
- Use null for countables: eggs, cloves, sprigs, slices, cans, sticks, whole items. Put the descriptor in "name" (e.g. name "garlic cloves", unit null, quantity 3).
- A "stick" of butter is 113 g — output quantity 113 and unit "g" for that one case only. Cinnamon sticks, celery sticks and similar stay countable with unit null.
- Write temperatures, oven settings, tin sizes and lengths in step text exactly as the source states them, including °F and inches. Do not convert them either.

QUANTITIES
- "quantity" must be a plain number. Convert written fractions to decimals only where they are genuinely fractional (1/2 -> 0.5).
- A range ("2-3 tbsp") takes the lower number, with the full range text in "notes".
- Use amountMode "to_taste" when an ingredient is by feel (e.g. chili flakes to taste). For "to_taste": quantity 0, unit null, scalable false.
- Salt and pepper ingredients always use amountMode "to_taste".
- Default scalable to true for exact ingredients; use scalable false only for explicit non-scaling entries and heading rows.
- Keep preparation wording in "notes", not "name": "finely chopped", "at room temperature", "plus extra for dusting".

SECTIONS
- If ingredients are split into components/parts (e.g. "Sponge Cake", "Simple Syrup", "Whipping Cream"), set each ingredient item's "section" field to that component title.
- If component headings appear as standalone lines, include them as dedicated heading rows with quantity: 0, unit: null, notes: null, scalable: false, amountMode: "exact".
- Do NOT turn an ingredient into a heading just because quantity is unknown/missing. If unsure, keep it as an ingredient row.

STEPS
- Step instructions are plain language. Preserve every actionable detail the source gives: heat level, timing, temperature, pan size, mixing order, texture and visual cues, doneness checks, resting times.
- Do not collapse multiple distinct actions into one vague line, and do not pad a step with detail the source never gave.
- Avoid vague instructions like "cook until done" unless the source gives no better detail.
- Where a step names an ingredient amount that should scale with servings, replace the number with a placeholder like {{qty_1}} (numbered per step) and list it in that step's scalableQuantities with its baseQuantity and unit. Keep the unit in the sentence: "Add {{qty_1}} g flour".
- Do NOT use placeholders for anything that does not scale: times, temperatures, tin sizes, counts of equipment.
- If a step has no scalable amount, set scalableQuantities to [].

- tags: short lowercase tokens like "dinner", "vegetarian".`;

/**
 * The audit turn.
 *
 * A single extraction pass is confidently wrong often enough that the cook ends
 * up correcting the saved recipe by hand, which is the thing this whole path
 * exists to avoid. Re-reading the source against the draft catches the failures
 * a re-run of the same prompt does not: a line silently dropped, two steps
 * fused, a quantity attached to the wrong ingredient.
 */
const VERIFY_SYSTEM = `You are a recipe extraction auditor. You are given a SOURCE and a CANDIDATE JSON extraction of it. Find every discrepancy and output the corrected JSON.

Output ONLY valid minified JSON in this shape (no markdown fences, no commentary):
${SHAPE}

Check, in this order:
1. COVERAGE. Walk the source ingredient list top to bottom. Every line must appear exactly once in the candidate. Add anything missing. Remove anything the source does not contain.
2. AMOUNTS. For each ingredient, re-read the source number and unit character by character. Fix wrong digits, decimal points, transposed values, and units attached to the wrong ingredient. Do not convert units — copy what the source says.
3. NAMES AND NOTES. Preparation wording ("finely chopped", "softened", "divided") belongs in notes, not name. Restore anything dropped.
4. STEPS. Walk the source method top to bottom. Every step must appear as its own step, in order, with nothing merged, dropped or reordered. Restore detail the candidate flattened away: timings, temperatures, heat levels, pan sizes, doneness cues.
5. SERVINGS, title, cuisine and tags match the source.

Rules for your output:
- Same rules as the extraction: report units exactly as the source states them, allowed values g, kg, ml, l, cup, cups, tsp, tbsp, pinch, oz, fl oz, lb, pint, quart, gallon, or null. Never do unit arithmetic. Leave °F and inches in step text as written.
- Keep section heading rows and the "section" field exactly as the candidate has them unless the source disagrees.
- If the candidate is already faithful, return it unchanged.
- Never drop content just because you are unsure. When the source is genuinely ambiguous, keep the candidate's reading.`;

/**
 * The photo path. Vision transcription invents text far more readily than it
 * admits it cannot read something, and a wrong quantity here becomes a saved
 * recipe someone cooks from months later — so the rules push hard toward
 * "show me what you could not read" over "give me a plausible number".
 */
const IMAGE_SYSTEM = `${SYSTEM}

The content is photographs of a recipe rather than typed text. Additional rules:
- Transcribe what is printed. Never invent an ingredient, a quantity, or a step that is not visible in the images.
- If a quantity is illegible, set quantity to 0 and put the printed text you can see in that ingredient's notes so the cook can correct it. Do not guess a number.
- The images may be consecutive pages or columns of ONE recipe. Combine them into a single recipe; never return one recipe per image.
- Ignore anything not part of the recipe: page numbers, running headers, photo captions, and text belonging to a neighbouring recipe.
- If the images show no recipe at all, still return valid JSON with an empty steps array rather than inventing one.`;

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
    const parsedQuantity = parseQuantityValue(row.quantity);
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
    const amountMode = row.amountMode === 'to_taste' ? 'to_taste' : 'exact';
    const looksLikeToTasteText =
      /to taste/i.test(rawName) || /to taste/i.test(notes ?? '');
    const shouldForceToTaste = isSaltOrPepperIngredient(rawName);
    const resolvedAmountMode =
      looksLikeToTasteText || shouldForceToTaste ? 'to_taste' : amountMode;
    // A missing number is only fatal for an exact amount. A "to taste" row
    // routinely arrives with quantity "to taste" or null, and discarding the
    // whole recipe over one of them buys nothing but another full extraction.
    const quantityRaw =
      parsedQuantity === null && resolvedAmountMode === 'to_taste'
        ? 0
        : parsedQuantity;
    if (quantityRaw === null) return null;
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
    // Imperial amounts are converted here rather than by the model, so the
    // arithmetic is a table lookup with a test around it instead of a step
    // nobody can check.
    const amount =
      resolvedAmountMode === 'to_taste'
        ? { quantity: 0, unit: null }
        : convertIngredientAmount(quantity, unit);
    out.push({
      id: newId(),
      quantity: amount.quantity,
      unit: amount.unit,
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Applies the same unit handling to a step that ingredients get.
 *
 * A scalable amount is written into the sentence next to its placeholder
 * ("Add {{qty_1}} oz flour"), so converting the number without rewriting the
 * word beside it would leave the step reading in one unit and scaling in
 * another.
 */
function normalizeStepMeasurements(
  instruction: string,
  quantities: Step['scalableQuantities']
): { instruction: string; scalableQuantities: Step['scalableQuantities'] } {
  let text = instruction;
  const converted = quantities.map((quantity) => {
    const next = convertIngredientAmount(
      quantity.baseQuantity,
      quantity.unit || null
    );
    const nextUnit = next.unit ?? '';
    if (quantity.unit && nextUnit !== quantity.unit) {
      text = text.replace(
        new RegExp(
          `(${escapeRegExp(quantity.placeholder)})\\s*${escapeRegExp(quantity.unit)}\\b`,
          'gi'
        ),
        nextUnit ? `$1 ${nextUnit}` : '$1'
      );
    }
    return {
      placeholder: quantity.placeholder,
      baseQuantity: next.quantity,
      unit: nextUnit,
    };
  });
  return {
    instruction: convertMeasurementsInText(text),
    scalableQuantities: converted,
  };
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
    const normalized = normalizeStepMeasurements(instruction, scalableQuantities);
    out.push({
      id: newId(),
      order: order++,
      instruction: normalized.instruction,
      scalableQuantities: normalized.scalableQuantities,
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

const JSON_FEEDBACK =
  'Return valid JSON only and ensure method steps are fully detailed and specific.';
const METHOD_FEEDBACK =
  'The method was too brief. Rewrite steps with concrete detail: include timing, heat/temperature, sequence, and doneness cues for each major action.';

function stripFences(raw: string): string {
  return raw
    .replace(/^```json\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

/** A draft, kept alongside the model's own JSON so the audit can re-read it. */
type ExtractionDraft = { parsed: Omit<Recipe, 'cookLogs'>; raw: string };

/**
 * The ask-parse-validate-retry loop shared by the text and photo paths. Each
 * attempt re-sends the whole prompt with a correction appended, so `maxAttempts`
 * is a direct multiplier on both cost and the time the user watches a spinner.
 */
async function runExtraction(
  provider: AiProvider,
  apiKey: string,
  config: {
    system: string;
    /** Called per attempt; `feedback` is '' on the first one. */
    buildUserContent: (feedback: string) => string | LlmContentPart[];
    sourceHasSubstantialMethod: boolean;
    maxAttempts: number;
    temperature?: number;
    timeoutMs?: number;
    parseFailureMessage: string;
    methodFailureMessage: string;
  }
): Promise<ExtractionDraft> {
  let feedback = '';
  for (let attempt = 0; attempt < config.maxAttempts; attempt += 1) {
    const isLastAttempt = attempt === config.maxAttempts - 1;

    const raw = await llmCompletion(
      provider,
      apiKey,
      [
        { role: 'system', content: config.system },
        { role: 'user', content: config.buildUserContent(feedback) },
      ],
      {
        temperature: config.temperature,
        timeoutMs: config.timeoutMs,
        effort: EXTRACTION_EFFORT,
      }
    );

    const cleaned = stripFences(raw);
    const parsed = parseRecipeJson(cleaned);
    if (!parsed) {
      if (isLastAttempt) {
        throw new Error(config.parseFailureMessage);
      }
      feedback = JSON_FEEDBACK;
      continue;
    }
    if (
      !stepsAreDetailedEnough(parsed.steps, {
        sourceHasSubstantialMethod: config.sourceHasSubstantialMethod,
      })
    ) {
      if (isLastAttempt) {
        throw new Error(config.methodFailureMessage);
      }
      feedback = METHOD_FEEDBACK;
      continue;
    }
    return { parsed, raw: cleaned };
  }
  throw new Error('Could not extract recipe method details');
}

/**
 * True when an audit result looks like a failure rather than a correction.
 *
 * Removing a hallucinated row or two is the audit working. Coming back with
 * half the recipe missing is the audit itself going wrong, and the draft is
 * the safer thing to keep.
 */
export function isSuspectAudit(
  draft: Pick<Recipe, 'ingredients' | 'steps'>,
  audited: Pick<Recipe, 'ingredients' | 'steps'>
): boolean {
  if (audited.ingredients.length === 0 || audited.steps.length === 0) return true;
  if (audited.ingredients.length * 2 < draft.ingredients.length) return true;
  if (audited.steps.length * 2 < draft.steps.length) return true;
  return false;
}

/**
 * Second pass: re-read the source against the draft and correct it.
 *
 * Re-running the extraction prompt produces the same confident mistakes,
 * because the failure is in the reading rather than in the sampling. Handing
 * the model its own draft to check against the source is what catches a
 * dropped ingredient line or two method steps fused into one.
 *
 * Every failure path here returns the draft. An audit that errors, times out,
 * comes back unparseable or comes back gutted must never cost the cook the
 * import they already waited for.
 */
async function runVerification(
  provider: AiProvider,
  apiKey: string,
  config: {
    buildUserContent: (candidateJson: string) => string | LlmContentPart[];
    sourceHasSubstantialMethod: boolean;
    timeoutMs: number;
  },
  draft: ExtractionDraft
): Promise<Omit<Recipe, 'cookLogs'>> {
  try {
    const corrected = await llmCompletion(
      provider,
      apiKey,
      [
        { role: 'system', content: VERIFY_SYSTEM },
        { role: 'user', content: config.buildUserContent(draft.raw) },
      ],
      { temperature: 0, timeoutMs: config.timeoutMs, effort: EXTRACTION_EFFORT }
    );
    if (typeof corrected !== 'string') return draft.parsed;
    const audited = parseRecipeJson(stripFences(corrected));
    if (!audited) return draft.parsed;
    if (
      !stepsAreDetailedEnough(audited.steps, {
        sourceHasSubstantialMethod: config.sourceHasSubstantialMethod,
      })
    ) {
      return draft.parsed;
    }
    if (isSuspectAudit(draft.parsed, audited)) return draft.parsed;
    return audited;
  } catch {
    return draft.parsed;
  }
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
  const draft = await runExtraction(provider, apiKey, {
    system: SYSTEM,
    buildUserContent: (feedback) =>
      feedback
        ? `${baseUser}

Additional instruction:
${feedback}`
        : baseUser,
    sourceHasSubstantialMethod: sourceMethod.hasSubstantialMethod,
    maxAttempts: 3,
    temperature: 0,
    timeoutMs: EXTRACTION_TIMEOUT_MS,
    parseFailureMessage: 'Could not parse recipe JSON from model output',
    methodFailureMessage: sourceMethod.hasSubstantialMethod
      ? 'Could not extract a usable method from this recipe. Check the source text and try again.'
      : 'Imported method is too brief. Add numbered steps with timing, heat, and doneness cues, then try again.',
  });
  const verified = await runVerification(
    provider,
    apiKey,
    {
      buildUserContent: (candidate) => `${baseUser}

CANDIDATE EXTRACTION:
${candidate}

Audit the candidate against the source above and output the corrected JSON.`,
      sourceHasSubstantialMethod: sourceMethod.hasSubstantialMethod,
      timeoutMs: EXTRACTION_TIMEOUT_MS,
    },
    draft
  );
  return {
    ...verified,
    sourceUrl: payload.sourceUrl,
    sourceType: payload.sourceType,
  };
}

export async function extractRecipeFromImages(
  provider: AiProvider,
  apiKey: string,
  images: ScanImage[]
): Promise<Omit<Recipe, 'cookLogs'>> {
  if (images.length === 0) {
    throw new Error('Add at least one photo.');
  }

  // Each image is introduced by its own label so the model can be told to treat
  // them as pages of one recipe, and so a later turn could refer to them.
  const imageBlocks = (): LlmContentPart[] =>
    images.flatMap((image, index) => [
      { type: 'text' as const, text: `Image ${index + 1}:` },
      {
        type: 'image' as const,
        mediaType: image.mediaType,
        base64: image.base64,
      },
    ]);

  const buildUserContent = (feedback: string): LlmContentPart[] => {
    const parts = imageBlocks();
    const trailing =
      images.length === 1
        ? 'Extract the recipe shown in this photo.'
        : `These ${images.length} photos are pages of a single recipe. Extract that one recipe.`;
    parts.push({
      type: 'text',
      text: feedback ? `${trailing}\n\nAdditional instruction:\n${feedback}` : trailing,
    });
    return parts;
  };

  // The audit re-sends the photos so the model can re-read the page rather
  // than reason about its own draft in the abstract. That is the expensive
  // half of a scan, and it is the half that catches a misread quantity.
  const buildAuditContent = (candidateJson: string): LlmContentPart[] => {
    const parts = imageBlocks();
    parts.push({
      type: 'text',
      text: `CANDIDATE EXTRACTION:
${candidateJson}

Audit the candidate against the photographs above and output the corrected JSON. Re-read every printed quantity. If a quantity is illegible in the photo, set it to 0 and put the printed text in that ingredient's notes rather than guessing a number.`,
    });
    return parts;
  };

  const draft = await runExtraction(provider, apiKey, {
    system: IMAGE_SYSTEM,
    buildUserContent,
    // There is no source text to analyse, and analyzeSourceMethod('') reports
    // false — which selects the *stricter* gate and then fails with advice
    // about pasting numbered steps. Neither fits a photo, so assume the page
    // has a real method and let the gate judge the model's output on its own.
    sourceHasSubstantialMethod: true,
    // One retry, not two. Every attempt re-uploads every image, so a third try
    // roughly triples the cost of a scan for a page that is usually just too
    // blurry or too cropped to read.
    maxAttempts: 2,
    temperature: 0,
    timeoutMs: VISION_TIMEOUT_MS,
    parseFailureMessage:
      'Could not read a recipe from these photos. Try again with more even lighting and the whole page in frame.',
    methodFailureMessage:
      'Could not read a full method from these photos. Check the method page is included and in focus, then try again.',
  });
  const verified = await runVerification(
    provider,
    apiKey,
    {
      buildUserContent: buildAuditContent,
      sourceHasSubstantialMethod: true,
      timeoutMs: VISION_TIMEOUT_MS,
    },
    draft
  );
  return { ...verified, sourceUrl: '', sourceType: 'manual' };
}
