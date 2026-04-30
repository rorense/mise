import { deleteCookLog, getCookLogById } from '@/data/recipes';
import { BackButton } from '@/components/BackButton';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useTheme } from '@/theme/ThemeContext';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';

export default function CookLogScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const router = useRouter();
  const [data, setData] = useState<Awaited<ReturnType<typeof getCookLogById>>>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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
          <Image source={{ uri: log.photoUri }} style={{ width: '100%', height: 280 }} />
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
          await deleteCookLog(log.id);
          router.back();
        }}
      />
    </View>
  );
}
