import { AppDialog } from '@/components/AppDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  Button,
  Chip,
  IconButton,
  Screen,
  SwitchRow,
  Text,
  TextField,
} from '@/components/ui';
import { pressedStyle, ripple } from '@/components/ui/press';
import {
  createManualRecipeDraft,
  getRecipeById,
  saveRecipe,
} from '@/data/recipes';
import { formatQuantity, isIngredientSectionHeading } from '@/domain/scaling';
import { describeAiUnavailable, getImportAiCredentials } from '@/lib/aiConfig';
import { newId } from '@/lib/id';
import { importFromManualText } from '@/lib/import/pipeline';
import { restoreImportDraft, takeImportDraft } from '@/lib/importDraftStore';
import { getSeenStepDragHint, setSeenStepDragHint } from '@/lib/secrets';
import {
  KEYBOARD_AVOIDING_BEHAVIOR,
  KEYBOARD_VERTICAL_OFFSET,
  useKeyboardSafeScroll,
} from '@/lib/ui/keyboardSafe';
import { useTheme } from '@/theme/ThemeContext';
import { radius, space, typeScale } from '@/theme/tokens';
import type { Ingredient, Recipe, Step } from '@/types/recipe';
import { Ionicons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  BackHandler,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import DraggableFlatList, {
  type RenderItemParams,
} from 'react-native-draggable-flatlist';

const COMMON_INGREDIENT_UNITS: { label: string; value: string | null }[] = [
  { label: 'tsp', value: 'tsp' },
  { label: 'tbsp', value: 'tbsp' },
  { label: 'cups', value: 'cups' },
  { label: 'grams', value: 'g' },
  { label: 'kg', value: 'kg' },
  { label: 'ml', value: 'ml' },
  { label: 'x', value: 'x' },
  { label: 'none', value: null },
];

const LARGE_INGREDIENT_QUANTITY_THRESHOLD = 100;

function getDefaultIngredientUnit(quantity: number): string {
  return quantity >= LARGE_INGREDIENT_QUANTITY_THRESHOLD ? 'g' : 'tsp';
}

function getAutoAdjustedIngredientUnit(unit: string | null, quantity: number): string | null {
  if (unit === 'tsp' && quantity >= LARGE_INGREDIENT_QUANTITY_THRESHOLD) {
    return 'g';
  }
  return unit;
}

function mergeAiExtractIntoDraft(
  current: Omit<Recipe, 'cookLogs'>,
  extracted: Omit<Recipe, 'cookLogs'>
): Omit<Recipe, 'cookLogs'> {
  return {
    ...current,
    title: extracted.title,
    baseServings: extracted.baseServings,
    cuisine: extracted.cuisine,
    tags: extracted.tags,
    ingredients: extracted.ingredients,
    steps: extracted.steps,
    updatedAt: new Date().toISOString(),
  };
}

function formatIngredientPreview(ingredient: Ingredient): string {
  if (isIngredientSectionHeading(ingredient)) {
    return `[Section] ${ingredient.name || 'Untitled section'}`;
  }
  if (ingredient.amountMode === 'to_taste') {
    return `to taste ${ingredient.name || 'Untitled ingredient'}`;
  }
  const amount = formatQuantity(ingredient.quantity, ingredient.unit);
  return `${amount} ${ingredient.name || 'Untitled ingredient'}`;
}

function parseQuantityInput(value: string): number | null {
  const normalized = value.replace(',', '.').trim();
  if (!normalized || normalized === '.') return null;
  if (!/^\d*\.?\d+$/.test(normalized) && !/^\d+\.$/.test(normalized)) {
    return null;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

type RecipeFormErrors = {
  title?: string;
  ingredients?: string;
  steps?: string;
};

function validateRecipeDraft(recipe: Omit<Recipe, 'cookLogs'>): RecipeFormErrors {
  const errors: RecipeFormErrors = {};
  if (!recipe.title.trim()) {
    errors.title = 'Title is required.';
  }
  const invalidIngredient = recipe.ingredients.find((ing) => {
    if (!ing.name.trim()) return true;
    if (isIngredientSectionHeading(ing)) return false;
    if (ing.amountMode === 'exact' && ing.quantity <= 0) return true;
    return false;
  });
  if (invalidIngredient) {
    errors.ingredients =
      'Each ingredient needs a name, and exact amounts must be greater than zero.';
  }
  const stepCount = recipe.steps.filter((step) => step.instruction.trim().length > 0).length;
  if (stepCount === 0) {
    errors.steps = 'Add at least one step.';
  }
  return errors;
}

export default function RecipeFormScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { scrollRef, scrollFocusedInputIntoView } = useKeyboardSafeScroll<ScrollView>();
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
  const [showUnitPickerForIngredientId, setShowUnitPickerForIngredientId] = useState<string | null>(null);
  const [activeStepId, setActiveStepId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showStepDragHint, setShowStepDragHint] = useState(false);
  const [showPasteAi, setShowPasteAi] = useState(false);
  const [startedFromImport, setStartedFromImport] = useState(false);
  const [rawPasteText, setRawPasteText] = useState('');
  const [parseBusy, setParseBusy] = useState(false);
  const [ingredientQuantityInputs, setIngredientQuantityInputs] = useState<Record<string, string>>({});
  const [baseServingsInput, setBaseServingsInput] = useState<string | null>(null);
  const [errors, setErrors] = useState<RecipeFormErrors>({});
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  // Snapshot of the recipe as loaded. Comparing against it tells us whether
  // leaving would throw away work.
  const [baseline, setBaseline] = useState<string | null>(null);

  const isDirty = baseline !== null && JSON.stringify(recipe) !== baseline;

  const leaveScreen = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  const requestLeave = useCallback(() => {
    if (isDirty) setShowDiscardConfirm(true);
    else leaveScreen();
  }, [isDirty, leaveScreen]);

  // Android's hardware/gesture back has to go through the same check as the
  // in-app arrow, or edits vanish silently.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!isDirty) return false;
      setShowDiscardConfirm(true);
      return true;
    });
    return () => subscription.remove();
  }, [isDirty]);

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
        setBaseline(JSON.stringify(rest));
      } else {
        const importedDraft = takeImportDraft() ?? (await restoreImportDraft());
        if (importedDraft) {
          setStartedFromImport(true);
          setRecipe(importedDraft);
          setBaseline(JSON.stringify(importedDraft));
        } else {
          const blank = await createManualRecipeDraft();
          setRecipe(blank);
          setBaseline(JSON.stringify(blank));
        }
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
      unit: getDefaultIngredientUnit(0),
      name: '',
      scalable: true,
      amountMode: 'exact',
      isSectionHeading: false,
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
    if (showUnitPickerForIngredientId === id) setShowUnitPickerForIngredientId(null);
    setIngredientQuantityInputs((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const removeStep = (id: string) => {
    setRecipe({
      ...recipe,
      steps: normalizeStepOrder(recipe.steps.filter((step) => step.id !== id)),
    });
    if (activeStepId === id) setActiveStepId(null);
  };

  const runAiParse = async () => {
    const text = rawPasteText.trim();
    if (!text) {
      setDialog({
        title: 'Nothing to parse',
        message: 'Paste some recipe text first.',
      });
      return;
    }
    const state = await NetInfo.fetch();
    if (!state.isConnected) {
      setDialog({
        title: 'Offline',
        message: 'Connect to Wi-Fi to use AI parsing.',
      });
      return;
    }
    const credentials = await getImportAiCredentials();
    if (!credentials.ok) {
      setDialog(describeAiUnavailable(credentials.reason, credentials.provider));
      return;
    }
    setParseBusy(true);
    try {
      const extracted = await importFromManualText(
        text,
        credentials.provider,
        credentials.apiKey,
        'manual'
      );
      setRecipe((r) => (r ? mergeAiExtractIntoDraft(r, extracted) : r));
      setRawPasteText('');
      setShowIngredients(true);
      setShowSteps(true);
      setActiveIngredientId(null);
      setActiveStepId(null);
    } catch (e) {
      setDialog({
        title: 'Parse failed',
        message: e instanceof Error ? e.message : 'Unknown error',
      });
    } finally {
      setParseBusy(false);
    }
  };

  const save = async () => {
    // saveRecipe opens its own transaction, and SQLite has no nested
    // transactions — a second tap mid-save fails the whole write.
    if (isSaving) return;
    const nextErrors = validateRecipeDraft(recipe);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setDialog({
        title: 'Fix required fields',
        message: 'Please fix the highlighted fields before saving.',
      });
      return;
    }
    setIsSaving(true);
    try {
      await saveRecipe(recipe);
      setBaseline(JSON.stringify(recipe));
      if (!recipeId && startedFromImport) {
        router.replace({
          pathname: '/recipe/[id]',
          params: { id: recipe.id, fromImport: '1' },
        });
        return;
      }
      router.replace(`/recipe/${recipe.id}`);
    } catch (e) {
      setDialog({
        title: 'Save failed',
        message: e instanceof Error ? e.message : 'Unknown error while saving recipe.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  /** Compact inline field used inside the ingredient editor rows. */
  const inlineInputStyle = {
    ...typeScale.body,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    minHeight: 44,
    color: colors.textPrimary,
    backgroundColor: colors.background,
  } as const;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={KEYBOARD_AVOIDING_BEHAVIOR}
      keyboardVerticalOffset={KEYBOARD_VERTICAL_OFFSET}
    >
      <Screen
        scroll
        scrollRef={scrollRef}
        header={{
          title: recipeId ? 'Edit recipe' : 'New recipe',
          back: true,
          onBack: requestLeave,
        }}
        gap={space.lg}
        footer={
          <Button
            label={isSaving ? 'Saving…' : 'Save'}
            size="lg"
            fullWidth
            icon="checkmark"
            loading={isSaving}
            disabled={isSaving}
            accessibilityLabel={isSaving ? 'Saving recipe' : 'Save recipe'}
            onPress={save}
          />
        }
      >
        <TextField
          label="Title"
          accessibilityLabel="Title"
          value={recipe.title}
          error={errors.title}
          onChangeText={(t) => {
            setRecipe({ ...recipe, title: t });
            if (errors.title) setErrors((prev) => ({ ...prev, title: undefined }));
          }}
          onFocus={scrollFocusedInputIntoView}
        />
        <TextField
          label="Base servings"
          accessibilityLabel="Base servings"
          value={baseServingsInput ?? String(recipe.baseServings)}
          keyboardType="decimal-pad"
          onChangeText={(t) => {
            setBaseServingsInput(t);
            const parsed = Number(t);
            if (!Number.isFinite(parsed) || parsed <= 0) return;
            setRecipe({ ...recipe, baseServings: parsed });
          }}
          onBlur={() => {
            if (baseServingsInput === null) return;
            const parsed = Number(baseServingsInput);
            setRecipe({
              ...recipe,
              baseServings: Number.isFinite(parsed) && parsed > 0 ? parsed : 1,
            });
            setBaseServingsInput(null);
          }}
          onFocus={scrollFocusedInputIntoView}
        />

        <Disclosure
          label="More options"
          accessibilityLabel="Advanced options"
          open={showAdvanced}
          onToggle={() => setShowAdvanced((v) => !v)}
        />
        {showAdvanced ? (
          <>
            <TextField
              label="Source URL"
              accessibilityLabel="Source URL"
              value={recipe.sourceUrl}
              autoCapitalize="none"
              keyboardType="url"
              onChangeText={(t) => setRecipe({ ...recipe, sourceUrl: t })}
              onFocus={scrollFocusedInputIntoView}
            />
            <TextField
              label="Cuisine"
              accessibilityLabel="Cuisine"
              value={recipe.cuisine ?? ''}
              onChangeText={(t) => setRecipe({ ...recipe, cuisine: t || undefined })}
              onFocus={scrollFocusedInputIntoView}
            />
            <TextField
              label="Main image URI"
              hint="Optional"
              accessibilityLabel="Main image URI, optional"
              value={recipe.mainImageUri ?? ''}
              autoCapitalize="none"
              onChangeText={(t) =>
                setRecipe({ ...recipe, mainImageUri: t.trim() ? t.trim() : undefined })
              }
              onFocus={scrollFocusedInputIntoView}
            />
          </>
        ) : null}

        <Disclosure
          label="Paste raw recipe (AI)"
          accessibilityLabel="Paste and parse with AI"
          open={showPasteAi}
          onToggle={() => setShowPasteAi((v) => !v)}
        />
        {showPasteAi ? (
          <>
            <TextField
              accessibilityLabel="Recipe text to parse"
              hint="Paste ingredients and instructions in one block; we will split them into ingredients and steps."
              multiline
              value={rawPasteText}
              onChangeText={setRawPasteText}
              onFocus={scrollFocusedInputIntoView}
              placeholder="Paste anything: blog text, notes, a caption…"
            />
            <Button
              label="Parse with AI"
              icon="sparkles-outline"
              fullWidth
              loading={parseBusy}
              disabled={parseBusy}
              accessibilityLabel={parseBusy ? 'Parsing recipe text' : 'Parse pasted text'}
              onPress={runAiParse}
            />
          </>
        ) : null}

        <SectionHeader
          label="Ingredients"
          count={recipe.ingredients.length}
          open={showIngredients}
          onToggle={() => setShowIngredients((v) => !v)}
          onAdd={addIngredient}
          addLabel="Add ingredient"
          accessibilityLabel="Ingredients section"
        />

        {showIngredients
          ? recipe.ingredients.map((ing, idx) => {
              const isActive = activeIngredientId === ing.id;
              const isSectionHeading = isIngredientSectionHeading(ing);
              return (
                <View
                  key={ing.id}
                  style={{
                    borderWidth: 1,
                    borderColor: isActive ? colors.primary : colors.border,
                    borderRadius: radius.md,
                    padding: space.md,
                    gap: space.md,
                    backgroundColor: colors.surface,
                  }}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ingredient ${ing.name || 'untitled'}`}
                    accessibilityState={{ expanded: isActive }}
                    onPress={() => {
                      setActiveIngredientId(isActive ? null : ing.id);
                      if (
                        showUnitPickerForIngredientId &&
                        showUnitPickerForIngredientId !== ing.id
                      ) {
                        setShowUnitPickerForIngredientId(null);
                      }
                    }}
                    android_ripple={ripple(colors.ripple)}
                    style={({ pressed }) => [
                      {
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: space.sm,
                        minHeight: 32,
                      },
                      pressedStyle(pressed),
                    ]}
                  >
                    <Text
                      variant={isSectionHeading ? 'bodyStrong' : 'body'}
                      tone={isSectionHeading ? 'accent' : 'primary'}
                      style={{ flex: 1 }}
                    >
                      {formatIngredientPreview(ing)}
                    </Text>
                    <Ionicons
                      name={isActive ? 'chevron-up' : 'chevron-down'}
                      size={16}
                      color={colors.textSecondary}
                    />
                  </Pressable>

                  {isActive ? (
                    <>
                      <SwitchRow
                        label="Section heading"
                        description="No amount or unit"
                        value={isSectionHeading}
                        onValueChange={(asHeading) => {
                          const next = [...recipe.ingredients];
                          next[idx] = asHeading
                            ? {
                                ...ing,
                                amountMode: 'exact',
                                quantity: 0,
                                unit: null,
                                scalable: false,
                                notes: undefined,
                                isSectionHeading: true,
                              }
                            : {
                                ...ing,
                                amountMode: ing.amountMode === 'to_taste' ? 'exact' : ing.amountMode,
                                quantity: ing.quantity > 0 ? ing.quantity : 1,
                                unit: ing.unit ?? getDefaultIngredientUnit(ing.quantity > 0 ? ing.quantity : 1),
                                scalable: true,
                                isSectionHeading: false,
                              };
                          setRecipe({ ...recipe, ingredients: next });
                          setShowUnitPickerForIngredientId(null);
                          setIngredientQuantityInputs((prev) => {
                            const updated = { ...prev };
                            delete updated[ing.id];
                            return updated;
                          });
                        }}
                      />

                      {!isSectionHeading ? (
                        <SwitchRow
                          label="To taste"
                          description="No amount or unit"
                          value={ing.amountMode === 'to_taste'}
                          onValueChange={(toTaste) => {
                            const next = [...recipe.ingredients];
                            next[idx] = toTaste
                              ? {
                                  ...ing,
                                  amountMode: 'to_taste',
                                  quantity: 0,
                                  unit: null,
                                  scalable: false,
                                  isSectionHeading: false,
                                }
                              : { ...ing, amountMode: 'exact', scalable: true, isSectionHeading: false };
                            setRecipe({ ...recipe, ingredients: next });
                            setShowUnitPickerForIngredientId(null);
                            setIngredientQuantityInputs((prev) => {
                              const updated = { ...prev };
                              delete updated[ing.id];
                              return updated;
                            });
                          }}
                        />
                      ) : null}

                      {isSectionHeading ? (
                        <TextInput
                          accessibilityLabel="Section heading"
                          value={ing.name}
                          onChangeText={(t) => {
                            const next = [...recipe.ingredients];
                            next[idx] = { ...ing, name: t };
                            setRecipe({ ...recipe, ingredients: next });
                          }}
                          onFocus={scrollFocusedInputIntoView}
                          placeholder="Section title"
                          placeholderTextColor={colors.textSecondary}
                          style={inlineInputStyle}
                        />
                      ) : ing.amountMode === 'exact' ? (
                        <View style={{ flexDirection: 'row', gap: space.sm }}>
                          <TextInput
                            accessibilityLabel="Ingredient quantity"
                            value={ingredientQuantityInputs[ing.id] ?? String(ing.quantity)}
                            onChangeText={(t) => {
                              setIngredientQuantityInputs((prev) => ({ ...prev, [ing.id]: t }));
                              const parsed = parseQuantityInput(t);
                              if (parsed === null) return;
                              const next = [...recipe.ingredients];
                              next[idx] = {
                                ...ing,
                                quantity: parsed,
                                unit: getAutoAdjustedIngredientUnit(ing.unit, parsed),
                              };
                              setRecipe({ ...recipe, ingredients: next });
                            }}
                            onBlur={() => {
                              const raw = ingredientQuantityInputs[ing.id];
                              if (raw === undefined) return;
                              const parsed = parseQuantityInput(raw);
                              const next = [...recipe.ingredients];
                              next[idx] = {
                                ...ing,
                                quantity: parsed ?? 0,
                                unit:
                                  parsed === null
                                    ? ing.unit
                                    : getAutoAdjustedIngredientUnit(ing.unit, parsed),
                              };
                              setRecipe({ ...recipe, ingredients: next });
                              setIngredientQuantityInputs((prev) => {
                                const updated = { ...prev };
                                delete updated[ing.id];
                                return updated;
                              });
                            }}
                            onFocus={scrollFocusedInputIntoView}
                            keyboardType="decimal-pad"
                            placeholder="Qty"
                            placeholderTextColor={colors.textSecondary}
                            style={[inlineInputStyle, { width: 72, textAlign: 'center' }]}
                          />
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Unit: ${ing.unit ?? 'none'}`}
                            accessibilityHint="Opens the unit picker"
                            accessibilityState={{
                              expanded: showUnitPickerForIngredientId === ing.id,
                            }}
                            onPress={() =>
                              setShowUnitPickerForIngredientId((current) =>
                                current === ing.id ? null : ing.id
                              )
                            }
                            android_ripple={ripple(colors.ripple)}
                            style={({ pressed }) => [
                              inlineInputStyle,
                              {
                                minWidth: 84,
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: space.xs,
                                overflow: 'hidden',
                              },
                              pressedStyle(pressed),
                            ]}
                          >
                            <Text
                              variant="body"
                              tone={ing.unit ? 'primary' : 'secondary'}
                              numberOfLines={1}
                            >
                              {ing.unit ?? 'Unit'}
                            </Text>
                            <Ionicons
                              name="chevron-down"
                              size={14}
                              color={colors.textSecondary}
                            />
                          </Pressable>
                          <TextInput
                            accessibilityLabel="Ingredient name"
                            value={ing.name}
                            onChangeText={(t) => {
                              const next = [...recipe.ingredients];
                              next[idx] = { ...ing, name: t };
                              setRecipe({ ...recipe, ingredients: next });
                            }}
                            onFocus={scrollFocusedInputIntoView}
                            placeholder="Ingredient"
                            placeholderTextColor={colors.textSecondary}
                            style={[inlineInputStyle, { flex: 1 }]}
                          />
                        </View>
                      ) : (
                        <TextInput
                          accessibilityLabel="Ingredient name"
                          value={ing.name}
                          onChangeText={(t) => {
                            const next = [...recipe.ingredients];
                            next[idx] = { ...ing, name: t };
                            setRecipe({ ...recipe, ingredients: next });
                          }}
                          onFocus={scrollFocusedInputIntoView}
                          placeholder="Ingredient"
                          placeholderTextColor={colors.textSecondary}
                          style={inlineInputStyle}
                        />
                      )}

                      {ing.amountMode === 'exact' &&
                      !isSectionHeading &&
                      showUnitPickerForIngredientId === ing.id ? (
                        <View
                          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}
                        >
                          {COMMON_INGREDIENT_UNITS.map((option) => (
                            <Chip
                              key={option.label}
                              label={option.label}
                              active={(ing.unit ?? null) === option.value}
                              accessibilityLabel={`Use unit ${option.label}`}
                              accessibilityHint="Sets this ingredient's unit"
                              onPress={() => {
                                const next = [...recipe.ingredients];
                                next[idx] = { ...ing, unit: option.value };
                                setRecipe({ ...recipe, ingredients: next });
                                setShowUnitPickerForIngredientId(null);
                              }}
                            />
                          ))}
                        </View>
                      ) : null}

                      {ing.amountMode === 'exact' && !isSectionHeading ? (
                        <SwitchRow
                          label="Scales with servings"
                          value={ing.scalable}
                          onValueChange={(v) => {
                            const next = [...recipe.ingredients];
                            next[idx] = { ...ing, scalable: v };
                            setRecipe({ ...recipe, ingredients: next });
                          }}
                        />
                      ) : null}

                      <View
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <Button
                          label="Done"
                          variant="ghost"
                          accessibilityLabel="Done editing ingredient"
                          onPress={() => {
                            setActiveIngredientId(null);
                            setShowUnitPickerForIngredientId(null);
                          }}
                        />
                        <IconButton
                          icon="trash-outline"
                          variant="ghost"
                          accessibilityLabel={`Remove ingredient ${ing.name || 'untitled'}`}
                          onPress={() => removeIngredient(ing.id)}
                          style={{ backgroundColor: colors.destructiveSoft }}
                        />
                      </View>
                    </>
                  ) : null}
                </View>
              );
            })
          : null}

        {errors.ingredients ? (
          <Text variant="caption" tone="destructive">
            {errors.ingredients}
          </Text>
        ) : null}

        <SectionHeader
          label="Steps"
          count={recipe.steps.length}
          open={showSteps}
          onToggle={() => setShowSteps((v) => !v)}
          onAdd={addStep}
          addLabel="Add step"
          accessibilityLabel="Method section"
        />

        {showStepDragHint ? (
          <Text variant="caption" tone="secondary">
            Long press a step number and drag to reorder.
          </Text>
        ) : null}

        {showSteps ? (
          <DraggableFlatList
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
            renderItem={({ item, getIndex, drag, isActive }: RenderItemParams<Step>) => {
              const number = (getIndex() ?? 0) + 1;
              const editing = activeStepId === item.id;
              return (
                <View style={{ marginBottom: space.sm, opacity: isActive ? 0.85 : 1 }}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Step ${number}, drag handle`}
                    accessibilityHint="Long press and drag to reorder this step"
                    onLongPress={drag}
                    delayLongPress={180}
                    style={({ pressed }) => [
                      {
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: space.sm,
                        marginBottom: space.xs,
                      },
                      pressedStyle(pressed),
                    ]}
                  >
                    <View
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: radius.pill,
                        backgroundColor: colors.primarySoft,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text variant="overline" tone="onAccentSoft">
                        {number}
                      </Text>
                    </View>
                    <Ionicons name="reorder-two-outline" size={16} color={colors.textSecondary} />
                  </Pressable>

                  {editing ? (
                    <>
                      <TextInput
                        accessibilityLabel="Step instruction"
                        multiline
                        value={item.instruction}
                        onChangeText={(text) => updateStepInstruction(item.id, text)}
                        onFocus={scrollFocusedInputIntoView}
                        placeholder="Describe the step."
                        placeholderTextColor={colors.textSecondary}
                        style={[
                          inlineInputStyle,
                          {
                            minHeight: 88,
                            borderColor: colors.primary,
                            textAlignVertical: 'top',
                          },
                        ]}
                      />
                      <View
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginTop: space.xs,
                        }}
                      >
                        <Button
                          label="Done"
                          variant="ghost"
                          accessibilityLabel="Done editing step"
                          onPress={() => setActiveStepId(null)}
                        />
                        <IconButton
                          icon="trash-outline"
                          variant="ghost"
                          accessibilityLabel="Remove this step"
                          onPress={() => removeStep(item.id)}
                          style={{ backgroundColor: colors.destructiveSoft }}
                        />
                      </View>
                    </>
                  ) : (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Edit step ${number}`}
                      onPress={() => setActiveStepId(item.id)}
                      android_ripple={ripple(colors.ripple)}
                      style={({ pressed }) => [
                        {
                          minHeight: 52,
                          borderWidth: 1,
                          borderColor: colors.border,
                          borderRadius: radius.md,
                          padding: space.md,
                          justifyContent: 'center',
                          backgroundColor: colors.surface,
                          overflow: 'hidden',
                        },
                        pressedStyle(pressed),
                      ]}
                    >
                      <Text
                        variant="body"
                        tone={item.instruction ? 'primary' : 'secondary'}
                        numberOfLines={2}
                      >
                        {item.instruction || 'Tap to edit step'}
                      </Text>
                    </Pressable>
                  )}
                </View>
              );
            }}
          />
        ) : null}

        {errors.steps ? (
          <Text variant="caption" tone="destructive">
            {errors.steps}
          </Text>
        ) : null}

        <ConfirmDialog
          visible={showDiscardConfirm}
          destructive
          title="Discard changes?"
          message="Your edits to this recipe have not been saved."
          confirmLabel="Discard"
          cancelLabel="Keep editing"
          onConfirm={() => {
            setShowDiscardConfirm(false);
            setBaseline(null);
            leaveScreen();
          }}
          onCancel={() => setShowDiscardConfirm(false)}
        />
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
      </Screen>
    </KeyboardAvoidingView>
  );
}

/** A quiet expand/collapse row for optional groups of fields. */
function Disclosure({
  label,
  open,
  onToggle,
  accessibilityLabel,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  accessibilityLabel: string;
}) {
  const { colors } = useTheme();
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
        },
        pressedStyle(pressed),
      ]}
    >
      <Ionicons
        name={open ? 'chevron-down' : 'chevron-forward'}
        size={16}
        color={colors.textSecondary}
      />
      <Text variant="label" tone="secondary">
        {label}
      </Text>
    </Pressable>
  );
}

/** Collapsible group heading with an inline add button. */
function SectionHeader({
  label,
  count,
  open,
  onToggle,
  onAdd,
  addLabel,
  accessibilityLabel,
}: {
  label: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  onAdd: () => void;
  addLabel: string;
  accessibilityLabel: string;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: space.sm,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ expanded: open }}
        onPress={onToggle}
        style={({ pressed }) => [
          {
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.sm,
            minHeight: 44,
          },
          pressedStyle(pressed),
        ]}
      >
        <Ionicons
          name={open ? 'chevron-down' : 'chevron-forward'}
          size={16}
          color={colors.textPrimary}
        />
        <Text variant="heading">{label}</Text>
        <Text variant="caption" tone="secondary">
          {count}
        </Text>
      </Pressable>
      <Button label="Add" variant="ghost" icon="add" accessibilityLabel={addLabel} onPress={onAdd} />
    </View>
  );
}
