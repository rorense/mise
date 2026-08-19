import {
  Button,
  Card,
  Chip,
  IconButton,
  ModalCard,
  Screen,
  SegmentedControl,
  SwitchRow,
  Text,
  TextField,
} from '@/components/ui';
import { ThemeProvider } from '@/theme/ThemeContext';
import React from 'react';
import type { ReactTestInstance } from 'react-test-renderer';
import { act, create } from 'react-test-renderer';

jest.mock('@/lib/secrets', () => ({
  getAppearance: jest.fn(async () => null),
  setAppearance: jest.fn(async () => undefined),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }),
}));

const mockRouter = {
  push: jest.fn(),
  back: jest.fn(),
  replace: jest.fn(),
  canGoBack: jest.fn(() => true),
};
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
}));

/** Mounts inside the real ThemeProvider so components resolve real tokens. */
function render(ui: React.ReactElement) {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<ThemeProvider>{ui}</ThemeProvider>);
  });
  return renderer;
}

/**
 * `findAll` visits composite wrappers and the host elements they render, so a
 * single control matches several times — and the two halves carry different
 * props: React Native forwards the accessibility props down to the host `View`
 * but keeps `onPress` on the composite `Pressable`. Requiring both on the same
 * node picks out exactly one instance per control.
 */
function hasProps(
  root: ReactTestInstance,
  match: (props: Record<string, unknown>) => boolean
): ReactTestInstance[] {
  return root.findAll((n) => match((n.props ?? {}) as Record<string, unknown>));
}

function buttonsIn(root: ReactTestInstance): ReactTestInstance[] {
  return hasProps(
    root,
    (p) => p.accessibilityRole === 'button' && typeof p.onPress === 'function'
  );
}

/**
 * The innermost node carrying this label and every named handler — i.e. the
 * real control, not the wrapper component that was handed the same props.
 */
function control(
  root: ReactTestInstance,
  label: string,
  ...handlers: ('onPress' | 'onValueChange' | 'onFocus' | 'onBlur')[]
): ReactTestInstance {
  const matches = hasProps(
    root,
    (p) =>
      p.accessibilityLabel === label && handlers.every((h) => typeof p[h] === 'function')
  );
  expect(matches.length).toBeGreaterThan(0);
  return matches[matches.length - 1];
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Button', () => {
  it('renders its label and fires onPress', () => {
    const onPress = jest.fn();
    const tree = render(<Button label="Save" onPress={onPress} />);
    const button = buttonsIn(tree.root)[0];

    expect(button.props.accessibilityLabel).toBe('Save');
    act(() => button.props.onPress());
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('blocks presses and reports state while disabled', () => {
    const onPress = jest.fn();
    const tree = render(<Button label="Save" onPress={onPress} disabled />);
    const button = buttonsIn(tree.root)[0];

    expect(button.props.disabled).toBe(true);
    expect(button.props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('reports busy while loading', () => {
    const tree = render(<Button label="Save" onPress={jest.fn()} loading />);
    const button = buttonsIn(tree.root)[0];

    expect(button.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
  });

  it.each(['primary', 'secondary', 'ghost', 'destructive'] as const)(
    'renders the %s variant',
    (variant) => {
      expect(() =>
        render(<Button label="X" onPress={jest.fn()} variant={variant} />)
      ).not.toThrow();
    }
  );
});

describe('IconButton', () => {
  it('exposes its label and selected state', () => {
    const onPress = jest.fn();
    const tree = render(
      <IconButton
        icon="star"
        accessibilityLabel="Favourite"
        accessibilityState={{ selected: true }}
        onPress={onPress}
      />
    );
    const button = buttonsIn(tree.root)[0];

    expect(button.props.accessibilityLabel).toBe('Favourite');
    expect(button.props.accessibilityState).toMatchObject({ selected: true });
    act(() => button.props.onPress());
    expect(onPress).toHaveBeenCalled();
  });

  it('pads an undersized control out to a 48dp tap target', () => {
    const tree = render(
      <IconButton icon="add" accessibilityLabel="Add" onPress={jest.fn()} size={36} />
    );
    const button = buttonsIn(tree.root)[0];
    // 36 rendered + 6 slop on each side = 48.
    expect(button.props.hitSlop).toBe(6);
  });
});

describe('Chip', () => {
  it('reports selection through accessibilityState', () => {
    const tree = render(<Chip label="Favorites" active onPress={jest.fn()} />);
    const chip = buttonsIn(tree.root)[0];

    expect(chip.props.accessibilityLabel).toBe('Favorites');
    expect(chip.props.accessibilityState).toMatchObject({ selected: true });
  });

  it('describes the toggle direction in its hint', () => {
    const active = render(<Chip label="A" active onPress={jest.fn()} />);
    const inactive = render(<Chip label="A" onPress={jest.fn()} />);

    expect(buttonsIn(active.root)[0].props.accessibilityHint).toMatch(/remove/i);
    expect(buttonsIn(inactive.root)[0].props.accessibilityHint).toMatch(/appl/i);
  });
});

describe('Card', () => {
  it('is inert without onPress', () => {
    const tree = render(
      <Card>
        <Text>Body</Text>
      </Card>
    );
    expect(buttonsIn(tree.root)).toHaveLength(0);
  });

  it('becomes a labelled button with onPress', () => {
    const onPress = jest.fn();
    const tree = render(
      <Card onPress={onPress} accessibilityLabel="Open recipe">
        <Text>Body</Text>
      </Card>
    );
    const button = buttonsIn(tree.root)[0];

    expect(button.props.accessibilityLabel).toBe('Open recipe');
    act(() => button.props.onPress());
    expect(onPress).toHaveBeenCalled();
  });
});

describe('SegmentedControl', () => {
  it('marks exactly one option selected and reports changes', () => {
    const onChange = jest.fn();
    const tree = render(
      <SegmentedControl
        value="light"
        onChange={onChange}
        accessibilityLabel="Appearance"
        options={[
          { value: 'system', label: 'System' },
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
        ]}
      />
    );
    const radios = hasProps(tree.root, (p) => p.accessibilityRole === 'radio' && typeof p.onPress === 'function');

    expect(radios).toHaveLength(3);
    expect(radios.filter((r) => r.props.accessibilityState.selected)).toHaveLength(1);

    act(() => radios[2].props.onPress());
    expect(onChange).toHaveBeenCalledWith('dark');
  });
});

describe('SwitchRow', () => {
  it('labels the switch and forwards changes', () => {
    const onValueChange = jest.fn();
    const tree = render(
      <SwitchRow label="AI features" value onValueChange={onValueChange} />
    );
    const toggle = control(tree.root, 'AI features', 'onValueChange');

    expect(toggle.props.value).toBe(true);
    act(() => toggle.props.onValueChange(false));
    expect(onValueChange).toHaveBeenCalledWith(false);
  });
});

describe('TextField', () => {
  /** The outlined wrapper around the input, whose border is the focus ring. */
  function focusRingColor(tree: ReturnType<typeof create>): string {
    const outlined = hasProps(tree.root, (p) => {
      const s = p.style as Record<string, unknown> | undefined;
      return (
        !!s && !Array.isArray(s) && s.borderWidth === 1 && typeof s.borderColor === 'string'
      );
    });
    expect(outlined.length).toBeGreaterThan(0);
    return (outlined[0].props.style as Record<string, string>).borderColor;
  }

  it('forwards a caller onFocus while still tracking focus itself', () => {
    // Regression guard: spreading caller props over the internal handlers used
    // to silently replace them, killing the focus ring on every field that
    // passes its own onFocus (which most of them do, to clear the keyboard).
    const onFocus = jest.fn();
    const tree = render(
      <TextField accessibilityLabel="Title" value="" onChangeText={jest.fn()} onFocus={onFocus} />
    );
    const input = control(tree.root, 'Title', 'onFocus', 'onBlur');
    const resting = focusRingColor(tree);

    act(() => input.props.onFocus({}));

    // Both must happen: the caller's handler runs *and* the field's own focus
    // state updates. Spreading caller props last satisfied only the first.
    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(focusRingColor(tree)).not.toBe(resting);

    act(() => input.props.onBlur({}));
    expect(focusRingColor(tree)).toBe(resting);
  });

  it('surfaces an error message', () => {
    const tree = render(
      <TextField
        accessibilityLabel="Title"
        value=""
        onChangeText={jest.fn()}
        error="Title is required."
      />
    );
    expect(JSON.stringify(tree.toJSON())).toContain('Title is required.');
  });
});

describe('ModalCard', () => {
  it('renders nothing interactive when closed, and a dismissable scrim when open', () => {
    const onClose = jest.fn();
    const tree = render(
      <ModalCard visible onClose={onClose} title="Sort by" dismissLabel="Close sort menu">
        <Text>Options</Text>
      </ModalCard>
    );
    const dismiss = control(tree.root, 'Close sort menu', 'onPress');

    act(() => dismiss.props.onPress());
    expect(onClose).toHaveBeenCalled();
  });
});

describe('Screen', () => {
  it('renders an inline header with a working back button', () => {
    const tree = render(
      <Screen header={{ title: 'Settings', back: true }}>
        <Text>Body</Text>
      </Screen>
    );
    const back = control(tree.root, 'Go back', 'onPress');

    act(() => back.props.onPress());
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('falls back to the library when there is no history', () => {
    mockRouter.canGoBack.mockReturnValueOnce(false);
    const tree = render(
      <Screen header={{ title: 'Settings', back: true }}>
        <Text>Body</Text>
      </Screen>
    );
    const back = control(tree.root, 'Go back', 'onPress');

    act(() => back.props.onPress());
    expect(mockRouter.replace).toHaveBeenCalledWith('/');
  });

  it('prefers an explicit onBack over navigating', () => {
    const onBack = jest.fn();
    const tree = render(
      <Screen header={{ title: 'Edit', back: true, onBack }}>
        <Text>Body</Text>
      </Screen>
    );
    const back = control(tree.root, 'Go back', 'onPress');

    act(() => back.props.onPress());
    expect(onBack).toHaveBeenCalled();
    expect(mockRouter.back).not.toHaveBeenCalled();
  });
});
