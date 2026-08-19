import { Button, Chip, Text } from '@/components/ui';
import { recipeToChatSystemPrompt } from '@/lib/chatPrompt';
import { llmCompletion, type LlmMessage } from '@/lib/llm';
import type { AiProvider } from '@/lib/secrets';
import { useTheme } from '@/theme/ThemeContext';
import { radius, space, typeScale } from '@/theme/tokens';
import type { Recipe } from '@/types/recipe';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetTextInput,
} from '@gorhom/bottom-sheet';
import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type RecipeChatSheetRef = {
  present: (
    recipe: Recipe,
    servings: number,
    provider: AiProvider,
    apiKey: string
  ) => void;
};

/** Height of the pinned composer, so the scroll area can clear it. */
const COMPOSER_HEIGHT = 108;

export const RecipeChatSheet = forwardRef<RecipeChatSheetRef>(function RecipeChatSheet(_, ref) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const modalRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ['55%', '90%'], []);
  const [messages, setMessages] = useState<LlmMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const keyRef = useRef('');
  const providerRef = useRef<AiProvider>('openai');
  const [ctx, setCtx] = useState<{ recipe: Recipe; servings: number } | null>(null);

  const renderBackdrop = useCallback(
    (props: React.ComponentProps<typeof BottomSheetBackdrop>) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
    ),
    []
  );

  useImperativeHandle(ref, () => ({
    present(recipe, servings, provider, key) {
      keyRef.current = key;
      providerRef.current = provider;
      setCtx({ recipe, servings });
      setMessages([]);
      setInput('');
      modalRef.current?.present();
    },
  }));

  const send = async (text: string) => {
    const trimmed = text.trim();
    // `busy` guard: without it, repeated taps fire concurrent requests whose
    // replies append out of order.
    if (!trimmed || !ctx || busy) return;
    const sys = recipeToChatSystemPrompt(ctx.recipe, ctx.servings);
    const nextUser: LlmMessage = { role: 'user', content: trimmed };
    const history = [...messages, nextUser].slice(-20);
    setMessages([...messages, nextUser]);
    setInput('');
    setBusy(true);
    try {
      const reply = await llmCompletion(
        providerRef.current,
        keyRef.current,
        [{ role: 'system', content: sys }, ...history]
      );
      setMessages((m) => [...m, { role: 'assistant', content: reply }]);
    } catch (error) {
      const text =
        error instanceof Error
          ? error.message
          : 'Request failed. Please try again.';
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          content: `I could not answer right now: ${text}`,
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const suggestions =
    ctx?.recipe.title.toLowerCase().includes('bread') ?? false
      ? ['Can I freeze the dough?', 'Why rest the dough?', 'Whole-wheat swap?']
      : ['Good substitutions?', 'Make it dairy-free?', "What does 'fold' mean here?"];

  const sendDisabled = busy || input.trim().length === 0;

  return (
    <BottomSheetModal
      ref={modalRef}
      index={0}
      snapPoints={snapPoints}
      backdropComponent={renderBackdrop}
      onDismiss={() => {
        setMessages([]);
        setCtx(null);
      }}
      backgroundStyle={{ backgroundColor: colors.surface }}
      handleIndicatorStyle={{ backgroundColor: colors.borderStrong }}
    >
      <BottomSheetScrollView
        contentContainerStyle={{
          padding: space.lg,
          gap: space.sm,
          paddingBottom: COMPOSER_HEIGHT + insets.bottom,
        }}
      >
        <Text variant="heading" accessibilityRole="header">
          Cooking assistant
        </Text>
        <Text variant="caption" tone="secondary">
          Scoped to this recipe. Session clears when you close the sheet.
        </Text>

        {messages.length === 0 ? (
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: space.sm,
              marginVertical: space.sm,
            }}
          >
            {suggestions.map((s) => (
              <Chip
                key={s}
                label={s}
                accessibilityHint="Sends this question to the assistant"
                onPress={() => send(s)}
              />
            ))}
          </View>
        ) : null}

        {messages.map((m, idx) => {
          const fromUser = m.role === 'user';
          return (
            <View
              key={idx}
              accessible
              accessibilityLabel={`${fromUser ? 'You' : 'Assistant'}: ${m.content}`}
              style={{
                alignSelf: fromUser ? 'flex-end' : 'flex-start',
                backgroundColor: fromUser ? colors.primarySoft : colors.surfaceMuted,
                padding: space.md,
                // Squaring off the corner nearest the speaker is what makes the
                // two sides readable at a glance without a label.
                borderRadius: radius.lg,
                borderBottomRightRadius: fromUser ? radius.xs : radius.lg,
                borderBottomLeftRadius: fromUser ? radius.lg : radius.xs,
                maxWidth: '90%',
                borderWidth: 1,
                borderColor: fromUser ? 'transparent' : colors.border,
              }}
            >
              <Text variant="body" tone={fromUser ? 'onAccentSoft' : 'primary'}>
                {m.content}
              </Text>
            </View>
          );
        })}

        {busy ? (
          <ActivityIndicator color={colors.primary} style={{ alignSelf: 'flex-start' }} />
        ) : null}
      </BottomSheetScrollView>

      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          flexDirection: 'row',
          gap: space.sm,
          alignItems: 'flex-end',
          paddingHorizontal: space.lg,
          paddingTop: space.md,
          paddingBottom: insets.bottom + space.md,
          backgroundColor: colors.surface,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        }}
      >
        <BottomSheetTextInput
          accessibilityLabel="Ask about this recipe"
          value={input}
          onChangeText={setInput}
          placeholder="Ask about this recipe…"
          placeholderTextColor={colors.textSecondary}
          multiline
          style={{
            ...typeScale.body,
            flex: 1,
            maxHeight: 96,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: radius.md,
            paddingHorizontal: space.md,
            paddingVertical: space.md,
            color: colors.textPrimary,
            backgroundColor: colors.background,
          }}
        />
        <Button
          label="Send"
          onPress={() => send(input)}
          disabled={sendDisabled}
          loading={busy}
          accessibilityLabel="Send message"
        />
      </View>
    </BottomSheetModal>
  );
});
