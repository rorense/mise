import { typeScale, type TextVariant } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeContext';
import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';

export type TextTone =
  | 'primary'
  | 'secondary'
  | 'accent'
  | 'onAccent'
  | 'onAccentSoft'
  | 'destructive'
  | 'onDestructive'
  | 'onImage'
  | 'inherit';

export type TextProps = RNTextProps & {
  variant?: TextVariant;
  tone?: TextTone;
};

/**
 * Replaces the `fontFamily` + `fontSize` + `color` triple that was retyped at
 * roughly 150 call sites. Pick a role, not a size.
 */
export function Text({
  variant = 'body',
  tone = 'primary',
  style,
  ...rest
}: TextProps) {
  const { colors } = useTheme();

  const toneStyle: TextStyle =
    tone === 'inherit'
      ? {}
      : {
          color: {
            primary: colors.textPrimary,
            secondary: colors.textSecondary,
            accent: colors.primary,
            onAccent: colors.onPrimaryFill,
            onAccentSoft: colors.onPrimarySoft,
            destructive: colors.destructive,
            onDestructive: colors.onDestructiveFill,
            onImage: colors.onImage,
          }[tone],
        };

  return <RNText {...rest} style={[typeScale[variant], toneStyle, style]} />;
}
