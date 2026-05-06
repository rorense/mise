import { exportBackupJson, restoreBackupJson } from '@/data/backup';
import { cleanupUnusedMediaFiles } from '@/data/recipes';
import { getActiveAiProvider } from '@/lib/aiConfig';
import { estimateAppStorageBytes, formatBytes } from '@/lib/media';
import { AppDialog } from '@/components/AppDialog';
import { BackButton } from '@/components/BackButton';
import {
  getAiProvider,
  getAppearance,
  setAiProvider,
  type AiProvider,
} from '@/lib/secrets';
import type { AppearanceMode } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeContext';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';

export default function SettingsScreen() {
  const { colors, mode, setMode } = useTheme();
  const [aiProvider, setAiProviderState] = useState<AiProvider>('openai');
  const [storage, setStorage] = useState('—');
  const [dialog, setDialog] = useState<{
    title: string;
    message: string;
  } | null>(null);

  const load = useCallback(async () => {
    try {
      const [provider, bytes] = await Promise.all([
        getAiProvider(),
        estimateAppStorageBytes(),
      ]);
      setAiProviderState(provider);
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
      <Pressable
        onPress={async () => {
          const result = await cleanupUnusedMediaFiles();
          await load();
          setDialog({
            title: 'Storage cleanup',
            message:
              result.deletedCount === 0
                ? 'No unused photos found.'
                : `Removed ${result.deletedCount} unused photo${result.deletedCount === 1 ? '' : 's'}.`,
          });
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
          Cleanup unused photos
        </Text>
      </Pressable>
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
      <Pressable
        onPress={async () => {
          try {
            const selected = await DocumentPicker.getDocumentAsync({
              type: 'application/json',
              multiple: false,
              copyToCacheDirectory: true,
            });
            if (selected.canceled) {
              return;
            }
            const file = selected.assets[0];
            if (!file?.uri) {
              throw new Error('No file selected');
            }
            const rawBackup = await FileSystem.readAsStringAsync(file.uri, {
              encoding: FileSystem.EncodingType.UTF8,
            });
            await restoreBackupJson(rawBackup);
            const restoredAppearance = await getAppearance();
            if (restoredAppearance) {
              setMode(restoredAppearance);
            }
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
          Upload backup and restore
        </Text>
      </Pressable>

      <Pressable
        onPress={() =>
          setDialog({
            title: 'Mise en',
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
