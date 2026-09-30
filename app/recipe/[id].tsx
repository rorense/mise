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
  ScreenLoading,
  SegmentedControl,
  Text,
  TextField,
  type SegmentedOption,
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
import { normalizeServings } from '@/domain/slider';
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
  useKeyboardSafeScroll,
} from '@/lib/ui/keyboardSafe';
import { useStepTimer } from '@/lib/ui/stepTimer';
import { useTheme } from '@/theme/ThemeContext';
import { control, elevation, radius, space } from '@/theme/tokens';
import type { Recipe, RecipeAdjustment } from '@/types/recipe';
import { Ionicons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
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

const HERO_HEIGHT = 300;
/** The docked "Start cooking" bar, excluding the bottom inset. */
const DOCK_HEIGHT = control.lg + space.md * 2;
/** Wide enough for "1 ½ tbsp" without wrapping at default font scale. */
const QUANTITY_WIDTH = 84;
const STEP_BADGE = control.sm - space.sm;
/** Height of the floating active-timer bar plus its gap. */
const TIMER_BAR_CLEARANCE = 76;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type RecipeSection = 'ingredients' | 'method' | 'journal';
const SECTION_OPTIONS: SegmentedOption<RecipeSection>[] = [
  { value: 'ingredients', label: 'Ingredients' },
  { value: 'method', label: 'Method' },
  { value: 'journal', label: 'Journal' },
];

/** "21 Sep": fixed English month names, so it reads the same on every device locale. */
function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
/** Reading mode bumps body copy for arm's-length legibility at the stove. */
const READ_MODE_BODY = { fontSize: 17, lineHeight: 27 } as const;

export default function RecipeDetailScreen() {
  const { id, fromImport } = useLocalSearchParams<{ id: string; fromImport?: string }>();
  const { colors, resolved } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<RecipeChatSheetRef>(null);
  const { scrollRef, scrollFocusedInputIntoView } = useKeyboardSafeScroll<ScrollView>();
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
  const [section, setSection] = useState<RecipeSection>('ingredients');
  const [tagEditorOpen, setTagEditorOpen] = useState(false);
  const [fullscreenImageUri, setFullscreenImageUri] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{
    title: string;
    message: string;
    actions: AppDialogAction[];
  } | null>(null);
  const [pendingAdjustments, setPendingAdjustments] = useState<RecipeAdjustment[]>([]);
  const [isLoggingCook, setIsLoggingCook] = useState(false);
  const [isUpdatingTags, setIsUpdatingTags] = useState(false);
  const {
    timer: activeTimer,
    start: startStepTimer,
    togglePause: toggleTimerPause,
    stop: stopTimer,
  } = useStepTimer();
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

  if (isLoading) {
    return (
      <ScreenLoading />
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

  const sortedSteps = [...recipe.steps].sort((a, b) => a.order - b.order);
  const lastCooked = recipe.cookLogs[0];
  const pending = pendingAdjustments[0];
  const pendingFrom = pending
    ? recipe.cookLogs.find((log) => log.id === pending.cookLogId)
    : undefined;
  // Review and Ignore act on one adjustment at a time, so count only its changes.
  const pendingChangeCount = pending?.suggestions.length ?? 0;
  // Reading mode is for the bench, where the journal is noise.
  const visibleSection: RecipeSection =
    readMode && section === 'journal' ? 'ingredients' : section;
  // The journal is for after the cook, and the dock would crowd its note field.
  const canCook = sortedSteps.length > 0 && visibleSection !== 'journal';
  const dockHeight = canCook ? DOCK_HEIGHT : 0;

  const changeServings = (delta: number) => {
    const next = normalizeServings(servings + delta, sliderMax);
    if (next === servings) return;
    setServings(next);
    void setRecipeServingsOverride(recipe.id, next);
  };

  const openMainImageDialog = () =>
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
    });

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior="padding"
    >
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <BackButton
          overImage={Boolean(hero)}
          onPress={shouldBackToHome ? () => router.replace('/') : undefined}
        />
        <ScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingBottom:
              insets.bottom +
              dockHeight +
              space.xxxl +
              (aiEnabled ? control.lg : 0) +
              (activeTimer ? TIMER_BAR_CLEARANCE : 0),
          }}
        >
          {/* The photo runs under the rounded top of the body sheet. */}
          <View style={{ height: HERO_HEIGHT + radius.xl, backgroundColor: colors.surfaceMuted }}>
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
            {/* Darkens the top of the photo so the floating buttons stay
                visible over a pale image. */}
            {hero ? <ImageScrim from="top" height={112} /> : null}
            {/* Inside the hero so they scroll away with the photo instead of
                floating over the title row and its buttons. */}
            <View
              style={{
                position: 'absolute',
                right: space.lg,
                top: insets.top + space.md,
                flexDirection: 'row',
                gap: space.sm,
              }}
            >
              <IconButton
                icon={recipe.wantToCook ? 'flame' : 'flame-outline'}
                accessibilityLabel="Want to cook"
                accessibilityHint={
                  recipe.wantToCook ? 'Removes the want-to-cook mark' : 'Marks as want to cook'
                }
                accessibilityState={{ selected: recipe.wantToCook }}
                variant={hero ? 'onImage' : 'surface'}
                onPress={toggleWantToCook}
              />
              <IconButton
                icon={recipe.isFavorite ? 'star' : 'star-outline'}
                accessibilityLabel="Favourite"
                accessibilityHint={
                  recipe.isFavorite ? 'Removes the favourite mark' : 'Marks as favourite'
                }
                accessibilityState={{ selected: recipe.isFavorite }}
                variant={hero ? 'onImage' : 'surface'}
                onPress={toggleFavorite}
              />
              <IconButton
                icon="camera-outline"
                accessibilityLabel="Change main photo"
                accessibilityHint="Set, replace, or clear the recipe photo"
                variant={hero ? 'onImage' : 'surface'}
                onPress={openMainImageDialog}
              />
            </View>
          </View>

          <View
            style={{
              marginTop: -radius.xl,
              borderTopLeftRadius: radius.xl,
              borderTopRightRadius: radius.xl,
              backgroundColor: colors.background,
              paddingHorizontal: space.lg,
              paddingTop: space.xxl,
              gap: space.lg,
            }}
          >
            <View style={{ gap: space.md }}>
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

              {!readMode ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
                  {recipe.cuisine ? <MetaPill label={recipe.cuisine} /> : null}
                  <MetaPill
                    label={
                      recipe.cookLogs.length === 0
                        ? 'Never cooked'
                        : `Cooked ${recipe.cookLogs.length}×`
                    }
                  />
                  {lastCooked ? (
                    <MetaPill label={`Last ${formatShortDate(lastCooked.cookedAt)}`} />
                  ) : null}
                  {recipe.sourceUrl ? (
                    <Chip
                      label="Source"
                      icon="open-outline"
                      accessibilityLabel="Open original recipe source in browser"
                      accessibilityHint="Opens in your browser"
                      onPress={() => Linking.openURL(recipe.sourceUrl)}
                    />
                  ) : null}
                </View>
              ) : null}
            </View>

            {!readMode ? (
              <View style={{ gap: space.sm }}>
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
                  <Chip
                    label={tagEditorOpen ? 'Done' : 'Tag'}
                    icon={tagEditorOpen ? 'checkmark' : 'add'}
                    active={tagEditorOpen}
                    accessibilityLabel={tagEditorOpen ? 'Close tag editor' : 'Edit tags'}
                    accessibilityHint={tagEditorOpen ? undefined : 'Shows a field for new tags'}
                    onPress={() => setTagEditorOpen((v) => !v)}
                  />
                </View>
                {tagEditorOpen ? (
                  <TextField
                    accessibilityLabel="Add tags, comma separated"
                    value={tagDraft}
                    onChangeText={setTagDraft}
                    onSubmitEditing={() => {
                      void addTagsFromDraft();
                    }}
                    editable={!isUpdatingTags}
                    autoFocus
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
                ) : null}
              </View>
            ) : null}

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.sm,
                paddingLeft: space.xl,
                paddingRight: space.sm,
                paddingVertical: space.sm,
                borderRadius: radius.pill,
                backgroundColor: colors.surface,
                borderWidth: resolved === 'dark' ? 1 : 0,
                borderColor: colors.border,
                ...elevation(1, resolved),
              }}
            >
              <Text variant="body" tone="secondary" style={{ flex: 1 }}>
                Serves
              </Text>
              <IconButton
                icon="remove"
                accessibilityLabel="Fewer servings"
                size={control.md}
                disabled={servings <= 1}
                onPress={() => changeServings(-1)}
              />
              <Text
                variant="numeral"
                accessibilityLabel={`Servings ${servings}`}
                accessibilityLiveRegion="polite"
                style={{ minWidth: control.lg, textAlign: 'center' }}
              >
                {servings}
              </Text>
              <IconButton
                icon="add"
                accessibilityLabel="More servings"
                size={control.md}
                disabled={servings >= sliderMax}
                onPress={() => changeServings(1)}
              />
            </View>

            {!readMode && pending ? (
              <View
                style={{
                  backgroundColor: colors.primarySoft,
                  borderRadius: radius.lg,
                  padding: space.lg,
                  gap: space.sm,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
                  <Ionicons name="sparkles" size={16} color={colors.onPrimarySoft} />
                  <Text variant="captionStrong" tone="onAccentSoft">
                    {pendingFrom
                      ? `From your cook on ${formatShortDate(pendingFrom.cookedAt)}`
                      : 'From a recent cook'}
                  </Text>
                </View>
                {pendingFrom?.notes ? (
                  <Text variant="body" numberOfLines={3}>
                    “{pendingFrom.notes}”
                  </Text>
                ) : null}
                <Text variant="bodyStrong">
                  {pendingChangeCount === 1
                    ? '1 suggested change to this recipe'
                    : `${pendingChangeCount} suggested changes to this recipe`}
                </Text>
                <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.xs }}>
                  <Button
                    label="Review"
                    icon="checkmark"
                    accessibilityLabel={`Review ${pendingChangeCount} suggested changes`}
                    onPress={() => router.push(`/recipe/adjustments/${pending.id}`)}
                  />
                  <Button
                    label="Ignore"
                    variant="secondary"
                    accessibilityHint="Dismisses these suggestions"
                    onPress={async () => {
                      await ignoreRecipeAdjustment(pending.id);
                      await reload();
                    }}
                    style={{ backgroundColor: colors.surface }}
                  />
                </View>
              </View>
            ) : null}

            <SegmentedControl
              accessibilityLabel="Recipe sections"
              value={visibleSection}
              onChange={setSection}
              options={
                readMode
                  ? SECTION_OPTIONS.filter((option) => option.value !== 'journal')
                  : SECTION_OPTIONS
              }
            />

            {visibleSection === 'ingredients' ? (
              <View style={{ gap: space.sm }}>
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
                {ingredientSections.map((group, groupIdx) => (
                  <View key={`section-${group.title ?? 'default'}-${groupIdx}`}>
                    {group.title ? (
                      <Text
                        variant="overline"
                        tone="secondary"
                        style={{ marginTop: space.md, marginBottom: space.xs }}
                      >
                        {group.title}
                      </Text>
                    ) : null}
                    {group.ingredients.map((ing, ingIdx) => {
                      const amount = formatIngredientAmount(ing, recipe.baseServings, servings);
                      const checked = checkedIngredientIds.includes(ing.id);
                      const needsTasteHint = ingredientShowsAdjustToTasteHint(ing);
                      const strike = checked ? ({ textDecorationLine: 'line-through' } as const) : null;
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
                              gap: space.md,
                              // Checklist rows are tap targets, so they get real
                              // height; the read-only list stays compact.
                              minHeight: checklistMode ? control.md : undefined,
                              paddingVertical: space.md,
                              borderTopWidth: ingIdx === 0 ? 0 : 1,
                              borderTopColor: colors.border,
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
                          ) : null}
                          {/* A fixed quantity column: the eye learns where
                              amounts live and never has to hunt for them. */}
                          <Text
                            variant="bodyStrong"
                            tone={checked ? 'secondary' : 'primary'}
                            style={[
                              readMode ? READ_MODE_BODY : null,
                              { width: QUANTITY_WIDTH, textAlign: 'right' },
                              strike,
                            ]}
                          >
                            {amount}
                          </Text>
                          <Text
                            variant="body"
                            tone={checked ? 'secondary' : 'primary'}
                            style={[readMode ? READ_MODE_BODY : null, { flex: 1 }, strike]}
                          >
                            {ing.name}
                          </Text>
                          {needsTasteHint ? (
                            <Text
                              variant="caption"
                              tone="secondary"
                              accessibilityLabel="Adjust to taste"
                            >
                              to taste
                            </Text>
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              </View>
            ) : null}

            {visibleSection === 'method' ? (
              <View style={{ gap: space.xl }}>
                {sortedSteps.map((s, idx) => {
                  const presets = extractStepTimerPresets(s.instruction);
                  return (
                    <View key={s.id} style={{ gap: space.sm }}>
                      <View style={{ flexDirection: 'row', gap: space.md }}>
                        <View
                          style={{
                            width: STEP_BADGE,
                            height: STEP_BADGE,
                            borderRadius: radius.pill,
                            backgroundColor: colors.primarySoft,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Text variant="captionStrong" tone="onAccentSoft">
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
                            marginLeft: STEP_BADGE + space.md,
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
                                startStepTimer(
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
                })}
              </View>
            ) : null}

            {visibleSection === 'journal' ? (
              <View style={{ gap: space.md }}>
                <Card level={1} style={{ gap: space.md }}>
                  <Text variant="subheading">Log a cook</Text>

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
                    icon="add"
                    fullWidth
                    size="lg"
                    loading={isLoggingCook}
                    disabled={isLoggingCook}
                    accessibilityLabel={isLoggingCook ? 'Saving cook log' : 'Log this cook'}
                    onPress={logCook}
                  />
                </Card>

                {recipe.cookLogs.length === 0 ? (
                  <Text
                    variant="body"
                    tone="secondary"
                    style={{ textAlign: 'center', paddingVertical: space.xl }}
                  >
                    No cooks logged yet. Each one you log shows up here, with its notes and photo.
                  </Text>
                ) : null}

                {recipe.cookLogs.map((log) => {
                  const cookedOn = new Date(log.cookedAt);
                  const cookedLabel = cookedOn.toLocaleDateString();
                  // The card itself is not pressable: sibling buttons stay
                  // individually reachable for TalkBack, which a pressable
                  // parent would swallow.
                  return (
                    <Card key={log.id} level={1} style={{ gap: space.sm }}>
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Open cook log from ${cookedLabel}`}
                          onPress={() => router.push(`/cook-log/${log.id}`)}
                          android_ripple={ripple(colors.ripple)}
                          style={({ pressed }) => [
                            {
                              flex: 1,
                              flexDirection: 'row',
                              gap: space.lg,
                              borderRadius: radius.md,
                              overflow: 'hidden',
                            },
                            pressedStyle(pressed),
                          ]}
                        >
                          <View style={{ width: control.md, alignItems: 'center' }}>
                            <Text variant="numeral">{cookedOn.getDate()}</Text>
                            <Text variant="caption" tone="secondary">
                              {MONTHS[cookedOn.getMonth()]}
                            </Text>
                          </View>
                          <View style={{ flex: 1, gap: space.sm }}>
                            <View
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: space.xxs,
                                minHeight: control.sm,
                              }}
                            >
                              {typeof log.rating === 'number' ? (
                                <>
                                  {[1, 2, 3, 4, 5].map((value) => (
                                    <Ionicons
                                      key={value}
                                      name="star"
                                      size={16}
                                      color={
                                        value <= (log.rating ?? 0)
                                          ? colors.star
                                          : colors.borderStrong
                                      }
                                    />
                                  ))}
                                  <Text
                                    variant="caption"
                                    tone="secondary"
                                    style={{ marginLeft: space.xs }}
                                  >
                                    {log.rating} of 5
                                  </Text>
                                </>
                              ) : (
                                <Text variant="caption" tone="secondary">
                                  No rating
                                </Text>
                              )}
                            </View>
                            {log.notes ? (
                              <Text variant="body" numberOfLines={4}>
                                {log.notes}
                              </Text>
                            ) : null}
                          </View>
                        </Pressable>
                        {log.photoUri ? (
                          <Pressable
                            accessibilityRole="imagebutton"
                            accessibilityLabel={`Cook photo from ${cookedLabel}`}
                            accessibilityHint="Opens the photo full screen"
                            onPress={() => setFullscreenImageUri(log.photoUri ?? null)}
                            android_ripple={ripple(colors.ripple)}
                            style={({ pressed }) => [
                              { borderRadius: radius.md, overflow: 'hidden' },
                              pressedStyle(pressed, 0.85),
                            ]}
                          >
                            <Image
                              source={{ uri: log.photoUri }}
                              style={{ width: control.lg, height: control.lg }}
                              resizeMode="cover"
                            />
                          </Pressable>
                        ) : null}
                      </View>
                      {log.photoUri ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Set this photo as the recipe hero image"
                          onPress={async () => {
                            await setRecipeMainImageFromCookLog(recipe.id, log.id);
                            await reload();
                          }}
                          android_ripple={ripple(colors.ripple)}
                          style={({ pressed }) => [
                            {
                              alignSelf: 'flex-start',
                              justifyContent: 'center',
                              minHeight: control.sm,
                              marginLeft: control.md + space.lg,
                              paddingHorizontal: space.xs,
                              borderRadius: radius.sm,
                              overflow: 'hidden',
                            },
                            pressedStyle(pressed),
                          ]}
                        >
                          <Text variant="captionStrong" tone="accent">
                            Use as recipe photo
                          </Text>
                        </Pressable>
                      ) : null}
                    </Card>
                  );
                })}
              </View>
            ) : null}
          </View>
        </ScrollView>

        {canCook ? (
          <View
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              paddingHorizontal: space.lg,
              paddingTop: space.md,
              paddingBottom: insets.bottom + space.md,
              backgroundColor: colors.background,
              borderTopWidth: 1,
              borderTopColor: colors.border,
            }}
          >
            <Button
              label="Start cooking"
              icon="timer-outline"
              size="lg"
              fullWidth
              accessibilityHint="Opens step-by-step cooking mode"
              onPress={() =>
                router.push({
                  pathname: '/recipe/cook/[id]',
                  params: { id: recipe.id, servings: String(servings) },
                })
              }
            />
          </View>
        ) : null}

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
                  bottom: insets.bottom + dockHeight + space.lg + (activeTimer ? TIMER_BAR_CLEARANCE : 0),
                  width: control.lg,
                  height: control.lg,
                  borderRadius: radius.lg,
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
              bottom: insets.bottom + dockHeight + space.md,
              borderRadius: radius.lg,
              borderWidth: resolved === 'dark' ? 1 : 0,
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
              onPress={toggleTimerPause}
            />
            <IconButton
              icon="stop"
              accessibilityLabel="Stop timer"
              variant="ghost"
              size={36}
              onPress={stopTimer}
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

/** A read-only fact about the recipe, shaped like a chip but not pressable. */
function MetaPill({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        minHeight: control.sm - space.xs,
        justifyContent: 'center',
        paddingHorizontal: space.md,
        borderRadius: radius.pill,
        backgroundColor: colors.surfaceMuted,
      }}
    >
      <Text variant="caption" tone="secondary">
        {label}
      </Text>
    </View>
  );
}
