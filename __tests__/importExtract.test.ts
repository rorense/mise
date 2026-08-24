import {
  analyzeSourceMethod,
  parseRecipeJson,
  stepsAreDetailedEnough,
} from '@/lib/import/extract';
import type { Step } from '@/types/recipe';

describe('parseRecipeJson ingredient components', () => {
  it('preserves explicit component heading rows from model output', () => {
    const parsed = parseRecipeJson(
      JSON.stringify({
        title: 'Layered Cake',
        baseServings: 8,
        cuisine: null,
        tags: [],
        ingredients: [
          {
            quantity: 0,
            unit: null,
            name: 'Sponge Cake',
            notes: null,
            scalable: false,
            amountMode: 'exact',
          },
          {
            quantity: 40,
            unit: 'g',
            name: 'flour',
            notes: null,
            scalable: true,
            amountMode: 'exact',
          },
        ],
        steps: [{ instruction: 'Mix and bake.' }],
      })
    );

    expect(parsed).not.toBeNull();
    expect(parsed?.ingredients[0]).toMatchObject({
      quantity: 0,
      unit: null,
      name: 'Sponge Cake',
      scalable: false,
      amountMode: 'exact',
    });
  });

  it('injects section headings from ingredient section metadata', () => {
    const parsed = parseRecipeJson(
      JSON.stringify({
        title: 'Layered Cake',
        baseServings: 8,
        cuisine: null,
        tags: [],
        ingredients: [
          {
            quantity: 100,
            unit: 'g',
            name: 'sugar',
            notes: null,
            scalable: true,
            amountMode: 'exact',
            section: 'Simple Syrup',
          },
          {
            quantity: 110,
            unit: 'ml',
            name: 'boiling water',
            notes: null,
            scalable: true,
            amountMode: 'exact',
            section: 'Simple Syrup',
          },
        ],
        steps: [{ instruction: 'Stir until dissolved.' }],
      })
    );

    expect(parsed).not.toBeNull();
    expect(parsed?.ingredients[0]).toMatchObject({
      quantity: 0,
      unit: null,
      name: 'Simple Syrup',
      scalable: false,
      amountMode: 'exact',
    });
    expect(parsed?.ingredients[1]).toMatchObject({
      quantity: 100,
      unit: 'g',
      name: 'sugar',
    });
  });

  it('keeps real ingredients numeric when quantity includes text units', () => {
    const parsed = parseRecipeJson(
      JSON.stringify({
        title: 'Layered Cake',
        baseServings: 8,
        cuisine: null,
        tags: [],
        ingredients: [
          {
            quantity: '1 batch',
            unit: null,
            name: 'raspberry jam filling',
            notes: null,
            scalable: true,
            amountMode: 'exact',
          },
        ],
        steps: [{ instruction: 'Use for filling.' }],
      })
    );

    expect(parsed).not.toBeNull();
    expect(parsed?.ingredients[0]).toMatchObject({
      quantity: 1,
      unit: null,
      name: 'raspberry jam filling',
      amountMode: 'exact',
    });
  });

  it('recovers an ingredient from heading notes instead of keeping zero-only entry', () => {
    const parsed = parseRecipeJson(
      JSON.stringify({
        title: 'Layered Cake',
        baseServings: 8,
        cuisine: null,
        tags: [],
        ingredients: [
          {
            quantity: 0,
            unit: null,
            name: 'Raspberry Jam',
            notes: '1 batch of my raspberry jam filling recipe',
            scalable: false,
            amountMode: 'exact',
          },
        ],
        steps: [{ instruction: 'Use for filling.' }],
      })
    );

    expect(parsed).not.toBeNull();
    expect(parsed?.ingredients[0]).toMatchObject({
      quantity: 0,
      unit: null,
      name: 'Raspberry Jam',
      amountMode: 'exact',
    });
    expect(parsed?.ingredients[1]).toMatchObject({
      quantity: 1,
      unit: null,
      name: 'my raspberry jam filling recipe',
      amountMode: 'exact',
    });
  });

  it('preserves numbered heading rows from model output', () => {
    const parsed = parseRecipeJson(
      JSON.stringify({
        title: 'Nilagang Baboy',
        baseServings: 5,
        cuisine: 'filipino',
        tags: ['soup'],
        ingredients: [
          {
            quantity: 0,
            unit: null,
            name: '1. Broth Base',
            notes: null,
            scalable: false,
            amountMode: 'exact',
          },
          {
            quantity: 1.5,
            unit: 'kg',
            name: 'pork spare ribs',
            notes: null,
            scalable: true,
            amountMode: 'exact',
          },
        ],
        steps: [{ instruction: 'Simmer until tender.' }],
      })
    );

    expect(parsed).not.toBeNull();
    expect(parsed?.ingredients[0]).toMatchObject({
      quantity: 0,
      unit: null,
      name: '1. Broth Base',
      scalable: false,
      amountMode: 'exact',
    });
    expect(parsed?.ingredients[1]).toMatchObject({
      quantity: 1.5,
      unit: 'kg',
      name: 'pork spare ribs',
    });
  });

  it('forces salt and pepper ingredients to to_taste', () => {
    const parsed = parseRecipeJson(
      JSON.stringify({
        title: 'Simple Soup',
        baseServings: 2,
        cuisine: null,
        tags: ['soup'],
        ingredients: [
          {
            quantity: 0,
            unit: null,
            name: 'salt',
            notes: 'start with a small pinch',
            scalable: false,
            amountMode: 'exact',
          },
          {
            quantity: 300,
            unit: 'g',
            name: 'potatoes',
            notes: null,
            scalable: true,
            amountMode: 'exact',
          },
        ],
        steps: [{ instruction: 'Simmer until tender.' }],
      })
    );

    expect(parsed).not.toBeNull();
    expect(parsed?.ingredients).toHaveLength(2);
    expect(parsed?.ingredients[0]).toMatchObject({
      quantity: 0,
      unit: null,
      name: 'salt',
      notes: 'start with a small pinch',
      scalable: false,
      amountMode: 'to_taste',
    });
  });
});

const BRISKET_SOURCE = `SLOW COOKER BEEF BRISKET PASTA

Serves: 4

Cook Time: 8 hours on low or 4 hours on high

Ingredients
1.2 kg beef brisket

Method:
1. Pat the beef brisket dry and season with salt and pepper. Heat olive oil in a frying pan over medium-high heat. Sear the brisket on all sides until well browned.

2. Transfer the seared brisket to your slow cooker. Add onion, garlic, tinned tomatoes, tomato paste, red wine, beef stock, and dried Italian herbs.

3. Cover and cook on low for 8 hours or high for 4 hours, until the brisket is fall-apart tender.

4. Remove the brisket, shred it using two forks, then return it to the sauce in the slow cooker. Stir well to combine.

5. Meanwhile, cook your pasta separately according to packet instructions. Drain and add it to the slow cooker. Stir through the brisket sauce until well coated.

6. Dish it up with a generous sprinkle of grated Parmesan and fresh parsley. Season to taste.`;

function makeSteps(instructions: string[]): Step[] {
  return instructions.map((instruction, order) => ({
    id: `step-${order}`,
    order,
    instruction,
    scalableQuantities: [],
  }));
}

describe('import method validation', () => {
  it('detects substantial method text in pasted recipes', () => {
    const analysis = analyzeSourceMethod(BRISKET_SOURCE);
    expect(analysis.hasSubstantialMethod).toBe(true);
    expect(analysis.numberedStepCount).toBeGreaterThanOrEqual(6);
  });

  it('accepts condensed model steps when the source method is substantial', () => {
    const condensed = makeSteps([
      'Prepare the brisket in a pan until coloured on all sides.',
      'Add everything to the slow cooker and leave to cook.',
      'Pull the brisket apart and mix back into the sauce.',
      'Cook pasta and combine with the sauce.',
      'Serve with cheese and herbs.',
    ]);

    expect(
      stepsAreDetailedEnough(condensed, { sourceHasSubstantialMethod: true })
    ).toBe(true);
    expect(stepsAreDetailedEnough(condensed)).toBe(false);
  });

  it('still rejects empty methods without a substantial source', () => {
    expect(stepsAreDetailedEnough(makeSteps([]))).toBe(false);
    expect(
      stepsAreDetailedEnough(makeSteps(['Cook until done.']))
    ).toBe(false);
  });
});

describe('parseRecipeJson unit handling', () => {
  const recipeWith = (
    ingredients: unknown[],
    steps: unknown[] = [
      { instruction: 'Bake for 45 minutes until golden and firm.' },
    ]
  ) =>
    parseRecipeJson(
      JSON.stringify({
        title: 'US Recipe',
        baseServings: 4,
        cuisine: null,
        tags: [],
        ingredients,
        steps,
      })
    );

  it('converts the imperial amounts the model reported verbatim', () => {
    const parsed = recipeWith([
      {
        quantity: 8,
        unit: 'oz',
        name: 'cream cheese',
        notes: null,
        scalable: true,
        amountMode: 'exact',
      },
      {
        quantity: 1,
        unit: 'lb',
        name: 'beef mince',
        notes: null,
        scalable: true,
        amountMode: 'exact',
      },
      {
        quantity: 2,
        unit: 'cups',
        name: 'flour',
        notes: null,
        scalable: true,
        amountMode: 'exact',
      },
    ]);

    expect(parsed?.ingredients[0]).toMatchObject({ quantity: 225, unit: 'g' });
    expect(parsed?.ingredients[1]).toMatchObject({ quantity: 455, unit: 'g' });
    // Cup measures are what the source said and what the cook will use.
    expect(parsed?.ingredients[2]).toMatchObject({ quantity: 2, unit: 'cups' });
  });

  it('keeps a to-taste row instead of discarding the whole recipe over it', () => {
    const parsed = recipeWith([
      {
        quantity: 'to taste',
        unit: null,
        name: 'chilli flakes',
        notes: null,
        scalable: false,
        amountMode: 'to_taste',
      },
    ]);

    expect(parsed).not.toBeNull();
    expect(parsed?.ingredients[0]).toMatchObject({
      quantity: 0,
      unit: null,
      name: 'chilli flakes',
      amountMode: 'to_taste',
    });
  });

  it('still rejects an exact row with no readable quantity', () => {
    expect(
      recipeWith([
        {
          quantity: 'some',
          unit: 'g',
          name: 'flour',
          notes: null,
          scalable: true,
          amountMode: 'exact',
        },
      ])
    ).toBeNull();
  });

  it('moves a step placeholder unit along with its number', () => {
    const parsed = recipeWith(
      [
        {
          quantity: 8,
          unit: 'oz',
          name: 'flour',
          notes: null,
          scalable: true,
          amountMode: 'exact',
        },
      ],
      [
        {
          instruction: 'Whisk {{qty_1}} oz flour into the butter and cook for 2 minutes.',
          scalableQuantities: [
            { placeholder: '{{qty_1}}', baseQuantity: 8, unit: 'oz' },
          ],
        },
      ]
    );

    expect(parsed?.steps[0].instruction).toBe(
      'Whisk {{qty_1}} g flour into the butter and cook for 2 minutes.'
    );
    expect(parsed?.steps[0].scalableQuantities[0]).toEqual({
      placeholder: '{{qty_1}}',
      baseQuantity: 225,
      unit: 'g',
    });
  });

  it('converts fahrenheit left in a step instruction', () => {
    const parsed = recipeWith(
      [
        {
          quantity: 200,
          unit: 'g',
          name: 'flour',
          notes: null,
          scalable: true,
          amountMode: 'exact',
        },
      ],
      [{ instruction: 'Bake at 350°F for 45 minutes in a 9-inch tin.' }]
    );

    expect(parsed?.steps[0].instruction).toBe(
      'Bake at 175°C for 45 minutes in a 23 cm tin.'
    );
  });
});
