import { RecipeChatSheet, type RecipeChatSheetRef } from '@/components/RecipeChatSheet';
import {
  addCookLog,
  deleteRecipe,
  getRecipeById,
} from '@/data/recipes';
import type { Recipe } from '@/types/recipe';
import {
  formatQuantity,
  renderStepInstruction,
  scaleForIngredient,
} from '@/domain/scaling';
import { getOpenAiApiKey } from '@/lib/secrets';
import { compressAndSaveCookPhoto } from '@/lib/media';
import { newId } from '@/lib/id';
import { useTheme } from '@/theme/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  Alert,
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
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [servings, setServings] = useState(4);
  const [noteDraft, setNoteDraft] = useState('');

  const reload = useCallback(async () => {
    const r = await getRecipeById(String(id));
    setRecipe(r);
    if (r) {
      setServings(Math.min(12, Math.max(1, Math.round(r.baseServings))));
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  if (!recipe) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <Text style={{ color: colors.textSecondary }}>Loading…</Text>
      </View>
    );
  }

  const hero = recipe.cookLogs.find((l) => l.photoUri)?.photoUri;

  const shareRecipe = async () => {
    const lines = [
      recipe.title,
      '',
      ...recipe.ingredients.map((i) => {
        const q = scaleForIngredient(i, recipe.baseServings, servings);
        return `- ${formatQuantity(q, i.unit)} ${i.name}`;
      }),
      '',
      ...recipe.steps
        .sort((a, b) => a.order - b.order)
        .map((s, idx) => `${idx + 1}. ${renderStepInstruction(s, recipe.baseServings, servings)}`),
    ];
    await Share.share({ message: lines.join('\n') });
  };

  const logCook = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission', 'Photos permission is required.');
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
    await addCookLog({
      id: newId(),
      recipeId: recipe.id,
      cookedAt: new Date().toISOString(),
      photoUri: saved,
      notes: noteDraft.trim() || undefined,
      createdAt: new Date().toISOString(),
    });
    setNoteDraft('');
    reload();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={{ height: 260, backgroundColor: colors.border }}>
          {hero ? (
            <Image source={{ uri: hero }} style={{ width: '100%', height: '100%' }} />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="image-outline" size={48} color={colors.textSecondary} />
            </View>
          )}
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
              onValueChange={setServings}
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
                · {formatQuantity(q, ing.unit)} {ing.name}
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
                  {renderStepInstruction(s, recipe.baseServings, servings)}
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
                  </Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
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
            <Pressable
              onPress={() => {
                Alert.alert('Delete recipe?', 'This cannot be undone.', [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                      await deleteRecipe(recipe.id);
                      router.replace('/');
                    },
                  },
                ]);
              }}
            >
              <Text style={{ color: colors.destructive, fontFamily: 'DMSans_500Medium' }}>Delete</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
      <Pressable
        onPress={async () => {
          const net = await NetInfo.fetch();
          if (!net.isConnected) {
            Alert.alert('Offline', 'Connect to use the assistant.');
            return;
          }
          const key = await getOpenAiApiKey();
          if (!key) {
            Alert.alert('API key', 'Add your OpenAI key in Settings.');
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
    </View>
  );
}
