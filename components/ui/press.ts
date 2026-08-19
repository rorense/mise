import { Platform, type PressableAndroidRippleConfig, type ViewStyle } from 'react-native';

/**
 * Android is the shipping target, so touch feedback means a ripple. Everything
 * else (web, and the odd iOS dev run) falls back to a dim, because `Pressable`
 * on its own renders no feedback at all — which is the main reason the app read
 * as unfinished.
 */

export function ripple(color: string, borderless = false): PressableAndroidRippleConfig | undefined {
  return Platform.OS === 'android' ? { color, borderless, foreground: !borderless } : undefined;
}

/** Opacity fallback for platforms without a ripple. Returns `undefined` on Android. */
export function pressedStyle(pressed: boolean, opacity = 0.72): ViewStyle | undefined {
  if (Platform.OS === 'android') return undefined;
  return pressed ? { opacity } : undefined;
}

/**
 * Grows the tap target of an undersized control up to {@link MIN_TOUCH}
 * without changing how big it looks.
 */
export function hitSlopFor(size: number, min = 48): number {
  return Math.max(0, Math.round((min - size) / 2));
}
