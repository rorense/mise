import {
  exportBackupJson,
  getStoredRecipeCount,
  inspectBackupJson,
  restoreBackupPayload,
  type BackupPayload,
  type BackupSummary,
} from '@/data/backup';
import { cleanupUnusedMediaFiles } from '@/data/recipes';
import { estimateAppStorageBytes, formatBytes } from '@/lib/media';
import { AppDialog } from '@/components/AppDialog';
import { BackButton } from '@/components/BackButton';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  deleteAiApiKey,
  getAiApiKey,
  getAiEnabled,
  getAiProvider,
  getAppearance,
  setAiApiKey,
  setAiEnabled,
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
  Switch,
  Text,
  TextInput,
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
  const [pendingRestore, setPendingRestore] = useState<{
    payload: BackupPayload;
    summary: BackupSummary;
    currentRecipeCount: number;
  } | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [aiEnabled, setAiEnabledState] = useState(true);
  const [apiKeyDraft, setApiKeyDraft] = useState('');
  const [hasStoredKey, setHasStoredKey] = useState(false);

  const load = useCallback(async () => {
    try {
      const [provider, enabled, bytes] = await Promise.all([
        getAiProvider(),
        getAiEnabled(),
        estimateAppStorageBytes(),
      ]);
      setAiProviderState(provider);
      setAiEnabledState(enabled);
      setStorage(formatBytes(bytes));
      setHasStoredKey((await getAiApiKey(provider)) !== null);
      setApiKeyDraft('');
    } catch {
      setStorage('Unavailable');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  // Reads and validates the file, then hands off to the confirmation dialog.
  // Nothing is written until the user confirms.
  const pickBackupToRestore = useCallback(async () => {
    try {
      const selected = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        multiple: false,
        copyToCacheDirectory: true,
      });
      if (selected.canceled) return;
      const file = selected.assets[0];
      if (!file?.uri) {
        throw new Error('No file selected');
      }
      const rawBackup = await FileSystem.readAsStringAsync(file.uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      const { payload, summary } = inspectBackupJson(rawBackup);
      const currentRecipeCount = await getStoredRecipeCount();
      setPendingRestore({ payload, summary, currentRecipeCount });
    } catch {
      setDialog({
        title: 'Could not read backup',
        message:
          'That file is not a valid Mise en backup. Nothing has been changed.',
      });
    }
  }, []);

  const applyPendingRestore = useCallback(async () => {
    if (!pendingRestore || isRestoring) return;
    const { payload, summary } = pendingRestore;
    setPendingRestore(null);
    setIsRestoring(true);
    try {
      await restoreBackupPayload(payload);
      const restoredAppearance = await getAppearance();
      if (restoredAppearance) {
        setMode(restoredAppearance);
      }
      await load();
      setDialog({
        title: 'Restore complete',
        message: `Restored ${formatCount(summary.recipes, 'recipe')}, ${formatCount(
          summary.cookLogs,
          'cook log'
        )} and ${formatCount(summary.photos, 'photo')}.`,
      });
    } catch {
      setDialog({
        title: 'Restore failed',
        message:
          'The restore was rolled back and your existing recipes are unchanged.',
      });
    } finally {
      setIsRestoring(false);
    }
  }, [pendingRestore, isRestoring, load, setMode]);

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
        Your API key is stored on this device only, in the Android keystore. It is
        never included in a build.
      </Text>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <Text style={{ fontFamily: 'DMSans_500Medium', color: colors.textPrimary, flex: 1 }}>
          AI features
        </Text>
        <Switch
          accessibilityLabel="AI features"
          accessibilityHint="Controls the recipe assistant and cook-note suggestions"
          value={aiEnabled}
          onValueChange={async (next) => {
            setAiEnabledState(next);
            await setAiEnabled(next);
          }}
          trackColor={{ false: colors.border, true: colors.primary }}
        />
      </View>
      <Text
        style={{
          fontFamily: 'DMSans_400Regular',
          color: colors.textSecondary,
          fontSize: 13,
          marginTop: -12,
        }}
      >
        Covers the recipe assistant and the suggestions generated from cook notes.
      </Text>

      <View>
        <Text style={{ fontFamily: 'DMSans_500Medium', color: colors.textPrimary, marginBottom: 6 }}>
          Provider
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(['openai', 'gemini'] as AiProvider[]).map((provider) => (
            <Pressable
              key={provider}
              accessibilityRole="button"
              accessibilityLabel={provider === 'gemini' ? 'Gemini' : 'OpenAI'}
              accessibilityState={{ selected: aiProvider === provider }}
              onPress={async () => {
                setAiProviderState(provider);
                await setAiProvider(provider);
                // Keys are per provider, so the field below has to follow.
                setApiKeyDraft('');
                setHasStoredKey((await getAiApiKey(provider)) !== null);
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
          {aiProvider === 'gemini' ? 'Gemini' : 'OpenAI'} API key
        </Text>
        <Text
          style={{
            fontFamily: 'DMSans_400Regular',
            color: colors.textSecondary,
            fontSize: 13,
            marginBottom: 8,
          }}
        >
          {hasStoredKey
            ? 'A key is saved. Enter a new one to replace it.'
            : 'No key saved yet. Import and the assistant need one.'}
        </Text>
        <TextInput
          accessibilityLabel={`${aiProvider === 'gemini' ? 'Gemini' : 'OpenAI'} API key`}
          value={apiKeyDraft}
          onChangeText={setApiKeyDraft}
          placeholder={hasStoredKey ? '••••••••  (saved)' : 'Paste your API key'}
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          style={{
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 12,
            paddingHorizontal: 12,
            paddingVertical: 10,
            fontFamily: 'DMSans_400Regular',
            color: colors.textPrimary,
            backgroundColor: colors.surface,
          }}
        />
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Save API key"
            accessibilityState={{ disabled: apiKeyDraft.trim().length === 0 }}
            disabled={apiKeyDraft.trim().length === 0}
            onPress={async () => {
              await setAiApiKey(aiProvider, apiKeyDraft);
              setApiKeyDraft('');
              setHasStoredKey(true);
              setDialog({
                title: 'Key saved',
                message: 'Stored on this device only.',
              });
            }}
            style={{
              flex: 1,
              backgroundColor: colors.primary,
              borderRadius: 12,
              padding: 12,
              alignItems: 'center',
              opacity: apiKeyDraft.trim().length === 0 ? 0.5 : 1,
            }}
          >
            <Text style={{ color: '#fff', fontFamily: 'DMSans_700Bold' }}>Save key</Text>
          </Pressable>
          {hasStoredKey ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Remove saved API key"
              onPress={async () => {
                await deleteAiApiKey(aiProvider);
                setApiKeyDraft('');
                setHasStoredKey(false);
                setDialog({
                  title: 'Key removed',
                  message: 'AI features will stop working until you add one.',
                });
              }}
              style={{
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                padding: 12,
                alignItems: 'center',
                paddingHorizontal: 16,
              }}
            >
              <Text style={{ color: colors.destructive, fontFamily: 'DMSans_700Bold' }}>
                Remove
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <Text style={{ fontFamily: 'Lora_700Bold', fontSize: 22, color: colors.textPrimary }}>
        Appearance
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {(['system', 'light', 'dark'] as AppearanceMode[]).map((m) => (
          <Pressable
            key={m}
            accessibilityRole="button"
            accessibilityLabel={`${m[0].toUpperCase() + m.slice(1)} appearance`}
            accessibilityState={{ selected: mode === m }}
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
        accessibilityRole="button"
        accessibilityLabel="Clean up unused photos"
        accessibilityHint="Deletes photo files no longer attached to any recipe or cook log"
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
        accessibilityRole="button"
        accessibilityLabel="Export backup"
        accessibilityHint="Creates a backup file and opens the share sheet"
        onPress={async () => {
          try {
            const json = await exportBackupJson();
            // Cache, not documents: the OS reclaims this, and it no longer
            // inflates the storage figure shown above.
            const cacheDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
            if (!cacheDir) {
              throw new Error('Storage directory unavailable');
            }
            const backupPath = `${cacheDir}mise-backup-${Date.now()}.json`;
            await FileSystem.writeAsStringAsync(backupPath, json);
            if (await Sharing.isAvailableAsync()) {
              await Sharing.shareAsync(backupPath);
            }
            setDialog({
              title: 'Backup ready',
              message:
                'Includes your recipes, cook logs and photos. Save it somewhere off this device.',
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
        accessibilityRole="button"
        accessibilityLabel="Choose a backup file to restore"
        accessibilityHint="Replaces all recipes on this device. You will be asked to confirm first."
        accessibilityState={{ disabled: isRestoring }}
        disabled={isRestoring}
        onPress={pickBackupToRestore}
        style={{
          backgroundColor: colors.primary,
          borderRadius: 12,
          padding: 12,
          alignItems: 'center',
          opacity: isRestoring ? 0.6 : 1,
        }}
      >
        <Text style={{ color: '#fff', fontFamily: 'DMSans_700Bold' }}>
          {isRestoring ? 'Restoring…' : 'Upload backup and restore'}
        </Text>
      </Pressable>
      <Text
        style={{
          fontFamily: 'DMSans_400Regular',
          color: colors.textSecondary,
          fontSize: 13,
          marginTop: -8,
        }}
      >
Restoring replaces every recipe on this device. Export a backup first if you
        want to keep what is here. Backups include photos, so they can be large.
      </Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="About Mise en"
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
      <ConfirmDialog
        visible={pendingRestore !== null}
        destructive
        title="Replace all recipes?"
        message={
          pendingRestore
            ? `This deletes ${formatCount(
                pendingRestore.currentRecipeCount,
                'recipe'
              )} on this device and replaces them with ${formatCount(
                pendingRestore.summary.recipes,
                'recipe'
              )} and ${formatCount(
                pendingRestore.summary.photos,
                'photo'
              )} from the backup. This cannot be undone.`
            : ''
        }
        confirmLabel="Replace everything"
        cancelLabel="Keep my recipes"
        onConfirm={() => {
          void applyPendingRestore();
        }}
        onCancel={() => setPendingRestore(null)}
      />
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

function formatCount(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}
