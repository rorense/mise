import { useTheme } from '@/theme/ThemeContext';
import { Modal, Pressable, Text, View } from 'react-native';

type ConfirmDialogProps = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { colors } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        onPress={onCancel}
        style={{
          flex: 1,
          backgroundColor: '#0006',
          padding: 24,
          justifyContent: 'center',
        }}
      >
        <Pressable
          // See AppDialog: grouping would make the buttons unreachable.
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
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={cancelLabel}
              onPress={onCancel}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.background,
              }}
            >
              <Text style={{ fontFamily: 'DMSans_500Medium', color: colors.textPrimary }}>
                {cancelLabel}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={confirmLabel}
              onPress={onConfirm}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 10,
                backgroundColor: destructive ? colors.destructive : colors.primary,
              }}
            >
              <Text style={{ fontFamily: 'DMSans_700Bold', color: '#fff' }}>
                {confirmLabel}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
