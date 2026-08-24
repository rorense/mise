import { AppDialog, type AppDialogAction } from '@/components/AppDialog';
import {
  Button,
  IconButton,
  Screen,
  SegmentedControl,
  Text,
  TextField,
} from '@/components/ui';
import { describeAiUnavailable, getImportAiCredentials } from '@/lib/aiConfig';
import {
  importFromImages,
  importFromManualText,
  importFromUrl,
} from '@/lib/import/pipeline';
import { MAX_SCAN_IMAGES, type ScanPhoto } from '@/lib/import/scanImage';
import { setImportDraft } from '@/lib/importDraftStore';
import {
  KEYBOARD_AVOIDING_BEHAVIOR,
  KEYBOARD_VERTICAL_OFFSET,
  useKeyboardSafeScroll,
} from '@/lib/ui/keyboardSafe';
import { useTheme } from '@/theme/ThemeContext';
import { radius, space } from '@/theme/tokens';
import NetInfo from '@react-native-community/netinfo';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, KeyboardAvoidingView, ScrollView, View } from 'react-native';

type ImportTab = 'url' | 'paste' | 'photo';

const THUMB_SIZE = 96;

export default function ImportScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { scrollRef, scrollFocusedInputIntoView } = useKeyboardSafeScroll<ScrollView>();
  const [url, setUrl] = useState('');
  const [batchText, setBatchText] = useState('');
  const [photos, setPhotos] = useState<ScanPhoto[]>([]);
  const [tab, setTab] = useState<ImportTab>('url');
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
    const credentials = await getImportAiCredentials();
    if (!credentials.ok) {
      const { title, message } = describeAiUnavailable(
        credentials.reason,
        credentials.provider
      );
      setDialog({
        title,
        message,
        actions: [{ label: 'OK', variant: 'primary' }],
      });
      return null;
    }
    return { provider: credentials.provider, key: credentials.apiKey };
  };

  const importFailed = (e: unknown) => {
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
  };

  const runUrlImport = async () => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      setDialog({
        title: 'Missing URL',
        message: 'Paste a recipe link first.',
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
    setBusy(true);
    try {
      const draft = await importFromUrl(trimmedUrl, ai.provider, ai.key);
      setImportDraft(draft);
      router.push('/recipe/form');
    } catch (e) {
      importFailed(e);
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
      importFailed(e);
    } finally {
      setBusy(false);
    }
  };

  const addPhotoFromCamera = async () => {
    if (photos.length >= MAX_SCAN_IMAGES) {
      setDialog({
        title: 'Photo limit',
        message: `Up to ${MAX_SCAN_IMAGES} photos per recipe. Remove one to add another.`,
        actions: [{ label: 'OK', variant: 'primary' }],
      });
      return;
    }
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setDialog({
        title: 'Permission',
        message: 'Camera permission is required.',
        actions: [{ label: 'OK', variant: 'primary' }],
      });
      return;
    }
    const snap = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 1,
    });
    if (snap.canceled || !snap.assets?.[0]) return;
    const asset = snap.assets[0];
    setPhotos((prev) => [
      ...prev,
      { uri: asset.uri, width: asset.width, height: asset.height },
    ]);
  };

  const removePhotoAt = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const runPhotoImport = async () => {
    if (photos.length === 0) {
      setDialog({
        title: 'No photos',
        message: 'Take a photo of the recipe first.',
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
      const draft = await importFromImages(photos, ai.provider, ai.key);
      setImportDraft(draft);
      router.push('/recipe/form');
    } catch (e) {
      importFailed(e);
    } finally {
      setBusy(false);
    }
  };

  const renderPhotoTab = () => (
    <>
      <Text variant="caption" tone="secondary">
        Photograph the recipe page. Add a second shot if the ingredients and
        method are on different pages — they will be read as one recipe. Check
        the quantities on the next screen before saving.
      </Text>

      {photos.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: space.sm }}
        >
          {photos.map((photo, index) => (
            <View key={photo.uri} style={{ width: THUMB_SIZE, height: THUMB_SIZE }}>
              <Image
                source={{ uri: photo.uri }}
                style={{
                  width: THUMB_SIZE,
                  height: THUMB_SIZE,
                  borderRadius: radius.md,
                  backgroundColor: colors.surfaceMuted,
                }}
                accessibilityLabel={`Recipe photo ${index + 1}`}
              />
              <View style={{ position: 'absolute', top: space.xxs, right: space.xxs }}>
                <IconButton
                  icon="close"
                  variant="onImage"
                  accessibilityLabel={`Remove photo ${index + 1}`}
                  onPress={() => removePhotoAt(index)}
                />
              </View>
            </View>
          ))}
        </ScrollView>
      ) : null}

      <Button
        label={photos.length === 0 ? 'Take photo' : 'Add another page'}
        variant={photos.length === 0 ? 'primary' : 'secondary'}
        fullWidth
        icon="camera-outline"
        disabled={busy}
        accessibilityLabel={
          photos.length === 0
            ? 'Take a photo of a recipe'
            : 'Take another photo of this recipe'
        }
        onPress={addPhotoFromCamera}
      />

      {photos.length > 0 ? (
        <Button
          label="Extract recipe"
          size="lg"
          fullWidth
          icon="sparkles-outline"
          loading={busy}
          disabled={busy}
          accessibilityLabel={busy ? 'Reading recipe' : 'Read recipe from photos'}
          onPress={runPhotoImport}
        />
      ) : null}
    </>
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={KEYBOARD_AVOIDING_BEHAVIOR}
      keyboardVerticalOffset={KEYBOARD_VERTICAL_OFFSET}
    >
      <Screen scroll scrollRef={scrollRef} header={{ title: 'Import', back: true }}>
        <SegmentedControl<ImportTab>
          value={tab}
          onChange={setTab}
          accessibilityLabel="Import source"
          options={[
            {
              value: 'url',
              label: 'Web page',
              icon: 'link-outline',
              accessibilityLabel: 'Import from a web page',
            },
            {
              value: 'paste',
              label: 'Paste text',
              icon: 'clipboard-outline',
              accessibilityLabel: 'Import by pasting text',
            },
            {
              value: 'photo',
              label: 'Photo',
              icon: 'camera-outline',
              accessibilityLabel: 'Import by photographing a recipe',
            },
          ]}
        />

        {tab === 'photo' ? (
          renderPhotoTab()
        ) : tab === 'paste' ? (
          <>
            <TextField
              accessibilityLabel="Recipe text to import"
              hint="Paste a full recipe block — notes, article text, a caption, or a copied page — and AI will split it into ingredients and steps."
              multiline
              value={batchText}
              onChangeText={setBatchText}
              onFocus={scrollFocusedInputIntoView}
              placeholder="Paste recipe text…"
            />
            <Button
              label="Extract recipe"
              size="lg"
              fullWidth
              icon="sparkles-outline"
              loading={busy}
              disabled={busy}
              accessibilityLabel={busy ? 'Importing recipe' : 'Import pasted text'}
              onPress={runBatchPasteImport}
            />
          </>
        ) : (
          <>
            <TextField
              accessibilityLabel="Recipe URL"
              icon="link-outline"
              value={url}
              onChangeText={setUrl}
              onFocus={scrollFocusedInputIntoView}
              placeholder="https://…"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <Button
              label="Extract recipe"
              size="lg"
              fullWidth
              icon="sparkles-outline"
              loading={busy}
              disabled={busy}
              accessibilityLabel={busy ? 'Importing recipe' : 'Import from this URL'}
              onPress={runUrlImport}
            />
          </>
        )}

        <Button
          label="Enter manually instead"
          variant="ghost"
          fullWidth
          accessibilityLabel="Enter a recipe manually instead"
          onPress={() => router.replace('/recipe/form')}
          style={{ marginTop: space.xs }}
        />

        <AppDialog
          visible={dialog !== null}
          title={dialog?.title ?? ''}
          message={dialog?.message ?? ''}
          actions={dialog?.actions ?? []}
          onClose={() => setDialog(null)}
        />
      </Screen>
    </KeyboardAvoidingView>
  );
}
