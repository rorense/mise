import { space } from '@/theme/tokens';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from './Text';

export type SectionProps = {
  title: string;
  children: React.ReactNode;
  /** Explanatory line under the heading. */
  description?: string;
  /** Vertical spacing between children. */
  gap?: number;
  style?: StyleProp<ViewStyle>;
};

/** A titled block of settings or form fields. */
export function Section({
  title,
  children,
  description,
  gap = space.md,
  style,
}: SectionProps) {
  return (
    <View style={[{ gap }, style]}>
      <View style={{ gap: space.xs }}>
        <Text variant="heading" accessibilityRole="header">
          {title}
        </Text>
        {description ? (
          <Text variant="caption" tone="secondary">
            {description}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}
