import { exportBackupJson, restoreBackupJson } from '@/data/backup';
import { getActiveAiProvider } from '@/lib/aiConfig';
import { estimateAppStorageBytes, formatBytes } from '@/lib/media';
import { AppDialog } from '@/components/AppDialog';
import { BackButton } from '@/components/BackButton';
import {
  getAiProvider,
  getAppearance,
  getYoutubeApiKey,
  setAiProvider,
  type AiProvider,
  setYoutubeApiKey,
} from '@/lib/secrets';
import type { AppearanceMode } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeContext';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

export default function SettingsScreen() {
  const { colors, mode, setMode } = useTheme();
  const [aiProvider, setAiProviderState] = useState<AiProvider>('openai');
  const [youtube, setYoutube] = useState('');
  const [storage, setStorage] = useState('—');
  const [backupDraft, setBackupDraft] = useState('');
  const [dialog, setDialog] = useState<{
    title: string;
    message: string;
  } | null>(null);

  const load = useCallback(async () => {
    try {
      const [provider, yt, bytes] = await Promise.all([
        getAiProvider(),
        getYoutubeApiKey(),
        estimateAppStorageBytes(),
      ]);
      setAiProviderState(provider);
      setYoutube(yt ?? '');
      setStorage(formatBytes(bytes));
    } catch {
      setStorage('Unavailable');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BackButton />
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{ padding: 20, paddingTop: 72, gap: 20, paddingBottom: 48 }}
      >
        <Text style={{ fontFamily: 'Lora_700Bold', fontSize: 22, color: colors.textPrimary }}>
          AI
        </Text>
      <Text style={{ fontFamily: 'DMSans_400Regular', color: colors.textSecondary }}>
        API keys are read from local env files in the codebase.
      </Text>
      <View>
        <Text style={{ fontFamily: 'DMSans_500Medium', color: colors.textPrimary, marginBottom: 6 }}>
          Provider
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(['openai', 'gemini'] as AiProvider[]).map((provider) => (
            <Pressable
              key={provider}
              onPress={async () => {
                setAiProviderState(provider);
                await setAiProvider(provider);
                const active = await getActiveAiProvider();
                setDialog({
                  title: 'Saved',
                  message: `AI provider set to ${active === 'gemini' ? 'Gemini' : 'OpenAI'}.`,
                });
              }}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 999,
                backgroundColor:
                  aiProvider === provider ? colors.primary + '33' : colors.surface,
                borderWidth: 1,
                borderColor: aiProvider === provider ? colors.primary : colors.border,
              }}
            >
              <Text style={{ color: colors.textPrimary, fontFamily: 'DMSans_500Medium' }}>
                {provider === 'gemini' ? 'Gemini' : 'OpenAI'}
              </Text>
            </Pressable>
          ))}
        </View>
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
            setDialog({ title: 'Saved', message: 'YouTube key updated.' });
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
      <Text style={{ fontFamily: 'Lora_700Bold', fontSize: 22, color: colors.textPrimary }}>
        Data backup
      </Text>
      <Pressable
        onPress={async () => {
          try {
            const json = await exportBackupJson();
            const docDir = FileSystem.documentDirectory;
            if (!docDir) {
              throw new Error('Storage directory unavailable');
            }
            const backupPath = `${docDir}mise-backup-${Date.now()}.json`;
            await FileSystem.writeAsStringAsync(backupPath, json);
            if (await Sharing.isAvailableAsync()) {
              await Sharing.shareAsync(backupPath);
            }
            setDialog({
              title: 'Backup ready',
              message: 'Backup file generated and ready to share.',
            });
          } catch {
            setDialog({
              title: 'Backup failed',
              message: 'Could not export backup on this device.',
            });
          }
        }}
        style={{
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 12,
          padding: 12,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: colors.textPrimary, fontFamily: 'DMSans_700Bold' }}>
          Export backup
        </Text>
      </Pressable>
      <TextInput
        value={backupDraft}
        onChangeText={setBackupDraft}
        placeholder="Paste backup JSON to restore"
        placeholderTextColor={colors.textSecondary}
        multiline
        style={{
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 12,
          padding: 12,
          minHeight: 110,
          textAlignVertical: 'top',
          fontFamily: 'DMSans_400Regular',
          color: colors.textPrimary,
          backgroundColor: colors.surface,
        }}
      />
      <Pressable
        onPress={async () => {
          try {
            await restoreBackupJson(backupDraft);
            const restoredAppearance = await getAppearance();
            if (restoredAppearance) {
              setMode(restoredAppearance);
            }
            setBackupDraft('');
            await load();
            setDialog({
              title: 'Restore complete',
              message: 'Backup data has been restored.',
            });
          } catch {
            setDialog({
              title: 'Restore failed',
              message: 'Invalid backup JSON or incompatible backup file.',
            });
          }
        }}
        style={{
          backgroundColor: colors.primary,
          borderRadius: 12,
          padding: 12,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: '#fff', fontFamily: 'DMSans_700Bold' }}>
          Restore backup
        </Text>
      </Pressable>

      <Pressable
        onPress={() =>
          setDialog({
            title: 'Mise',
            message: 'Personal recipe journal — local only.',
          })
        }
      >
        <Text style={{ color: colors.primary, fontFamily: 'DMSans_500Medium' }}>About</Text>
      </Pressable>
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
