import { Platform, type TextStyle, type ViewStyle } from 'react-native';

/**
 * The single source of truth for every non-colour design decision.
 *
 * Before this existed the app used 18 distinct spacing values, 11 font sizes
 * and 12 border radii, all typed inline at each call site. Snapping everything
 * to these scales is what makes unrelated screens look like one app.
 */

/** 4pt-based spacing scale. Use these instead of raw numbers for padding, margin and gap. */
export const space = {
  /** 2 — hairline nudges only */
  xxs: 2,
  /** 4 */
  xs: 4,
  /** 8 */
  sm: 8,
  /** 12 */
  md: 12,
  /** 16 — the default screen gutter */
  lg: 16,
  /** 20 */
  xl: 20,
  /** 24 */
  xxl: 24,
  /** 32 */
  xxxl: 32,
} as const;

export const radius = {
  /** 4 — the squared-off corner on a chat bubble, and little else. */
  xs: 4,
  sm: 8,
  /** 12 — inputs, small buttons */
  md: 12,
  /** 16 — cards, sheets, dialogs */
  lg: 16,
  /** 20 — large media cards */
  xl: 20,
  /** Fully rounded. Not `9999`: very large radii can overflow on some Android GPUs. */
  pill: 999,
} as const;

/**
 * Loaded in `app/_layout.tsx`. Referencing the families through here means a
 * typo is a compile error rather than a silent fallback to the system font.
 */
export const fontFamily = {
  serif: 'Lora_400Regular',
  serifBold: 'Lora_700Bold',
  sans: 'DMSans_400Regular',
  sansMedium: 'DMSans_500Medium',
  sansBold: 'DMSans_700Bold',
} as const;

export type TextVariant =
  | 'display'
  | 'title'
  | 'heading'
  | 'subheading'
  | 'body'
  | 'bodyStrong'
  | 'label'
  | 'caption'
  | 'captionStrong'
  | 'overline'
  | 'button';

/**
 * Colourless type scale — `Text` in `components/ui` pairs these with a tone.
 * Every entry carries its own `lineHeight` so vertical rhythm survives when a
 * string wraps.
 */
export const typeScale: Record<TextVariant, TextStyle> = {
  /** Library home only. */
  display: { fontFamily: fontFamily.serifBold, fontSize: 30, lineHeight: 38 },
  /** Screen titles. */
  title: { fontFamily: fontFamily.serifBold, fontSize: 22, lineHeight: 29 },
  /** Section and dialog headings. */
  heading: { fontFamily: fontFamily.serifBold, fontSize: 19, lineHeight: 25 },
  /** Card titles, list-row titles. */
  subheading: { fontFamily: fontFamily.serifBold, fontSize: 16, lineHeight: 22 },
  body: { fontFamily: fontFamily.sans, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: fontFamily.sansBold, fontSize: 15, lineHeight: 22 },
  /** Field labels and other short UI strings. */
  label: { fontFamily: fontFamily.sansMedium, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: fontFamily.sans, fontSize: 13, lineHeight: 18 },
  captionStrong: { fontFamily: fontFamily.sansMedium, fontSize: 13, lineHeight: 18 },
  overline: {
    fontFamily: fontFamily.sansMedium,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  button: { fontFamily: fontFamily.sansBold, fontSize: 15, lineHeight: 20 },
};

/** Material's minimum touch target. Controls smaller than this need `hitSlop`. */
export const MIN_TOUCH = 48;

export const control = {
  /** Icon buttons and small pills. */
  sm: 36,
  /** Default control height — inputs, buttons. */
  md: 44,
  lg: 52,
} as const;

export const duration = {
  fast: 120,
  base: 200,
  slow: 320,
} as const;

/**
 * Android reads `elevation` and ignores `shadow*`; iOS and web are the
 * reverse, so both have to be set. A black drop shadow is invisible against a
 * dark surface, so dark mode leans on borders and `surfaceMuted` instead of
 * faking depth it cannot render.
 */
export function elevation(level: 0 | 1 | 2 | 3, mode: 'light' | 'dark'): ViewStyle {
  if (level === 0) return {};
  if (mode === 'dark') {
    // Just enough to keep Android's z-ordering correct for overlays.
    return { elevation: level };
  }
  const spec = {
    1: { elevation: 1, shadowOpacity: 0.06, shadowRadius: 3, offsetY: 1 },
    2: { elevation: 3, shadowOpacity: 0.09, shadowRadius: 8, offsetY: 2 },
    3: { elevation: 6, shadowOpacity: 0.14, shadowRadius: 16, offsetY: 4 },
  }[level];
  return {
    elevation: spec.elevation,
    ...Platform.select({
      android: null,
      default: {
        shadowColor: '#000000',
        shadowOpacity: spec.shadowOpacity,
        shadowRadius: spec.shadowRadius,
        shadowOffset: { width: 0, height: spec.offsetY },
      },
    }),
  };
}
