import { useTheme } from '@/theme/ThemeContext';
import { space } from '@/theme/tokens';
import { Switch, View, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from './Text';

export type SwitchRowProps = {
  label: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  /** Second line under the label. */
  description?: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Label on the left, switch on the right — the app's one on/off row. */
export function SwitchRow({
  label,
  value,
  onValueChange,
  description,
  accessibilityLabel,
  accessibilityHint,
  disabled = false,
  style,
}: SwitchRowProps) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: space.md,
          minHeight: 44,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      <View style={{ flex: 1, gap: space.xxs }}>
        <Text variant="body">{label}</Text>
        {description ? (
          <Text variant="caption" tone="secondary">
            {description}
          </Text>
        ) : null}
      </View>
      <Switch
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityHint={accessibilityHint}
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: colors.borderStrong, true: colors.primary }}
        thumbColor={colors.surface}
      />
    </View>
  );
}
