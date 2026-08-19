import { Button, Screen, Text } from '@/components/ui';
import { pressedStyle, ripple } from '@/components/ui/press';
import {
  applyRecipeAdjustment,
  getRecipeAdjustmentById,
  getRecipeById,
  ignoreRecipeAdjustment,
} from '@/data/recipes';
import { formatQuantity } from '@/domain/scaling';
import { useTheme } from '@/theme/ThemeContext';
import { radius, space } from '@/theme/tokens';
import type { Recipe, RecipeAdjustment } from '@/types/recipe';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

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
        <ActivityIndicator color={colors.primary} />
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
          paddingHorizontal: space.xxl,
          gap: space.lg,
        }}
      >
        <Ionicons name="checkmark-circle-outline" size={44} color={colors.textSecondary} />
        <Text variant="heading" accessibilityRole="header">
          No pending suggestions
        </Text>
        <Button
          label="Back to library"
          onPress={() => router.replace('/')}
        />
      </View>
    );
  }

  return (
    <Screen
      scroll
      header={{ title: 'Review updates', back: true }}
      gap={space.md}
      footer={
        <View style={{ gap: space.sm }}>
          <Button
            label={`Apply selected (${selectedSuggestionIds.length})`}
            fullWidth
            size="lg"
            disabled={!applyEnabled}
            loading={busyAction === 'apply'}
            accessibilityLabel={`Apply ${selectedSuggestionIds.length} selected updates`}
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
          />
          <Button
            label="Ignore suggestions"
            variant="secondary"
            fullWidth
            disabled={busyAction !== null}
            loading={busyAction === 'ignore'}
            accessibilityLabel="Ignore these suggested updates"
            onPress={async () => {
              setBusyAction('ignore');
              await ignoreRecipeAdjustment(adjustment.id);
              setBusyAction(null);
              router.replace(`/recipe/${adjustment.recipeId}`);
            }}
          />
        </View>
      }
    >
      <Text variant="body" tone="secondary">
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
          before = ingredient ? formatQuantity(ingredient.quantity, ingredient.unit) : '';
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
            accessibilityRole="checkbox"
            accessibilityLabel={`${title}: change ${before || 'nothing'} to ${after}`}
            accessibilityState={{ checked: selected }}
            onPress={() =>
              setSelectedSuggestionIds((prev) =>
                selected
                  ? prev.filter((item) => item !== suggestion.id)
                  : [...prev, suggestion.id]
              )
            }
            android_ripple={ripple(colors.ripple)}
            style={({ pressed }) => [
              {
                borderWidth: 1,
                borderColor: selected ? colors.primary : colors.border,
                backgroundColor: selected ? colors.primarySoft : colors.surface,
                borderRadius: radius.lg,
                padding: space.lg,
                gap: space.sm,
                overflow: 'hidden',
              },
              pressedStyle(pressed),
            ]}
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: space.sm,
              }}
            >
              <Text
                variant="bodyStrong"
                tone={selected ? 'onAccentSoft' : 'primary'}
                style={{ flex: 1 }}
              >
                {title}
              </Text>
              <Ionicons
                name={selected ? 'checkbox' : 'square-outline'}
                size={20}
                color={selected ? colors.onPrimarySoft : colors.textSecondary}
              />
            </View>

            {/* The before/after pair is the whole point of the row, so it gets
                its own strip rather than being run together in a sentence. */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: space.sm,
              }}
            >
              <Text
                variant="caption"
                tone="secondary"
                style={{ textDecorationLine: 'line-through' }}
              >
                {before}
              </Text>
              <Ionicons name="arrow-forward" size={13} color={colors.textSecondary} />
              <Text variant="captionStrong" tone={selected ? 'onAccentSoft' : 'primary'}>
                {after}
              </Text>
            </View>

            <Text variant="caption" tone="secondary">
              {suggestion.reason}
            </Text>
            <Text variant="caption" tone="secondary" style={{ fontStyle: 'italic' }}>
              Evidence: “{suggestion.noteEvidence}”
            </Text>
          </Pressable>
        );
      })}
    </Screen>
  );
}
