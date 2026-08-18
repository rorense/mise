import {
  deleteCookLogWithUndoData,
  getCookLogById,
  restoreDeletedCookLog,
} from '@/data/recipes';
import { AppDialog } from '@/components/AppDialog';
import { BackButton } from '@/components/BackButton';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { FullscreenImageViewer } from '@/components/FullscreenImageViewer';
import { useTheme } from '@/theme/ThemeContext';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';

export default function CookLogScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const router = useRouter();
  const [data, setData] = useState<Awaited<ReturnType<typeof getCookLogById>>>(null);
  const [fullscreenImageUri, setFullscreenImageUri] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [undoDialog, setUndoDialog] = useState(false);
  const [deletedLog, setDeletedLog] = useState<Awaited<
    ReturnType<typeof deleteCookLogWithUndoData>
  > | null>(null);

  useEffect(() => {
    (async () => {
      setData(await getCookLogById(String(id)));
    })();
  }, [id]);

  if (!data) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <Text style={{ color: colors.textSecondary }}>Loading…</Text>
      </View>
    );
  }

  const { log, recipeTitle } = data;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BackButton />
      <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ paddingBottom: 40 }}>
        {log.photoUri ? (
          <Pressable
            accessibilityRole="imagebutton"
            accessibilityLabel="Cook photo"
            accessibilityHint="Opens the photo full screen"
            onPress={() => setFullscreenImageUri(log.photoUri ?? null)}
          >
            <Image source={{ uri: log.photoUri }} style={{ width: '100%', height: 280 }} />
          </Pressable>
        ) : null}
        <View style={{ padding: 20, paddingTop: 72, gap: 12 }}>
        <Text style={{ fontFamily: 'Lora_700Bold', fontSize: 22, color: colors.textPrimary }}>{recipeTitle}</Text>
        <Text style={{ fontFamily: 'DMSans_400Regular', color: colors.textSecondary }}>
          {new Date(log.cookedAt).toLocaleString()}
        </Text>
        {typeof log.rating === 'number' ? (
          <Text style={{ fontFamily: 'DMSans_500Medium', color: colors.textPrimary }}>
            Rating: {log.rating}/5
          </Text>
        ) : null}
        {log.notes ? (
          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 16, lineHeight: 24, color: colors.textPrimary }}>
            {log.notes}
          </Text>
        ) : (
          <Text style={{ color: colors.textSecondary, fontFamily: 'DMSans_400Regular' }}>No notes</Text>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Delete this cook log entry"
          onPress={() => setShowDeleteConfirm(true)}
          style={{ marginTop: 16 }}
        >
          <Text style={{ color: colors.destructive, fontFamily: 'DMSans_500Medium' }}>Delete entry</Text>
        </Pressable>
        </View>
      </ScrollView>
      <ConfirmDialog
        visible={showDeleteConfirm}
        title="Delete this cook entry?"
        message="The photo will be removed from the app."
        confirmLabel="Delete"
        destructive
        onCancel={() => setShowDeleteConfirm(false)}
        onConfirm={async () => {
          setShowDeleteConfirm(false);
          const removed = await deleteCookLogWithUndoData(log.id);
          setDeletedLog(removed);
          setUndoDialog(true);
        }}
      />
      <AppDialog
        visible={undoDialog}
        title="Entry deleted"
        message="You can undo this action now."
        actions={[
          {
            label: 'Undo',
            onPress: async () => {
              if (deletedLog) {
                await restoreDeletedCookLog(deletedLog);
              }
              router.back();
            },
          },
          {
            label: 'Done',
            variant: 'primary',
            onPress: () => router.back(),
          },
        ]}
        onClose={() => {
          setUndoDialog(false);
          router.back();
        }}
      />
      <FullscreenImageViewer
        imageUri={fullscreenImageUri}
        onClose={() => setFullscreenImageUri(null)}
      />
    </View>
  );
}
