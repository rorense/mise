import { useTheme } from '@/theme/ThemeContext';
import { View, type StyleProp, type ViewStyle } from 'react-native';

export function Divider({
  inset = 0,
  style,
}: {
  /** Left indent, to line the rule up with text rather than the card edge. */
  inset?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        { height: 1, backgroundColor: colors.border, marginLeft: inset },
        style,
      ]}
    />
  );
}
