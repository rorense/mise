import { AppDialog, type AppDialogAction } from '@/components/AppDialog';
import { BackButton } from '@/components/BackButton';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { FullscreenImageViewer } from '@/components/FullscreenImageViewer';
import { RecipeChatSheet, type RecipeChatSheetRef } from '@/components/RecipeChatSheet';
import {
  addCookLog,
  cleanupUnusedMediaFiles,
  createRecipeAdjustment,
  enqueueCookLogAdjustmentTask,
  getRecipeById,
  ignoreRecipeAdjustment,
  listPendingRecipeAdjustments,
  getRecipeServingsOverride,
  setRecipeArchived,
  setRecipeFlags,
  setRecipeMainImageFromCookLog,
  setRecipeMainImage,
  setRecipeTags,
  setRecipeServingsOverride,
} from '@/data/recipes';
import type { Recipe, RecipeAdjustment } from '@/types/recipe';
import {
  formatIngredientAmount,
  renderStepInstruction,
  splitIngredientSections,
} from '@/domain/scaling';
import { resolveRecipeHeroImage } from '@/domain/recipeImages';
import {
  normalizeServings,
  shouldCommitSliderTick,
} from '@/domain/slider';
import {
  getAiProvider,
  getRecipeSavedServings,
  setRecipeSavedServings,
} from '@/lib/secrets';
import {
  compressAndSaveCookPhoto,
  compressAndSaveMainRecipePhoto,
} from '@/lib/media';
import { getBundledAiKey } from '@/lib/aiConfig';
import { suggestRecipeAdjustmentsFromCookNote } from '@/lib/ai/cookLogAdjustments';
import { newId } from '@/lib/id';
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
import { Ionicons } from '@expo/vector-icons';
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
  Text,
  TextInput,
  View,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import NetInfo from '@react-native-community/netinfo';

export default function RecipeDetailScreen() {
  const { id, fromImport } = useLocalSearchParams<{ id: string; fromImport?: string }>();
  const { colors } = useTheme();
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
  const AI_ENABLED = false;
  const shouldBackToHome = fromImport === '1' || fromImport === 'true';

  const reload = useCallback(async () => {
    setIsLoading(true);
    setIsMissing(false);
    const seq = ++loadSeqRef.current;
    const r = await getRecipeById(String(id));
    if (seq !== loadSeqRef.current) return;
    if (r) {
      const maxServings = Math.max(12, Math.round(r.baseServings));
      const [savedSecure, savedDb, pending] = await Promise.all([
        getRecipeSavedServings(r.id),
        getRecipeServingsOverride(r.id),
        listPendingRecipeAdjustments(r.id),
      ]);
      if (seq !== loadSeqRef.current) return;
      const nextServings =
        typeof savedSecure === 'number'
          ? normalizeServings(savedSecure, maxServings)
          : typeof savedDb === 'number'
            ? normalizeServings(savedDb, maxServings)
          : normalizeServings(r.baseServings, maxServings);
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

  useEffect(() => {
    if (!activeTimer || activeTimer.isPaused || !activeTimer.endsAtMs) return;
    const handle = setInterval(() => {
      setActiveTimer((current) => {
        if (!current || current.isPaused || !current.endsAtMs) return current;
        const remainingSeconds = Math.max(
          0,
          Math.ceil((current.endsAtMs - Date.now()) / 1000)
        );
        if (remainingSeconds <= 0) {
          void presentTimerDoneNotification(current.label);
          setDialog({
            title: 'Timer done',
            message: `${current.label} finished.`,
            actions: [{ label: 'OK', variant: 'primary' }],
          });
          return null;
        }
        if (remainingSeconds === current.remainingSeconds) return current;
        return {
          ...current,
          remainingSeconds,
        };
      });
    }, 250);
    return () => clearInterval(handle);
  }, [activeTimer, setDialog]);

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
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <Text style={{ color: colors.textSecondary }}>Loading…</Text>
      </View>
    );
  }

  if (isMissing || !recipe || servings === null) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, paddingHorizontal: 24 }}>
        <Text style={{ color: colors.textPrimary, fontFamily: 'Lora_700Bold', fontSize: 20, marginBottom: 8 }}>
          Recipe not found
        </Text>
        <Text style={{ color: colors.textSecondary, textAlign: 'center', marginBottom: 14 }}>
          This recipe may have been removed.
        </Text>
        <Pressable
          onPress={() => router.replace('/')}
          style={{
            backgroundColor: colors.primary,
            borderRadius: 12,
            paddingHorizontal: 16,
            paddingVertical: 10,
          }}
        >
          <Text style={{ color: '#fff', fontFamily: 'DMSans_700Bold' }}>Back to library</Text>
        </Pressable>
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
      ...recipe.steps
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
      if (noteText) {
        const net = await NetInfo.fetch();
        if (net.isConnected) {
          const provider = await getAiProvider();
          const key = getBundledAiKey(provider);
          if (key) {
            try {
              const suggestions = await suggestRecipeAdjustmentsFromCookNote({
                recipe,
                note: noteText,
                provider,
                apiKey: key,
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
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
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
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
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
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
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
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
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
      setRecipe({ ...recipe, isFavorite: !nextValue });
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
      setRecipe({ ...recipe, wantToCook: !nextValue });
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
      <BackButton onPress={shouldBackToHome ? () => router.replace('/') : undefined} />
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        <View style={{ height: 260, backgroundColor: colors.border }}>
          {hero ? (
            <Pressable onPress={() => setFullscreenImageUri(hero)} style={{ width: '100%', height: '100%' }}>
              <Image source={{ uri: hero }} style={{ width: '100%', height: '100%' }} />
            </Pressable>
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="image-outline" size={48} color={colors.textSecondary} />
            </View>
          )}
          <Pressable
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
            style={{
              position: 'absolute',
              right: 10,
              bottom: 10,
              width: 34,
              height: 34,
              borderRadius: 17,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#0000007a',
              borderWidth: 1,
              borderColor: '#ffffff80',
            }}
          >
            <Ionicons name="camera-outline" size={17} color="#fff" />
          </Pressable>
        </View>
        <View style={{ padding: 20, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text
              style={{ flex: 1, fontFamily: 'Lora_700Bold', fontSize: 26, color: colors.textPrimary }}
            >
              {recipe.title}
            </Text>
            <Pressable
              onPress={() => setReadMode((v) => !v)}
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: readMode ? colors.primary : colors.border,
                backgroundColor: readMode ? colors.primary + '22' : colors.surface,
              }}
            >
              <Ionicons
                name={readMode ? 'book' : 'book-outline'}
                size={18}
                color={readMode ? colors.primary : colors.textPrimary}
              />
            </Pressable>
            <Pressable
              onPress={openQuickActions}
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surface,
              }}
            >
              <Ionicons name="ellipsis-horizontal" size={18} color={colors.textPrimary} />
            </Pressable>
          </View>
          {!readMode && recipe.sourceUrl ? (
            <Text
              onPress={() => Linking.openURL(recipe.sourceUrl)}
              style={{ color: colors.primary, fontFamily: 'DMSans_500Medium' }}
            >
              Open source
            </Text>
          ) : null}
          {!readMode ? (
            <Text style={{ fontFamily: 'DMSans_400Regular', color: colors.textSecondary }}>
            {recipe.cuisine ? `${recipe.cuisine} · ` : ''}
            {recipe.tags.length > 0 ? recipe.tags.join(' · ') : 'No tags yet'}
          </Text>
          ) : null}
          {!readMode ? (
            <>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {recipe.tags.map((tag) => (
                  <Pressable
                    key={tag}
                    disabled={isUpdatingTags}
                    onPress={() => removeTag(tag)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.surface,
                      opacity: isUpdatingTags ? 0.7 : 1,
                    }}
                  >
                    <Text style={{ fontFamily: 'DMSans_500Medium', color: colors.textPrimary }}>
                      {tag}
                    </Text>
                    <Ionicons name="close" size={14} color={colors.textSecondary} />
                  </Pressable>
                ))}
              </View>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <TextInput
                  value={tagDraft}
                  onChangeText={setTagDraft}
                  onSubmitEditing={() => {
                    void addTagsFromDraft();
                  }}
                  editable={!isUpdatingTags}
                  placeholder="Add tags (comma separated)"
                  placeholderTextColor={colors.textSecondary}
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 10,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    color: colors.textPrimary,
                    backgroundColor: colors.surface,
                    opacity: isUpdatingTags ? 0.7 : 1,
                  }}
                />
                <Pressable
                  onPress={() => {
                    void addTagsFromDraft();
                  }}
                  disabled={isUpdatingTags}
                  style={{
                    borderWidth: 1,
                    borderColor: colors.primary,
                    backgroundColor: colors.primary + '1A',
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 9,
                    opacity: isUpdatingTags ? 0.7 : 1,
                  }}
                >
                  <Text style={{ fontFamily: 'DMSans_700Bold', color: colors.primary }}>Add</Text>
                </Pressable>
              </View>
            </>
          ) : null}
          {!readMode ? (
            <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable
              onPress={toggleFavorite}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: recipe.isFavorite ? colors.primary + '22' : colors.surface,
                borderWidth: 1,
                borderColor: recipe.isFavorite ? colors.primary : colors.border,
              }}
            >
              <Ionicons
                name={recipe.isFavorite ? 'star' : 'star-outline'}
                size={14}
                color={recipe.isFavorite ? colors.primary : colors.textPrimary}
              />
              <Text
                style={{
                  fontFamily: 'DMSans_500Medium',
                  color: recipe.isFavorite ? colors.primary : colors.textPrimary,
                }}
              >
                Favorite
              </Text>
            </Pressable>
            <Pressable
              onPress={toggleWantToCook}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: recipe.wantToCook ? colors.primary + '22' : colors.surface,
                borderWidth: 1,
                borderColor: recipe.wantToCook ? colors.primary : colors.border,
              }}
            >
              <Ionicons
                name={recipe.wantToCook ? 'flame' : 'flame-outline'}
                size={14}
                color={recipe.wantToCook ? colors.primary : colors.textPrimary}
              />
              <Text
                style={{
                  fontFamily: 'DMSans_500Medium',
                  color: recipe.wantToCook ? colors.primary : colors.textPrimary,
                }}
              >
                Want to cook
              </Text>
            </Pressable>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Pressable
              onPress={() => setChecklistMode((v) => !v)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: checklistMode ? colors.primary + '22' : colors.surface,
                borderWidth: 1,
                borderColor: checklistMode ? colors.primary : colors.border,
              }}
            >
              <Ionicons
                name={checklistMode ? 'checkbox' : 'checkbox-outline'}
                size={14}
                color={checklistMode ? colors.primary : colors.textPrimary}
              />
              <Text
                style={{
                  fontFamily: 'DMSans_500Medium',
                  color: checklistMode ? colors.primary : colors.textPrimary,
                }}
              >
                Checklist
              </Text>
            </Pressable>
            {checklistMode ? (
              <Pressable
                onPress={() => setCheckedIngredientIds([])}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 999,
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Text style={{ fontFamily: 'DMSans_500Medium', color: colors.textPrimary }}>
                  Reset checks
                </Text>
              </Pressable>
            ) : null}
          </View>
          <View
            style={{
              backgroundColor: colors.surface,
              padding: 16,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontFamily: 'DMSans_700Bold', color: colors.textPrimary }}>Serves</Text>
              <Text style={{ fontFamily: 'Lora_700Bold', fontSize: 20, color: colors.primary }}>
                {Math.round(servings)}
              </Text>
            </View>
            <Slider
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
                setRecipeSavedServings(recipe.id, nextServings);
                void setRecipeServingsOverride(recipe.id, nextServings);
              }}
              minimumTrackTintColor={colors.primary}
              maximumTrackTintColor={colors.border}
              thumbTintColor={colors.primary}
            />
          </View>
          <Pressable
            onPress={() => setShowIngredients((v) => !v)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}
          >
            <Ionicons
              name={showIngredients ? 'chevron-down' : 'chevron-forward'}
              size={16}
              color={colors.textPrimary}
            />
            <Text style={{ fontFamily: 'DMSans_700Bold', color: colors.textPrimary }}>
              Ingredients
            </Text>
          </Pressable>
          {(readMode || showIngredients)
            ? ingredientSections.map((section, sectionIdx) => (
                <View
                  key={`section-${section.title ?? 'default'}-${sectionIdx}`}
                  style={{ marginTop: sectionIdx === 0 ? 0 : 6 }}
                >
                  {section.title ? (
                    <Text
                      style={{
                        color: colors.textPrimary,
                        fontFamily: 'DMSans_700Bold',
                        marginTop: sectionIdx === 0 ? 0 : 4,
                        marginBottom: 4,
                      }}
                    >
                      {section.title}
                    </Text>
                  ) : null}
                  {section.ingredients.map((ing) => {
                    const amount = formatIngredientAmount(ing, recipe.baseServings, servings);
                    const checked = checkedIngredientIds.includes(ing.id);
                    return (
                      <Pressable
                        key={ing.id}
                        onPress={() => {
                          if (checklistMode) {
                            toggleIngredientChecked(ing.id);
                          }
                        }}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 }}
                      >
                        {checklistMode ? (
                          <Ionicons
                            name={checked ? 'checkbox' : 'square-outline'}
                            size={18}
                            color={checked ? colors.primary : colors.textSecondary}
                          />
                        ) : null}
                        <Text
                          style={{
                            fontFamily: readMode ? 'DMSans_500Medium' : 'DMSans_400Regular',
                            color: checked ? colors.textSecondary : colors.textPrimary,
                            textDecorationLine: checked ? 'line-through' : 'none',
                            fontSize: readMode ? 17 : 15,
                            lineHeight: readMode ? 26 : 21,
                          }}
                        >
                          {!checklistMode ? '· ' : ''}
                          {amount} {ing.name}
                          {!ing.scalable && ing.amountMode !== 'to_taste' ? '  ⚠ adjust to taste' : ''}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ))
            : null}
          <Pressable
            onPress={() => setShowMethod((v) => !v)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}
          >
            <Ionicons
              name={showMethod ? 'chevron-down' : 'chevron-forward'}
              size={16}
              color={colors.textPrimary}
            />
            <Text style={{ fontFamily: 'DMSans_700Bold', color: colors.textPrimary }}>
              Method
            </Text>
          </Pressable>
          {(readMode || showMethod)
            ? recipe.steps
            .sort((a, b) => a.order - b.order)
            .map((s, idx) => (
              <View key={s.id} style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View
                    style={{
                      minWidth: 28,
                      height: 28,
                      borderRadius: 14,
                      backgroundColor: colors.primary,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: '#fff', fontFamily: 'DMSans_700Bold' }}>{idx + 1}</Text>
                  </View>
                  <Text
                    style={{
                      flex: 1,
                      fontFamily: readMode ? 'DMSans_500Medium' : 'DMSans_400Regular',
                      color: colors.textPrimary,
                      fontSize: readMode ? 17 : 15,
                      lineHeight: readMode ? 28 : 22,
                    }}
                  >
                    {renderStepInstruction(s, recipe.baseServings, servings)}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 6, marginLeft: 38 }}>
                  {extractStepTimerPresets(s.instruction).map((preset) => (
                    <Pressable
                      key={preset.key}
                      onPress={() => void startStepTimer(s.id, `Step ${idx + 1} · ${preset.label}`, preset.seconds)}
                      style={{
                        borderWidth: 1,
                        borderColor: colors.border,
                        backgroundColor: colors.surface,
                        borderRadius: 999,
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                      }}
                    >
                      <Text style={{ color: colors.textPrimary, fontFamily: 'DMSans_500Medium', fontSize: 12 }}>
                        Start {preset.label} timer
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ))
            : null}
          {!readMode ? (
            <>
              <Pressable
                onPress={() => setShowCookJournal((v) => !v)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}
              >
                <Ionicons
                  name={showCookJournal ? 'chevron-down' : 'chevron-forward'}
                  size={16}
                  color={colors.textPrimary}
                />
                <Text style={{ fontFamily: 'DMSans_700Bold', color: colors.textPrimary }}>
                  Cook journal
                </Text>
              </Pressable>
              {showCookJournal ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
                  {recipe.cookLogs.map((log) => (
                    <View key={log.id} style={{ width: 120 }}>
                      <Pressable onPress={() => (log.photoUri ? setFullscreenImageUri(log.photoUri) : router.push(`/cook-log/${log.id}`))}>
                        {log.photoUri ? (
                          <Image source={{ uri: log.photoUri }} style={{ width: 120, height: 120, borderRadius: 14 }} />
                        ) : (
                          <View
                            style={{
                              width: 120,
                              height: 120,
                              borderRadius: 14,
                              backgroundColor: colors.border,
                            }}
                          />
                        )}
                      </Pressable>
                      <Pressable onPress={() => router.push(`/cook-log/${log.id}`)}>
                        <Text style={{ marginTop: 6, color: colors.textSecondary, fontFamily: 'DMSans_400Regular' }} numberOfLines={1}>
                          {new Date(log.cookedAt).toLocaleDateString()}
                          {typeof log.rating === 'number' ? ` · ${log.rating}/5` : ''}
                        </Text>
                        {log.notes ? (
                          <Text
                            style={{
                              marginTop: 4,
                              color: colors.textPrimary,
                              fontFamily: 'DMSans_400Regular',
                              fontSize: 12,
                              lineHeight: 16,
                            }}
                            numberOfLines={3}
                          >
                            {log.notes}
                          </Text>
                        ) : null}
                      </Pressable>
                      {log.photoUri ? (
                        <Pressable
                          onPress={async () => {
                            await setRecipeMainImageFromCookLog(recipe.id, log.id);
                            await reload();
                          }}
                        >
                          <Text
                            style={{
                              marginTop: 4,
                              color: colors.primary,
                              fontFamily: 'DMSans_500Medium',
                              fontSize: 12,
                            }}
                          >
                            Set as hero
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ))}
                </ScrollView>
              ) : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ color: colors.textSecondary, fontFamily: 'DMSans_500Medium' }}>Cook rating</Text>
                {[1, 2, 3, 4, 5].map((value) => (
                  <Pressable
                    key={value}
                    onPress={() => setRatingDraft((prev) => (prev === value ? null : value))}
                  >
                    <Ionicons
                      name={ratingDraft !== null && value <= ratingDraft ? 'star' : 'star-outline'}
                      size={18}
                      color={ratingDraft !== null && value <= ratingDraft ? '#FFD166' : colors.textSecondary}
                    />
                  </Pressable>
                ))}
              </View>
              {pendingAdjustments.length > 0 ? (
                <Pressable
                  onPress={() =>
                    router.push(`/recipe/adjustments/${pendingAdjustments[0].id}`)
                  }
                  style={{
                    borderWidth: 1,
                    borderColor: colors.primary,
                    borderRadius: 12,
                    backgroundColor: colors.primary + '1A',
                    padding: 10,
                  }}
                >
                  <Text style={{ color: colors.primary, fontFamily: 'DMSans_700Bold' }}>
                    Review pending updates ({pendingAdjustments.length})
                  </Text>
                </Pressable>
              ) : null}
              <TextInput
                placeholder="Notes for this cook (optional)"
                placeholderTextColor={colors.textSecondary}
                value={noteDraft}
                onChangeText={setNoteDraft}
                onFocus={() => {
                  scrollFocusedInputIntoView();
                }}
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
                disabled={isLoggingCook}
                onPress={logCook}
                style={{
                  backgroundColor: colors.primary,
                  padding: 14,
                  borderRadius: 14,
                  alignItems: 'center',
                  opacity: isLoggingCook ? 0.7 : 1,
                }}
              >
                {isLoggingCook ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ color: '#fff', fontFamily: 'DMSans_700Bold' }}>Log this cook</Text>
                )}
              </Pressable>
            </>
          ) : null}
        </View>
      </ScrollView>
      {AI_ENABLED ? (
        <>
          <Pressable
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
              const provider = await getAiProvider();
              const key = getBundledAiKey(provider);
              if (!key) {
                setDialog({
                  title: 'API key',
                  message: 'Missing API key in local env.',
                  actions: [{ label: 'OK', variant: 'primary' }],
                });
                return;
              }
              sheetRef.current?.present(recipe, servings, provider, key);
            }}
            style={{
              position: 'absolute',
              right: 20,
              bottom: 20 + insets.bottom,
              width: 52,
              height: 52,
              borderRadius: 26,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={22} color={colors.textPrimary} />
          </Pressable>
          <RecipeChatSheet ref={sheetRef} />
        </>
      ) : null}
      {activeTimer ? (
        <View
          style={{
            position: 'absolute',
            left: 16,
            right: 16,
            bottom: insets.bottom + 14,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            paddingHorizontal: 12,
            paddingVertical: 10,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textSecondary, fontFamily: 'DMSans_400Regular', fontSize: 12 }}>
              Active timer
            </Text>
            <Text style={{ color: colors.textPrimary, fontFamily: 'DMSans_700Bold' }}>
              {activeTimer.label} · {formatTimerRemaining(activeTimer.remainingSeconds)}
            </Text>
          </View>
          <Pressable
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
          >
            <Text style={{ color: colors.primary, fontFamily: 'DMSans_700Bold' }}>
              {activeTimer.isPaused ? 'Resume' : 'Pause'}
            </Text>
          </Pressable>
          <Pressable onPress={() => setActiveTimer(null)}>
            <Text style={{ color: colors.destructive, fontFamily: 'DMSans_700Bold' }}>Stop</Text>
          </Pressable>
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
            backgroundColor: '#0000001A',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              paddingHorizontal: 16,
              paddingVertical: 12,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <ActivityIndicator color={colors.primary} />
            <Text style={{ color: colors.textPrimary, fontFamily: 'DMSans_500Medium' }}>
              Logging cook...
            </Text>
          </View>
        </View>
      ) : null}
    </View>
    </KeyboardAvoidingView>
  );
}
