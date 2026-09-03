import { isRecord } from '@/lib/guards';
import { cleanModelJson, llmCompletion } from '@/lib/llm';
import { newId } from '@/lib/id';
import type { AiProvider } from '@/lib/secrets';
import type { Recipe, RecipeAdjustmentSuggestion } from '@/types/recipe';

const SYSTEM = `You analyze cook notes and propose minimal recipe edits.
Output ONLY valid minified JSON in this shape:
{"suggestions":[{"type":"ingredient_quantity","ingredientId":"...","nextQuantity":0,"confidence":0,"reason":"...","noteEvidence":"..."},{"type":"ingredient_amount_mode","ingredientId":"...","nextAmountMode":"exact","nextScalable":true,"confidence":0,"reason":"...","noteEvidence":"..."},{"type":"step_instruction","stepId":"...","nextInstruction":"...","confidence":0,"reason":"...","noteEvidence":"..."}]}

Rules:
- Propose at most 6 suggestions.
- Only reference existing ingredientId or stepId from the input.
- Only suggest changes directly supported by the note.
- confidence must be 0..1.
- Keep step edits small and specific, not full rewrites.
- Use metric conventions and realistic quantities.
- When suggesting any recipe change, also include ingredient list updates whenever the note implies ingredient amounts or amount modes should change.
- If a suggested step change depends on ingredient amount/taste handling, include matching ingredient_quantity or ingredient_amount_mode suggestions for the same evidence.
- Do not add/remove ingredients or steps.`;

function textContainsEvidence(note: string, evidence: string): boolean {
  const noteLower = note.toLowerCase();
  const evidenceLower = evidence.toLowerCase();
  if (noteLower.includes(evidenceLower)) return true;
  const tokens = evidenceLower.match(/[a-z]{4,}/g) ?? [];
  return tokens.some((token) => noteLower.includes(token));
}

function dedupeSuggestions(
  suggestions: RecipeAdjustmentSuggestion[]
): RecipeAdjustmentSuggestion[] {
  const bestByKey = new Map<string, RecipeAdjustmentSuggestion>();
  for (const suggestion of suggestions) {
    const key =
      suggestion.type === 'step_instruction'
        ? `${suggestion.type}:${suggestion.stepId}`
        : `${suggestion.type}:${suggestion.ingredientId}`;
    const current = bestByKey.get(key);
    if (!current || suggestion.confidence > current.confidence) {
      bestByKey.set(key, suggestion);
    }
  }
  return [...bestByKey.values()].sort((a, b) => b.confidence - a.confidence);
}

function parseSuggestions(
  raw: string,
  recipe: Recipe,
  note: string,
  minConfidence: number
): RecipeAdjustmentSuggestion[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleanModelJson(raw));
  } catch {
    return [];
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.suggestions)) {
    return [];
  }
  const ingredientById = new Map(recipe.ingredients.map((i) => [i.id, i]));
  const stepById = new Map(recipe.steps.map((s) => [s.id, s]));
  const out: RecipeAdjustmentSuggestion[] = [];

  for (const row of parsed.suggestions) {
    if (!isRecord(row)) continue;
    const type = typeof row.type === 'string' ? row.type : '';
    const reason = typeof row.reason === 'string' ? row.reason.trim() : '';
    const noteEvidence =
      typeof row.noteEvidence === 'string' ? row.noteEvidence.trim() : '';
    const confidence = Number(row.confidence);
    if (
      !reason ||
      !noteEvidence ||
      !Number.isFinite(confidence) ||
      confidence < minConfidence ||
      confidence > 1 ||
      !textContainsEvidence(note, noteEvidence)
    ) {
      continue;
    }

    if (type === 'ingredient_quantity') {
      const ingredientId =
        typeof row.ingredientId === 'string' ? row.ingredientId : '';
      const nextQuantity = Number(row.nextQuantity);
      const ingredient = ingredientById.get(ingredientId);
      if (
        !ingredient ||
        ingredient.amountMode === 'to_taste' ||
        !Number.isFinite(nextQuantity) ||
        nextQuantity < 0 ||
        Math.abs(nextQuantity - ingredient.quantity) < Number.EPSILON
      ) {
        continue;
      }
      out.push({
        id: newId(),
        type: 'ingredient_quantity',
        ingredientId,
        nextQuantity: Number(nextQuantity.toFixed(2)),
        confidence,
        reason,
        noteEvidence,
      });
      continue;
    }

    if (type === 'ingredient_amount_mode') {
      const ingredientId =
        typeof row.ingredientId === 'string' ? row.ingredientId : '';
      const nextAmountMode = row.nextAmountMode === 'to_taste' ? 'to_taste' : 'exact';
      const nextScalable = row.nextScalable === true;
      const ingredient = ingredientById.get(ingredientId);
      if (!ingredient) continue;
      const normalizedScalable =
        nextAmountMode === 'to_taste' ? false : nextScalable;
      if (
        ingredient.amountMode === nextAmountMode &&
        ingredient.scalable === normalizedScalable
      ) {
        continue;
      }
      out.push({
        id: newId(),
        type: 'ingredient_amount_mode',
        ingredientId,
        nextAmountMode,
        nextScalable: normalizedScalable,
        confidence,
        reason,
        noteEvidence,
      });
      continue;
    }

    if (type === 'step_instruction') {
      const stepId = typeof row.stepId === 'string' ? row.stepId : '';
      const nextInstruction =
        typeof row.nextInstruction === 'string' ? row.nextInstruction.trim() : '';
      const step = stepById.get(stepId);
      if (!step || !nextInstruction || nextInstruction === step.instruction.trim()) {
        continue;
      }
      out.push({
        id: newId(),
        type: 'step_instruction',
        stepId,
        nextInstruction,
        confidence,
        reason,
        noteEvidence,
      });
    }
  }

  return dedupeSuggestions(out).slice(0, 6);
}

function buildUserPrompt(recipe: Recipe, note: string): string {
  const ingredients = recipe.ingredients
    .map((ing) =>
      [
        ing.id,
        ing.name,
        `qty=${ing.quantity}`,
        `unit=${ing.unit ?? 'null'}`,
        `amountMode=${ing.amountMode}`,
        `scalable=${String(ing.scalable)}`,
      ].join(' | ')
    )
    .join('\n');

  const steps = [...recipe.steps]
    .sort((a, b) => a.order - b.order)
    .map((step, idx) => `${idx + 1}. ${step.id} | ${step.instruction}`)
    .join('\n');

  return `Recipe title: ${recipe.title}

Cook note:
${note}

Ingredients:
${ingredients}

Steps:
${steps}`;
}

export async function suggestRecipeAdjustmentsFromCookNote(params: {
  recipe: Recipe;
  note: string;
  provider: AiProvider;
  apiKey: string;
  minConfidence?: number;
}): Promise<RecipeAdjustmentSuggestion[]> {
  const minConfidence = params.minConfidence ?? 0.7;
  const raw = await llmCompletion(
    params.provider,
    params.apiKey,
    [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: buildUserPrompt(params.recipe, params.note) },
    ],
    { temperature: 0.1 }
  );
  return parseSuggestions(raw, params.recipe, params.note, minConfidence);
}
