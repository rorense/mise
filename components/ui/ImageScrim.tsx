import { useTheme } from '@/theme/ThemeContext';
import { View, type StyleProp, type ViewStyle } from 'react-native';

/** Opacity ramp, top to bottom. Four bands read as smooth at scrim heights. */
const BANDS = [0.0, 0.18, 0.42, 0.68];

export type ImageScrimProps = {
  /** Total height of the ramp, in dp. */
  height?: number;
  /** Anchors the darkest band to the top instead of the bottom. */
  from?: 'bottom' | 'top';
  style?: StyleProp<ViewStyle>;
};

/**
 * A gradient wash that keeps `onImage` text legible over an arbitrary photo.
 *
 * A flat 40% black — what the recipe cards used before — guarantees nothing:
 * over a pale photo the title still lands near 2:1. Ramping to 68% at the text
 * edge holds contrast without dimming the whole image.
 *
 * Stacked opaque bands rather than a real gradient, deliberately: the only way
 * to get one is `expo-linear-gradient`, and a new native module means every
 * contributor has to rebuild the dev client.
 */
export function ImageScrim({ height = 96, from = 'bottom', style }: ImageScrimProps) {
  const { colors } = useTheme();
  const bands = from === 'bottom' ? BANDS : [...BANDS].reverse();

  return (
    <View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: 0,
          right: 0,
          [from]: 0,
          height,
          flexDirection: 'column',
        },
        style,
      ]}
    >
      {bands.map((opacity, i) => (
        <View
          key={i}
          style={{ flex: 1, backgroundColor: colors.imageScrim, opacity }}
        />
      ))}
    </View>
  );
}
