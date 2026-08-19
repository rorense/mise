import { AppDialog, type AppDialogAction } from '@/components/AppDialog';
import { BackButton } from '@/components/BackButton';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { FullscreenImageViewer } from '@/components/FullscreenImageViewer';
import { RecipeChatSheet, type RecipeChatSheetRef } from '@/components/RecipeChatSheet';
import {
  Button,
  Card,
  Chip,
  IconButton,
  ImageScrim,
  Text,
  TextField,
} from '@/components/ui';
import { pressedStyle, ripple } from '@/components/ui/press';
import {
  addCookLog,
  cleanupUnusedMediaFiles,
  createRecipeAdjustment,
  enqueueCookLogAdjustmentTask,
  getRecipeById,
  getRecipeServingsOverride,
  ignoreRecipeAdjustment,
  listPendingRecipeAdjustments,
  setRecipeArchived,
  setRecipeFlags,
  setRecipeMainImage,
  setRecipeMainImageFromCookLog,
  setRecipeServingsOverride,
  setRecipeTags,
} from '@/data/recipes';
import { resolveRecipeHeroImage } from '@/domain/recipeImages';
import {
  formatIngredientAmount,
  ingredientShowsAdjustToTasteHint,
  renderStepInstruction,
  splitIngredientSections,
} from '@/domain/scaling';
import { normalizeServings, shouldCommitSliderTick } from '@/domain/slider';
import { suggestRecipeAdjustmentsFromCookNote } from '@/lib/ai/cookLogAdjustments';
import { describeAiUnavailable, getAiCredentials } from '@/lib/aiConfig';
import { newId } from '@/lib/id';
import {
  compressAndSaveCookPhoto,
  compressAndSaveMainRecipePhoto,
} from '@/lib/media';
import { getAiEnabled } from '@/lib/secrets';
import { extractStepTimerPresets, formatTimerRemaining } from '@/lib/stepTimers';
import {
  ensureTimerNotificationPermission,
  presentTimerDoneNotification,
} from '@/lib/timerNotifications';
import {
  KEYBOARD_AVOIDING_BEHAVIOR,
  KEYBOARD_VERTICAL_OFFSET,
  useKeyboardSafeScroll,
} from '@/lib/ui/keyboardSafe';
import { useTheme } from '@/theme/ThemeContext';
import { elevation, radius, space } from '@/theme/tokens';
import type { Recipe, RecipeAdjustment } from '@/types/recipe';
import { Ionicons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import Slider from '@react-native-community/slider';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Linking,
  Pressable,
  ScrollView,
  Share,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const HERO_HEIGHT = 280;
/** Reading mode bumps body copy for arm's-length legibility at the stove. */
const READ_MODE_BODY = { fontSize: 17, lineHeight: 27 } as const;

export default function RecipeDetailScreen() {
  const { id, fromImport } = useLocalSearchParams<{ id: string; fromImport?: string }>();
  const { colors, resolved } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<RecipeChatSheetRef>(null);
  const { scrollRef, scrollFocusedInputIntoView } = useKeyboardSafeScroll<ScrollView>();
  const lastSliderCommitAtRef = useRef(0);
  const isSlidingRef = useRef(false);
  const loadSeqRef = useRef(0);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [servings, setServings] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMissing, setIsMissing] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [ratingDraft, setRatingDraft] = useState<number | null>(null);
  const [tagDraft, setTagDraft] = useState('');
  const [showArchiveRecipeConfirm, setShowArchiveRecipeConfirm] = useState(false);
  const [readMode, setReadMode] = useState(false);
  const [checklistMode, setChecklistMode] = useState(false);
  const [checkedIngredientIds, setCheckedIngredientIds] = useState<string[]>([]);
  const [showIngredients, setShowIngredients] = useState(true);
  const [showMethod, setShowMethod] = useState(true);
  const [showCookJournal, setShowCookJournal] = useState(true);
  const [fullscreenImageUri, setFullscreenImageUri] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{
    title: string;
    message: string;
    actions: AppDialogAction[];
  } | null>(null);
  const [pendingAdjustments, setPendingAdjustments] = useState<RecipeAdjustment[]>([]);
  const [isLoggingCook, setIsLoggingCook] = useState(false);
  const [isUpdatingTags, setIsUpdatingTags] = useState(false);
  const [activeTimer, setActiveTimer] = useState<{
    stepId: string;
    label: string;
    remainingSeconds: number;
    isPaused: boolean;
    endsAtMs: number | null;
  } | null>(null);
  const hasRequestedNotificationPermissionRef = useRef(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const shouldBackToHome = fromImport === '1' || fromImport === 'true';

  const reload = useCallback(async () => {
    setIsLoading(true);
    setIsMissing(false);
    const seq = ++loadSeqRef.current;
    const r = await getRecipeById(String(id));
    if (seq !== loadSeqRef.current) return;
    if (r) {
      const maxServings = Math.max(12, Math.round(r.baseServings));
      const [savedServings, pending] = await Promise.all([
        getRecipeServingsOverride(r.id),
        listPendingRecipeAdjustments(r.id),
      ]);
      if (seq !== loadSeqRef.current) return;
      const nextServings = normalizeServings(
        typeof savedServings === 'number' ? savedServings : r.baseServings,
        maxServings
      );
      setServings(nextServings);
      setPendingAdjustments(pending);
      setRecipe(r);
    } else {
      setRecipe(null);
      setServings(null);
      setPendingAdjustments([]);
      setIsMissing(true);
    }
    setIsLoading(false);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void (async () => {
        const enabled = await getAiEnabled();
        if (!cancelled) setAiEnabled(enabled);
      })();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  // The updater stays pure: React may call it more than once, and firing the
  // notification from inside it produced duplicate alerts. Depending on
  // endsAtMs rather than the whole timer object also stops the interval being
  // torn down and rebuilt on every displayed second.
  const timerEndsAtMs = activeTimer?.isPaused ? null : activeTimer?.endsAtMs ?? null;
  const timerLabel = activeTimer?.label ?? '';

  useEffect(() => {
    if (timerEndsAtMs === null) return;
    const handle = setInterval(() => {
      const remainingSeconds = Math.max(
        0,
        Math.ceil((timerEndsAtMs - Date.now()) / 1000)
      );
      if (remainingSeconds <= 0) {
        // Stop first: the notification and dialog must fire once, and firing
        // them from inside the state updater made React's double-invoke
        // produce duplicates.
        clearInterval(handle);
        setActiveTimer(null);
        void presentTimerDoneNotification(timerLabel);
        setDialog({
          title: 'Timer done',
          message: `${timerLabel} finished.`,
          actions: [{ label: 'OK', variant: 'primary' }],
        });
        return;
      }
      setActiveTimer((current) =>
        current && current.remainingSeconds !== remainingSeconds
          ? { ...current, remainingSeconds }
          : current
      );
    }, 250);
    return () => clearInterval(handle);
  }, [timerEndsAtMs, timerLabel]);

  const startStepTimer = useCallback(async (stepId: string, label: string, seconds: number) => {
    if (!hasRequestedNotificationPermissionRef.current) {
      hasRequestedNotificationPermissionRef.current = true;
      void ensureTimerNotificationPermission();
    }
    setActiveTimer({
      stepId,
      label,
      remainingSeconds: seconds,
      isPaused: false,
      endsAtMs: Date.now() + seconds * 1000,
    });
  }, []);

  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.background,
        }}
      >
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (isMissing || !recipe || servings === null) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.background,
          paddingHorizontal: space.xxl,
          gap: space.lg,
        }}
      >
        <Ionicons name="help-circle-outline" size={44} color={colors.textSecondary} />
        <Text variant="heading" accessibilityRole="header">
          Recipe not found
        </Text>
        <Text variant="body" tone="secondary" style={{ textAlign: 'center' }}>
          This recipe may have been removed.
        </Text>
        <Button label="Back to library" onPress={() => router.replace('/')} />
      </View>
    );
  }


  const hero = resolveRecipeHeroImage(
    recipe.mainImageUri,
    recipe.cookLogs.find((l) => l.photoUri)?.photoUri
  );
  const sliderMax = Math.max(12, Math.round(recipe.baseServings));
  const ingredientSections = splitIngredientSections(recipe.ingredients);

  const shareRecipe = async () => {
    const ingredientLines = ingredientSections.flatMap((section, sectionIdx) => {
      const sectionLines: string[] = [];
      if (sectionIdx > 0) {
        sectionLines.push('');
      }
      if (section.title) {
        sectionLines.push(section.title);
      }
      section.ingredients.forEach((ingredient) => {
        sectionLines.push(
          `- ${formatIngredientAmount(ingredient, recipe.baseServings, servings)} ${ingredient.name}`
        );
      });
      return sectionLines;
    });
    const lines = [
      recipe.title,
      '',
      ...ingredientLines,
      '',
      ...[...recipe.steps]
        .sort((a, b) => a.order - b.order)
        .map(
          (s, idx) =>
            `${idx + 1}. ${renderStepInstruction(
              s,
              recipe.baseServings,
              servings
            )}`
        ),
    ];
    await Share.share({ message: lines.join('\n') });
  };

  const persistCookLog = async (photoUri?: string) => {
    setIsLoggingCook(true);
    try {
      const cookLogId = newId();
      const noteText = noteDraft.trim();
      await addCookLog({
        id: cookLogId,
        recipeId: recipe.id,
        cookedAt: new Date().toISOString(),
        photoUri,
        notes: noteText || undefined,
        rating: ratingDraft ?? undefined,
        createdAt: new Date().toISOString(),
      });
      let adjustmentId: string | undefined;
      if (noteText && aiEnabled) {
        const net = await NetInfo.fetch();
        if (net.isConnected) {
          const credentials = await getAiCredentials();
          if (credentials.ok) {
            try {
              const suggestions = await suggestRecipeAdjustmentsFromCookNote({
                recipe,
                note: noteText,
                provider: credentials.provider,
                apiKey: credentials.apiKey,
              });
              const adjustment = await createRecipeAdjustment({
                recipeId: recipe.id,
                cookLogId,
                suggestions,
              });
              adjustmentId = adjustment?.id;
            } catch {
              // Cook logs still save even if AI extraction fails.
            }
          } else {
            await enqueueCookLogAdjustmentTask({
              recipeId: recipe.id,
              cookLogId,
              note: noteText,
            });
          }
        } else {
          await enqueueCookLogAdjustmentTask({
            recipeId: recipe.id,
            cookLogId,
            note: noteText,
          });
        }
      }
      setNoteDraft('');
      setRatingDraft(null);
      await reload();
      if (adjustmentId) {
        setDialog({
          title: 'Suggested recipe updates',
          message: 'We found note-based updates. Review and choose what to apply.',
          actions: [
            { label: 'Later' },
            {
              label: 'Ignore',
              onPress: () => ignoreRecipeAdjustment(adjustmentId!),
            },
            {
              label: 'Review',
              variant: 'primary',
              onPress: () => router.push(`/recipe/adjustments/${adjustmentId}`),
            },
          ],
        });
      }
    } catch {
      setDialog({
        title: 'Could not log cook',
        message: 'Please try again.',
        actions: [{ label: 'OK', variant: 'primary' }],
      });
    } finally {
      setIsLoggingCook(false);
    }
  };

  const logCookFromLibrary = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setDialog({
        title: 'Permission',
        message: 'Photos permission is required.',
        actions: [{ label: 'OK', variant: 'primary' }],
      });
      return;
    }
    const pick = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
    });
    if (pick.canceled || !pick.assets?.[0]) return;
    const uri = pick.assets[0].uri;
    const destName = newId();
    const saved = await compressAndSaveCookPhoto(uri, destName);
    await persistCookLog(saved);
  };

  const logCookFromCamera = async () => {
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
    const uri = snap.assets[0].uri;
    const destName = newId();
    const saved = await compressAndSaveCookPhoto(uri, destName);
    await persistCookLog(saved);
  };

  const logCook = () => {
    setDialog({
      title: 'Log this cook',
      message: 'Choose a photo source',
      actions: [
        { label: 'Cancel' },
        { label: 'No photo', onPress: () => persistCookLog(), variant: 'primary' },
        { label: 'Photo library', onPress: () => logCookFromLibrary() },
        { label: 'Camera', onPress: () => logCookFromCamera() },
      ],
    });
  };

  const setMainImageFromLibrary = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setDialog({
        title: 'Permission',
        message: 'Photos permission is required.',
        actions: [{ label: 'OK', variant: 'primary' }],
      });
      return;
    }
    const pick = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
    });
    if (pick.canceled || !pick.assets?.[0]) return;
    const saved = await compressAndSaveMainRecipePhoto(pick.assets[0].uri, newId());
    await setRecipeMainImage(recipe.id, saved);
    await reload();
  };

  const setMainImageFromCamera = async () => {
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
    const saved = await compressAndSaveMainRecipePhoto(snap.assets[0].uri, newId());
    await setRecipeMainImage(recipe.id, saved);
    await reload();
  };

  const toggleIngredientChecked = (ingredientId: string) => {
    setCheckedIngredientIds((prev) =>
      prev.includes(ingredientId)
        ? prev.filter((id) => id !== ingredientId)
        : [...prev, ingredientId]
    );
  };

  const openQuickActions = () => {
    setDialog({
      title: 'Recipe actions',
      message: recipe.title,
      actions: [
        { label: 'Cancel' },
        {
          label: 'Edit recipe',
          onPress: () =>
            router.push({ pathname: '/recipe/form', params: { recipeId: recipe.id } }),
        },
        { label: 'Share', onPress: shareRecipe },
        {
          label: 'Version history',
          onPress: () => router.push(`/recipe/versions/${recipe.id}`),
        },
        {
          label: 'Use latest cook photo as hero',
          onPress: async () => {
            const latestWithPhoto = recipe.cookLogs.find((log) => !!log.photoUri);
            if (!latestWithPhoto) {
              setDialog({
                title: 'No cook photo',
                message: 'Log a cook with a photo first.',
                actions: [{ label: 'OK', variant: 'primary' }],
              });
              return;
            }
            const ok = await setRecipeMainImageFromCookLog(recipe.id, latestWithPhoto.id);
            if (ok) {
              await reload();
            }
          },
        },
        {
          label: 'Clean unused photos',
          onPress: async () => {
            const result = await cleanupUnusedMediaFiles();
            setDialog({
              title: 'Cleanup complete',
              message:
                result.deletedCount === 0
                  ? 'No unused photos found.'
                  : `Removed ${result.deletedCount} unused photo${result.deletedCount === 1 ? '' : 's'}.`,
              actions: [{ label: 'OK', variant: 'primary' }],
            });
          },
        },
        {
          label: recipe.isArchived ? 'Unarchive' : 'Archive',
          variant: recipe.isArchived ? 'default' : 'destructive',
          onPress: () => setShowArchiveRecipeConfirm(true),
        },
      ],
    });
  };

  const toggleFavorite = async () => {
    const nextValue = !recipe.isFavorite;
    setRecipe({ ...recipe, isFavorite: nextValue });
    try {
      await setRecipeFlags(recipe.id, { isFavorite: nextValue });
    } catch {
      setRecipe((current) =>
        current ? { ...current, isFavorite: !nextValue } : current
      );
      setDialog({
        title: 'Could not update',
        message: 'Please try again.',
        actions: [{ label: 'OK', variant: 'primary' }],
      });
    }
  };

  const toggleWantToCook = async () => {
    const nextValue = !recipe.wantToCook;
    setRecipe({ ...recipe, wantToCook: nextValue });
    try {
      await setRecipeFlags(recipe.id, { wantToCook: nextValue });
    } catch {
      setRecipe((current) =>
        current ? { ...current, wantToCook: !nextValue } : current
      );
      setDialog({
        title: 'Could not update',
        message: 'Please try again.',
        actions: [{ label: 'OK', variant: 'primary' }],
      });
    }
  };

  const persistTags = async (nextTags: string[]) => {
    const previousTags = recipe.tags;
    setRecipe({ ...recipe, tags: nextTags });
    setIsUpdatingTags(true);
    try {
      await setRecipeTags(recipe.id, nextTags);
    } catch {
      setRecipe((current) => (current ? { ...current, tags: previousTags } : current));
      setDialog({
        title: 'Could not update tags',
        message: 'Please try again.',
        actions: [{ label: 'OK', variant: 'primary' }],
      });
    } finally {
      setIsUpdatingTags(false);
    }
  };

  const addTagsFromDraft = async () => {
    if (isUpdatingTags) return;
    const candidates = tagDraft
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
    if (candidates.length === 0) return;
    const existing = new Set(recipe.tags.map((tag) => tag.toLowerCase()));
    const nextTags = [...recipe.tags];
    for (const candidate of candidates) {
      const key = candidate.toLowerCase();
      if (existing.has(key)) continue;
      existing.add(key);
      nextTags.push(candidate);
    }
    setTagDraft('');
    await persistTags(nextTags);
  };

  const removeTag = async (tagToRemove: string) => {
    if (isUpdatingTags) return;
    const nextTags = recipe.tags.filter((tag) => tag.toLowerCase() !== tagToRemove.toLowerCase());
    await persistTags(nextTags);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={KEYBOARD_AVOIDING_BEHAVIOR}
      keyboardVerticalOffset={KEYBOARD_VERTICAL_OFFSET}
    >
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <BackButton
          overImage={Boolean(hero)}
          onPress={shouldBackToHome ? () => router.replace('/') : undefined}
        />
        <ScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
        >
          <View style={{ height: HERO_HEIGHT, backgroundColor: colors.surfaceMuted }}>
            {hero ? (
              <Pressable
                accessibilityRole="imagebutton"
                accessibilityLabel={`Photo of ${recipe.title}`}
                accessibilityHint="Opens the photo full screen"
                onPress={() => setFullscreenImageUri(hero)}
                style={{ width: '100%', height: '100%' }}
              >
                <Image
                  source={{ uri: hero }}
                  style={{ width: '100%', height: '100%' }}
                  resizeMode="cover"
                />
              </Pressable>
            ) : (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="image-outline" size={48} color={colors.textSecondary} />
              </View>
            )}
            {/* Darkens the top of the photo so the floating back arrow stays
                visible over a pale image. */}
            {hero ? <ImageScrim from="top" height={112} /> : null}
            <IconButton
              icon="camera-outline"
              accessibilityLabel="Change main photo"
              accessibilityHint="Set, replace, or clear the recipe photo"
              variant={hero ? 'onImage' : 'surface'}
              onPress={() =>
                setDialog({
                  title: 'Main image',
                  message: 'Choose how to set the recipe main image.',
                  actions: [
                    { label: 'Cancel' },
                    {
                      label: 'Clear',
                      onPress: async () => {
                        await setRecipeMainImage(recipe.id, undefined);
                        await reload();
                      },
                    },
                    {
                      label: 'Photo library',
                      onPress: () => setMainImageFromLibrary(),
                    },
                    { label: 'Camera', onPress: () => setMainImageFromCamera() },
                  ],
                })
              }
              style={{ position: 'absolute', right: space.md, bottom: space.md }}
            />
          </View>

          <View style={{ padding: space.xl, gap: space.lg }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}>
              <Text variant="title" accessibilityRole="header" style={{ flex: 1 }}>
                {recipe.title}
              </Text>
              <IconButton
                icon={readMode ? 'book' : 'book-outline'}
                accessibilityLabel="Reading mode"
                accessibilityHint="Hides everything except ingredients and method"
                accessibilityState={{ selected: readMode }}
                variant={readMode ? 'accent' : 'surface'}
                onPress={() => setReadMode((v) => !v)}
              />
              <IconButton
                icon="ellipsis-horizontal"
                accessibilityLabel="Recipe actions"
                accessibilityHint="Edit, share, version history, archive"
                onPress={openQuickActions}
              />
            </View>

            {!readMode && recipe.sourceUrl ? (
              <Text
                variant="label"
                tone="accent"
                accessibilityRole="link"
                accessibilityLabel="Open original recipe source in browser"
                onPress={() => Linking.openURL(recipe.sourceUrl)}
              >
                Open source ↗
              </Text>
            ) : null}

            {!readMode ? (
              <Text variant="caption" tone="secondary">
                {recipe.cuisine ? `${recipe.cuisine} · ` : ''}
                {recipe.tags.length > 0 ? recipe.tags.join(' · ') : 'No tags yet'}
              </Text>
            ) : null}

            {!readMode ? (
              <>
                {recipe.tags.length > 0 ? (
                  <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
                    {recipe.tags.map((tag) => (
                      <Chip
                        key={tag}
                        label={tag}
                        icon="close"
                        accessibilityLabel={`Tag ${tag}`}
                        accessibilityHint="Removes this tag"
                        onPress={() => {
                          if (!isUpdatingTags) void removeTag(tag);
                        }}
                        style={{ opacity: isUpdatingTags ? 0.6 : 1 }}
                      />
                    ))}
                  </View>
                ) : null}

                <TextField
                  accessibilityLabel="Add tags, comma separated"
                  value={tagDraft}
                  onChangeText={setTagDraft}
                  onSubmitEditing={() => {
                    void addTagsFromDraft();
                  }}
                  editable={!isUpdatingTags}
                  placeholder="Add tags (comma separated)"
                  returnKeyType="done"
                  trailing={
                    <IconButton
                      icon="add"
                      accessibilityLabel="Add tags"
                      variant="accent"
                      size={32}
                      iconSize={18}
                      disabled={isUpdatingTags}
                      onPress={() => {
                        void addTagsFromDraft();
                      }}
                    />
                  }
                />

                <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
                  <Chip
                    label="Favorite"
                    icon={recipe.isFavorite ? 'star' : 'star-outline'}
                    active={recipe.isFavorite}
                    accessibilityLabel="Favourite"
                    accessibilityHint={
                      recipe.isFavorite ? 'Removes the favourite mark' : 'Marks as favourite'
                    }
                    onPress={toggleFavorite}
                  />
                  <Chip
                    label="Want to cook"
                    icon={recipe.wantToCook ? 'flame' : 'flame-outline'}
                    active={recipe.wantToCook}
                    accessibilityLabel="Want to cook"
                    accessibilityHint={
                      recipe.wantToCook ? 'Removes the want-to-cook mark' : 'Marks as want to cook'
                    }
                    onPress={toggleWantToCook}
                  />
                </View>
              </>
            ) : null}

            <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
              <Chip
                label="Checklist"
                icon={checklistMode ? 'checkbox' : 'checkbox-outline'}
                active={checklistMode}
                accessibilityLabel="Checklist mode"
                accessibilityHint="Lets you tick off ingredients as you go"
                onPress={() => setChecklistMode((v) => !v)}
              />
              {checklistMode ? (
                <Chip
                  label="Reset checks"
                  icon="refresh-outline"
                  accessibilityLabel="Clear ticked ingredients"
                  accessibilityHint="Unticks every ingredient"
                  onPress={() => setCheckedIngredientIds([])}
                />
              ) : null}
            </View>

            <Card level={1} style={{ gap: space.xs }}>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                }}
              >
                <Text variant="overline" tone="secondary">
                  Serves
                </Text>
                <Text variant="title" tone="accent">
                  {Math.round(servings)}
                </Text>
              </View>
              <Slider
                accessibilityLabel="Servings"
                minimumValue={1}
                maximumValue={sliderMax}
                step={1}
                value={servings}
                onSlidingStart={() => {
                  isSlidingRef.current = true;
                }}
                onValueChange={(value) => {
                  if (!isSlidingRef.current) {
                    return;
                  }
                  const now = Date.now();
                  if (!shouldCommitSliderTick(lastSliderCommitAtRef.current, now)) {
                    return;
                  }
                  lastSliderCommitAtRef.current = now;
                  const nextServings = normalizeServings(value, sliderMax);
                  setServings(nextServings);
                }}
                onSlidingComplete={(value) => {
                  isSlidingRef.current = false;
                  lastSliderCommitAtRef.current = Date.now();
                  const nextServings = normalizeServings(value, sliderMax);
                  setServings(nextServings);
                  void setRecipeServingsOverride(recipe.id, nextServings);
                }}
                minimumTrackTintColor={colors.primary}
                maximumTrackTintColor={colors.borderStrong}
                thumbTintColor={colors.primary}
              />
            </Card>

            <SectionToggle
              label="Ingredients"
              open={showIngredients}
              onToggle={() => setShowIngredients((v) => !v)}
              accessibilityLabel="Ingredients section"
              colors={colors}
            />
            {readMode || showIngredients
              ? ingredientSections.map((section, sectionIdx) => (
                  <View
                    key={`section-${section.title ?? 'default'}-${sectionIdx}`}
                    style={{ gap: space.xs }}
                  >
                    {section.title ? (
                      <Text variant="overline" tone="secondary" style={{ marginTop: space.sm }}>
                        {section.title}
                      </Text>
                    ) : null}
                    {section.ingredients.map((ing) => {
                      const amount = formatIngredientAmount(ing, recipe.baseServings, servings);
                      const checked = checkedIngredientIds.includes(ing.id);
                      const needsTasteHint = ingredientShowsAdjustToTasteHint(ing);
                      return (
                        <Pressable
                          key={ing.id}
                          accessibilityRole={checklistMode ? 'checkbox' : 'text'}
                          accessibilityLabel={`${amount} ${ing.name}`}
                          accessibilityState={checklistMode ? { checked } : undefined}
                          accessibilityHint={
                            checklistMode ? 'Ticks this ingredient off' : undefined
                          }
                          disabled={!checklistMode}
                          onPress={() => {
                            if (checklistMode) {
                              toggleIngredientChecked(ing.id);
                            }
                          }}
                          android_ripple={checklistMode ? ripple(colors.ripple) : undefined}
                          style={({ pressed }) => [
                            {
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: space.sm,
                              // Checklist rows are tap targets, so they get real
                              // height; the read-only list stays compact.
                              minHeight: checklistMode ? 40 : undefined,
                              paddingVertical: checklistMode ? 0 : space.xxs,
                              borderRadius: radius.sm,
                            },
                            checklistMode ? pressedStyle(pressed) : undefined,
                          ]}
                        >
                          {checklistMode ? (
                            <Ionicons
                              name={checked ? 'checkbox' : 'square-outline'}
                              size={20}
                              color={checked ? colors.primary : colors.textSecondary}
                            />
                          ) : (
                            <View
                              style={{
                                width: 4,
                                height: 4,
                                borderRadius: 2,
                                backgroundColor: colors.textSecondary,
                              }}
                            />
                          )}
                          <Text
                            variant={readMode ? 'bodyStrong' : 'body'}
                            tone={checked ? 'secondary' : 'primary'}
                            style={[
                              readMode ? READ_MODE_BODY : null,
                              {
                                flex: 1,
                                textDecorationLine: checked ? 'line-through' : 'none',
                              },
                            ]}
                          >
                            {amount} {ing.name}
                          </Text>
                          {needsTasteHint ? (
                            <Text
                              variant="caption"
                              tone="secondary"
                              accessibilityLabel="Adjust to taste"
                            >
                              ⚠ to taste
                            </Text>
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </View>
                ))
              : null}

            <SectionToggle
              label="Method"
              open={showMethod}
              onToggle={() => setShowMethod((v) => !v)}
              accessibilityLabel="Method section"
              colors={colors}
            />
            {readMode || showMethod
              ? [...recipe.steps]
                  .sort((a, b) => a.order - b.order)
                  .map((s, idx) => {
                    const presets = extractStepTimerPresets(s.instruction);
                    return (
                      <View key={s.id} style={{ gap: space.sm }}>
                        <View style={{ flexDirection: 'row', gap: space.md }}>
                          <View
                            style={{
                              minWidth: 26,
                              height: 26,
                              borderRadius: radius.pill,
                              backgroundColor: colors.primaryFill,
                              alignItems: 'center',
                              justifyContent: 'center',
                              marginTop: space.xxs,
                            }}
                          >
                            <Text variant="captionStrong" tone="onAccent">
                              {idx + 1}
                            </Text>
                          </View>
                          <Text
                            variant={readMode ? 'bodyStrong' : 'body'}
                            style={[readMode ? READ_MODE_BODY : null, { flex: 1 }]}
                          >
                            {renderStepInstruction(s, recipe.baseServings, servings)}
                          </Text>
                        </View>
                        {presets.length > 0 ? (
                          <View
                            style={{
                              flexDirection: 'row',
                              gap: space.sm,
                              flexWrap: 'wrap',
                              marginLeft: 26 + space.md,
                            }}
                          >
                            {presets.map((preset) => (
                              <Chip
                                key={preset.key}
                                label={preset.label}
                                icon="timer-outline"
                                accessibilityLabel={`Start ${preset.label} timer for step ${idx + 1}`}
                                accessibilityHint="Starts a countdown timer"
                                onPress={() =>
                                  void startStepTimer(
                                    s.id,
                                    `Step ${idx + 1} · ${preset.label}`,
                                    preset.seconds
                                  )
                                }
                              />
                            ))}
                          </View>
                        ) : null}
                      </View>
                    );
                  })
              : null}

            {!readMode ? (
              <>
                <SectionToggle
                  label="Cook journal"
                  open={showCookJournal}
                  onToggle={() => setShowCookJournal((v) => !v)}
                  accessibilityLabel="Cook journal section"
                  colors={colors}
                />
                {showCookJournal && recipe.cookLogs.length > 0 ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: space.md, paddingBottom: space.xs }}
                  >
                    {recipe.cookLogs.map((log) => {
                      const cookedOn = new Date(log.cookedAt).toLocaleDateString();
                      return (
                        <View key={log.id} style={{ width: 132, gap: space.xs }}>
                          <Pressable
                            accessibilityRole={log.photoUri ? 'imagebutton' : 'button'}
                            accessibilityLabel={
                              log.photoUri
                                ? `Cook photo from ${cookedOn}`
                                : `Cook log from ${cookedOn}`
                            }
                            onPress={() =>
                              log.photoUri
                                ? setFullscreenImageUri(log.photoUri)
                                : router.push(`/cook-log/${log.id}`)
                            }
                            style={({ pressed }) => pressedStyle(pressed, 0.85)}
                          >
                            {log.photoUri ? (
                              <Image
                                source={{ uri: log.photoUri }}
                                style={{
                                  width: 132,
                                  height: 132,
                                  borderRadius: radius.md,
                                }}
                                resizeMode="cover"
                              />
                            ) : (
                              <View
                                style={{
                                  width: 132,
                                  height: 132,
                                  borderRadius: radius.md,
                                  backgroundColor: colors.surfaceMuted,
                                  borderWidth: 1,
                                  borderColor: colors.border,
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                <Ionicons
                                  name="document-text-outline"
                                  size={26}
                                  color={colors.textSecondary}
                                />
                              </View>
                            )}
                          </Pressable>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Open cook log from ${cookedOn}`}
                            onPress={() => router.push(`/cook-log/${log.id}`)}
                            style={({ pressed }) => [{ gap: space.xxs }, pressedStyle(pressed)]}
                          >
                            <Text variant="caption" tone="secondary" numberOfLines={1}>
                              {cookedOn}
                              {typeof log.rating === 'number' ? ` · ${log.rating}/5` : ''}
                            </Text>
                            {log.notes ? (
                              <Text variant="caption" numberOfLines={3}>
                                {log.notes}
                              </Text>
                            ) : null}
                          </Pressable>
                          {log.photoUri ? (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel="Set this photo as the recipe hero image"
                              onPress={async () => {
                                await setRecipeMainImageFromCookLog(recipe.id, log.id);
                                await reload();
                              }}
                              hitSlop={8}
                              style={({ pressed }) => pressedStyle(pressed)}
                            >
                              <Text variant="caption" tone="accent">
                                Set as hero
                              </Text>
                            </Pressable>
                          ) : null}
                        </View>
                      );
                    })}
                  </ScrollView>
                ) : null}

                <Card level={0} style={{ gap: space.md }}>
                  <Text variant="overline" tone="secondary">
                    Log a cook
                  </Text>

                  <View
                    style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}
                  >
                    <Text variant="label" tone="secondary" style={{ flex: 1 }}>
                      Rating
                    </Text>
                    {[1, 2, 3, 4, 5].map((value) => {
                      const filled = ratingDraft !== null && value <= ratingDraft;
                      return (
                        <Pressable
                          key={value}
                          accessibilityRole="button"
                          accessibilityLabel={`Rate ${value} out of 5`}
                          accessibilityState={{ selected: filled }}
                          hitSlop={8}
                          onPress={() => setRatingDraft((prev) => (prev === value ? null : value))}
                          style={({ pressed }) => pressedStyle(pressed)}
                        >
                          <Ionicons
                            name={filled ? 'star' : 'star-outline'}
                            size={24}
                            color={filled ? colors.star : colors.textSecondary}
                          />
                        </Pressable>
                      );
                    })}
                  </View>

                  <TextField
                    accessibilityLabel="Notes for this cook"
                    placeholder="Notes for this cook (optional)"
                    multiline
                    value={noteDraft}
                    onChangeText={setNoteDraft}
                    onFocus={() => {
                      scrollFocusedInputIntoView();
                    }}
                  />

                  <Button
                    label="Log this cook"
                    icon="add-circle-outline"
                    fullWidth
                    size="lg"
                    loading={isLoggingCook}
                    disabled={isLoggingCook}
                    accessibilityLabel={isLoggingCook ? 'Saving cook log' : 'Log this cook'}
                    onPress={logCook}
                  />
                </Card>

                {pendingAdjustments.length > 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Review ${pendingAdjustments.length} pending recipe updates`}
                    onPress={() => router.push(`/recipe/adjustments/${pendingAdjustments[0].id}`)}
                    android_ripple={ripple(colors.ripple)}
                    style={({ pressed }) => [
                      {
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: space.md,
                        borderWidth: 1,
                        borderColor: colors.primary,
                        borderRadius: radius.md,
                        backgroundColor: colors.primarySoft,
                        padding: space.lg,
                        overflow: 'hidden',
                      },
                      pressedStyle(pressed),
                    ]}
                  >
                    <Ionicons name="sparkles" size={18} color={colors.onPrimarySoft} />
                    <Text variant="bodyStrong" tone="onAccentSoft" style={{ flex: 1 }}>
                      Review pending updates ({pendingAdjustments.length})
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.onPrimarySoft} />
                  </Pressable>
                ) : null}
              </>
            ) : null}
          </View>
        </ScrollView>

        {aiEnabled ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cooking assistant"
              accessibilityHint="Opens a chat scoped to this recipe"
              onPress={async () => {
                const net = await NetInfo.fetch();
                if (!net.isConnected) {
                  setDialog({
                    title: 'Offline',
                    message: 'Connect to use the assistant.',
                    actions: [{ label: 'OK', variant: 'primary' }],
                  });
                  return;
                }
                const credentials = await getAiCredentials();
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
                  return;
                }
                sheetRef.current?.present(
                  recipe,
                  servings,
                  credentials.provider,
                  credentials.apiKey
                );
              }}
              android_ripple={ripple(colors.rippleOnFill, true)}
              style={({ pressed }) => [
                {
                  position: 'absolute',
                  right: space.xl,
                  // Clears the timer bar when one is running, so the two never
                  // stack on top of each other.
                  bottom: insets.bottom + space.xl + (activeTimer ? 76 : 0),
                  width: 56,
                  height: 56,
                  borderRadius: radius.pill,
                  backgroundColor: colors.primaryFill,
                  alignItems: 'center',
                  justifyContent: 'center',
                  ...elevation(3, resolved),
                },
                pressedStyle(pressed, 0.9),
              ]}
            >
              <Ionicons
                name="chatbubble-ellipses"
                size={24}
                color={colors.onPrimaryFill}
              />
            </Pressable>
            <RecipeChatSheet ref={sheetRef} />
          </>
        ) : null}

        {activeTimer ? (
          <View
            accessible
            accessibilityLabel={`Active timer: ${activeTimer.label}, ${formatTimerRemaining(
              activeTimer.remainingSeconds
            )} remaining`}
            style={{
              position: 'absolute',
              left: space.lg,
              right: space.lg,
              bottom: insets.bottom + space.md,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              paddingHorizontal: space.lg,
              paddingVertical: space.md,
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.md,
              ...elevation(3, resolved),
            }}
          >
            <Ionicons name="timer-outline" size={20} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text variant="overline" tone="secondary">
                Active timer
              </Text>
              <Text variant="bodyStrong" numberOfLines={1}>
                {activeTimer.label} · {formatTimerRemaining(activeTimer.remainingSeconds)}
              </Text>
            </View>
            <IconButton
              icon={activeTimer.isPaused ? 'play' : 'pause'}
              accessibilityLabel={activeTimer.isPaused ? 'Resume timer' : 'Pause timer'}
              variant="accent"
              size={36}
              onPress={() =>
                setActiveTimer((current) => {
                  if (!current) return current;
                  if (current.isPaused) {
                    return {
                      ...current,
                      isPaused: false,
                      endsAtMs: Date.now() + current.remainingSeconds * 1000,
                    };
                  }
                  const remainingSeconds = current.endsAtMs
                    ? Math.max(0, Math.ceil((current.endsAtMs - Date.now()) / 1000))
                    : current.remainingSeconds;
                  return {
                    ...current,
                    remainingSeconds,
                    isPaused: true,
                    endsAtMs: null,
                  };
                })
              }
            />
            <IconButton
              icon="stop"
              accessibilityLabel="Stop timer"
              variant="ghost"
              size={36}
              onPress={() => setActiveTimer(null)}
              style={{ backgroundColor: colors.destructiveSoft }}
            />
          </View>
        ) : null}

        <ConfirmDialog
          visible={showArchiveRecipeConfirm}
          title={recipe.isArchived ? 'Unarchive recipe?' : 'Archive recipe?'}
          message={
            recipe.isArchived
              ? 'This recipe will return to your active library.'
              : 'Archived recipes are hidden from your active library.'
          }
          confirmLabel={recipe.isArchived ? 'Unarchive' : 'Archive'}
          destructive={!recipe.isArchived}
          onCancel={() => setShowArchiveRecipeConfirm(false)}
          onConfirm={async () => {
            setShowArchiveRecipeConfirm(false);
            const previousArchived = recipe.isArchived;
            const nextArchived = !previousArchived;
            await setRecipeArchived(recipe.id, nextArchived);
            setRecipe({ ...recipe, isArchived: nextArchived });
            setDialog({
              title: nextArchived ? 'Recipe archived' : 'Recipe unarchived',
              message: nextArchived
                ? 'This recipe is hidden from your active library.'
                : 'This recipe is back in your active library.',
              actions: [
                {
                  label: 'Undo',
                  onPress: async () => {
                    await setRecipeArchived(recipe.id, previousArchived);
                    setRecipe((current) =>
                      current ? { ...current, isArchived: previousArchived } : current
                    );
                  },
                },
                { label: 'OK', variant: 'primary' },
              ],
            });
          }}
        />
        <AppDialog
          visible={dialog !== null}
          title={dialog?.title ?? ''}
          message={dialog?.message ?? ''}
          actions={dialog?.actions ?? []}
          onClose={() => setDialog(null)}
        />
        <FullscreenImageViewer
          imageUri={fullscreenImageUri}
          onClose={() => setFullscreenImageUri(null)}
        />

        {isLoggingCook ? (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
              backgroundColor: colors.scrim,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <View
              style={{
                backgroundColor: colors.surface,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: colors.border,
                paddingHorizontal: space.lg,
                paddingVertical: space.md,
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.md,
                ...elevation(3, resolved),
              }}
            >
              <ActivityIndicator color={colors.primary} />
              <Text variant="body">Logging cook…</Text>
            </View>
          </View>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

/** Collapsible group heading shared by the ingredients, method and journal blocks. */
function SectionToggle({
  label,
  open,
  onToggle,
  accessibilityLabel,
  colors,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  accessibilityLabel: string;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ expanded: open }}
      onPress={onToggle}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.sm,
          minHeight: 44,
          marginTop: space.sm,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          paddingBottom: space.sm,
        },
        pressedStyle(pressed),
      ]}
    >
      <Text variant="heading" style={{ flex: 1 }}>
        {label}
      </Text>
      <Ionicons
        name={open ? 'chevron-up' : 'chevron-down'}
        size={18}
        color={colors.textSecondary}
      />
    </Pressable>
  );
}
