import { useTheme } from '@/theme/ThemeContext';
import { control, elevation, fontFamily, radius, space } from '@/theme/tokens';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { pressedStyle, ripple } from './press';
import { Text } from './Text';

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Spoken instead of `label` when the label alone is ambiguous. */
  accessibilityLabel?: string;
};

export type SegmentedControlProps<T extends string> = {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  /** Names the group for a screen reader, e.g. "Import source". */
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * A one-of-N switch: a sunken track with the chosen option raised onto a
 * surface-coloured pill. An option's icon keeps the accent colour in both
 * states, so a marker like the want-to-cook flame reads the same everywhere.
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  accessibilityLabel,
  style,
}: SegmentedControlProps<T>) {
  const { colors, resolved } = useTheme();

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={[
        {
          flexDirection: 'row',
          gap: space.xs,
          padding: space.xs,
          borderRadius: radius.pill,
          backgroundColor: colors.surfaceMuted,
        },
        style,
      ]}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={option.accessibilityLabel ?? option.label}
            accessibilityState={{ selected, checked: selected }}
            onPress={() => onChange(option.value)}
            android_ripple={ripple(colors.ripple)}
            style={({ pressed }) => [
              {
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: space.xs,
                minHeight: control.sm,
                paddingHorizontal: space.md,
                borderRadius: radius.pill,
                backgroundColor: selected ? colors.surface : 'transparent',
                overflow: 'hidden',
                ...(selected ? elevation(1, resolved) : null),
              },
              pressedStyle(pressed),
            ]}
          >
            {option.icon ? (
              <Ionicons name={option.icon} size={15} color={colors.primary} />
            ) : null}
            <Text
              variant="label"
              tone={selected ? 'primary' : 'secondary'}
              numberOfLines={1}
              style={selected ? { fontFamily: fontFamily.sansSemiBold } : undefined}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
