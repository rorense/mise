export type SourceType = 'url' | 'youtube' | 'instagram' | 'manual';

export interface ScalableQuantity {
  placeholder: string;
  baseQuantity: number;
  unit: string;
}

export interface Ingredient {
  id: string;
  quantity: number;
  unit: string | null;
  name: string;
  notes?: string;
  scalable: boolean;
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
  createdAt: string;
}

export interface Recipe {
  id: string;
  title: string;
  sourceUrl: string;
  sourceType: SourceType;
  baseServings: number;
  isFavorite: boolean;
  wantToCook: boolean;
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
  cookCount: number;
  isFavorite: boolean;
  wantToCook: boolean;
  lastCookedAt?: string;
  updatedAt: string;
  tags: string[];
}
