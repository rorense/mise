export type AppearanceMode = 'light' | 'dark' | 'system';

/**
 * Every colour the UI is allowed to use. Declaring the shape up front means
 * TypeScript fails the build if a mode is missing a token, which is what stops
 * "just this once" hex literals from creeping back into screens.
 *
 * Contrast: every foreground/background pairing below meets WCAG AA (4.5:1)
 * for normal-size text. The `on*` tokens exist because that is not automatic —
 * white on the dark-mode accent was only 3.2:1, and white on the dark-mode
 * destructive colour was 2.3:1.
 */
export type ThemeColors = {
  /** Page background. */
  background: string;
  /** Cards, sheets, dialogs — one step up from the page. */
  surface: string;
  /** Inputs, inactive chips, sunken rows — one step *toward* the page. */
  surfaceMuted: string;

  border: string;
  /** For dividers and outlines that need to carry weight on their own. */
  borderStrong: string;

  textPrimary: string;
  textSecondary: string;

  /** Brand accent for text, icons, active borders. Contrasts with background and surface. */
  primary: string;
  /** Background of filled primary controls. */
  primaryFill: string;
  /** Text and icons drawn on `primaryFill`. */
  onPrimaryFill: string;
  /** Tinted background for selected chips and rows. Replaces the old `primary + '22'`. */
  primarySoft: string;
  /** Text and icons drawn on `primarySoft`. */
  onPrimarySoft: string;

  destructive: string;
  destructiveFill: string;
  onDestructiveFill: string;
  destructiveSoft: string;

  /** Modal backdrop. */
  scrim: string;
  /** Android ripple over surface-coloured controls. */
  ripple: string;
  /** Android ripple over `primaryFill` / `destructiveFill`. */
  rippleOnFill: string;

  /** Text and icons drawn over a photo. */
  onImage: string;
  /** Base tone of the gradient laid over photos so `onImage` stays legible. */
  imageScrim: string;
  /** Circular backing for icons floating on a photo. */
  imageChrome: string;

  /** Favourite marker. */
  star: string;
  /** "Want to cook" marker. */
  flame: string;
};

export const palette: Record<'light' | 'dark', ThemeColors> = {
  light: {
    background: '#FAF8F5',
    surface: '#FFFFFF',
    surfaceMuted: '#F1ECE5',

    border: '#E6E1D9',
    borderStrong: '#D5CEC3',

    textPrimary: '#1A1A1A',
    textSecondary: '#6B6B6B',

    // 4.8:1 on the page background and 5.1:1 on white — a shade deeper than the
    // original #C4622D, which sat at 4.1:1 and failed AA under white labels.
    primary: '#B05426',
    primaryFill: '#B05426',
    onPrimaryFill: '#FFFFFF',
    primarySoft: '#F6E6DA',
    onPrimarySoft: '#8F4419',

    destructive: '#D93025',
    destructiveFill: '#D93025',
    onDestructiveFill: '#FFFFFF',
    destructiveSoft: '#FBE6E4',

    scrim: 'rgba(0, 0, 0, 0.45)',
    ripple: 'rgba(0, 0, 0, 0.09)',
    rippleOnFill: 'rgba(255, 255, 255, 0.24)',

    onImage: '#FFFFFF',
    imageScrim: '#000000',
    imageChrome: 'rgba(0, 0, 0, 0.45)',

    star: '#F2B138',
    flame: '#FF9F1C',
  },
  dark: {
    background: '#121211',
    surface: '#1E1E1C',
    surfaceMuted: '#2A2A26',

    border: '#33322E',
    borderStrong: '#474540',

    textPrimary: '#F2F0EC',
    textSecondary: '#A8A7A2',

    // Dark mode inverts which half of the pair carries the light: the accent is
    // bright enough to read on the page (7.6:1) and filled controls take dark
    // text on top (7.2:1). White on an orange fill cannot reach AA at any
    // usable saturation.
    primary: '#E59254',
    primaryFill: '#E59254',
    onPrimaryFill: '#23150A',
    primarySoft: '#3A2718',
    onPrimarySoft: '#F0B183',

    destructive: '#F28E86',
    destructiveFill: '#F28E86',
    onDestructiveFill: '#2A0F0C',
    destructiveSoft: '#3A1C19',

    scrim: 'rgba(0, 0, 0, 0.6)',
    ripple: 'rgba(255, 255, 255, 0.10)',
    rippleOnFill: 'rgba(0, 0, 0, 0.14)',

    onImage: '#FFFFFF',
    imageScrim: '#000000',
    imageChrome: 'rgba(0, 0, 0, 0.5)',

    star: '#F2B138',
    flame: '#FF9F1C',
  },
};
