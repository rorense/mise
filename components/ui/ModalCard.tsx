import { useTheme } from '@/theme/ThemeContext';
import { elevation, radius, space } from '@/theme/tokens';
import { Modal, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from './Text';

export type ModalCardProps = {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Rendered as a heading inside the card. */
  title?: string;
  /** Describes the backdrop for a screen reader, e.g. "Close sort menu". */
  dismissLabel?: string;
  /** Pinned to the bottom of the card, outside the scroll area. */
  footer?: React.ReactNode;
  cardStyle?: StyleProp<ViewStyle>;
};

/**
 * Centred dialog over a scrim. The backdrop closes it; the card swallows
 * presses so a tap inside does not.
 */
export function ModalCard({
  visible,
  onClose,
  children,
  title,
  dismissLabel = 'Dismiss',
  footer,
  cardStyle,
}: ModalCardProps) {
  const { colors, resolved } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={dismissLabel}
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: colors.scrim,
          justifyContent: 'center',
          padding: space.xl,
        }}
      >
        <Pressable
          // `accessible={false}` keeps the title and each control inside
          // individually reachable; a Pressable otherwise collapses its
          // children into one node and hides them.
          accessible={false}
          accessibilityViewIsModal
          onPress={() => undefined}
          style={[
            {
              backgroundColor: colors.surface,
              borderRadius: radius.lg,
              borderWidth: 1,
              borderColor: colors.border,
              padding: space.lg,
              gap: space.md,
              maxHeight: '80%',
              ...elevation(3, resolved),
            },
            cardStyle,
          ]}
        >
          {title ? (
            <Text variant="heading" accessibilityRole="header">
              {title}
            </Text>
          ) : null}
          {children}
          {footer ? <View>{footer}</View> : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
