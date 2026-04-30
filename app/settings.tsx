import { estimateAppStorageBytes, formatBytes } from '@/lib/media';
import {
  deleteOpenAiApiKey,
  getOpenAiApiKey,
  getYoutubeApiKey,
  setOpenAiApiKey,
  setYoutubeApiKey,
} from '@/lib/secrets';
import type { AppearanceMode } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeContext';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

export default function SettingsScreen() {
  const { colors, mode, setMode } = useTheme();
  const router = useRouter();
  const [openai, setOpenai] = useState('');
  const [youtube, setYoutube] = useState('');
  const [storage, setStorage] = useState('—');

  const load = useCallback(async () => {
    const [oa, yt, bytes] = await Promise.all([
      getOpenAiApiKey(),
      getYoutubeApiKey(),
      estimateAppStorageBytes(),
    ]);
    setOpenai(oa ?? '');
    setYoutube(yt ?? '');
    setStorage(formatBytes(bytes));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const masked = (k: string) => {
    if (!k) return '';
    if (k.length <= 8) return '••••••••';
    return `${k.slice(0, 8)}••••••••`;
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: 48 }}
    >
      <Text style={{ fontFamily: 'Lora_700Bold', fontSize: 22, color: colors.textPrimary }}>
        Keys
      </Text>
      <Text style={{ fontFamily: 'DMSans_400Regular', color: colors.textSecondary }}>
        Stored in SecureStore. Never logged.
      </Text>
      <View>
        <Text style={{ fontFamily: 'DMSans_500Medium', color: colors.textPrimary, marginBottom: 6 }}>
          OpenAI API key
        </Text>
        <TextInput
          value={openai}
          onChangeText={setOpenai}
          placeholder="sk-..."
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
          secureTextEntry
          style={{
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 12,
            padding: 12,
            fontFamily: 'DMSans_400Regular',
            color: colors.textPrimary,
            backgroundColor: colors.surface,
          }}
        />
        <Text style={{ marginTop: 6, color: colors.textSecondary, fontFamily: 'DMSans_400Regular' }}>
          Saved: {masked(openai)}
        </Text>
        <Pressable
          onPress={async () => {
            await setOpenAiApiKey(openai.trim());
            Alert.alert('Saved', 'OpenAI key updated.');
          }}
          style={{
            marginTop: 10,
            backgroundColor: colors.primary,
            padding: 14,
            borderRadius: 12,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontFamily: 'DMSans_700Bold' }}>Save OpenAI key</Text>
        </Pressable>
        <Pressable
          onPress={async () => {
            await deleteOpenAiApiKey();
            setOpenai('');
          }}
          style={{ marginTop: 8 }}
        >
          <Text style={{ color: colors.destructive, fontFamily: 'DMSans_500Medium' }}>
            Remove OpenAI key
          </Text>
        </Pressable>
      </View>

      <View>
        <Text style={{ fontFamily: 'DMSans_500Medium', color: colors.textPrimary, marginBottom: 6 }}>
          YouTube Data API key (optional)
        </Text>
        <TextInput
          value={youtube}
          onChangeText={setYoutube}
          placeholder="AIza..."
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
          secureTextEntry
          style={{
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 12,
            padding: 12,
            fontFamily: 'DMSans_400Regular',
            color: colors.textPrimary,
            backgroundColor: colors.surface,
          }}
        />
        <Pressable
          onPress={async () => {
            await setYoutubeApiKey(youtube.trim());
            Alert.alert('Saved', 'YouTube key updated.');
          }}
          style={{
            marginTop: 10,
            backgroundColor: colors.surface,
            padding: 14,
            borderRadius: 12,
            alignItems: 'center',
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text style={{ color: colors.textPrimary, fontFamily: 'DMSans_700Bold' }}>
            Save YouTube key
          </Text>
        </Pressable>
      </View>

      <Text style={{ fontFamily: 'Lora_700Bold', fontSize: 22, color: colors.textPrimary }}>
        Appearance
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {(['system', 'light', 'dark'] as AppearanceMode[]).map((m) => (
          <Pressable
            key={m}
            onPress={() => setMode(m)}
            style={{
              paddingHorizontal: 16,
              paddingVertical: 10,
              borderRadius: 999,
              backgroundColor: mode === m ? colors.primary + '33' : colors.surface,
              borderWidth: 1,
              borderColor: mode === m ? colors.primary : colors.border,
            }}
          >
            <Text style={{ fontFamily: 'DMSans_500Medium', color: colors.textPrimary }}>
              {m[0].toUpperCase() + m.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={{ fontFamily: 'Lora_700Bold', fontSize: 22, color: colors.textPrimary }}>
        Storage
      </Text>
      <Text style={{ fontFamily: 'DMSans_400Regular', color: colors.textSecondary }}>
        Approximate document storage: {storage}
      </Text>

      <Pressable onPress={() => Alert.alert('Mise', 'Personal recipe journal — local only.')}>
        <Text style={{ color: colors.primary, fontFamily: 'DMSans_500Medium' }}>About</Text>
      </Pressable>
      <Pressable onPress={() => router.back()}>
        <Text style={{ color: colors.textSecondary }}>Close</Text>
      </Pressable>
    </ScrollView>
  );
}
