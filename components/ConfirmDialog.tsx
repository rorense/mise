import { Button, ModalCard, Text } from '@/components/ui';
import { space } from '@/theme/tokens';
import { View } from 'react-native';

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
  return (
    <ModalCard visible={visible} onClose={onCancel} title={title}>
      <Text variant="body" tone="secondary">
        {message}
      </Text>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'flex-end',
          gap: space.sm,
          marginTop: space.xs,
        }}
      >
        <Button label={cancelLabel} variant="secondary" onPress={onCancel} />
        <Button
          label={confirmLabel}
          variant={destructive ? 'destructive' : 'primary'}
          onPress={onConfirm}
        />
      </View>
    </ModalCard>
  );
}
