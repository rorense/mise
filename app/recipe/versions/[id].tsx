import { AppDialog } from '@/components/AppDialog';
import { Button, Card, Screen, Text } from '@/components/ui';
import { listRecipeVersions, restoreRecipeVersion } from '@/data/recipes';
import { useTheme } from '@/theme/ThemeContext';
import { space } from '@/theme/tokens';
import type { RecipeVersion } from '@/types/recipe';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

export default function RecipeVersionsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const router = useRouter();
  const [versions, setVersions] = useState<RecipeVersion[]>([]);
  const [busyVersionId, setBusyVersionId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ title: string; message: string } | null>(null);

  const load = useCallback(async () => {
    const rows = await listRecipeVersions(String(id));
    setVersions(rows);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  return (
    <Screen scroll header={{ title: 'Recipe versions', back: true }} gap={space.md}>
      {versions.length === 0 ? (
        <View style={{ alignItems: 'center', gap: space.md, paddingVertical: space.xxxl }}>
          <Ionicons name="time-outline" size={40} color={colors.textSecondary} />
          <Text variant="body" tone="secondary">
            No saved versions yet.
          </Text>
        </View>
      ) : null}

      {versions.map((version) => (
        <Card key={version.id} style={{ gap: space.md }}>
          <View style={{ gap: space.xxs }}>
            <Text variant="bodyStrong">{version.label}</Text>
            <Text variant="caption" tone="secondary">
              {new Date(version.createdAt).toLocaleString()}
            </Text>
          </View>
          <Button
            label={busyVersionId === version.id ? 'Restoring…' : 'Restore this version'}
            variant="secondary"
            icon="arrow-undo-outline"
            loading={busyVersionId === version.id}
            disabled={busyVersionId !== null}
            accessibilityLabel={`Restore version: ${version.label}`}
            accessibilityHint="Replaces the current recipe with this saved version"
            onPress={async () => {
              setBusyVersionId(version.id);
              const ok = await restoreRecipeVersion(version.id);
              setBusyVersionId(null);
              if (ok) {
                router.replace(`/recipe/${version.recipeId}`);
              } else {
                setDialog({
                  title: 'Restore failed',
                  message: 'This version could not be restored.',
                });
              }
            }}
          />
        </Card>
      ))}

      <AppDialog
        visible={dialog !== null}
        title={dialog?.title ?? ''}
        message={dialog?.message ?? ''}
        actions={[{ label: 'OK', variant: 'primary' }]}
        onClose={() => setDialog(null)}
      />
    </Screen>
  );
}
