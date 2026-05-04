import { AppDialog, type AppDialogAction } from '@/components/AppDialog';
import { getActiveAiProvider, getBundledAiKey } from '@/lib/aiConfig';
import { getYoutubeApiKey } from '@/lib/secrets';
import { BackButton } from '@/components/BackButton';
import {
  importFromManualText,
  importFromUrl,
} from '@/lib/import/pipeline';
import { setImportDraft } from '@/lib/importDraftStore';
import {
  KEYBOARD_AVOIDING_BEHAVIOR,
  KEYBOARD_VERTICAL_OFFSET,
  useKeyboardSafeScroll,
} from '@/lib/ui/keyboardSafe';
import { useTheme } from '@/theme/ThemeContext';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
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
  const { scrollRef, scrollFocusedInputIntoView } = useKeyboardSafeScroll<ScrollView>();
  const [url, setUrl] = useState('');
  const [batchText, setBatchText] = useState('');
  const [tab, setTab] = useState<'url' | 'paste'>('url');
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<{
    title: string;
    message: string;
    actions: AppDialogAction[];
  } | null>(null);

  useEffect(() => {
    (async () => {
      const clip = await Clipboard.getStringAsync();
      if (clip && /^https?:\/\//i.test(clip)) {
        setUrl(clip);
      }
    })();
  }, []);

  const getAiConfig = async () => {
    const state = await NetInfo.fetch();
    if (!state.isConnected) {
      setDialog({
        title: 'Offline',
        message: 'Connect to Wi-Fi to import recipes.',
        actions: [{ label: 'OK', variant: 'primary' }],
      });
      return null;
    }
    const provider = await getActiveAiProvider();
    const key = getBundledAiKey(provider);
    if (!key) {
      setDialog({
        title: 'API key',
        message: `Missing ${provider === 'gemini' ? 'Gemini' : 'OpenAI'} API key in local env.`,
        actions: [{ label: 'OK', variant: 'primary' }],
      });
      return null;
    }
    return { provider, key };
  };

  const runUrlImport = async () => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      setDialog({
        title: 'Missing URL',
        message: 'Paste a recipe or YouTube link first.',
        actions: [{ label: 'OK', variant: 'primary' }],
      });
      return;
    }
    try {
      new URL(trimmedUrl);
    } catch {
      setDialog({
        title: 'Invalid URL',
        message: 'Please enter a full URL including https://',
        actions: [{ label: 'OK', variant: 'primary' }],
      });
      return;
    }
    const ai = await getAiConfig();
    if (!ai) {
      return;
    }
    const yt = await getYoutubeApiKey();
    setBusy(true);
    try {
      const draft = await importFromUrl(trimmedUrl, ai.provider, ai.key, yt);
      setImportDraft(draft);
      router.push('/recipe/form');
    } catch (e) {
      setDialog({
        title: 'Import failed',
        message: e instanceof Error ? e.message : 'Unknown error',
        actions: [
          { label: 'OK' },
          {
            label: 'Manual entry',
            variant: 'primary',
            onPress: () => router.replace('/recipe/form'),
          },
        ],
      });
    } finally {
      setBusy(false);
    }
  };

  const runBatchPasteImport = async () => {
    const trimmedText = batchText.trim();
    if (!trimmedText) {
      setDialog({
        title: 'Missing text',
        message: 'Paste recipe text before extracting.',
        actions: [{ label: 'OK', variant: 'primary' }],
      });
      return;
    }
    const ai = await getAiConfig();
    if (!ai) {
      return;
    }
    setBusy(true);
    try {
      const draft = await importFromManualText(
        trimmedText,
        ai.provider,
        ai.key,
        'manual'
      );
      setImportDraft(draft);
      router.push('/recipe/form');
    } catch (e) {
      setDialog({
        title: 'Import failed',
        message: e instanceof Error ? e.message : 'Unknown error',
        actions: [
          { label: 'OK' },
          {
            label: 'Manual entry',
            variant: 'primary',
            onPress: () => router.replace('/recipe/form'),
          },
        ],
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={KEYBOARD_AVOIDING_BEHAVIOR}
      keyboardVerticalOffset={KEYBOARD_VERTICAL_OFFSET}
    >
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BackButton />
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{ padding: 20, paddingTop: 72, gap: 16 }}
      >
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
          onPress={() => setTab('paste')}
          style={{
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: 999,
            backgroundColor: tab === 'paste' ? colors.primary + '22' : colors.surface,
            borderWidth: 1,
            borderColor: tab === 'paste' ? colors.primary : colors.border,
          }}
        >
          <Text style={{ fontFamily: 'DMSans_500Medium', color: colors.textPrimary }}>Paste text</Text>
        </Pressable>
      </View>

      {tab === 'paste' ? (
        <>
          <Text style={{ fontFamily: 'DMSans_400Regular', color: colors.textSecondary }}>
            Paste a full recipe block (notes, article text, caption, or copied page), and AI will split it into ingredients and steps.
          </Text>
          <TextInput
            multiline
            value={batchText}
            onChangeText={setBatchText}
            onFocus={scrollFocusedInputIntoView}
            placeholder="Paste recipe text..."
            placeholderTextColor={colors.textSecondary}
            style={{
              minHeight: 180,
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
            onPress={runBatchPasteImport}
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
            onFocus={scrollFocusedInputIntoView}
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
      <AppDialog
        visible={dialog !== null}
        title={dialog?.title ?? ''}
        message={dialog?.message ?? ''}
        actions={dialog?.actions ?? []}
        onClose={() => setDialog(null)}
      />
    </View>
    </KeyboardAvoidingView>
  );
}
