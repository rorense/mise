/* eslint-disable import/first -- jest.mock is hoisted above imports, so the
   mock function it closes over has to be declared before them. */
const mockLlmCompletion = jest.fn();

jest.mock('@/lib/llm', () => ({
  llmCompletion: (...args: unknown[]) => mockLlmCompletion(...args),
}));

import { extractRecipeFromImages } from '@/lib/import/extract';
import type { ScanImage } from '@/lib/import/scanImage';

const IMAGE: ScanImage = { base64: 'AAAA', mediaType: 'image/jpeg' };
const IMAGE_2: ScanImage = { base64: 'BBBB', mediaType: 'image/jpeg' };

/**
 * A minimal but *detailed enough* recipe — the method has to clear
 * stepsAreDetailedEnough or the extractor retries.
 */
const GOOD_RECIPE = JSON.stringify({
  title: 'Tomato Soup',
  baseServings: 4,
  cuisine: null,
  tags: ['dinner'],
  ingredients: [
    {
      quantity: 800,
      unit: 'g',
      name: 'tomatoes',
      notes: null,
      scalable: true,
      amountMode: 'exact',
    },
  ],
  steps: [
    {
      instruction:
        'Roast the tomatoes at 200 °C for 25 minutes until the skins blister and darken at the edges.',
      scalableQuantities: [],
    },
    {
      instruction:
        'Blend until smooth, then simmer over low heat for 10 minutes until slightly thickened.',
      scalableQuantities: [],
    },
  ],
});

/** Steps so thin that the quality gate rejects them on either branch. */
const THIN_RECIPE = JSON.stringify({
  title: 'Soup',
  baseServings: 4,
  cuisine: null,
  tags: [],
  ingredients: [],
  steps: [{ instruction: 'Cook until done', scalableQuantities: [] }],
});

type Turn = { role: string; content: unknown };

function sentMessages(call = 0): Turn[] {
  return mockLlmCompletion.mock.calls[call][2] as Turn[];
}

function sentOptions(call = 0): Record<string, unknown> {
  return mockLlmCompletion.mock.calls[call][3] as Record<string, unknown>;
}

beforeEach(() => {
  mockLlmCompletion.mockReset();
});

describe('extractRecipeFromImages request', () => {
  it('labels each image and puts the instruction last', async () => {
    mockLlmCompletion.mockResolvedValue(GOOD_RECIPE);
    await extractRecipeFromImages('anthropic', 'key', [IMAGE, IMAGE_2]);

    const user = sentMessages()[1].content as {
      type: string;
      text?: string;
      base64?: string;
    }[];
    expect(user.map((p) => p.type)).toEqual([
      'text',
      'image',
      'text',
      'image',
      'text',
    ]);
    expect(user[0].text).toBe('Image 1:');
    expect(user[2].text).toBe('Image 2:');
    expect(user[1].base64).toBe('AAAA');
    expect(user[3].base64).toBe('BBBB');
    expect(user[4].text).toContain('pages of a single recipe');
  });

  it('tells the model a single photo is one recipe', async () => {
    mockLlmCompletion.mockResolvedValue(GOOD_RECIPE);
    await extractRecipeFromImages('anthropic', 'key', [IMAGE]);

    const user = sentMessages()[1].content as { text?: string }[];
    expect(user[user.length - 1].text).toBe(
      'Extract the recipe shown in this photo.'
    );
  });

  it('sends the photo-specific transcription rules', async () => {
    mockLlmCompletion.mockResolvedValue(GOOD_RECIPE);
    await extractRecipeFromImages('anthropic', 'key', [IMAGE]);

    const system = sentMessages()[0].content as string;
    expect(system).toContain('Never invent an ingredient');
    expect(system).toContain('never return one recipe per image');
    // Still carries the shared schema and unit rules.
    expect(system).toContain('recipe extraction engine');
    expect(system).toContain('Report the amount exactly as the source states it');
  });

  it('uses the longer vision deadline, not the 60s text one', async () => {
    mockLlmCompletion.mockResolvedValue(GOOD_RECIPE);
    await extractRecipeFromImages('anthropic', 'key', [IMAGE]);
    expect(sentOptions().timeoutMs).toBe(120_000);
  });

  it('rejects an empty photo list before calling the model', async () => {
    await expect(
      extractRecipeFromImages('anthropic', 'key', [])
    ).rejects.toThrow('Add at least one photo.');
    expect(mockLlmCompletion).not.toHaveBeenCalled();
  });
});

describe('extractRecipeFromImages retry behaviour', () => {
  it('returns a parsed draft marked as a manual source', async () => {
    mockLlmCompletion.mockResolvedValue(GOOD_RECIPE);
    const recipe = await extractRecipeFromImages('anthropic', 'key', [IMAGE]);

    expect(recipe.title).toBe('Tomato Soup');
    expect(recipe.steps).toHaveLength(2);
    expect(recipe.sourceType).toBe('manual');
    expect(recipe.sourceUrl).toBe('');
  });

  it('strips a markdown fence the model wrapped the JSON in', async () => {
    mockLlmCompletion.mockResolvedValue('```json\n' + GOOD_RECIPE + '\n```');
    const recipe = await extractRecipeFromImages('anthropic', 'key', [IMAGE]);
    expect(recipe.title).toBe('Tomato Soup');
  });

  it('retries once with feedback, then succeeds', async () => {
    mockLlmCompletion
      .mockResolvedValueOnce('not json at all')
      .mockResolvedValue(GOOD_RECIPE);

    const recipe = await extractRecipeFromImages('anthropic', 'key', [IMAGE]);
    expect(recipe.title).toBe('Tomato Soup');
    // Failed attempt, successful retry, then the audit pass.
    expect(mockLlmCompletion).toHaveBeenCalledTimes(3);

    const retryUser = sentMessages(1)[1].content as { text?: string }[];
    expect(retryUser[retryUser.length - 1].text).toContain(
      'Additional instruction:'
    );
  });

  it('stops after two attempts rather than re-uploading a third time', async () => {
    mockLlmCompletion.mockResolvedValue('not json at all');

    await expect(
      extractRecipeFromImages('anthropic', 'key', [IMAGE])
    ).rejects.toThrow('Could not read a recipe from these photos');
    expect(mockLlmCompletion).toHaveBeenCalledTimes(2);
  });

  it('gives photo advice, not paste-more-text advice, when the method is thin', async () => {
    mockLlmCompletion.mockResolvedValue(THIN_RECIPE);

    await expect(
      extractRecipeFromImages('anthropic', 'key', [IMAGE])
    ).rejects.toThrow('Check the method page is included and in focus');
  });
});

/** The draft is corrected in place: 800 g of tomatoes was misread as 300 g. */
const AUDITED_RECIPE = GOOD_RECIPE.replace('"quantity":800', '"quantity":300');

describe('extractRecipeFromImages audit pass', () => {
  it('re-sends the photos with the draft and keeps the corrected result', async () => {
    mockLlmCompletion
      .mockResolvedValueOnce(GOOD_RECIPE)
      .mockResolvedValueOnce(AUDITED_RECIPE);

    const recipe = await extractRecipeFromImages('anthropic', 'key', [IMAGE]);

    expect(mockLlmCompletion).toHaveBeenCalledTimes(2);
    expect(recipe.ingredients[0].quantity).toBe(300);

    const auditSystem = sentMessages(1)[0].content as string;
    expect(auditSystem).toContain('recipe extraction auditor');

    const auditUser = sentMessages(1)[1].content as {
      type: string;
      text?: string;
    }[];
    // The photo goes back up: the audit re-reads the page, it does not just
    // reason about the draft.
    expect(auditUser.map((p) => p.type)).toEqual(['text', 'image', 'text']);
    expect(auditUser[2].text).toContain('CANDIDATE EXTRACTION:');
    expect(auditUser[2].text).toContain('Tomato Soup');
  });

  it('keeps the draft when the audit reply is unusable', async () => {
    mockLlmCompletion
      .mockResolvedValueOnce(GOOD_RECIPE)
      .mockResolvedValueOnce('I had trouble reading the second page.');

    const recipe = await extractRecipeFromImages('anthropic', 'key', [IMAGE]);
    expect(recipe.ingredients[0].quantity).toBe(800);
    expect(recipe.steps).toHaveLength(2);
  });

  it('keeps the draft when the audit call fails outright', async () => {
    mockLlmCompletion
      .mockResolvedValueOnce(GOOD_RECIPE)
      .mockRejectedValueOnce(new Error('Claude error 529: overloaded'));

    const recipe = await extractRecipeFromImages('anthropic', 'key', [IMAGE]);
    expect(recipe.title).toBe('Tomato Soup');
  });

  it('keeps the draft when the audit comes back gutted', async () => {
    const gutted = JSON.stringify({
      title: 'Tomato Soup',
      baseServings: 4,
      cuisine: null,
      tags: [],
      ingredients: [],
      steps: [
        {
          instruction:
            'Roast the tomatoes at 200 °C for 25 minutes until the skins blister.',
          scalableQuantities: [],
        },
      ],
    });
    mockLlmCompletion
      .mockResolvedValueOnce(GOOD_RECIPE)
      .mockResolvedValueOnce(gutted);

    const recipe = await extractRecipeFromImages('anthropic', 'key', [IMAGE]);
    expect(recipe.ingredients).toHaveLength(1);
    expect(recipe.steps).toHaveLength(2);
  });
});
