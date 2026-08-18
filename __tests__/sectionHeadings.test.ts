import { isIngredientSectionHeading } from '@/domain/scaling';
import type { Ingredient } from '@/types/recipe';

function ingredient(overrides: Partial<Ingredient>): Ingredient {
  return {
    id: 'i1',
    quantity: 0,
    unit: null,
    name: '',
    scalable: false,
    amountMode: 'exact',
    sortOrder: 0,
    ...overrides,
  };
}

describe('isIngredientSectionHeading', () => {
  it('honours the explicit flag regardless of shape', () => {
    expect(
      isIngredientSectionHeading(
        ingredient({ name: 'Sponge', isSectionHeading: true })
      )
    ).toBe(true);
  });

  it('treats a trailing colon as a heading', () => {
    expect(isIngredientSectionHeading(ingredient({ name: 'For the sponge:' }))).toBe(
      true
    );
  });

  it('treats a leading "For" as a heading', () => {
    expect(isIngredientSectionHeading(ingredient({ name: 'For the glaze' }))).toBe(
      true
    );
  });

  it('treats numbered labels as headings', () => {
    expect(isIngredientSectionHeading(ingredient({ name: '1) Dough' }))).toBe(true);
    expect(isIngredientSectionHeading(ingredient({ name: 'Step 2 filling' }))).toBe(
      true
    );
  });

  it('does not hide a title-case ingredient that simply has no amount', () => {
    // Regression: this used to render as a section header, silently dropping
    // the ingredient from the list.
    expect(isIngredientSectionHeading(ingredient({ name: 'Olive Oil' }))).toBe(false);
    expect(
      isIngredientSectionHeading(ingredient({ name: 'Parmesan Reggiano' }))
    ).toBe(false);
  });

  it('never treats a row with an amount or unit as a heading', () => {
    expect(
      isIngredientSectionHeading(ingredient({ name: 'For the glaze', quantity: 2 }))
    ).toBe(false);
    expect(
      isIngredientSectionHeading(ingredient({ name: 'For the glaze', unit: 'g' }))
    ).toBe(false);
  });

  it('never treats a to-taste row as a heading', () => {
    expect(
      isIngredientSectionHeading(
        ingredient({ name: 'For the glaze', amountMode: 'to_taste' })
      )
    ).toBe(false);
  });
});
