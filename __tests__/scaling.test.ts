import {
  buildChatIngredientLines,
  formatQuantity,
  renderStepInstruction,
  scaleForIngredient,
  scaleQuantity,
  splitIngredientSections,
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
      amountMode: 'exact',
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
      amountMode: 'exact',
      sortOrder: 0,
    };
    expect(scaleForIngredient(ing, 4, 1)).toBe(1);
  });

  it('keeps to-taste ingredients unscaled at display amount', () => {
    const ing: Ingredient = {
      id: '1',
      quantity: 0,
      unit: null,
      name: 'salt',
      scalable: false,
      amountMode: 'to_taste',
      sortOrder: 0,
    };
    expect(scaleForIngredient(ing, 4, 10)).toBe(0);
  });
});

describe('formatQuantity', () => {
  it('formats kitchen spoon and cup units as fractions', () => {
    expect(formatQuantity(0.8, 'tsp')).toBe('3/4 tsp');
    expect(formatQuantity(1.25, 'tbsp')).toBe('1 1/4 tbsp');
    expect(formatQuantity(0.5, 'cup')).toBe('1/2 cup');
    expect(formatQuantity(2, 'cup')).toBe('2 cup');
  });

  it('keeps numeric output for non-fractional units', () => {
    expect(formatQuantity(12.5, 'g')).toBe('12.5 g');
  });
});

describe('renderStepInstruction', () => {
  it('scales a quantity whose unit already follows it in the text', () => {
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
        2
      )
    ).toBe('Add 50 g sugar and mix.');
  });

  it('supplies the unit when the placeholder stands alone', () => {
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
        4
      )
    ).toBe('Whisk in 60 ml.');
  });

  it('uses kitchen fractions for spoon and cup units', () => {
    expect(
      renderStepInstruction(
        {
          id: 's3',
          order: 0,
          instruction: 'Stir in {{qty_1}} tsp vanilla.',
          scalableQuantities: [
            { placeholder: '{{qty_1}}', baseQuantity: 1, unit: 'tsp' },
          ],
        },
        4,
        2
      )
    ).toBe('Stir in 1/2 tsp vanilla.');
  });

  it('substitutes every occurrence of the same placeholder', () => {
    expect(
      renderStepInstruction(
        {
          id: 's4',
          order: 0,
          instruction: 'Add {{qty_1}} g now and {{qty_1}} g later.',
          scalableQuantities: [
            { placeholder: '{{qty_1}}', baseQuantity: 20, unit: 'g' },
          ],
        },
        2,
        4
      )
    ).toBe('Add 40 g now and 40 g later.');
  });

  it('never leaks an unmatched placeholder into the rendered step', () => {
    expect(
      renderStepInstruction(
        {
          id: 's5',
          order: 0,
          instruction: 'Fold in {{qty_9}} gently.',
          scalableQuantities: [],
        },
        4,
        4
      )
    ).toBe('Fold in gently.');
  });

  it('leaves steps without placeholders untouched', () => {
    expect(
      renderStepInstruction(
        {
          id: 's6',
          order: 0,
          instruction: 'Rest the dough for 20 minutes.',
          scalableQuantities: [],
        },
        4,
        8
      )
    ).toBe('Rest the dough for 20 minutes.');
  });
});

describe('splitIngredientSections', () => {
  it('treats zero-quantity heading rows as section titles', () => {
    const ingredients: Ingredient[] = [
      {
        id: 'h1',
        quantity: 0,
        unit: null,
        name: 'Sponge Cake',
        scalable: false,
        amountMode: 'exact',
        isSectionHeading: true,
        sortOrder: 0,
      },
      {
        id: 'i1',
        quantity: 40,
        unit: 'g',
        name: 'flour',
        scalable: true,
        amountMode: 'exact',
        sortOrder: 1,
      },
      {
        id: 'h2',
        quantity: 0,
        unit: null,
        name: 'Simple Syrup:',
        scalable: false,
        amountMode: 'exact',
        sortOrder: 2,
      },
      {
        id: 'i2',
        quantity: 100,
        unit: 'g',
        name: 'sugar',
        scalable: true,
        amountMode: 'exact',
        sortOrder: 3,
      },
    ];

    expect(splitIngredientSections(ingredients)).toEqual([
      { title: 'Sponge Cake', ingredients: [ingredients[1]] },
      { title: 'Simple Syrup', ingredients: [ingredients[3]] },
    ]);
  });

  it('treats numbered heading rows as section titles', () => {
    const ingredients: Ingredient[] = [
      {
        id: 'h1',
        quantity: 0,
        unit: null,
        name: '1. Broth Base',
        scalable: false,
        amountMode: 'exact',
        sortOrder: 0,
      },
      {
        id: 'i1',
        quantity: 1500,
        unit: 'g',
        name: 'pork spare ribs',
        scalable: true,
        amountMode: 'exact',
        sortOrder: 1,
      },
    ];

    expect(splitIngredientSections(ingredients)).toEqual([
      { title: '1. Broth Base', ingredients: [ingredients[1]] },
    ]);
  });

  it('does not treat plain ingredient labels as section titles', () => {
    const ingredients: Ingredient[] = [
      {
        id: 'i1',
        quantity: 0,
        unit: null,
        name: 'salt',
        scalable: false,
        amountMode: 'exact',
        sortOrder: 0,
      },
      {
        id: 'i2',
        quantity: 200,
        unit: 'g',
        name: 'potatoes',
        scalable: true,
        amountMode: 'exact',
        sortOrder: 1,
      },
    ];

    expect(splitIngredientSections(ingredients)).toEqual([
      { title: null, ingredients },
    ]);
  });
});

describe('buildChatIngredientLines', () => {
  it('preserves section headings in chat ingredient output', () => {
    const ingredients: Ingredient[] = [
      {
        id: 'h1',
        quantity: 0,
        unit: null,
        name: 'Sponge Cake',
        scalable: false,
        amountMode: 'exact',
        isSectionHeading: true,
        sortOrder: 0,
      },
      {
        id: 'i1',
        quantity: 40,
        unit: 'g',
        name: 'flour',
        scalable: true,
        amountMode: 'exact',
        sortOrder: 1,
      },
    ];

    expect(buildChatIngredientLines(ingredients, 4, 4)).toBe('Sponge Cake:\n- 40 g flour');
  });
});
