import { ThemeProvider } from '@/theme/ThemeContext';
import React from 'react';
import type { ReactTestInstance } from 'react-test-renderer';
import { act, create } from 'react-test-renderer';

/**
 * Mounts real screens against a mocked data layer. `tsc` and the Metro bundle
 * prove the module graph resolves; this proves the screens actually render —
 * catching bad style values, hook-order faults and undefined access that only
 * surface once React walks the tree.
 *
 * Note the explicit `.tsx` on `@/app/index.tsx`: under Jest's resolver the
 * extensionless form matches `app.json` first and yields a module with no
 * default export, so the screen renders as `undefined`. Metro resolves it
 * correctly, so this is a test-harness quirk — but do not drop the extension.
 */

const mockRouter = {
  push: jest.fn(),
  back: jest.fn(),
  replace: jest.fn(),
  canGoBack: jest.fn(() => true),
};

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({ id: 'recipe-1' }),
  // Run the effect body once, like a real focus would.
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React_ = jest.requireActual('react');
    React_.useEffect(() => cb(), []);
  },
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }),
}));

jest.mock('@/lib/secrets', () => ({
  getAppearance: jest.fn(async () => null),
  setAppearance: jest.fn(async () => undefined),
  getOnboarded: jest.fn(async () => true),
  setOnboarded: jest.fn(async () => undefined),
}));

jest.mock('@/lib/ai/offlineQueue', () => ({
  drainOfflineAiQueue: jest.fn(async () => undefined),
}));

const RECIPE_CARD = {
  id: 'recipe-1',
  title: 'Roast Chicken',
  cuisine: 'French',
  cookCount: 3,
  isFavorite: true,
  wantToCook: false,
  heroUri: null,
};

jest.mock('@/data/recipes', () => ({
  getAllTags: jest.fn(async () => ['weeknight', 'roast']),
  getAllCuisines: jest.fn(async () => ['French', 'Thai']),
  listRecipeCards: jest.fn(async () => [RECIPE_CARD]),
  listRecipeVersions: jest.fn(async () => [
    {
      id: 'v1',
      recipeId: 'recipe-1',
      label: 'Before AI tweak',
      createdAt: '2026-01-02T10:00:00.000Z',
    },
  ]),
  restoreRecipeVersion: jest.fn(async () => true),
}));

// `jest.mock` calls above are hoisted over these, so the screens load against
// the mocked data layer. Required rather than imported because the resolver
// needs the explicit `.tsx` (see the note at the top of this file).
/* eslint-disable @typescript-eslint/no-require-imports */
const LibraryScreen = require('@/app/index.tsx').default as React.ComponentType;
const OnboardingScreen = require('@/app/onboarding.tsx').default as React.ComponentType;
const VersionsScreen = require('@/app/recipe/versions/[id].tsx')
  .default as React.ComponentType;
const { setOnboarded } = require('@/lib/secrets') as {
  setOnboarded: jest.Mock;
};
const { restoreRecipeVersion } = require('@/data/recipes') as {
  restoreRecipeVersion: jest.Mock;
};
/* eslint-enable @typescript-eslint/no-require-imports */

async function renderScreen(ui: React.ReactElement) {
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<ThemeProvider>{ui}</ThemeProvider>);
  });
  return renderer;
}

/**
 * Collects the rendered text. Walks the tree rather than stringifying it —
 * a rendered `Modal` carries a circular context reference that JSON chokes on.
 */
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

function pressableLabelled(root: ReactTestInstance, label: string): ReactTestInstance {
  const matches = root.findAll(
    (n) => n.props?.accessibilityLabel === label && typeof n.props?.onPress === 'function'
  );
  expect(matches.length).toBeGreaterThan(0);
  return matches[matches.length - 1];
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('library screen', () => {
  it('renders the header, filters and a recipe card', async () => {
    const tree = await renderScreen(<LibraryScreen />);
    const body = textIn(tree);

    expect(body).toContain('Mise en');
    expect(body).toContain('Roast Chicken');
    expect(body).toContain('Favorites');
    expect(body).toContain('3 cooks');
  });

  it('describes each card as one phrase for a screen reader', async () => {
    const tree = await renderScreen(<LibraryScreen />);

    const card = tree.root.findAll(
      (n) =>
        typeof n.props?.accessibilityLabel === 'string' &&
        n.props.accessibilityLabel.startsWith('Roast Chicken')
    )[0];

    expect(card.props.accessibilityLabel).toBe(
      'Roast Chicken, French, cooked 3 times, favourite'
    );
    expect(card.props.accessibilityHint).toBe('Opens the recipe');
  });

  it('opens the recipe when a card is pressed', async () => {
    const tree = await renderScreen(<LibraryScreen />);
    const card = pressableLabelled(
      tree.root,
      'Roast Chicken, French, cooked 3 times, favourite'
    );

    act(() => card.props.onPress());
    expect(mockRouter.push).toHaveBeenCalledWith('/recipe/recipe-1');
  });

  it('reaches settings and the add-recipe flow from the header', async () => {
    const tree = await renderScreen(<LibraryScreen />);

    act(() => pressableLabelled(tree.root, 'Settings').props.onPress());
    expect(mockRouter.push).toHaveBeenCalledWith('/settings');

    act(() => pressableLabelled(tree.root, 'Add recipe').props.onPress());
    expect(mockRouter.push).toHaveBeenCalledWith('/import');
  });

  it('toggles between grid and list without crashing', async () => {
    const tree = await renderScreen(<LibraryScreen />);

    act(() => pressableLabelled(tree.root, 'Switch to list view').props.onPress());
    expect(() =>
      pressableLabelled(tree.root, 'Switch to grid view')
    ).not.toThrow();
  });
});

describe('onboarding screen', () => {
  it('renders the welcome copy and quick-start steps', async () => {
    const tree = await renderScreen(<OnboardingScreen />);
    const body = textIn(tree);

    expect(body).toContain('Welcome to Mise en');
    expect(body).toContain('Quick start');
    expect(body).toContain('Log each cook with a photo and notes.');
  });

  it('marks onboarding done and lands on the library', async () => {
    const tree = await renderScreen(<OnboardingScreen />);

    await act(async () => {
      await pressableLabelled(tree.root, 'Start using Mise en').props.onPress();
    });

    expect(setOnboarded).toHaveBeenCalledWith(true);
    expect(mockRouter.replace).toHaveBeenCalledWith('/');
  });
});

describe('recipe versions screen', () => {
  it('lists saved versions', async () => {
    const tree = await renderScreen(<VersionsScreen />);
    const body = textIn(tree);

    expect(body).toContain('Recipe versions');
    expect(body).toContain('Before AI tweak');
  });

  it('restores a version and navigates to the recipe', async () => {
    const tree = await renderScreen(<VersionsScreen />);

    await act(async () => {
      await pressableLabelled(
        tree.root,
        'Restore version: Before AI tweak'
      ).props.onPress();
    });

    expect(restoreRecipeVersion).toHaveBeenCalledWith('v1');
    expect(mockRouter.replace).toHaveBeenCalledWith('/recipe/recipe-1');
  });
});
