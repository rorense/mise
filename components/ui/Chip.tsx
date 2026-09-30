import { useTheme } from '@/theme/ThemeContext';
import { control, radius, space, typeScale } from '@/theme/tokens';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, type StyleProp, type ViewStyle } from 'react-native';
import { pressedStyle, ripple } from './press';

export type ChipProps = {
  label: string;
  active?: boolean;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Selectable pill: a tonal fill with no outline. Active swaps to the solid
 * `primarySoft` token rather than the old `colors.primary + '22'` trick, which
 * rendered as a near-invisible smudge in dark mode.
 */
export function Chip({
  label,
  active = false,
  onPress,
  icon,
  accessibilityLabel,
  accessibilityHint,
  style,
}: ChipProps) {
  const { colors } = useTheme();
  const fg = active ? colors.onPrimarySoft : colors.textPrimary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: active }}
      accessibilityHint={
        accessibilityHint ?? (active ? 'Removes this filter' : 'Applies this filter')
      }
      onPress={onPress}
      hitSlop={{ top: 7, bottom: 7 }}
      android_ripple={ripple(colors.ripple)}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.xs,
          minHeight: control.sm - space.xs,
          paddingHorizontal: space.md,
          paddingVertical: space.sm,
          borderRadius: radius.pill,
          backgroundColor: active ? colors.primarySoft : colors.surfaceMuted,
          alignSelf: 'flex-start',
          justifyContent: 'center',
          overflow: 'hidden',
        },
        pressedStyle(pressed),
        style,
      ]}
    >
      {icon ? <Ionicons name={icon} size={14} color={fg} /> : null}
      <Text style={[typeScale.captionStrong, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}
