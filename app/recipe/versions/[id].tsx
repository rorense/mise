import { AppDialog } from '@/components/AppDialog';
import { BackButton } from '@/components/BackButton';
import { listRecipeVersions, restoreRecipeVersion } from '@/data/recipes';
import { useTheme } from '@/theme/ThemeContext';
import type { RecipeVersion } from '@/types/recipe';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

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
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BackButton />
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 72, gap: 12, paddingBottom: 48 }}>
        <Text style={{ fontFamily: 'Lora_700Bold', fontSize: 22, color: colors.textPrimary }}>
          Recipe versions
        </Text>
        {versions.length === 0 ? (
          <Text style={{ color: colors.textSecondary, fontFamily: 'DMSans_400Regular' }}>
            No saved versions yet.
          </Text>
        ) : null}
        {versions.map((version) => (
          <View
            key={version.id}
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 12,
              padding: 12,
              backgroundColor: colors.surface,
              gap: 8,
            }}
          >
            <Text style={{ color: colors.textPrimary, fontFamily: 'DMSans_700Bold' }}>
              {version.label}
            </Text>
            <Text style={{ color: colors.textSecondary, fontFamily: 'DMSans_400Regular' }}>
              {new Date(version.createdAt).toLocaleString()}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Restore version: ${version.label}`}
              accessibilityHint="Replaces the current recipe with this saved version"
              accessibilityState={{ disabled: busyVersionId !== null }}
              disabled={busyVersionId !== null}
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
              style={{
                alignSelf: 'flex-start',
                borderRadius: 999,
                borderWidth: 1,
                borderColor: colors.primary,
                backgroundColor: colors.primary + '18',
                paddingHorizontal: 12,
                paddingVertical: 8,
              }}
            >
              <Text style={{ color: colors.primary, fontFamily: 'DMSans_700Bold' }}>
                {busyVersionId === version.id ? 'Restoring…' : 'Restore this version'}
              </Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>
      <AppDialog
        visible={dialog !== null}
        title={dialog?.title ?? ''}
        message={dialog?.message ?? ''}
        actions={[{ label: 'OK', variant: 'primary' }]}
        onClose={() => setDialog(null)}
      />
    </View>
  );
}
