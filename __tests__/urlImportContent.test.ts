import {
  excerptHtml,
  extractJsonLdRecipe,
  formatJsonLdRecipe,
  isUsableJsonLdRecipe,
} from '@/lib/import/jsonLd';
import { buildUrlImportContent } from '@/lib/import/pipeline';

/** A page shaped the way a real recipe blog is: the card is nested in @graph. */
function pageWithJsonLd(recipe: Record<string, unknown>, body = ''): string {
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Organization', name: 'Some Food Blog' },
      { '@type': 'WebPage', name: 'Lemon drizzle loaf' },
      { '@type': 'Recipe', ...recipe },
    ],
  };
  return `<!doctype html><html><head>
<script type="application/ld+json">${JSON.stringify(graph)}</script>
</head><body>${body}</body></html>`;
}

const FULL_RECIPE = {
  name: 'Lemon Drizzle Loaf',
  description: 'A very lemony loaf.',
  recipeYield: ['8', '8 slices'],
  recipeCuisine: 'British',
  recipeCategory: 'Dessert',
  keywords: 'baking, cake, lemon',
  prepTime: 'PT20M',
  cookTime: 'PT1H15M',
  recipeIngredient: [
    '225 g unsalted butter, softened',
    '1&frac12; tsp baking powder',
    '4 large eggs',
    '2 lemons, zest &amp; juice',
  ],
  recipeInstructions: [
    { '@type': 'HowToStep', text: 'Heat the oven to 180°C and line a loaf tin.' },
    {
      '@type': 'HowToStep',
      text: '<p>Beat the butter and sugar for 4 minutes until pale.</p>',
    },
    { '@type': 'HowToStep', text: 'Bake for 45 minutes until a skewer comes out clean.' },
  ],
};

describe('extractJsonLdRecipe', () => {
  it('pulls the publisher ingredient and method lines, not just the title', () => {
    const recipe = extractJsonLdRecipe(pageWithJsonLd(FULL_RECIPE));

    expect(recipe).not.toBeNull();
    expect(recipe?.title).toBe('Lemon Drizzle Loaf');
    expect(recipe?.ingredients).toHaveLength(4);
    expect(recipe?.instructions).toHaveLength(3);
    expect(isUsableJsonLdRecipe(recipe)).toBe(true);
  });

  it('finds a Recipe nested inside @graph rather than at the top level', () => {
    expect(extractJsonLdRecipe(pageWithJsonLd(FULL_RECIPE))?.title).toBe(
      'Lemon Drizzle Loaf'
    );
  });

  it('decodes entities and spells out fractions', () => {
    const recipe = extractJsonLdRecipe(pageWithJsonLd(FULL_RECIPE));
    expect(recipe?.ingredients[1]).toBe('1 1/2 tsp baking powder');
    expect(recipe?.ingredients[3]).toBe('2 lemons, zest & juice');
  });

  it('strips HTML out of an instruction string', () => {
    const recipe = extractJsonLdRecipe(pageWithJsonLd(FULL_RECIPE));
    expect(recipe?.instructions[1]).toBe(
      'Beat the butter and sugar for 4 minutes until pale.'
    );
  });

  it('takes the first entry of an array recipeYield', () => {
    expect(extractJsonLdRecipe(pageWithJsonLd(FULL_RECIPE))?.recipeYield).toBe('8');
  });

  it('reads a comma-joined keyword string as a list', () => {
    expect(extractJsonLdRecipe(pageWithJsonLd(FULL_RECIPE))?.keywords).toEqual([
      'baking',
      'cake',
      'lemon',
    ]);
  });

  it('flattens HowToSection groups and keeps the section names', () => {
    const recipe = extractJsonLdRecipe(
      pageWithJsonLd({
        ...FULL_RECIPE,
        recipeInstructions: [
          {
            '@type': 'HowToSection',
            name: 'For the loaf',
            itemListElement: [
              { '@type': 'HowToStep', text: 'Cream the butter and sugar.' },
              { '@type': 'HowToStep', text: 'Fold in the flour.' },
            ],
          },
          {
            '@type': 'HowToSection',
            name: 'For the drizzle',
            itemListElement: [{ '@type': 'HowToStep', text: 'Mix juice and sugar.' }],
          },
        ],
      })
    );

    expect(recipe?.instructions).toEqual([
      '[For the loaf]',
      'Cream the butter and sugar.',
      'Fold in the flour.',
      '[For the drizzle]',
      'Mix juice and sugar.',
    ]);
  });

  it('splits a single numbered instruction blob back into steps', () => {
    const recipe = extractJsonLdRecipe(
      pageWithJsonLd({
        ...FULL_RECIPE,
        recipeInstructions:
          '1. Heat the oven to 180°C. 2. Beat the butter and sugar. 3. Bake for 45 minutes.',
      })
    );
    expect(recipe?.instructions).toHaveLength(3);
    expect(recipe?.instructions[2]).toContain('Bake for 45 minutes');
  });

  it('returns null when the page carries no recipe block', () => {
    expect(extractJsonLdRecipe('<html><body>no structured data</body></html>')).toBeNull();
  });

  it('skips a malformed block instead of losing the whole page', () => {
    const html = `<script type="application/ld+json">{ not json </script>${pageWithJsonLd(
      FULL_RECIPE
    )}`;
    expect(extractJsonLdRecipe(html)?.title).toBe('Lemon Drizzle Loaf');
  });
});

describe('formatJsonLdRecipe', () => {
  it('renders one ingredient per line and numbers the method', () => {
    const recipe = extractJsonLdRecipe(pageWithJsonLd(FULL_RECIPE));
    const text = formatJsonLdRecipe(recipe!);

    expect(text).toContain('PUBLISHER RECIPE DATA (authoritative)');
    expect(text).toContain('- 225 g unsalted butter, softened');
    expect(text).toContain('1. Heat the oven to 180°C and line a loaf tin.');
    expect(text).toContain('Yield: 8');
    expect(text).toContain('Cook time: 1 h 15 min');
  });
});

const INGREDIENT_LIST = `<ul class="ingredients">
  <li>225 g unsalted butter</li>
  <li>1 &frac12; tsp baking powder</li>
  <li>4 large eggs</li>
</ul>`;

describe('excerptHtml', () => {
  it('keeps list items on separate lines instead of running them together', () => {
    const lines = excerptHtml(INGREDIENT_LIST, 5000).split('\n');
    expect(lines).toEqual([
      '225 g unsalted butter',
      '1 1/2 tsp baking powder',
      '4 large eggs',
    ]);
  });

  it('drops navigation and footer link soup', () => {
    const html = `<nav><a href="/">Home</a><a href="/about">About</a></nav>
      ${INGREDIENT_LIST}
      <footer>All rights reserved</footer>`;
    const text = excerptHtml(html, 5000);
    expect(text).not.toContain('About');
    expect(text).not.toContain('All rights reserved');
    expect(text).toContain('225 g unsalted butter');
  });

  it('keeps the recipe when it sits below a long preamble', () => {
    const preamble = Array.from(
      { length: 400 },
      (_, i) =>
        `<p>Paragraph ${i} about the summer I first visited my grandmother in the countryside.</p>`
    ).join('');
    const html = `<html><body>${preamble}
      <h2>Ingredients</h2>${INGREDIENT_LIST}
      <h2>Method</h2><ol><li>Preheat the oven to 180°C and bake for 45 minutes until golden.</li></ol>
      </body></html>`;

    const text = excerptHtml(html, 2000);
    expect(text.length).toBeLessThanOrEqual(2000);
    // The old take-the-first-N-characters behaviour returned only the preamble.
    expect(text).toContain('225 g unsalted butter');
    expect(text).toContain('Preheat the oven');
  });

  it('returns the whole page when it already fits', () => {
    expect(excerptHtml('<p>Short page</p>', 5000)).toBe('Short page');
  });
});

describe('buildUrlImportContent', () => {
  it('leads with the publisher block and marks the page text as secondary', () => {
    const content = buildUrlImportContent(pageWithJsonLd(FULL_RECIPE, INGREDIENT_LIST));

    expect(content.indexOf('PUBLISHER RECIPE DATA (authoritative)')).toBe(0);
    expect(content).toContain('PAGE TEXT (supporting context only');
    expect(content).toContain('- 225 g unsalted butter, softened');
    expect(content).toContain('4 large eggs');
  });

  it('falls back to page text alone when there is no structured block', () => {
    const content = buildUrlImportContent(`<html><body>${INGREDIENT_LIST}</body></html>`);
    expect(content).not.toContain('PUBLISHER RECIPE DATA');
    expect(content).toContain('225 g unsalted butter');
  });
});
