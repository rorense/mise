import { AppDialog, type AppDialogAction } from '@/components/AppDialog';
import { BackButton } from '@/components/BackButton';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { RecipeChatSheet, type RecipeChatSheetRef } from '@/components/RecipeChatSheet';
import {
  addCookLog,
  getRecipeById,
  getRecipeServingsOverride,
  setRecipeArchived,
  setRecipeFlags,
  setRecipeMainImage,
  setRecipeServingsOverride,
} from '@/data/recipes';
import type { Recipe } from '@/types/recipe';
import {
  formatQuantity,
  renderStepInstruction,
  scaleForIngredient,
  type UnitsDisplayMode,
} from '@/domain/scaling';
import { resolveRecipeHeroImage } from '@/domain/recipeImages';
import {
  normalizeServings,
  shouldCommitSliderTick,
} from '@/domain/slider';
import {
  getOpenAiApiKey,
  getRecipeSavedServings,
  getUnitsDisplayPreference,
  setRecipeSavedServings,
} from '@/lib/secrets';
import {
  compressAndSaveCookPhoto,
  compressAndSaveMainRecipePhoto,
} from '@/lib/media';
import { newId } from '@/lib/id';
import { useTheme } from '@/theme/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Image,
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
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<RecipeChatSheetRef>(null);
  const lastSliderCommitAtRef = useRef(0);
  const isSlidingRef = useRef(false);
  const loadSeqRef = useRef(0);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [servings, setServings] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMissing, setIsMissing] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [ratingDraft, setRatingDraft] = useState<number | null>(null);
  const [showArchiveRecipeConfirm, setShowArchiveRecipeConfirm] = useState(false);
  const [unitsMode, setUnitsMode] = useState<UnitsDisplayMode>('compact');
  const [readMode, setReadMode] = useState(false);
  const [checklistMode, setChecklistMode] = useState(false);
  const [checkedIngredientIds, setCheckedIngredientIds] = useState<string[]>([]);
  const [showIngredients, setShowIngredients] = useState(true);
  const [showMethod, setShowMethod] = useState(true);
  const [showCookJournal, setShowCookJournal] = useState(true);
  const [dialog, setDialog] = useState<{
    title: string;
    message: string;
    actions: AppDialogAction[];
  } | null>(null);
  const AI_ENABLED = false;

  const reload = useCallback(async () => {
    setIsLoading(true);
    setIsMissing(false);
    const seq = ++loadSeqRef.current;
    const [r, unitsPreference] = await Promise.all([
      getRecipeById(String(id)),
      getUnitsDisplayPreference(),
    ]);
    if (seq !== loadSeqRef.current) return;
    setUnitsMode(unitsPreference);
    if (r) {
      const maxServings = Math.max(12, Math.round(r.baseServings));
      const [savedSecure, savedDb] = await Promise.all([
        getRecipeSavedServings(r.id),
        getRecipeServingsOverride(r.id),
      ]);
      if (seq !== loadSeqRef.current) return;
      const nextServings =
        typeof savedSecure === 'number'
          ? normalizeServings(savedSecure, maxServings)
          : typeof savedDb === 'number'
            ? normalizeServings(savedDb, maxServings)
          : normalizeServings(r.baseServings, maxServings);
      setServings(nextServings);
      setRecipe(r);
    } else {
      setRecipe(null);
      setServings(null);
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
    if (!recipe) return;
    setCheckedIngredientIds((prev) =>
      prev.filter((id) => recipe.ingredients.some((ingredient) => ingredient.id === id))
    );
  }, [recipe]);

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

  const shareRecipe = async () => {
    const lines = [
      recipe.title,
      '',
      ...recipe.ingredients.map((i) => {
        const q = scaleForIngredient(i, recipe.baseServings, servings);
        return `- ${formatQuantity(q, i.unit, unitsMode)} ${i.name}`;
      }),
      '',
      ...recipe.steps
        .sort((a, b) => a.order - b.order)
        .map(
          (s, idx) =>
            `${idx + 1}. ${renderStepInstruction(
              s,
              recipe.baseServings,
              servings,
              unitsMode
            )}`
        ),
    ];
    await Share.share({ message: lines.join('\n') });
  };

  const persistCookLog = async (photoUri?: string) => {
    await addCookLog({
      id: newId(),
      recipeId: recipe.id,
      cookedAt: new Date().toISOString(),
      photoUri,
      notes: noteDraft.trim() || undefined,
      rating: ratingDraft ?? undefined,
      createdAt: new Date().toISOString(),
    });
    setNoteDraft('');
    setRatingDraft(null);
    reload();
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

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BackButton />
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={{ height: 260, backgroundColor: colors.border }}>
          {hero ? (
            <Image source={{ uri: hero }} style={{ width: '100%', height: '100%' }} />
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
            {recipe.tags.join(' · ')}
          </Text>
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
            ? recipe.ingredients.map((ing) => {
            const q = scaleForIngredient(ing, recipe.baseServings, servings);
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
                  {formatQuantity(q, ing.unit, unitsMode)} {ing.name}
                  {!ing.scalable ? '  ⚠ adjust to taste' : ''}
                </Text>
              </Pressable>
            );
          })
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
              <View key={s.id} style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
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
                  {renderStepInstruction(s, recipe.baseServings, servings, unitsMode)}
                </Text>
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
                    <Pressable key={log.id} onPress={() => router.push(`/cook-log/${log.id}`)}>
                      <View style={{ width: 120 }}>
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
                        <Text style={{ marginTop: 6, color: colors.textSecondary, fontFamily: 'DMSans_400Regular' }} numberOfLines={1}>
                          {new Date(log.cookedAt).toLocaleDateString()}
                          {typeof log.rating === 'number' ? ` · ${log.rating}/5` : ''}
                        </Text>
                      </View>
                    </Pressable>
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
              <TextInput
                placeholder="Notes for this cook (optional)"
                placeholderTextColor={colors.textSecondary}
                value={noteDraft}
                onChangeText={setNoteDraft}
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
                onPress={logCook}
                style={{
                  backgroundColor: colors.primary,
                  padding: 14,
                  borderRadius: 14,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: '#fff', fontFamily: 'DMSans_700Bold' }}>Log this cook</Text>
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
              const key = await getOpenAiApiKey();
              if (!key) {
                setDialog({
                  title: 'API key',
                  message: 'Add your OpenAI key in Settings.',
                  actions: [{ label: 'OK', variant: 'primary' }],
                });
                return;
              }
              sheetRef.current?.present(recipe, servings, key);
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
          await setRecipeArchived(recipe.id, !recipe.isArchived);
          router.replace('/');
        }}
      />
      <AppDialog
        visible={dialog !== null}
        title={dialog?.title ?? ''}
        message={dialog?.message ?? ''}
        actions={dialog?.actions ?? []}
        onClose={() => setDialog(null)}
      />
    </View>
  );
}
