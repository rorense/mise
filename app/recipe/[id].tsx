import { AppDialog, type AppDialogAction } from '@/components/AppDialog';
import { BackButton } from '@/components/BackButton';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { RecipeChatSheet, type RecipeChatSheetRef } from '@/components/RecipeChatSheet';
import {
  addCookLog,
  getRecipeById,
  setRecipeArchived,
  setRecipeFlags,
  setRecipeMainImage,
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
import { getOpenAiApiKey, getUnitsDisplayPreference } from '@/lib/secrets';
import {
  compressAndSaveCookPhoto,
  compressAndSaveMainRecipePhoto,
} from '@/lib/media';
import { newId } from '@/lib/id';
import { useTheme } from '@/theme/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
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
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [servings, setServings] = useState<number | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [ratingDraft, setRatingDraft] = useState<number | null>(null);
  const [showArchiveRecipeConfirm, setShowArchiveRecipeConfirm] = useState(false);
  const [unitsMode, setUnitsMode] = useState<UnitsDisplayMode>('compact');
  const [dialog, setDialog] = useState<{
    title: string;
    message: string;
    actions: AppDialogAction[];
  } | null>(null);
  const AI_ENABLED = false;

  const reload = useCallback(async () => {
    const [r, unitsPreference] = await Promise.all([
      getRecipeById(String(id)),
      getUnitsDisplayPreference(),
    ]);
    setUnitsMode(unitsPreference);
    if (r) {
      const initialServings = normalizeServings(r.baseServings);
      setServings(initialServings);
      setRecipe(r);
    } else {
      setRecipe(null);
      setServings(null);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  if (!recipe || servings === null) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <Text style={{ color: colors.textSecondary }}>Loading…</Text>
      </View>
    );
  }

  const hero = resolveRecipeHeroImage(
    recipe.mainImageUri,
    recipe.cookLogs.find((l) => l.photoUri)?.photoUri
  );

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
          <Text style={{ fontFamily: 'Lora_700Bold', fontSize: 26, color: colors.textPrimary }}>
            {recipe.title}
          </Text>
          {recipe.sourceUrl ? (
            <Text
              onPress={() => Linking.openURL(recipe.sourceUrl)}
              style={{ color: colors.primary, fontFamily: 'DMSans_500Medium' }}
            >
              Open source
            </Text>
          ) : null}
          <Text style={{ fontFamily: 'DMSans_400Regular', color: colors.textSecondary }}>
            {recipe.cuisine ? `${recipe.cuisine} · ` : ''}
            {recipe.tags.join(' · ')}
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable
              onPress={async () => {
                await setRecipeFlags(recipe.id, { isFavorite: !recipe.isFavorite });
                reload();
              }}
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
              onPress={async () => {
                await setRecipeFlags(recipe.id, { wantToCook: !recipe.wantToCook });
                reload();
              }}
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
              maximumValue={12}
              step={1}
              value={servings}
              onValueChange={(value) => {
                const now = Date.now();
                if (!shouldCommitSliderTick(lastSliderCommitAtRef.current, now)) {
                  return;
                }
                lastSliderCommitAtRef.current = now;
                setServings(normalizeServings(value));
              }}
              onSlidingComplete={(value) => {
                lastSliderCommitAtRef.current = Date.now();
                setServings(normalizeServings(value));
              }}
              minimumTrackTintColor={colors.primary}
              maximumTrackTintColor={colors.border}
              thumbTintColor={colors.primary}
            />
          </View>
          <Text style={{ fontFamily: 'DMSans_700Bold', color: colors.textPrimary, marginTop: 8 }}>
            Ingredients
          </Text>
          {recipe.ingredients.map((ing) => {
            const q = scaleForIngredient(ing, recipe.baseServings, servings);
            return (
              <Text key={ing.id} style={{ fontFamily: 'DMSans_400Regular', color: colors.textPrimary }}>
                · {formatQuantity(q, ing.unit, unitsMode)} {ing.name}
                {!ing.scalable ? '  ⚠ adjust to taste' : ''}
              </Text>
            );
          })}
          <Text style={{ fontFamily: 'DMSans_700Bold', color: colors.textPrimary, marginTop: 12 }}>
            Method
          </Text>
          {recipe.steps
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
                <Text style={{ flex: 1, fontFamily: 'DMSans_400Regular', color: colors.textPrimary, lineHeight: 22 }}>
                  {renderStepInstruction(s, recipe.baseServings, servings, unitsMode)}
                </Text>
              </View>
            ))}
          <Text style={{ fontFamily: 'DMSans_700Bold', marginTop: 12, color: colors.textPrimary }}>
            Cook journal
          </Text>
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
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
            <Pressable onPress={() => router.push({ pathname: '/recipe/form', params: { recipeId: recipe.id } })}>
              <Text style={{ color: colors.primary, fontFamily: 'DMSans_500Medium' }}>Edit</Text>
            </Pressable>
            <Pressable onPress={shareRecipe}>
              <Text style={{ color: colors.primary, fontFamily: 'DMSans_500Medium' }}>Share</Text>
            </Pressable>
            <Pressable onPress={() => setShowArchiveRecipeConfirm(true)}>
              <Text style={{ color: colors.destructive, fontFamily: 'DMSans_500Medium' }}>
                {recipe.isArchived ? 'Unarchive' : 'Archive'}
              </Text>
            </Pressable>
          </View>
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
