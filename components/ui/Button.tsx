import { useTheme } from '@/theme/ThemeContext';
import { control, radius, space, typeScale } from '@/theme/tokens';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Pressable,
  Text,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { pressedStyle, ripple } from './press';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'md' | 'lg';

export type ButtonProps = {
  label: string;
  onPress: () => void | Promise<void>;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Ionicon drawn before the label. */
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  /** Swaps the label for a spinner and blocks presses. */
  loading?: boolean;
  /** Stretches to fill the parent's cross axis. */
  fullWidth?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  disabled = false,
  loading = false,
  fullWidth = false,
  accessibilityLabel,
  accessibilityHint,
  style,
}: ButtonProps) {
  const { colors } = useTheme();
  const blocked = disabled || loading;

  const surface: Record<ButtonVariant, { bg: string; fg: string; border: string; ripple: string }> = {
    primary: {
      bg: colors.primaryFill,
      fg: colors.onPrimaryFill,
      border: 'transparent',
      ripple: colors.rippleOnFill,
    },
    secondary: {
      bg: colors.surface,
      fg: colors.textPrimary,
      border: colors.border,
      ripple: colors.ripple,
    },
    ghost: {
      bg: 'transparent',
      fg: colors.primary,
      border: 'transparent',
      ripple: colors.ripple,
    },
    destructive: {
      bg: colors.destructiveFill,
      fg: colors.onDestructiveFill,
      border: 'transparent',
      ripple: colors.rippleOnFill,
    },
  };
  const tone = surface[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: blocked, busy: loading }}
      disabled={blocked}
      onPress={onPress}
      android_ripple={blocked ? undefined : ripple(tone.ripple)}
      style={({ pressed }) => [
        {
          minHeight: size === 'lg' ? control.lg : control.md,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: space.sm,
          paddingHorizontal: size === 'lg' ? space.xl : space.lg,
          paddingVertical: space.md,
          borderRadius: radius.md,
          backgroundColor: tone.bg,
          borderWidth: tone.border === 'transparent' ? 0 : 1,
          borderColor: tone.border,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          opacity: blocked ? 0.45 : 1,
          overflow: 'hidden',
        },
        !blocked && pressedStyle(pressed),
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={tone.fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={18} color={tone.fg} /> : null}
          <Text style={[typeScale.button, { color: tone.fg }]} numberOfLines={1}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}
