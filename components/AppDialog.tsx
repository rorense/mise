import { useTheme } from '@/theme/ThemeContext';
import { Modal, Pressable, Text, View } from 'react-native';

export type AppDialogAction = {
  label: string;
  variant?: 'default' | 'primary' | 'destructive';
  onPress?: () => void | Promise<void>;
};

type AppDialogProps = {
  visible: boolean;
  title: string;
  message: string;
  actions: AppDialogAction[];
  onClose: () => void;
};

export function AppDialog({
  visible,
  title,
  message,
  actions,
  onClose,
}: AppDialogProps) {
  const { colors } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: '#0006',
          padding: 24,
          justifyContent: 'center',
        }}
      >
        <Pressable
          // accessible={false} keeps the title, message and each action button
          // individually reachable; a Pressable defaults to grouping its
          // children into one node, which would hide the buttons.
          accessible={false}
          accessibilityViewIsModal
          onPress={() => undefined}
          style={{
            backgroundColor: colors.surface,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: colors.border,
            padding: 16,
            gap: 10,
          }}
        >
          <Text style={{ fontFamily: 'Lora_700Bold', fontSize: 20, color: colors.textPrimary }}>
            {title}
          </Text>
          <Text
            style={{
              fontFamily: 'DMSans_400Regular',
              color: colors.textSecondary,
              lineHeight: 21,
            }}
          >
            {message}
          </Text>
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            {actions.map((action, idx) => {
              const variant = action.variant ?? 'default';
              const primary = variant === 'primary';
              const destructive = variant === 'destructive';
              return (
                <Pressable
                  key={`${action.label}-${idx}`}
                  accessibilityRole="button"
                  accessibilityLabel={action.label}
                  onPress={async () => {
                    onClose();
                    try {
                      await action.onPress?.();
                    } catch {
                      // A throwing action must not surface as an unhandled
                      // rejection; the action itself owns its error reporting.
                    }
                  }}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderRadius: 10,
                    borderWidth: primary || destructive ? 0 : 1,
                    borderColor: colors.border,
                    backgroundColor: destructive
                      ? colors.destructive
                      : primary
                        ? colors.primary
                        : colors.background,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: primary || destructive ? 'DMSans_700Bold' : 'DMSans_500Medium',
                      color: primary || destructive ? '#fff' : colors.textPrimary,
                    }}
                  >
                    {action.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
