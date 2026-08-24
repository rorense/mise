import { AppDialog } from '@/components/AppDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  Button,
  Card,
  Divider,
  Screen,
  Section,
  SegmentedControl,
  Text,
  TextField,
} from '@/components/ui';
import {
  exportBackupJson,
  getStoredRecipeCount,
  inspectBackupJson,
  restoreBackupPayload,
  type BackupPayload,
  type BackupSummary,
} from '@/data/backup';
import { cleanupUnusedMediaFiles } from '@/data/recipes';
import { AI_PROVIDER_LABEL } from '@/lib/aiConfig';
import { estimateAppStorageBytes, formatBytes } from '@/lib/media';
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
import { space } from '@/theme/tokens';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useFocusEffect } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useState } from 'react';
import { Switch, View } from 'react-native';

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

  const exportBackup = useCallback(async () => {
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
  }, []);

  const providerName = AI_PROVIDER_LABEL[aiProvider];

  return (
    <Screen scroll header={{ title: 'Settings', back: true }} gap={space.xxl}>
      <Section
        title="AI"
        description="Your API key is stored on this device only, in the Android keystore. It is never included in a build."
      >
        <Card style={{ gap: space.lg }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: space.md,
            }}
          >
            <View style={{ flex: 1, gap: space.xxs }}>
              <Text variant="bodyStrong">AI features</Text>
              <Text variant="caption" tone="secondary">
                The recipe assistant and the suggestions generated from cook notes.
              </Text>
            </View>
            <Switch
              accessibilityLabel="AI features"
              accessibilityHint="Controls the recipe assistant and cook-note suggestions"
              value={aiEnabled}
              onValueChange={async (next) => {
                setAiEnabledState(next);
                await setAiEnabled(next);
              }}
              trackColor={{ false: colors.borderStrong, true: colors.primary }}
              thumbColor={colors.surface}
            />
          </View>

          <Divider />

          <View style={{ gap: space.sm }}>
            <Text variant="label">Provider</Text>
            <SegmentedControl<AiProvider>
              value={aiProvider}
              accessibilityLabel="AI provider"
              options={[
                { value: 'openai', label: 'OpenAI' },
                { value: 'gemini', label: 'Gemini' },
                { value: 'anthropic', label: 'Claude' },
              ]}
              onChange={async (provider) => {
                setAiProviderState(provider);
                await setAiProvider(provider);
                // Keys are per provider, so the field below has to follow.
                setApiKeyDraft('');
                setHasStoredKey((await getAiApiKey(provider)) !== null);
              }}
            />
            <Text variant="caption" tone="secondary">
              Recipe import always uses Claude when a Claude key is saved — it is
              the most accurate at reading a whole page or a photo of one. Chat
              and cook-note suggestions use the provider you pick here.
            </Text>
          </View>

          <View style={{ gap: space.sm }}>
            <TextField
              label={`${providerName} API key`}
              accessibilityLabel={`${providerName} API key`}
              hint={
                hasStoredKey
                  ? 'A key is saved. Enter a new one to replace it.'
                  : 'No key saved yet. Import and the assistant need one.'
              }
              value={apiKeyDraft}
              onChangeText={setApiKeyDraft}
              placeholder={hasStoredKey ? '••••••••  (saved)' : 'Paste your API key'}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
            />
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Button
                label="Save key"
                accessibilityLabel="Save API key"
                disabled={apiKeyDraft.trim().length === 0}
                style={{ flex: 1 }}
                onPress={async () => {
                  await setAiApiKey(aiProvider, apiKeyDraft);
                  setApiKeyDraft('');
                  setHasStoredKey(true);
                  setDialog({
                    title: 'Key saved',
                    message: 'Stored on this device only.',
                  });
                }}
              />
              {hasStoredKey ? (
                <Button
                  label="Remove"
                  variant="secondary"
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
                />
              ) : null}
            </View>
          </View>
        </Card>
      </Section>

      <Section title="Appearance">
        <SegmentedControl<AppearanceMode>
          value={mode}
          accessibilityLabel="Appearance"
          onChange={(m) => void setMode(m)}
          options={[
            { value: 'system', label: 'System', icon: 'phone-portrait-outline' },
            { value: 'light', label: 'Light', icon: 'sunny-outline' },
            { value: 'dark', label: 'Dark', icon: 'moon-outline' },
          ]}
        />
      </Section>

      <Section title="Storage">
        <Card style={{ gap: space.lg }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: space.md,
            }}
          >
            <Text variant="body" tone="secondary">
              Approximate document storage
            </Text>
            <Text variant="bodyStrong">{storage}</Text>
          </View>
          <Button
            label="Clean up unused photos"
            variant="secondary"
            fullWidth
            icon="sparkles-outline"
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
          />
        </Card>
      </Section>

      <Section
        title="Data backup"
        description="Restoring replaces every recipe on this device. Export a backup first if you want to keep what is here. Backups include photos, so they can be large."
      >
        <Card style={{ gap: space.sm }}>
          <Button
            label="Export backup"
            variant="secondary"
            fullWidth
            icon="share-outline"
            accessibilityLabel="Export backup"
            accessibilityHint="Creates a backup file and opens the share sheet"
            onPress={exportBackup}
          />
          <Button
            label={isRestoring ? 'Restoring…' : 'Upload backup and restore'}
            fullWidth
            icon="cloud-upload-outline"
            loading={isRestoring}
            disabled={isRestoring}
            accessibilityLabel="Choose a backup file to restore"
            accessibilityHint="Replaces all recipes on this device. You will be asked to confirm first."
            onPress={pickBackupToRestore}
          />
        </Card>
      </Section>

      <Button
        label="About"
        variant="ghost"
        accessibilityLabel="About Mise en"
        style={{ alignSelf: 'center' }}
        onPress={() =>
          setDialog({
            title: 'Mise en',
            message: 'Personal recipe journal — local only.',
          })
        }
      />

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
    </Screen>
  );
}

function formatCount(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}
