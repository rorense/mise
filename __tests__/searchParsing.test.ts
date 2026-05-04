import { estimateStepMinutes, parseSearchQuery } from '@/data/recipes';

describe('parseSearchQuery', () => {
  it('parses structured tokens and plain terms', () => {
    const parsed = parseSearchQuery(
      'has:chicken no:nuts tag:weeknight -tag:dessert cuisine:thai -cuisine:french is:favorite is:cooked mins<30 spicy "green curry"'
    );

    expect(parsed.includeIngredients).toEqual(['chicken']);
    expect(parsed.excludeIngredients).toEqual(['nuts']);
    expect(parsed.includeTags).toEqual(['weeknight']);
    expect(parsed.excludeTags).toEqual(['dessert']);
    expect(parsed.includeCuisine).toEqual(['thai']);
    expect(parsed.excludeCuisine).toEqual(['french']);
    expect(parsed.flags.favorite).toBe(true);
    expect(parsed.flags.cooked).toBe(true);
    expect(parsed.minutes).toEqual({ op: '<', value: 30 });
    expect(parsed.textTerms).toEqual(['spicy', 'green curry']);
  });

  it('handles uncooked flag and mixed-case minute token', () => {
    const parsed = parseSearchQuery('is:uncooked MINS>=45');
    expect(parsed.flags.cooked).toBe(false);
    expect(parsed.minutes).toEqual({ op: '>=', value: 45 });
  });
});

describe('estimateStepMinutes', () => {
  it('accumulates minute and hour units', () => {
    const total = estimateStepMinutes('Bake for 45 min, then rest 1 hour.');
    expect(total).toBe(105);
  });

  it('uses midpoint for minute ranges', () => {
    const total = estimateStepMinutes('Simmer 10-15 min and cool 5 min.');
    expect(total).toBe(18);
  });
});
