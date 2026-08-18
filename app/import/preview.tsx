import { saveRecipe } from '@/data/recipes';
import { AppDialog } from '@/components/AppDialog';
import { BackButton } from '@/components/BackButton';
import { newId } from '@/lib/id';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { takeImportDraft } from '@/lib/importDraftStore';
import {
  KEYBOARD_AVOIDING_BEHAVIOR,
  KEYBOARD_VERTICAL_OFFSET,
  useKeyboardSafeScroll,
} from '@/lib/ui/keyboardSafe';
import type { Recipe } from '@/types/recipe';
import { useTheme } from '@/theme/ThemeContext';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  BackHandler,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

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
        <BackButton />
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

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={KEYBOARD_AVOIDING_BEHAVIOR}
      keyboardVerticalOffset={KEYBOARD_VERTICAL_OFFSET}
    >
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BackButton onPress={() => setShowDiscardConfirm(true)} />
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{ padding: 20, paddingTop: 72, gap: 12, paddingBottom: 40 }}
      >
      <Text style={{ fontFamily: 'Lora_700Bold', fontSize: 22, color: colors.textPrimary }}>
        Preview
      </Text>
      <Text style={{ fontFamily: 'DMSans_400Regular', color: colors.textSecondary }}>
        Review before saving. For deep edits, open manual form after save.
      </Text>
      <Field
        label="Title"
        value={draft.title}
        onChange={(t) => setDraft({ ...draft, title: t })}
        colors={colors}
        onFocus={scrollFocusedInputIntoView}
      />
      <Field
        label="Base servings"
        value={String(draft.baseServings)}
        onChange={(t) => setDraft({ ...draft, baseServings: Number(t) || 1 })}
        colors={colors}
        keyboardType="decimal-pad"
        onFocus={scrollFocusedInputIntoView}
      />
      <Field
        label="Cuisine"
        value={draft.cuisine ?? ''}
        onChange={(t) => setDraft({ ...draft, cuisine: t || undefined })}
        colors={colors}
        onFocus={scrollFocusedInputIntoView}
      />
      <Field
        label="Tags (comma separated)"
        value={draft.tags.join(', ')}
        onChange={(t) =>
          setDraft({
            ...draft,
            tags: t
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
          })
        }
        colors={colors}
        onFocus={scrollFocusedInputIntoView}
      />
      <Text style={{ fontFamily: 'DMSans_500Medium', color: colors.textPrimary }}>
        Ingredients (qty|unit|name|y/n|notes|exact/to_taste)
      </Text>
      <TextInput
        accessibilityLabel="Ingredients, one per line"
        multiline
        value={ingredientText}
        onChangeText={setIngredientText}
        onEndEditing={() => setDraft(parseIngredientLines())}
        onFocus={scrollFocusedInputIntoView}
        style={{
          minHeight: 140,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 12,
          padding: 12,
          fontFamily: 'DMSans_400Regular',
          color: colors.textPrimary,
          backgroundColor: colors.surface,
          textAlignVertical: 'top',
        }}
      />
      <Text style={{ fontFamily: 'DMSans_500Medium', color: colors.textPrimary }}>
        Steps (one per line)
      </Text>
      <TextInput
        accessibilityLabel="Method steps, one per line"
        multiline
        value={stepText}
        onChangeText={setStepText}
        onEndEditing={() => setDraft(parseStepLines())}
        onFocus={scrollFocusedInputIntoView}
        style={{
          minHeight: 140,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 12,
          padding: 12,
          fontFamily: 'DMSans_400Regular',
          color: colors.textPrimary,
          backgroundColor: colors.surface,
          textAlignVertical: 'top',
        }}
      />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isSaving ? 'Saving recipe' : 'Save recipe to library'}
          accessibilityState={{ disabled: isSaving, busy: isSaving }}
          disabled={isSaving}
          onPress={async () => {
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
              setSaveError(
                e instanceof Error ? e.message : 'Unknown error while saving.'
              );
            } finally {
              setIsSaving(false);
            }
          }}
          style={{
            backgroundColor: colors.primary,
            padding: 16,
            borderRadius: 14,
            alignItems: 'center',
            marginTop: 8,
            opacity: isSaving ? 0.6 : 1,
          }}
        >
          <Text style={{ color: '#fff', fontFamily: 'DMSans_700Bold' }}>
            {isSaving ? 'Saving…' : 'Save to library'}
          </Text>
        </Pressable>
      </ScrollView>
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
    </View>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  value,
  onChange,
  colors,
  keyboardType = 'default',
  onFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  colors: ReturnType<typeof useTheme>['colors'];
  keyboardType?: 'default' | 'decimal-pad';
  onFocus?: () => void;
}) {
  return (
    <View>
      <Text
        style={{
          fontFamily: 'DMSans_500Medium',
          marginBottom: 6,
          color: colors.textPrimary,
        }}
      >
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        onFocus={onFocus}
        keyboardType={keyboardType}
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
