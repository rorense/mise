import { saveRecipe } from '@/data/recipes';
import { AppDialog } from '@/components/AppDialog';
import { BackButton } from '@/components/BackButton';
import { newId } from '@/lib/id';
import { takeImportDraft } from '@/lib/importDraftStore';
import type { Recipe } from '@/types/recipe';
import { useTheme } from '@/theme/ThemeContext';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

export default function ImportPreviewScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const [draft, setDraft] = useState<Omit<Recipe, 'cookLogs'> | null>(() => takeImportDraft());
  const [ingredientText, setIngredientText] = useState(() =>
    (draft?.ingredients ?? [])
      .map((i) => `${i.quantity}|${i.unit ?? ''}|${i.name}|${i.scalable ? 'y' : 'n'}|${i.notes ?? ''}`)
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
      const [qtyRaw, unitRaw, nameRaw, scalableRaw, notesRaw] = line
        .split('|')
        .map((part) => part.trim());
      const existing = draft.ingredients[idx];
      const quantity = Number(qtyRaw);
      return {
        id: existing?.id ?? newId(),
        quantity: Number.isFinite(quantity) ? quantity : 0,
        unit: unitRaw ? unitRaw : null,
        name: nameRaw || existing?.name || '',
        notes: notesRaw ? notesRaw : undefined,
        scalable: (scalableRaw || 'y').toLowerCase() !== 'n',
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
    const next = lines.map((instruction, idx) => {
      const existing = draft.steps[idx];
      return {
        id: existing?.id ?? newId(),
        order: idx,
        instruction,
        scalableQuantities: existing?.scalableQuantities ?? [],
      };
    });
    return { ...draft, steps: next };
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BackButton />
      <ScrollView
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
      />
      <Field
        label="Base servings"
        value={String(draft.baseServings)}
        onChange={(t) => setDraft({ ...draft, baseServings: Number(t) || 1 })}
        colors={colors}
        keyboardType="decimal-pad"
      />
      <Field
        label="Cuisine"
        value={draft.cuisine ?? ''}
        onChange={(t) => setDraft({ ...draft, cuisine: t || undefined })}
        colors={colors}
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
      />
      <Text style={{ fontFamily: 'DMSans_500Medium', color: colors.textPrimary }}>
        Ingredients (qty|unit|name|y/n|notes)
      </Text>
      <TextInput
        multiline
        value={ingredientText}
        onChangeText={setIngredientText}
        onEndEditing={() => setDraft(parseIngredientLines())}
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
        multiline
        value={stepText}
        onChangeText={setStepText}
        onEndEditing={() => setDraft(parseStepLines())}
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
          onPress={async () => {
            const withIngredients = parseIngredientLines();
            const withSteps = {
              ...withIngredients,
              steps: parseStepLines().steps,
            };
            setDraft(withSteps);
            await saveRecipe(withSteps);
            router.replace(`/recipe/${withSteps.id}`);
          }}
          style={{
            backgroundColor: colors.primary,
            padding: 16,
            borderRadius: 14,
            alignItems: 'center',
            marginTop: 8,
          }}
        >
          <Text style={{ color: '#fff', fontFamily: 'DMSans_700Bold' }}>
            Save to library
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
  colors,
  keyboardType = 'default',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  colors: ReturnType<typeof useTheme>['colors'];
  keyboardType?: 'default' | 'decimal-pad';
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
        value={value}
        onChangeText={onChange}
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
