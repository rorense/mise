import { useTheme } from '@/theme/ThemeContext';
import { elevation, radius, space } from '@/theme/tokens';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { pressedStyle, ripple } from './press';

type CardBase = {
  children: React.ReactNode;
  /** 0 flattens the card to a plain outline. */
  level?: 0 | 1 | 2;
  /** Set false when a child (a photo, say) needs to bleed to the edges. */
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * A tappable card is a button, so the label is required rather than optional —
 * the union makes an unlabelled `onPress` a compile error instead of something
 * a screen reader silently announces as nothing.
 */
export type CardProps = CardBase &
  (
    | { onPress?: undefined; accessibilityLabel?: never; accessibilityHint?: never }
    | { onPress: () => void; accessibilityLabel: string; accessibilityHint?: string }
  );

export function Card({
  children,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  level = 1,
  padded = true,
  style,
}: CardProps) {
  const { colors, resolved } = useTheme();

  const base: ViewStyle = {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: padded ? space.lg : 0,
    overflow: 'hidden',
    ...elevation(level, resolved),
  };

  if (!onPress) return <View style={[base, style]}>{children}</View>;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      android_ripple={ripple(colors.ripple)}
      style={({ pressed }) => [base, pressedStyle(pressed, 0.85), style]}
    >
      {children}
    </Pressable>
  );
}
