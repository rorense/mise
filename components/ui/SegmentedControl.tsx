import { useTheme } from '@/theme/ThemeContext';
import { radius, space } from '@/theme/tokens';
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
 * A one-of-N switch. Selection reads the same here as it does on `Chip` —
 * tinted fill plus an accent outline — so "this one is active" only has to be
 * learned once.
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  accessibilityLabel,
  style,
}: SegmentedControlProps<T>) {
  const { colors } = useTheme();

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
                minHeight: 40,
                paddingHorizontal: space.md,
                borderRadius: radius.pill,
                backgroundColor: selected ? colors.primarySoft : 'transparent',
                borderWidth: 1,
                borderColor: selected ? colors.primary : 'transparent',
                overflow: 'hidden',
              },
              pressedStyle(pressed),
            ]}
          >
            {option.icon ? (
              <Ionicons
                name={option.icon}
                size={15}
                color={selected ? colors.onPrimarySoft : colors.textSecondary}
              />
            ) : null}
            <Text
              variant="label"
              tone={selected ? 'onAccentSoft' : 'secondary'}
              numberOfLines={1}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
