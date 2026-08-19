import { useTheme } from '@/theme/ThemeContext';
import { control, radius } from '@/theme/tokens';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { hitSlopFor, pressedStyle, ripple } from './press';

export type IconButtonVariant = 'surface' | 'ghost' | 'accent' | 'onImage';

export type IconButtonProps = {
  icon: keyof typeof Ionicons.glyphMap;
  /** Required: an icon on its own tells a screen reader nothing. */
  accessibilityLabel: string;
  onPress: () => void;
  accessibilityHint?: string;
  accessibilityState?: { selected?: boolean; disabled?: boolean; expanded?: boolean };
  variant?: IconButtonVariant;
  /** Rendered diameter. The tap target is padded out to 48 regardless. */
  size?: number;
  iconSize?: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  accessibilityHint,
  accessibilityState,
  variant = 'surface',
  size = control.sm,
  iconSize,
  disabled = false,
  style,
}: IconButtonProps) {
  const { colors } = useTheme();

  const tone: Record<IconButtonVariant, { bg: string; fg: string; border: string }> = {
    surface: { bg: colors.surface, fg: colors.textPrimary, border: colors.border },
    ghost: { bg: 'transparent', fg: colors.textPrimary, border: 'transparent' },
    accent: { bg: colors.primarySoft, fg: colors.onPrimarySoft, border: 'transparent' },
    onImage: { bg: colors.imageChrome, fg: colors.onImage, border: 'transparent' },
  };
  const t = tone[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ ...accessibilityState, disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={hitSlopFor(size)}
      android_ripple={disabled ? undefined : ripple(colors.ripple, true)}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          borderRadius: radius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: t.bg,
          borderWidth: t.border === 'transparent' ? 0 : 1,
          borderColor: t.border,
          opacity: disabled ? 0.45 : 1,
        },
        !disabled && pressedStyle(pressed),
        style,
      ]}
    >
      <Ionicons name={icon} size={iconSize ?? Math.round(size * 0.55)} color={t.fg} />
    </Pressable>
  );
}
