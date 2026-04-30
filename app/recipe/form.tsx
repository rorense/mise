import {
  createManualRecipeDraft,
  getRecipeById,
  saveRecipe,
} from '@/data/recipes';
import { AppDialog } from '@/components/AppDialog';
import { BackButton } from '@/components/BackButton';
import { newId } from '@/lib/id';
import { getSeenStepDragHint, setSeenStepDragHint } from '@/lib/secrets';
import type { Ingredient, Recipe, Step } from '@/types/recipe';
import { useTheme } from '@/theme/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Pressable,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  NestableScrollContainer,
  NestableDraggableFlatList,
  type RenderItemParams,
} from 'react-native-draggable-flatlist';

export default function RecipeFormScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { recipeId } = useLocalSearchParams<{ recipeId?: string }>();
  const [recipe, setRecipe] = useState<Omit<Recipe, 'cookLogs'> | null>(null);
  const [dialog, setDialog] = useState<{
    title: string;
    message: string;
    onOk?: () => void;
  } | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showIngredients, setShowIngredients] = useState(true);
  const [showSteps, setShowSteps] = useState(true);
  const [activeIngredientId, setActiveIngredientId] = useState<string | null>(null);
  const [activeStepId, setActiveStepId] = useState<string | null>(null);
  const [showStepDragHint, setShowStepDragHint] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const seenStepHint = await getSeenStepDragHint();
      if (!cancelled) {
        setShowStepDragHint(!seenStepHint);
      }
      if (recipeId) {
        const r = await getRecipeById(String(recipeId));
        if (cancelled) return;
        if (!r) {
          setDialog({
            title: 'Not found',
            message: 'This recipe could not be loaded.',
            onOk: () => router.back(),
          });
          return;
        }
        const { cookLogs: _c, ...rest } = r;
        setRecipe(rest);
      } else {
        setRecipe(await createManualRecipeDraft());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [recipeId, router]);

  if (!recipe) {
    return null;
  }

  const addIngredient = () => {
    const next: Ingredient = {
      id: newId(),
      quantity: 0,
      unit: 'g',
      name: '',
      scalable: true,
      sortOrder: recipe.ingredients.length,
    };
    setRecipe({ ...recipe, ingredients: [...recipe.ingredients, next] });
    setActiveIngredientId(next.id);
  };

  const addStep = () => {
    const next: Step = {
      id: newId(),
      order: recipe.steps.length,
      instruction: '',
      scalableQuantities: [],
    };
    setRecipe({ ...recipe, steps: [...recipe.steps, next] });
    setActiveStepId(next.id);
    setShowSteps(true);
  };

  const normalizeStepOrder = (steps: Step[]): Step[] =>
    steps.map((step, idx) => ({ ...step, order: idx }));

  const updateStepInstruction = (id: string, instruction: string) => {
    const next = recipe.steps.map((step) =>
      step.id === id ? { ...step, instruction } : step
    );
    setRecipe({ ...recipe, steps: next });
  };

  const removeIngredient = (id: string) => {
    setRecipe({
      ...recipe,
      ingredients: recipe.ingredients
        .filter((ing) => ing.id !== id)
        .map((ing, idx) => ({ ...ing, sortOrder: idx })),
    });
    if (activeIngredientId === id) setActiveIngredientId(null);
  };

  const removeStep = (id: string) => {
    setRecipe({
      ...recipe,
      steps: normalizeStepOrder(recipe.steps.filter((step) => step.id !== id)),
    });
    if (activeStepId === id) setActiveStepId(null);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BackButton />
      <NestableScrollContainer
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{ padding: 20, paddingTop: 72, gap: 14, paddingBottom: 48 }}
      >
      <Text style={{ fontFamily: 'Lora_700Bold', fontSize: 22, color: colors.textPrimary }}>
        {recipeId ? 'Edit recipe' : 'New recipe'}
      </Text>
      <LabeledInput
        label="Title"
        value={recipe.title}
        onChange={(t) => setRecipe({ ...recipe, title: t })}
        colors={colors}
      />
      <LabeledInput
        label="Base servings"
        value={String(recipe.baseServings)}
        keyboard="decimal-pad"
        onChange={(t) => setRecipe({ ...recipe, baseServings: Number(t) || 1 })}
        colors={colors}
      />
      <Pressable
        onPress={() => setShowAdvanced((v) => !v)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
      >
        <Ionicons
          name={showAdvanced ? 'chevron-down' : 'chevron-forward'}
          size={16}
          color={colors.textSecondary}
        />
        <Text style={{ color: colors.textSecondary, fontFamily: 'DMSans_500Medium' }}>
          More options
        </Text>
      </Pressable>
      {showAdvanced ? (
        <>
          <LabeledInput
            label="Source URL"
            value={recipe.sourceUrl}
            onChange={(t) => setRecipe({ ...recipe, sourceUrl: t })}
            colors={colors}
          />
          <LabeledInput
            label="Cuisine"
            value={recipe.cuisine ?? ''}
            onChange={(t) => setRecipe({ ...recipe, cuisine: t || undefined })}
            colors={colors}
          />
          <LabeledInput
            label="Main image URI (optional)"
            value={recipe.mainImageUri ?? ''}
            onChange={(t) =>
              setRecipe({ ...recipe, mainImageUri: t.trim() ? t.trim() : undefined })
            }
            colors={colors}
          />
        </>
      ) : null}
      <LabeledInput
        label="Tags (comma separated)"
        value={recipe.tags.join(', ')}
        onChange={(t) =>
          setRecipe({
            ...recipe,
            tags: t
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
          })
        }
        colors={colors}
      />

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Pressable
          onPress={() => setShowIngredients((v) => !v)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
        >
          <Ionicons
            name={showIngredients ? 'chevron-down' : 'chevron-forward'}
            size={16}
            color={colors.textPrimary}
          />
          <Text style={{ fontFamily: 'DMSans_700Bold', color: colors.textPrimary }}>Ingredients</Text>
        </Pressable>
        <Pressable onPress={addIngredient}>
          <Text style={{ color: colors.primary, fontFamily: 'DMSans_500Medium' }}>Add</Text>
        </Pressable>
      </View>
      {showIngredients
        ? recipe.ingredients.map((ing, idx) => (
        <View
          key={ing.id}
          style={{
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 12,
            padding: 10,
            gap: 8,
            backgroundColor: colors.surface,
          }}
        >
          <Pressable onPress={() => setActiveIngredientId(ing.id)}>
            <Text style={{ color: colors.textPrimary, fontFamily: 'DMSans_500Medium' }}>
              {ing.quantity} {ing.unit ?? ''} {ing.name || 'Untitled ingredient'}
            </Text>
          </Pressable>
          {activeIngredientId === ing.id ? (
            <>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput
                  value={String(ing.quantity)}
                  onChangeText={(t) => {
                    const next = [...recipe.ingredients];
                    next[idx] = { ...ing, quantity: Number(t) || 0 };
                    setRecipe({ ...recipe, ingredients: next });
                  }}
                  keyboardType="decimal-pad"
                  placeholder="Qty"
                  placeholderTextColor={colors.textSecondary}
                  style={{
                    width: 64,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 8,
                    padding: 8,
                    color: colors.textPrimary,
                  }}
                />
                <TextInput
                  value={ing.unit ?? ''}
                  onChangeText={(t) => {
                    const next = [...recipe.ingredients];
                    next[idx] = { ...ing, unit: t.trim() ? t : null };
                    setRecipe({ ...recipe, ingredients: next });
                  }}
                  placeholder="Unit"
                  placeholderTextColor={colors.textSecondary}
                  style={{
                    width: 72,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 8,
                    padding: 8,
                    color: colors.textPrimary,
                  }}
                />
                <TextInput
                  value={ing.name}
                  onChangeText={(t) => {
                    const next = [...recipe.ingredients];
                    next[idx] = { ...ing, name: t };
                    setRecipe({ ...recipe, ingredients: next });
                  }}
                  placeholder="Ingredient"
                  placeholderTextColor={colors.textSecondary}
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 8,
                    padding: 8,
                    color: colors.textPrimary,
                  }}
                />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ color: colors.textSecondary, fontFamily: 'DMSans_400Regular' }}>
                  Scales with servings
                </Text>
                <Switch
                  value={ing.scalable}
                  onValueChange={(v) => {
                    const next = [...recipe.ingredients];
                    next[idx] = { ...ing, scalable: v };
                    setRecipe({ ...recipe, ingredients: next });
                  }}
                />
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Pressable onPress={() => setActiveIngredientId(null)}>
                  <Text style={{ color: colors.textSecondary, fontFamily: 'DMSans_500Medium' }}>
                    Done
                  </Text>
                </Pressable>
                <Pressable onPress={() => removeIngredient(ing.id)}>
                  <Text style={{ color: colors.destructive, fontFamily: 'DMSans_500Medium' }}>
                    Remove
                  </Text>
                </Pressable>
              </View>
            </>
          ) : null}
        </View>
      ))
        : null}

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Pressable
          onPress={() => setShowSteps((v) => !v)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
        >
          <Ionicons
            name={showSteps ? 'chevron-down' : 'chevron-forward'}
            size={16}
            color={colors.textPrimary}
          />
          <Text style={{ fontFamily: 'DMSans_700Bold', color: colors.textPrimary }}>Steps</Text>
        </Pressable>
        <Pressable onPress={addStep}>
          <Text style={{ color: colors.primary, fontFamily: 'DMSans_500Medium' }}>Add</Text>
        </Pressable>
      </View>
      {showStepDragHint ? (
        <Text style={{ color: colors.textSecondary, fontFamily: 'DMSans_400Regular' }}>
          Long press a step title and drag to reorder.
        </Text>
      ) : null}
      {showSteps ? (
      <NestableDraggableFlatList
        data={recipe.steps}
        keyExtractor={(item) => item.id}
        scrollEnabled={false}
        activationDistance={10}
        onDragBegin={async () => {
          if (showStepDragHint) {
            setShowStepDragHint(false);
            await setSeenStepDragHint(true);
          }
        }}
        onDragEnd={({ data }) => {
          setRecipe({ ...recipe, steps: normalizeStepOrder(data) });
        }}
        renderItem={({ item, getIndex, drag, isActive }: RenderItemParams<Step>) => (
          <View
            style={{
              marginBottom: 8,
              opacity: isActive ? 0.8 : 1,
            }}
          >
            <Pressable
              onLongPress={drag}
              delayLongPress={180}
              style={{ marginBottom: 4, flexDirection: 'row', alignItems: 'center', gap: 8 }}
            >
              <Text style={{ color: colors.textSecondary }}>
                Step {(getIndex() ?? 0) + 1}
              </Text>
            </Pressable>
            {activeStepId === item.id ? (
              <>
                <TextInput
                  multiline
                  value={item.instruction}
                  onChangeText={(text) => updateStepInstruction(item.id, text)}
                  placeholder="Describe the step. Use {{qty_1}} placeholders if needed."
                  placeholderTextColor={colors.textSecondary}
                  style={{
                    minHeight: 80,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 12,
                    padding: 10,
                    textAlignVertical: 'top',
                    fontFamily: 'DMSans_400Regular',
                    color: colors.textPrimary,
                    backgroundColor: colors.surface,
                  }}
                />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                  <Pressable onPress={() => setActiveStepId(null)}>
                    <Text style={{ color: colors.textSecondary, fontFamily: 'DMSans_500Medium' }}>
                      Done
                    </Text>
                  </Pressable>
                  <Pressable onPress={() => removeStep(item.id)}>
                    <Text style={{ color: colors.destructive, fontFamily: 'DMSans_500Medium' }}>
                      Remove
                    </Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <Pressable
                onPress={() => setActiveStepId(item.id)}
                style={{
                  minHeight: 52,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 12,
                  padding: 10,
                  justifyContent: 'center',
                  backgroundColor: colors.surface,
                }}
              >
                <Text
                  style={{ color: colors.textPrimary, fontFamily: 'DMSans_400Regular' }}
                  numberOfLines={2}
                >
                  {item.instruction || 'Tap to edit step'}
                </Text>
              </Pressable>
            )}
          </View>
        )}
      />
      ) : null}

        <Pressable
          onPress={async () => {
            if (!recipe.title.trim()) {
              setDialog({
                title: 'Title required',
                message: 'Please enter a recipe title before saving.',
              });
              return;
            }
            await saveRecipe(recipe);
            router.replace(`/recipe/${recipe.id}`);
          }}
          style={{
            backgroundColor: colors.primary,
            padding: 16,
            borderRadius: 14,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontFamily: 'DMSans_700Bold' }}>Save</Text>
        </Pressable>
      </NestableScrollContainer>
      <AppDialog
        visible={dialog !== null}
        title={dialog?.title ?? ''}
        message={dialog?.message ?? ''}
        actions={[
          {
            label: 'OK',
            variant: 'primary',
            onPress: () => dialog?.onOk?.(),
          },
        ]}
        onClose={() => setDialog(null)}
      />
    </View>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  colors,
  keyboard = 'default',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  colors: ReturnType<typeof useTheme>['colors'];
  keyboard?: 'default' | 'decimal-pad';
}) {
  return (
    <View>
      <Text style={{ fontFamily: 'DMSans_500Medium', marginBottom: 6, color: colors.textPrimary }}>{label}</Text>
      <TextInput
        value={value}
        keyboardType={keyboard}
        onChangeText={onChange}
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
    </View>
  );
}
