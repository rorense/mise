import { AppDialog } from '@/components/AppDialog';
import { BackButton } from '@/components/BackButton';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { FullscreenImageViewer } from '@/components/FullscreenImageViewer';
import { Button, Card, ScreenLoading, Text } from '@/components/ui';
import { pressedStyle } from '@/components/ui/press';
import {
  deleteCookLogWithUndoData,
  getCookLogById,
  restoreDeletedCookLog,
} from '@/data/recipes';
import { useTheme } from '@/theme/ThemeContext';
import { space } from '@/theme/tokens';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const HERO_HEIGHT = 280;

export default function CookLogScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
      <ScreenLoading />
    );
  }

  const { log, recipeTitle } = data;
  const hasPhoto = Boolean(log.photoUri);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Floating rather than inline: with a photo present the arrow belongs on
          top of it, and the button carries its own contrast backing there. */}
      <BackButton overImage={hasPhoto} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + space.xxxl }}
      >
        {log.photoUri ? (
          <Pressable
            accessibilityRole="imagebutton"
            accessibilityLabel="Cook photo"
            accessibilityHint="Opens the photo full screen"
            onPress={() => setFullscreenImageUri(log.photoUri ?? null)}
            style={({ pressed }) => pressedStyle(pressed, 0.9)}
          >
            <Image
              source={{ uri: log.photoUri }}
              style={{ width: '100%', height: HERO_HEIGHT }}
              resizeMode="cover"
            />
          </Pressable>
        ) : null}

        <View
          style={{
            padding: space.xl,
            // Only clear the floating back button when there is no photo for it
            // to sit on. The old layout padded unconditionally, leaving a band
            // of dead space under every hero image.
            paddingTop: hasPhoto ? space.xl : insets.top + space.xxxl + space.xl,
            gap: space.md,
          }}
        >
          <Text variant="title" accessibilityRole="header">
            {recipeTitle}
          </Text>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <Text variant="caption" tone="secondary">
              {new Date(log.cookedAt).toLocaleString()}
            </Text>
            {typeof log.rating === 'number' ? (
              <View
                accessible
                accessibilityLabel={`Rated ${log.rating} out of 5`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: space.xxs }}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <Ionicons
                    key={n}
                    name={n <= (log.rating ?? 0) ? 'star' : 'star-outline'}
                    size={14}
                    color={n <= (log.rating ?? 0) ? colors.star : colors.textSecondary}
                  />
                ))}
              </View>
            ) : null}
          </View>

          {log.notes ? (
            <Card level={0}>
              <Text variant="body">{log.notes}</Text>
            </Card>
          ) : (
            <Text variant="body" tone="secondary">
              No notes
            </Text>
          )}

          <Button
            label="Delete entry"
            variant="ghost"
            icon="trash-outline"
            accessibilityLabel="Delete this cook log entry"
            onPress={() => setShowDeleteConfirm(true)}
            style={{ marginTop: space.sm, alignSelf: 'flex-start' }}
          />
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
