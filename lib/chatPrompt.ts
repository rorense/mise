import {
  buildChatIngredientLines,
  buildSystemPrompt,
  renderStepInstruction,
} from '@/domain/scaling';
import type { Recipe } from '@/types/recipe';

export function recipeToChatSystemPrompt(
  recipe: Recipe,
  currentServings: number
): string {
  const ingBlock = buildChatIngredientLines(
    recipe.ingredients,
    recipe.baseServings,
    currentServings
  );
  const stepsBlock = [...recipe.steps]
    .sort((a, b) => a.order - b.order)
    .map((s, i) => {
      const text = renderStepInstruction(
        s,
        recipe.baseServings,
        currentServings
      );
      return `${i + 1}. ${text}`;
    })
    .join('\n');
  return buildSystemPrompt(
    recipe.title,
    recipe.baseServings,
    currentServings,
    ingBlock,
    stepsBlock
  );
}
