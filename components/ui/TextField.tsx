import { useTheme } from '@/theme/ThemeContext';
import { radius, space, typeScale } from '@/theme/tokens';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { Text } from './Text';

export type TextFieldProps = Omit<TextInputProps, 'style' | 'placeholderTextColor'> & {
  /** Required: a bare input is unlabelled for a screen reader. */
  accessibilityLabel: string;
  /** Visible label above the field. Omit for search bars and other self-evident inputs. */
  label?: string;
  /** Helper text below the field. */
  hint?: string;
  /** Replaces `hint` and turns the outline red. */
  error?: string;
  /** Ionicon inside the field, before the text. */
  icon?: keyof typeof Ionicons.glyphMap;
  /** Rendered after the text — a clear button, a unit suffix. */
  trailing?: React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
};

export function TextField({
  accessibilityLabel,
  label,
  hint,
  error,
  icon,
  trailing,
  containerStyle,
  multiline,
  ...rest
}: TextFieldProps) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);

  const outline = error ? colors.destructive : focused ? colors.primary : colors.border;

  return (
    <View style={containerStyle}>
      {label ? (
        <Text variant="label" style={{ marginBottom: space.sm }}>
          {label}
        </Text>
      ) : null}
      <View
        style={{
          flexDirection: 'row',
          alignItems: multiline ? 'flex-start' : 'center',
          gap: space.sm,
          backgroundColor: colors.surface,
          borderRadius: radius.md,
          borderWidth: 1,
          // The focus ring is a colour change, not a width change: growing the
          // border would shift the text by a pixel on every focus.
          borderColor: outline,
          paddingHorizontal: space.md,
        }}
      >
        {icon ? (
          <Ionicons
            name={icon}
            size={18}
            color={focused ? colors.primary : colors.textSecondary}
            style={multiline ? { marginTop: space.md } : undefined}
          />
        ) : null}
        <TextInput
          {...rest}
          accessibilityLabel={accessibilityLabel}
          placeholderTextColor={colors.textSecondary}
          multiline={multiline}
          // These must come after the spread: a caller passing its own
          // `onFocus` (several do, to scroll the field clear of the keyboard)
          // would otherwise replace the focus tracker and kill the focus ring.
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          style={[
            typeScale.body,
            {
              flex: 1,
              paddingVertical: space.md,
              color: colors.textPrimary,
              minHeight: multiline ? 88 : undefined,
              textAlignVertical: multiline ? 'top' : 'center',
            },
          ]}
        />
        {trailing}
      </View>
      {error || hint ? (
        <Text
          variant="caption"
          tone={error ? 'destructive' : 'secondary'}
          style={{ marginTop: space.xs }}
        >
          {error ?? hint}
        </Text>
      ) : null}
    </View>
  );
}
