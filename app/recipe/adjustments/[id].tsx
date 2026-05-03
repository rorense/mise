import { BackButton } from '@/components/BackButton';
import {
  applyRecipeAdjustment,
  getRecipeAdjustmentById,
  getRecipeById,
  ignoreRecipeAdjustment,
} from '@/data/recipes';
import { formatQuantity } from '@/domain/scaling';
import type { Recipe, RecipeAdjustment } from '@/types/recipe';
import { useTheme } from '@/theme/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

export default function RecipeAdjustmentsReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const [isLoading, setIsLoading] = useState(true);
  const [adjustment, setAdjustment] = useState<RecipeAdjustment | null>(null);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [selectedSuggestionIds, setSelectedSuggestionIds] = useState<string[]>([]);
  const [busyAction, setBusyAction] = useState<'apply' | 'ignore' | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      const nextAdjustment = await getRecipeAdjustmentById(String(id));
      if (!nextAdjustment) {
        if (!cancelled) {
          setAdjustment(null);
          setRecipe(null);
          setIsLoading(false);
        }
        return;
      }
      const nextRecipe = await getRecipeById(nextAdjustment.recipeId);
      if (!cancelled) {
        setAdjustment(nextAdjustment);
        setRecipe(nextRecipe);
        setSelectedSuggestionIds(nextAdjustment.suggestions.map((s) => s.id));
        setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const suggestionCount = adjustment?.suggestions.length ?? 0;
  const applyEnabled = useMemo(
    () => selectedSuggestionIds.length > 0 && busyAction === null,
    [selectedSuggestionIds.length, busyAction]
  );

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
        <Text style={{ color: colors.textSecondary }}>Loading…</Text>
      </View>
    );
  }

  if (!adjustment || !recipe) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.background,
          paddingHorizontal: 24,
          gap: 10,
        }}
      >
        <Text style={{ fontFamily: 'Lora_700Bold', color: colors.textPrimary, fontSize: 20 }}>
          No pending suggestions
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

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BackButton />
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingTop: 72, paddingBottom: 48, gap: 12 }}
      >
        <Text style={{ fontFamily: 'Lora_700Bold', fontSize: 22, color: colors.textPrimary }}>
          Review suggested updates
        </Text>
        <Text style={{ color: colors.textSecondary, fontFamily: 'DMSans_400Regular' }}>
          {recipe.title} · {suggestionCount} suggestion{suggestionCount === 1 ? '' : 's'}
        </Text>

        {adjustment.suggestions.map((suggestion) => {
          const selected = selectedSuggestionIds.includes(suggestion.id);
          const ingredient =
            suggestion.type === 'step_instruction'
              ? null
              : recipe.ingredients.find((ing) => ing.id === suggestion.ingredientId);
          const step =
            suggestion.type === 'step_instruction'
              ? recipe.steps.find((s) => s.id === suggestion.stepId)
              : null;
          let title = '';
          let before = '';
          let after = '';
          if (suggestion.type === 'ingredient_quantity') {
            title = ingredient?.name ?? 'Ingredient';
            before = ingredient
              ? formatQuantity(ingredient.quantity, ingredient.unit)
              : '';
            after = ingredient
              ? formatQuantity(suggestion.nextQuantity, ingredient.unit)
              : String(suggestion.nextQuantity);
          } else if (suggestion.type === 'ingredient_amount_mode') {
            title = ingredient?.name ?? 'Ingredient';
            before = ingredient?.amountMode === 'to_taste' ? 'to taste' : 'exact amount';
            after = suggestion.nextAmountMode === 'to_taste' ? 'to taste' : 'exact amount';
          } else {
            title = `Step ${(step?.order ?? 0) + 1}`;
            before = step?.instruction ?? '';
            after = suggestion.nextInstruction;
          }
          return (
            <Pressable
              key={suggestion.id}
              onPress={() =>
                setSelectedSuggestionIds((prev) =>
                  selected
                    ? prev.filter((item) => item !== suggestion.id)
                    : [...prev, suggestion.id]
                )
              }
              style={{
                borderWidth: 1,
                borderColor: selected ? colors.primary : colors.border,
                backgroundColor: selected ? colors.primary + '18' : colors.surface,
                borderRadius: 14,
                padding: 12,
                gap: 8,
              }}
            >
              <View
                style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <Text style={{ fontFamily: 'DMSans_700Bold', color: colors.textPrimary }}>
                  {title}
                </Text>
                <Ionicons
                  name={selected ? 'checkbox' : 'square-outline'}
                  size={18}
                  color={selected ? colors.primary : colors.textSecondary}
                />
              </View>
              <Text style={{ color: colors.textPrimary, fontFamily: 'DMSans_400Regular' }}>
                {before}
                {' -> '}
                {after}
              </Text>
              <Text style={{ color: colors.textSecondary, fontFamily: 'DMSans_400Regular' }}>
                {suggestion.reason}
              </Text>
              <Text style={{ color: colors.textSecondary, fontFamily: 'DMSans_400Regular' }}>
                Evidence: "{suggestion.noteEvidence}"
              </Text>
            </Pressable>
          );
        })}

        <Pressable
          disabled={!applyEnabled}
          onPress={async () => {
            setBusyAction('apply');
            const success = await applyRecipeAdjustment({
              adjustmentId: adjustment.id,
              selectedSuggestionIds,
            });
            setBusyAction(null);
            if (success) {
              router.replace(`/recipe/${adjustment.recipeId}`);
            }
          }}
          style={{
            backgroundColor: colors.primary,
            borderRadius: 14,
            alignItems: 'center',
            padding: 14,
            opacity: applyEnabled ? 1 : 0.5,
          }}
        >
          <Text style={{ color: '#fff', fontFamily: 'DMSans_700Bold' }}>
            Apply selected ({selectedSuggestionIds.length})
          </Text>
        </Pressable>

        <Pressable
          disabled={busyAction !== null}
          onPress={async () => {
            setBusyAction('ignore');
            await ignoreRecipeAdjustment(adjustment.id);
            setBusyAction(null);
            router.replace(`/recipe/${adjustment.recipeId}`);
          }}
          style={{
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 14,
            alignItems: 'center',
            padding: 14,
            backgroundColor: colors.surface,
          }}
        >
          <Text style={{ color: colors.textPrimary, fontFamily: 'DMSans_500Medium' }}>
            Ignore suggestions
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
