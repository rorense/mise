import {
  formatQuantity,
  renderStepInstruction,
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

describe('renderStepInstruction', () => {
  it('does not duplicate units when instruction already includes unit text', () => {
    expect(
      renderStepInstruction(
        {
          id: 's1',
          order: 0,
          instruction: 'Add {{qty_1}} g sugar and mix.',
          scalableQuantities: [
            { placeholder: '{{qty_1}}', baseQuantity: 100, unit: 'g' },
          ],
        },
        4,
        2,
        'compact'
      )
    ).toBe('Add 50 g sugar and mix.');
  });

  it('keeps unit in replacement when instruction has only placeholder', () => {
    expect(
      renderStepInstruction(
        {
          id: 's2',
          order: 0,
          instruction: 'Whisk in {{qty_1}}.',
          scalableQuantities: [
            { placeholder: '{{qty_1}}', baseQuantity: 30, unit: 'ml' },
          ],
        },
        2,
        4,
        'compact'
      )
    ).toBe('Whisk in 60 ml.');
  });
});
