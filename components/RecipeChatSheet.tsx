import { recipeToChatSystemPrompt } from '@/lib/chatPrompt';
import { chatCompletion, type ChatMessage } from '@/lib/openai';
import type { Recipe } from '@/types/recipe';
import { useTheme } from '@/theme/ThemeContext';
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

export type RecipeChatSheetRef = {
  present: (recipe: Recipe, servings: number, apiKey: string) => void;
};

export const RecipeChatSheet = forwardRef<RecipeChatSheetRef>(function RecipeChatSheet(_, ref) {
  const { colors } = useTheme();
  const modalRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ['55%', '90%'], []);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const keyRef = useRef('');
  const [ctx, setCtx] = useState<{ recipe: Recipe; servings: number } | null>(null);

  const renderBackdrop = useCallback(
    (props: React.ComponentProps<typeof BottomSheetBackdrop>) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
    ),
    []
  );

  useImperativeHandle(ref, () => ({
    present(recipe, servings, key) {
      keyRef.current = key;
      setCtx({ recipe, servings });
      setMessages([]);
      setInput('');
      modalRef.current?.present();
    },
  }));

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || !ctx) return;
    const sys = recipeToChatSystemPrompt(ctx.recipe, ctx.servings);
    const nextUser: ChatMessage = { role: 'user', content: trimmed };
    const history = [...messages, nextUser].slice(-20);
    setMessages([...messages, nextUser]);
    setInput('');
    setBusy(true);
    try {
      const reply = await chatCompletion(keyRef.current, [
        { role: 'system', content: sys },
        ...history,
      ]);
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
      handleIndicatorStyle={{ backgroundColor: colors.border }}
    >
      <BottomSheetScrollView contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 120 }}>
        <Text style={{ fontFamily: 'Lora_700Bold', fontSize: 18, color: colors.textPrimary }}>
          Cooking assistant
        </Text>
        <Text style={{ fontFamily: 'DMSans_400Regular', color: colors.textSecondary }}>
          Scoped to this recipe. Session clears when you close the sheet.
        </Text>
        {messages.length === 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 }}>
            {suggestions.map((s: string, i: number) => (
              <Pressable
                key={i}
                onPress={() => send(s)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 999,
                  backgroundColor: colors.background,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Text style={{ color: colors.textPrimary, fontFamily: 'DMSans_400Regular' }}>{s}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {messages.map((m, idx) => (
          <View
            key={idx}
            style={{
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              backgroundColor: m.role === 'user' ? colors.primary + '22' : colors.background,
              padding: 12,
              borderRadius: 14,
              maxWidth: '90%',
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text style={{ fontFamily: 'DMSans_400Regular', color: colors.textPrimary }}>{m.content}</Text>
          </View>
        ))}
        {busy ? <ActivityIndicator color={colors.primary} /> : null}
      </BottomSheetScrollView>
      <View
        style={{
          position: 'absolute',
          left: 12,
          right: 12,
          bottom: 12,
          flexDirection: 'row',
          gap: 8,
          alignItems: 'center',
        }}
      >
        <BottomSheetTextInput
          value={input}
          onChangeText={setInput}
          placeholder="Ask about this recipe…"
          placeholderTextColor={colors.textSecondary}
          style={{
            flex: 1,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 12,
            paddingHorizontal: 12,
            paddingVertical: 10,
            fontFamily: 'DMSans_400Regular',
            color: colors.textPrimary,
            backgroundColor: colors.surface,
          }}
        />
        <Pressable
          onPress={() => send(input)}
          style={{
            paddingHorizontal: 16,
            paddingVertical: 12,
            backgroundColor: colors.primary,
            borderRadius: 12,
          }}
        >
          <Text style={{ color: '#fff', fontFamily: 'DMSans_700Bold' }}>Send</Text>
        </Pressable>
      </View>
    </BottomSheetModal>
  );
});
