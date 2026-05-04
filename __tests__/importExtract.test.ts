import { parseRecipeJson } from '@/lib/import/extract';

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
});
