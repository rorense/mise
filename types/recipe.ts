export type SourceType = 'url' | 'youtube' | 'instagram' | 'manual';

export interface ScalableQuantity {
  placeholder: string;
  baseQuantity: number;
  unit: string;
}

export type IngredientAmountMode = 'exact' | 'to_taste';

export interface Ingredient {
  id: string;
  quantity: number;
  unit: string | null;
  name: string;
  notes?: string;
  scalable: boolean;
  amountMode: IngredientAmountMode;
  sortOrder: number;
}

export interface Step {
  id: string;
  order: number;
  instruction: string;
  scalableQuantities: ScalableQuantity[];
}

export interface CookLog {
  id: string;
  recipeId: string;
  cookedAt: string;
  photoUri?: string;
  notes?: string;
  rating?: number;
  createdAt: string;
}

export type RecipeAdjustmentStatus = 'pending' | 'applied' | 'ignored';

type RecipeAdjustmentSuggestionBase = {
  id: string;
  confidence: number;
  reason: string;
  noteEvidence: string;
};

export type IngredientQuantityAdjustmentSuggestion =
  RecipeAdjustmentSuggestionBase & {
    type: 'ingredient_quantity';
    ingredientId: string;
    nextQuantity: number;
  };

export type IngredientAmountModeAdjustmentSuggestion =
  RecipeAdjustmentSuggestionBase & {
    type: 'ingredient_amount_mode';
    ingredientId: string;
    nextAmountMode: IngredientAmountMode;
    nextScalable: boolean;
  };

export type StepInstructionAdjustmentSuggestion = RecipeAdjustmentSuggestionBase & {
  type: 'step_instruction';
  stepId: string;
  nextInstruction: string;
};

export type RecipeAdjustmentSuggestion =
  | IngredientQuantityAdjustmentSuggestion
  | IngredientAmountModeAdjustmentSuggestion
  | StepInstructionAdjustmentSuggestion;

export interface RecipeAdjustment {
  id: string;
  recipeId: string;
  cookLogId: string;
  status: RecipeAdjustmentStatus;
  suggestions: RecipeAdjustmentSuggestion[];
  createdAt: string;
  appliedAt?: string;
}

export interface Recipe {
  id: string;
  title: string;
  sourceUrl: string;
  sourceType: SourceType;
  mainImageUri?: string;
  baseServings: number;
  isFavorite: boolean;
  wantToCook: boolean;
  isArchived: boolean;
  ingredients: Ingredient[];
  steps: Step[];
  tags: string[];
  cuisine?: string;
  cookLogs: CookLog[];
  createdAt: string;
  updatedAt: string;
}

export interface RecipeListItem {
  id: string;
  title: string;
  cuisine?: string;
  heroUri?: string;
  mainImageUri?: string;
  cookCount: number;
  isFavorite: boolean;
  wantToCook: boolean;
  isArchived: boolean;
  lastCookedAt?: string;
  updatedAt: string;
  tags: string[];
}
