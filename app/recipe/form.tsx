import {
  createManualRecipeDraft,
  getRecipeById,
  saveRecipe,
} from '@/data/recipes';
import { AppDialog } from '@/components/AppDialog';
import { BackButton } from '@/components/BackButton';
import { newId } from '@/lib/id';
import type { Ingredient, Recipe, Step } from '@/types/recipe';
import { useTheme } from '@/theme/ThemeContext';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
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
  };

  const addStep = () => {
    const next: Step = {
      id: newId(),
      order: recipe.steps.length,
      instruction: '',
      scalableQuantities: [],
    };
    setRecipe({ ...recipe, steps: [...recipe.steps, next] });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BackButton />
      <ScrollView
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
        label="Source URL"
        value={recipe.sourceUrl}
        onChange={(t) => setRecipe({ ...recipe, sourceUrl: t })}
        colors={colors}
      />
      <LabeledInput
        label="Base servings"
        value={String(recipe.baseServings)}
        keyboard="decimal-pad"
        onChange={(t) => setRecipe({ ...recipe, baseServings: Number(t) || 1 })}
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
        <Text style={{ fontFamily: 'DMSans_700Bold', color: colors.textPrimary }}>Ingredients</Text>
        <Pressable onPress={addIngredient}>
          <Text style={{ color: colors.primary, fontFamily: 'DMSans_500Medium' }}>Add</Text>
        </Pressable>
      </View>
      {recipe.ingredients.map((ing, idx) => (
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
            <Text style={{ color: colors.textSecondary, fontFamily: 'DMSans_400Regular' }}>Scales with servings</Text>
            <Switch
              value={ing.scalable}
              onValueChange={(v) => {
                const next = [...recipe.ingredients];
                next[idx] = { ...ing, scalable: v };
                setRecipe({ ...recipe, ingredients: next });
              }}
            />
          </View>
        </View>
      ))}

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontFamily: 'DMSans_700Bold', color: colors.textPrimary }}>Steps</Text>
        <Pressable onPress={addStep}>
          <Text style={{ color: colors.primary, fontFamily: 'DMSans_500Medium' }}>Add</Text>
        </Pressable>
      </View>
      {recipe.steps.map((st, idx) => (
        <View key={st.id} style={{ marginBottom: 8 }}>
          <Text style={{ marginBottom: 4, color: colors.textSecondary }}>Step {idx + 1}</Text>
          <TextInput
            multiline
            value={st.instruction}
            onChangeText={(t) => {
              const next = [...recipe.steps];
              next[idx] = { ...st, instruction: t };
              setRecipe({ ...recipe, steps: next });
            }}
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
        </View>
      ))}

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
      </ScrollView>
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
