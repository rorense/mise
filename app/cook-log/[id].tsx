import { deleteCookLog, getCookLogById } from '@/data/recipes';
import { useTheme } from '@/theme/ThemeContext';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, Text, View } from 'react-native';

export default function CookLogScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const router = useRouter();
  const [data, setData] = useState<Awaited<ReturnType<typeof getCookLogById>>>(null);

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
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ paddingBottom: 40 }}>
      {log.photoUri ? (
        <Image source={{ uri: log.photoUri }} style={{ width: '100%', height: 280 }} />
      ) : null}
      <View style={{ padding: 20, gap: 12 }}>
        <Text style={{ fontFamily: 'Lora_700Bold', fontSize: 22, color: colors.textPrimary }}>{recipeTitle}</Text>
        <Text style={{ fontFamily: 'DMSans_400Regular', color: colors.textSecondary }}>
          {new Date(log.cookedAt).toLocaleString()}
        </Text>
        {log.notes ? (
          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 16, lineHeight: 24, color: colors.textPrimary }}>
            {log.notes}
          </Text>
        ) : (
          <Text style={{ color: colors.textSecondary, fontFamily: 'DMSans_400Regular' }}>No notes</Text>
        )}
        <Pressable
          onPress={() =>
            Alert.alert('Delete this cook entry?', 'The photo will be removed from the app.', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                  await deleteCookLog(log.id);
                  router.back();
                },
              },
            ])
          }
          style={{ marginTop: 16 }}
        >
          <Text style={{ color: colors.destructive, fontFamily: 'DMSans_500Medium' }}>Delete entry</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
