import { getOpenAiApiKey, getYoutubeApiKey } from '@/lib/secrets';
import { importFromInstagramCaption, importFromUrl } from '@/lib/import/pipeline';
import { setImportDraft } from '@/lib/importDraftStore';
import { useTheme } from '@/theme/ThemeContext';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import NetInfo from '@react-native-community/netinfo';

export default function ImportScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [instagramCaption, setInstagramCaption] = useState('');
  const [tab, setTab] = useState<'url' | 'instagram'>('url');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const clip = await Clipboard.getStringAsync();
      if (clip && /^https?:\/\//i.test(clip)) {
        setUrl(clip);
      }
    })();
  }, []);

  const runUrlImport = async () => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      Alert.alert('Missing URL', 'Paste a recipe or YouTube link first.');
      return;
    }
    try {
      new URL(trimmedUrl);
    } catch {
      Alert.alert('Invalid URL', 'Please enter a full URL including https://');
      return;
    }
    const state = await NetInfo.fetch();
    if (!state.isConnected) {
      Alert.alert('Offline', 'Connect to Wi‑Fi to import recipes.');
      return;
    }
    const key = await getOpenAiApiKey();
    if (!key) {
      Alert.alert('API key', 'Add an OpenAI API key in Settings.');
      return;
    }
    const yt = await getYoutubeApiKey();
    setBusy(true);
    try {
      const draft = await importFromUrl(trimmedUrl, key, yt);
      setImportDraft(draft);
      router.push('/import/preview');
    } catch (e) {
      Alert.alert(
        'Import failed',
        e instanceof Error ? e.message : 'Unknown error',
        [
          { text: 'OK' },
          {
            text: 'Manual entry',
            onPress: () => router.replace('/recipe/form'),
          },
        ]
      );
    } finally {
      setBusy(false);
    }
  };

  const runInstagramImport = async () => {
    const trimmedCaption = instagramCaption.trim();
    if (!trimmedCaption) {
      Alert.alert('Missing caption', 'Paste the Instagram caption before extracting.');
      return;
    }
    const state = await NetInfo.fetch();
    if (!state.isConnected) {
      Alert.alert('Offline', 'Connect to Wi‑Fi to import recipes.');
      return;
    }
    const key = await getOpenAiApiKey();
    if (!key) {
      Alert.alert('API key', 'Add an OpenAI API key in Settings.');
      return;
    }
    setBusy(true);
    try {
      const draft = await importFromInstagramCaption(trimmedCaption, key);
      setImportDraft(draft);
      router.push('/import/preview');
    } catch (e) {
      Alert.alert(
        'Import failed',
        e instanceof Error ? e.message : 'Unknown error',
        [
          { text: 'OK' },
          {
            text: 'Manual entry',
            onPress: () => router.replace('/recipe/form'),
          },
        ]
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 20, gap: 16 }}>
      <Text style={{ fontFamily: 'Lora_700Bold', fontSize: 22, color: colors.textPrimary }}>
        Import
      </Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable
          onPress={() => setTab('url')}
          style={{
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: 999,
            backgroundColor: tab === 'url' ? colors.primary + '22' : colors.surface,
            borderWidth: 1,
            borderColor: tab === 'url' ? colors.primary : colors.border,
          }}
        >
          <Text style={{ fontFamily: 'DMSans_500Medium', color: colors.textPrimary }}>URL / YouTube</Text>
        </Pressable>
        <Pressable
          onPress={() => setTab('instagram')}
          style={{
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: 999,
            backgroundColor: tab === 'instagram' ? colors.primary + '22' : colors.surface,
            borderWidth: 1,
            borderColor: tab === 'instagram' ? colors.primary : colors.border,
          }}
        >
          <Text style={{ fontFamily: 'DMSans_500Medium', color: colors.textPrimary }}>Instagram</Text>
        </Pressable>
      </View>

      {tab === 'instagram' ? (
        <>
          <Text style={{ fontFamily: 'DMSans_400Regular', color: colors.textSecondary }}>
            Open the Reel, copy the caption, and paste it here.
          </Text>
          <TextInput
            multiline
            value={instagramCaption}
            onChangeText={setInstagramCaption}
            placeholder="Paste caption…"
            placeholderTextColor={colors.textSecondary}
            style={{
              minHeight: 160,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 12,
              padding: 12,
              textAlignVertical: 'top',
              fontFamily: 'DMSans_400Regular',
              color: colors.textPrimary,
              backgroundColor: colors.surface,
            }}
          />
          <Pressable
            disabled={busy}
            onPress={runInstagramImport}
            style={{
              backgroundColor: colors.primary,
              padding: 16,
              borderRadius: 14,
              alignItems: 'center',
              opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: '#fff', fontFamily: 'DMSans_700Bold' }}>Extract recipe</Text>
            )}
          </Pressable>
        </>
      ) : (
        <>
          <TextInput
            value={url}
            onChangeText={setUrl}
            placeholder="https://…"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="none"
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
            disabled={busy}
            onPress={runUrlImport}
            style={{
              backgroundColor: colors.primary,
              padding: 16,
              borderRadius: 14,
              alignItems: 'center',
              opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: '#fff', fontFamily: 'DMSans_700Bold' }}>Extract recipe</Text>
            )}
          </Pressable>
        </>
      )}

      <Pressable onPress={() => router.replace('/recipe/form')}>
        <Text style={{ color: colors.primary, fontFamily: 'DMSans_500Medium' }}>Enter manually instead</Text>
      </Pressable>
    </ScrollView>
  );
}
