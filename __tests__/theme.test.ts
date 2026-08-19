import { palette, type ThemeColors } from '@/theme/colors';
import { radius, space, typeScale } from '@/theme/tokens';

/**
 * The palette makes a specific promise — every foreground/background pairing
 * clears WCAG AA. These tests hold it to that, so a future colour tweak that
 * looks fine on one device cannot quietly drop text below legibility.
 */

function srgbChannel(value8Bit: number): number {
  const c = value8Bit / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function parseHex(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((ch) => ch + ch)
          .join('')
      : clean;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/** WCAG 2.1 relative luminance. */
function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map(srgbChannel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Composites `overlayOpacity` of black onto a colour, the way a scrim does. */
function overBlackScrim(hex: string, overlayOpacity: number): string {
  const composited = parseHex(hex).map((channel) =>
    Math.round(channel * (1 - overlayOpacity))
  );
  return `#${composited.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

const MODES: ('light' | 'dark')[] = ['light', 'dark'];

/** Foreground/background pairings that carry normal-size text. AA is 4.5:1. */
const TEXT_PAIRS: [keyof ThemeColors, keyof ThemeColors][] = [
  ['textPrimary', 'background'],
  ['textPrimary', 'surface'],
  ['textPrimary', 'surfaceMuted'],
  ['textSecondary', 'background'],
  ['textSecondary', 'surface'],
  ['textSecondary', 'surfaceMuted'],
  ['primary', 'background'],
  ['primary', 'surface'],
  ['onPrimaryFill', 'primaryFill'],
  ['onPrimarySoft', 'primarySoft'],
  ['destructive', 'background'],
  ['destructive', 'surface'],
  ['onDestructiveFill', 'destructiveFill'],
];

describe('palette', () => {
  it('defines the same token set in both modes', () => {
    expect(Object.keys(palette.dark).sort()).toEqual(Object.keys(palette.light).sort());
  });

  const tokenCases = MODES.flatMap((mode) =>
    Object.entries(palette[mode]).map(([name, value]) => ({ mode, name, value }))
  );

  it.each(tokenCases)('$mode.$name is a usable colour string', ({ value }) => {
    expect(typeof value).toBe('string');
    expect(value).toMatch(/^(#[0-9A-Fa-f]{6}|rgba?\()/);
  });
});

describe('contrast (WCAG AA, 4.5:1 for normal text)', () => {
  for (const mode of MODES) {
    for (const [fg, bg] of TEXT_PAIRS) {
      it(`${mode}: ${fg} on ${bg}`, () => {
        const ratio = contrast(palette[mode][fg], palette[mode][bg]);
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  // The regression this guards: white on the dark-mode accent was 3.2:1 and
  // white on the dark-mode destructive fill was 2.3:1.
  it('dark mode fills do not use white text', () => {
    expect(contrast('#FFFFFF', palette.dark.primaryFill)).toBeLessThan(4.5);
    expect(contrast(palette.dark.onPrimaryFill, palette.dark.primaryFill)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(palette.dark.onDestructiveFill, palette.dark.destructiveFill)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('photo scrim', () => {
  // Worst case for a scrim is the brightest possible photo behind it.
  const WHITE_PHOTO = '#FFFFFF';
  const DARKEST_BAND = 0.68;

  it('keeps card titles legible over a pure white photo', () => {
    const scrimmed = overBlackScrim(WHITE_PHOTO, DARKEST_BAND);
    expect(contrast(palette.light.onImage, scrimmed)).toBeGreaterThanOrEqual(4.5);
  });

  it('improves on the flat 40% scrim it replaced', () => {
    const old = overBlackScrim(WHITE_PHOTO, 0.4);
    expect(contrast('#FFFFFF', old)).toBeLessThan(4.5);
  });
});

describe('tokens', () => {
  it('exposes ascending, positive spacing', () => {
    const values = Object.values(space);
    expect(values).toEqual([...values].sort((a, b) => a - b));
    expect(Math.min(...values)).toBeGreaterThan(0);
  });

  it('exposes ascending radii', () => {
    const { pill, ...rest } = radius;
    const values = Object.values(rest);
    expect(values).toEqual([...values].sort((a, b) => a - b));
    expect(pill).toBeGreaterThan(Math.max(...values));
  });

  it.each(Object.entries(typeScale))(
    '%s pairs a font, a size and a line height that clears it',
    (_name, style) => {
      expect(style.fontSize).toBeGreaterThan(0);
      expect(style.lineHeight).toBeGreaterThanOrEqual(style.fontSize as number);
      expect(style.fontFamily).toBeTruthy();
    }
  );
});
