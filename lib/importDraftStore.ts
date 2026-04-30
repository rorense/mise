import type { Recipe } from '@/types/recipe';

let draft: Omit<Recipe, 'cookLogs'> | null = null;

export function setImportDraft(recipe: Omit<Recipe, 'cookLogs'>): void {
  draft = recipe;
}

export function peekImportDraft(): Omit<Recipe, 'cookLogs'> | null {
  return draft;
}

export function takeImportDraft(): Omit<Recipe, 'cookLogs'> | null {
  const d = draft;
  draft = null;
  return d;
}
