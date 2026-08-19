import { Button, ModalCard, Text } from '@/components/ui';
import { space } from '@/theme/tokens';
import { View } from 'react-native';

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
  return (
    <ModalCard visible={visible} onClose={onClose} title={title}>
      <Text variant="body" tone="secondary">
        {message}
      </Text>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'flex-end',
          gap: space.sm,
          marginTop: space.xs,
          flexWrap: 'wrap',
        }}
      >
        {actions.map((action, idx) => (
          <Button
            key={`${action.label}-${idx}`}
            label={action.label}
            variant={
              action.variant === 'primary'
                ? 'primary'
                : action.variant === 'destructive'
                  ? 'destructive'
                  : 'secondary'
            }
            onPress={async () => {
              onClose();
              try {
                await action.onPress?.();
              } catch {
                // A throwing action must not surface as an unhandled
                // rejection; the action itself owns its error reporting.
              }
            }}
          />
        ))}
      </View>
    </ModalCard>
  );
}
