/* eslint-disable import/first -- jest.mock is hoisted above imports, so the
   mocks it closes over have to be declared before them. */
import { ThemeProvider } from '@/theme/ThemeContext';
import React from 'react';
import type { ReactTestInstance } from 'react-test-renderer';
import { act, create } from 'react-test-renderer';

/**
 * Drives the real Import screen through the real photo pipeline: screen ->
 * importFromImages -> prepareScanImage -> extractRecipeFromImages -> the real
 * JSON validators. Only the three things that cannot run in Node are faked —
 * the camera, the native image manipulator, and the network.
 *
 * This is as close to the on-device flow as a Jest run gets, and it asserts on
 * the actual HTTP body that would reach api.anthropic.com.
 */

const mockRouter = {
  push: jest.fn(),
  back: jest.fn(),
  replace: jest.fn(),
  canGoBack: jest.fn(() => true),
};

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({}),
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React_ = jest.requireActual('react');
    React_.useEffect(() => cb(), []);
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }),
}));

jest.mock('expo-clipboard', () => ({
  getStringAsync: jest.fn(async () => ''),
}));

jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn(async () => ({ isConnected: true })),
}));

const mockLaunchCamera = jest.fn();
const mockRequestCameraPermissions = jest.fn(async () => ({ granted: true }));

jest.mock('expo-image-picker', () => ({
  launchCameraAsync: (...a: unknown[]) => mockLaunchCamera(...a),
  requestCameraPermissionsAsync: () => mockRequestCameraPermissions(),
}));

// Stands in for the native module: echoes a per-image base64 so the request
// body can be checked for the right picture in the right slot.
const mockManipulateAsync = jest.fn(
  async (uri: string, _actions?: unknown, _opts?: unknown) => ({
    uri,
    width: 1650,
    height: 2200,
    base64: 'b64-' + uri.split('/').pop(),
  })
);

jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: (...a: unknown[]) =>
    mockManipulateAsync(...(a as [string, unknown, unknown])),
  SaveFormat: { JPEG: 'jpeg' },
}));

const mockOkCredentials = async () => ({
  ok: true,
  provider: 'anthropic',
  apiKey: 'test-key',
});

jest.mock('@/lib/aiConfig', () => ({
  getAiCredentials: jest.fn(mockOkCredentials),
  getImportAiCredentials: jest.fn(mockOkCredentials),
  describeAiUnavailable: jest.fn(() => ({ title: 'AI is off', message: '' })),
}));

const mockSetImportDraft = jest.fn();
jest.mock('@/lib/importDraftStore', () => ({
  setImportDraft: (...a: unknown[]) => mockSetImportDraft(...a),
}));

// jest-expo stubs expo-crypto: `Crypto.randomUUID()` is a function that returns
// undefined, so the real `newId()` silently yields undefined in every test.
// Counting ids here keeps the "each row gets its own id" assertion meaningful.
let mockIdCounter = 0;
jest.mock('@/lib/id', () => ({
  newId: () => `id-${++mockIdCounter}`,
}));

/* eslint-disable @typescript-eslint/no-require-imports */
const ImportScreen = require('@/app/import/index.tsx')
  .default as React.ComponentType;
/* eslint-enable @typescript-eslint/no-require-imports */

/**
 * Deliberately messy, the way a model actually replies: a fraction as a string,
 * component sections, salt with no amount, and a scaling placeholder. This is
 * what the validators have to survive on the photo path.
 */
const MODEL_JSON = JSON.stringify({
  title: 'Lemon Drizzle Loaf',
  baseServings: 8,
  cuisine: 'British',
  tags: ['baking', 'cake'],
  ingredients: [
    {
      quantity: 225,
      unit: 'g',
      name: 'unsalted butter',
      notes: 'softened',
      scalable: true,
      amountMode: 'exact',
      section: 'Loaf',
    },
    {
      quantity: '1 1/2',
      unit: 'tsp',
      name: 'baking powder',
      notes: null,
      scalable: true,
      amountMode: 'exact',
      section: 'Loaf',
    },
    {
      quantity: 0,
      unit: null,
      name: 'salt',
      notes: null,
      scalable: true,
      amountMode: 'exact',
      section: 'Loaf',
    },
    {
      quantity: 85,
      unit: 'g',
      name: 'caster sugar',
      notes: null,
      scalable: true,
      amountMode: 'exact',
      section: 'Drizzle',
    },
  ],
  steps: [
    {
      instruction:
        'Heat the oven to 180 °C and line a 900 g loaf tin with baking paper.',
      scalableQuantities: [],
    },
    {
      instruction:
        'Beat {{qty_1}} g butter with the sugar for 4 minutes until pale and fluffy, then add the eggs one at a time.',
      scalableQuantities: [
        { placeholder: '{{qty_1}}', baseQuantity: 225, unit: 'g' },
      ],
    },
    {
      instruction:
        'Bake for 45 minutes until a skewer comes out clean, then prick all over and spoon the drizzle on while still warm.',
      scalableQuantities: [],
    },
  ],
});

function claudeReplies(text: string): jest.Mock {
  const fetchMock = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ content: [{ type: 'text', text }] }),
    text: async () => '',
  }));
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function sentBody(fetchMock: jest.Mock): any {
  return JSON.parse(fetchMock.mock.calls[0][1].body);
}

/** Collects rendered text; walks the tree because Modal props are circular. */
function textIn(tree: ReturnType<typeof create>): string {
  const parts: string[] = [];
  const walk = (node: unknown): void => {
    if (node == null) return;
    if (typeof node === 'string' || typeof node === 'number') {
      parts.push(String(node));
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    const children = (node as { children?: unknown[] }).children;
    if (Array.isArray(children)) children.forEach(walk);
  };
  walk(tree.toJSON());
  return parts.join(' ');
}

async function renderScreen() {
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(
      <ThemeProvider>
        <ImportScreen />
      </ThemeProvider>
    );
  });
  return renderer;
}

function pressableLabelled(
  root: ReactTestInstance,
  label: string
): ReactTestInstance {
  const matches = root.findAll(
    (n) =>
      n.props?.accessibilityLabel === label &&
      typeof n.props?.onPress === 'function'
  );
  expect(matches.length).toBeGreaterThan(0);
  return matches[matches.length - 1];
}

async function press(root: ReactTestInstance, label: string) {
  await act(async () => {
    await pressableLabelled(root, label).props.onPress();
  });
}

/** Mount, switch to the Photo tab, and shoot `count` pages. */
async function shootPages(count: number) {
  mockLaunchCamera.mockImplementation(async () => {
    const n = mockLaunchCamera.mock.calls.length;
    return {
      canceled: false,
      assets: [{ uri: 'file://page' + n + '.jpg', width: 3000, height: 4000 }],
    };
  });
  const tree = await renderScreen();
  await press(tree.root, 'Import by photographing a recipe');
  await press(tree.root, 'Take a photo of a recipe');
  for (let i = 1; i < count; i += 1) {
    await press(tree.root, 'Take another photo of this recipe');
  }
  return tree;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockManipulateAsync.mockImplementation(async (uri: string) => ({
    uri,
    width: 1650,
    height: 2200,
    base64: 'b64-' + uri.split('/').pop(),
  }));
});

describe('photo import, end to end through the real pipeline', () => {
  it('turns two photographed pages into a saved draft', async () => {
    const fetchMock = claudeReplies(MODEL_JSON);
    const tree = await shootPages(2);

    await press(tree.root, 'Read recipe from photos');

    // 1. Two requests to Claude: the extraction, then the audit that re-reads
    //    the same photos against the draft. Both carry every page.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.anthropic.com/v1/messages'
    );
    const body = sentBody(fetchMock);
    const blocks = body.messages[0].content;
    expect(blocks.map((b: any) => b.type)).toEqual([
      'text',
      'image',
      'text',
      'image',
      'text',
    ]);
    expect(blocks[1].source.data).toBe('b64-page1.jpg');
    expect(blocks[3].source.data).toBe('b64-page2.jpg');
    expect(blocks[0].text).toBe('Image 1:');
    expect(blocks[2].text).toBe('Image 2:');
    expect(blocks[4].text).toContain('pages of a single recipe');

    // 2. The photo rules reached the model.
    expect(body.system).toContain('Never invent an ingredient');
    expect(body.model).toBe('claude-opus-5');

    // 3. The audit re-sends both photos alongside the candidate, so it re-reads
    //    the page rather than reasoning about its own draft in the abstract.
    const audit = JSON.parse(fetchMock.mock.calls[1][1].body);
    const auditBlocks = audit.messages[0].content;
    expect(auditBlocks.filter((b: any) => b.type === 'image')).toHaveLength(2);
    expect(auditBlocks[auditBlocks.length - 1].text).toContain(
      'CANDIDATE EXTRACTION:'
    );
    expect(auditBlocks[auditBlocks.length - 1].text).toContain(
      'Lemon Drizzle Loaf'
    );
    expect(audit.system).toContain('recipe extraction auditor');

    // 4. The reply became a real draft, and the editor opened for review.
    expect(mockSetImportDraft).toHaveBeenCalledTimes(1);
    expect(mockRouter.push).toHaveBeenCalledWith('/recipe/form');
  });

  it('keeps the draft when the audit call fails', async () => {
    // The audit is a safety net, not a gate: losing it must not lose the scan.
    let call = 0;
    global.fetch = jest.fn(async () => {
      call += 1;
      if (call === 1) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ content: [{ type: 'text', text: MODEL_JSON }] }),
          text: async () => '',
        };
      }
      throw new Error('network died mid-audit');
    }) as unknown as typeof fetch;

    const tree = await shootPages(1);
    await press(tree.root, 'Read recipe from photos');

    expect(mockSetImportDraft).toHaveBeenCalledTimes(1);
    expect(mockSetImportDraft.mock.calls[0][0].title).toBe('Lemon Drizzle Loaf');
    expect(mockRouter.push).toHaveBeenCalledWith('/recipe/form');
  });

  it('keeps the draft when the audit returns unusable JSON', async () => {
    let call = 0;
    global.fetch = jest.fn(async () => {
      call += 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          content: [
            { type: 'text', text: call === 1 ? MODEL_JSON : 'not json at all' },
          ],
        }),
        text: async () => '',
      };
    }) as unknown as typeof fetch;

    const tree = await shootPages(1);
    await press(tree.root, 'Read recipe from photos');

    expect(mockSetImportDraft).toHaveBeenCalledTimes(1);
    expect(mockSetImportDraft.mock.calls[0][0].title).toBe('Lemon Drizzle Loaf');
  });

  it('parses the messy reply the way the rest of the app expects', async () => {
    claudeReplies(MODEL_JSON);
    const tree = await shootPages(1);
    await press(tree.root, 'Read recipe from photos');

    const draft = mockSetImportDraft.mock.calls[0][0];

    expect(draft.title).toBe('Lemon Drizzle Loaf');
    expect(draft.baseServings).toBe(8);
    expect(draft.cuisine).toBe('British');
    expect(draft.sourceType).toBe('manual');
    expect(draft.sourceUrl).toBe('');
    expect(draft.wantToCook).toBe(true);
    expect(draft.id).toEqual(expect.any(String));

    // "1 1/2" as a string became a number.
    const bakingPowder = draft.ingredients.find(
      (i: any) => i.name === 'baking powder'
    );
    expect(bakingPowder.quantity).toBe(1.5);

    // Salt is forced to_taste even though the model said exact.
    const salt = draft.ingredients.find((i: any) => i.name === 'salt');
    expect(salt.amountMode).toBe('to_taste');
    expect(salt.scalable).toBe(false);

    // Section changes became heading rows.
    const headings = draft.ingredients.filter((i: any) => i.isSectionHeading);
    expect(headings.map((h: any) => h.name)).toEqual(['Loaf', 'Drizzle']);

    // Scaling placeholder survived onto the step.
    const step = draft.steps[1];
    expect(step.instruction).toContain('{{qty_1}}');
    expect(step.scalableQuantities[0]).toMatchObject({
      placeholder: '{{qty_1}}',
      baseQuantity: 225,
      unit: 'g',
    });

    // Every row got its own id, and the steps came out in order.
    const ids = [
      ...draft.ingredients.map((i: any) => i.id),
      ...draft.steps.map((s: any) => s.id),
    ];
    expect(ids.every((id) => typeof id === 'string' && id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    expect(draft.steps.map((s: any) => s.order)).toEqual([0, 1, 2]);
  });

  it('resizes on the long edge and asks for base64, once per page', async () => {
    claudeReplies(MODEL_JSON);
    const tree = await shootPages(2);
    await press(tree.root, 'Read recipe from photos');

    // Two pages, two manipulator calls: the measuring pass was skipped because
    // the camera already reported the dimensions.
    expect(mockManipulateAsync).toHaveBeenCalledTimes(2);
    const [uri, actions, opts] = mockManipulateAsync.mock.calls[0];
    expect(uri).toBe('file://page1.jpg');
    // 3000x4000 is portrait, so the height is what gets constrained.
    expect(actions).toEqual([{ resize: { height: 2200 } }]);
    expect(opts).toMatchObject({
      base64: true,
      format: 'jpeg',
      compress: 0.85,
    });
  });

  it('refuses a fifth page rather than sending an oversized request', async () => {
    claudeReplies(MODEL_JSON);
    const tree = await shootPages(4);

    await press(tree.root, 'Take another photo of this recipe');

    expect(mockLaunchCamera).toHaveBeenCalledTimes(4);
    expect(textIn(tree)).toContain('Up to 4 photos per recipe');
  });
});

describe('photo import failure paths', () => {
  it('does not call the camera without permission', async () => {
    mockRequestCameraPermissions.mockResolvedValueOnce({ granted: false });
    claudeReplies(MODEL_JSON);

    const tree = await renderScreen();
    await press(tree.root, 'Import by photographing a recipe');
    await press(tree.root, 'Take a photo of a recipe');

    expect(mockLaunchCamera).not.toHaveBeenCalled();
    expect(textIn(tree)).toContain('Camera permission is required.');
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('adds nothing when the user backs out of the camera', async () => {
    claudeReplies(MODEL_JSON);
    mockLaunchCamera.mockResolvedValue({ canceled: true, assets: null });

    const tree = await renderScreen();
    await press(tree.root, 'Import by photographing a recipe');
    await press(tree.root, 'Take a photo of a recipe');

    // Still on the empty state: the extract button never appeared.
    expect(() =>
      pressableLabelled(tree.root, 'Read recipe from photos')
    ).toThrow();
  });

  it('stops before the network when offline', async () => {
    const fetchMock = claudeReplies(MODEL_JSON);
    /* eslint-disable @typescript-eslint/no-require-imports */
    const NetInfo = require('@react-native-community/netinfo') as {
      fetch: jest.Mock;
    };
    /* eslint-enable @typescript-eslint/no-require-imports */
    NetInfo.fetch.mockResolvedValueOnce({ isConnected: false });

    const tree = await shootPages(1);
    await press(tree.root, 'Read recipe from photos');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(textIn(tree)).toContain('Connect to Wi-Fi to import recipes.');
  });

  it('offers manual entry when the model cannot read the page', async () => {
    const fetchMock = claudeReplies('sorry, I cannot read this');
    const tree = await shootPages(1);

    await press(tree.root, 'Read recipe from photos');

    expect(mockSetImportDraft).not.toHaveBeenCalled();
    expect(mockRouter.push).not.toHaveBeenCalled();
    // Two attempts, then a photo-specific message with an escape hatch.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const body = textIn(tree);
    expect(body).toContain('Could not read a recipe from these photos');
    expect(body).toContain('Manual entry');
  });

  it('surfaces an API failure instead of hanging the spinner', async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({}),
      text: async () => 'invalid x-api-key',
    })) as unknown as typeof fetch;

    const tree = await shootPages(1);
    await press(tree.root, 'Read recipe from photos');

    expect(textIn(tree)).toContain('Claude error 401');
    expect(mockRouter.push).not.toHaveBeenCalled();
  });
});
