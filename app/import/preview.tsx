import { AppDialog } from '@/components/AppDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button, Screen, Text, TextField } from '@/components/ui';
import { saveRecipe } from '@/data/recipes';
import { newId } from '@/lib/id';
import { takeImportDraft } from '@/lib/importDraftStore';
import {
  KEYBOARD_AVOIDING_BEHAVIOR,
  KEYBOARD_VERTICAL_OFFSET,
  useKeyboardSafeScroll,
} from '@/lib/ui/keyboardSafe';
import { useTheme } from '@/theme/ThemeContext';
import { space } from '@/theme/tokens';
import type { Recipe } from '@/types/recipe';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { BackHandler, KeyboardAvoidingView, ScrollView, View } from 'react-native';

export default function ImportPreviewScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { scrollRef, scrollFocusedInputIntoView } = useKeyboardSafeScroll<ScrollView>();
  const [draft, setDraft] = useState<Omit<Recipe, 'cookLogs'> | null>(() => takeImportDraft());
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const leaveScreen = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  // Leaving here throws away a whole imported recipe, so it gets the same
  // confirmation as the editor.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setShowDiscardConfirm(true);
      return true;
    });
    return () => subscription.remove();
  }, []);

  const [ingredientText, setIngredientText] = useState(() =>
    (draft?.ingredients ?? [])
      .map(
        (i) =>
          `${i.quantity}|${i.unit ?? ''}|${i.name}|${i.scalable ? 'y' : 'n'}|${i.notes ?? ''}|${i.amountMode ?? 'exact'}`
      )
      .join('\n')
  );
  const [stepText, setStepText] = useState(() =>
    (draft?.steps ?? []).map((s) => s.instruction).join('\n')
  );

  if (!draft) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <AppDialog
          visible
          title="Nothing to preview"
          message="Go back and import again."
          actions={[
            {
              label: 'OK',
              variant: 'primary',
              onPress: () => router.back(),
            },
          ]}
          onClose={() => {
            router.back();
          }}
        />
      </View>
    );
  }

  const parseIngredientLines = () => {
    const lines = ingredientText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const next = lines.map((line, idx) => {
      const [quantityRaw, unitTextRaw, ingredientNameRaw, ingredientScalableRaw, ingredientNotesRaw, modeRaw] = line
        .split('|')
        .map((part) => part.trim());
      const existing = draft.ingredients[idx];
      const quantity = Number(quantityRaw);
      const toTaste =
        (modeRaw ?? 'exact') === 'to_taste' ||
        /to taste/i.test(ingredientNameRaw) ||
        /to taste/i.test(ingredientNotesRaw ?? '');
      const amountMode: 'to_taste' | 'exact' = toTaste ? 'to_taste' : 'exact';
      return {
        id: existing?.id ?? newId(),
        quantity: toTaste ? 0 : Number.isFinite(quantity) ? quantity : 0,
        unit: toTaste ? null : unitTextRaw ? unitTextRaw : null,
        name: ingredientNameRaw || existing?.name || '',
        notes: ingredientNotesRaw ? ingredientNotesRaw : undefined,
        scalable: toTaste ? false : (ingredientScalableRaw || 'y').toLowerCase() !== 'n',
        amountMode,
        sortOrder: idx,
      };
    });
    return { ...draft, ingredients: next };
  };

  const parseStepLines = () => {
    const lines = stepText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    // Placeholders belong to the text they appear in, not to a row position.
    // Matching by index reattached them to whichever line happened to land at
    // that offset once a line was inserted or deleted.
    const allQuantities = draft.steps.flatMap((step) => step.scalableQuantities);
    const next = lines.map((instruction, idx) => ({
      id: draft.steps[idx]?.id ?? newId(),
      order: idx,
      instruction,
      scalableQuantities: allQuantities.filter((quantity) =>
        instruction.includes(quantity.placeholder)
      ),
    }));
    return { ...draft, steps: next };
  };

  const save = async () => {
    // saveRecipe opens its own transaction, and SQLite has no nested
    // transactions — a second tap mid-save fails the whole write.
    if (isSaving) return;
    setIsSaving(true);
    const withIngredients = parseIngredientLines();
    const withSteps = {
      ...withIngredients,
      steps: parseStepLines().steps,
    };
    setDraft(withSteps);
    try {
      await saveRecipe(withSteps);
      router.replace(`/recipe/${withSteps.id}`);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Unknown error while saving.');
    } finally {
      setIsSaving(false);
    }
  };

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
          title: 'Preview',
          back: true,
          onBack: () => setShowDiscardConfirm(true),
        }}
        gap={space.lg}
        footer={
          <Button
            label={isSaving ? 'Saving…' : 'Save to library'}
            size="lg"
            fullWidth
            icon="checkmark"
            loading={isSaving}
            disabled={isSaving}
            accessibilityLabel={isSaving ? 'Saving recipe' : 'Save recipe to library'}
            onPress={save}
          />
        }
      >
        <Text variant="body" tone="secondary">
          Review before saving. For deeper edits, open the manual form after saving.
        </Text>

        <TextField
          label="Title"
          accessibilityLabel="Title"
          value={draft.title}
          onChangeText={(t) => setDraft({ ...draft, title: t })}
          onFocus={scrollFocusedInputIntoView}
        />
        <TextField
          label="Base servings"
          accessibilityLabel="Base servings"
          value={String(draft.baseServings)}
          onChangeText={(t) => setDraft({ ...draft, baseServings: Number(t) || 1 })}
          keyboardType="decimal-pad"
          onFocus={scrollFocusedInputIntoView}
        />
        <TextField
          label="Cuisine"
          accessibilityLabel="Cuisine"
          value={draft.cuisine ?? ''}
          onChangeText={(t) => setDraft({ ...draft, cuisine: t || undefined })}
          onFocus={scrollFocusedInputIntoView}
        />
        <TextField
          label="Tags"
          hint="Separate with commas"
          accessibilityLabel="Tags, comma separated"
          value={draft.tags.join(', ')}
          onChangeText={(t) =>
            setDraft({
              ...draft,
              tags: t
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
          onFocus={scrollFocusedInputIntoView}
        />

        <TextField
          label="Ingredients"
          hint="One per line: qty | unit | name | y/n scalable | notes | exact/to_taste"
          accessibilityLabel="Ingredients, one per line"
          multiline
          value={ingredientText}
          onChangeText={setIngredientText}
          onEndEditing={() => setDraft(parseIngredientLines())}
          onFocus={scrollFocusedInputIntoView}
        />
        <TextField
          label="Steps"
          hint="One per line"
          accessibilityLabel="Method steps, one per line"
          multiline
          value={stepText}
          onChangeText={setStepText}
          onEndEditing={() => setDraft(parseStepLines())}
          onFocus={scrollFocusedInputIntoView}
        />

        <ConfirmDialog
          visible={showDiscardConfirm}
          destructive
          title="Discard this import?"
          message="The imported recipe has not been saved to your library."
          confirmLabel="Discard"
          cancelLabel="Keep editing"
          onConfirm={() => {
            setShowDiscardConfirm(false);
            leaveScreen();
          }}
          onCancel={() => setShowDiscardConfirm(false)}
        />
        <AppDialog
          visible={saveError !== null}
          title="Could not save recipe"
          message={saveError ?? ''}
          actions={[{ label: 'OK', variant: 'primary' }]}
          onClose={() => setSaveError(null)}
        />
      </Screen>
    </KeyboardAvoidingView>
  );
}
