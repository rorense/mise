import {
  formatQuantity,
  scaleForIngredient,
  scaleQuantity,
} from '@/domain/scaling';
import type { Ingredient } from '@/types/recipe';

describe('scaleQuantity', () => {
  it('scales linearly', () => {
    expect(scaleQuantity(400, 4, 2)).toBe(200);
  });
});

describe('scaleForIngredient', () => {
  it('keeps non-scalable quantities', () => {
    const ing: Ingredient = {
      id: '1',
      quantity: 5,
      unit: 'g',
      name: 'salt',
      scalable: false,
      sortOrder: 0,
    };
    expect(scaleForIngredient(ing, 4, 8)).toBe(5);
  });

  it('rounds eggs to whole numbers', () => {
    const ing: Ingredient = {
      id: '1',
      quantity: 3,
      unit: null,
      name: 'free-range eggs',
      scalable: true,
      sortOrder: 0,
    };
    expect(scaleForIngredient(ing, 4, 1)).toBe(1);
  });
});

describe('formatQuantity', () => {
  it('uses numeric output in compact mode', () => {
    expect(formatQuantity(0.2, 'tsp', 'compact')).toBe('0.2 tsp');
  });

  it('uses friendly output in friendly mode', () => {
    expect(formatQuantity(0.2, 'tsp', 'friendly')).toBe('a pinch');
  });
});
