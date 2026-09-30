import { Button, Chip, IconButton, ScreenLoading, Text } from '@/components/ui';
import { pressedStyle, ripple } from '@/components/ui/press';
import { getRecipeById } from '@/data/recipes';
import { renderStepInstruction } from '@/domain/scaling';
import { extractStepTimerPresets, formatTimerRemaining } from '@/lib/stepTimers';
import { useStepTimer } from '@/lib/ui/stepTimer';
import { useTheme } from '@/theme/ThemeContext';
import { control, radius, space } from '@/theme/tokens';
import type { Recipe } from '@/types/recipe';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const RING_SIZE = 216;
const TICKS = 60;
const TICK_WIDTH = 3;

/**
 * Cooking mode: one step per screen, read from arm's length, driven with a
 * knuckle. The recipe screen stays the place to plan; this is for the bench.
 */
export default function CookModeScreen() {
  const { id, servings: servingsParam } = useLocalSearchParams<{
    id: string;
    servings?: string;
  }>();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [recipe, setRecipe] = useState<Recipe | null | undefined>(undefined);
  const [index, setIndex] = useState(0);
  const { timer, start, togglePause, stop } = useStepTimer();

  useEffect(() => {
    let cancelled = false;
    void getRecipeById(String(id)).then((r) => {
      if (!cancelled) setRecipe(r ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const steps = useMemo(
    () => (recipe ? [...recipe.steps].sort((a, b) => a.order - b.order) : []),
    [recipe]
  );

  if (recipe === undefined) return <ScreenLoading />;

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (!recipe || steps.length === 0) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background,
          alignItems: 'center',
          justifyContent: 'center',
          gap: space.lg,
          padding: space.xxl,
        }}
      >
        <Text variant="heading" style={{ textAlign: 'center' }}>
          This recipe has no method steps yet
        </Text>
        <Button label="Back to recipe" onPress={close} />
      </View>
    );
  }

  const servings = Number(servingsParam) > 0 ? Number(servingsParam) : recipe.baseServings;
  const step = steps[index];
  const isLast = index === steps.length - 1;
  const presets = extractStepTimerPresets(step.instruction);
  const stepTimer = timer?.stepId === step.id ? timer : null;
  const otherTimer = timer && !stepTimer ? timer : null;
  const otherTimerIndex = otherTimer ? steps.findIndex((s) => s.id === otherTimer.stepId) : -1;

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.background,
        paddingTop: insets.top + space.sm,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.md,
          paddingHorizontal: space.lg,
        }}
      >
        <IconButton
          icon="close"
          accessibilityLabel="Leave cooking mode"
          size={control.md}
          onPress={close}
        />
        <View style={{ flex: 1, gap: space.sm }}>
          <Text variant="caption" tone="secondary">
            Step {index + 1} of {steps.length}
          </Text>
          <View style={{ flexDirection: 'row', gap: space.xs }}>
            {steps.map((s, i) => (
              <View
                key={s.id}
                style={{
                  flex: 1,
                  height: space.xs,
                  borderRadius: radius.pill,
                  backgroundColor:
                    i === index
                      ? colors.primary
                      : i < index
                        ? colors.borderStrong
                        : colors.surfaceMuted,
                }}
              />
            ))}
          </View>
        </View>
      </View>

      {otherTimer ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${otherTimer.label}, ${formatTimerRemaining(otherTimer.remainingSeconds)} left`}
          accessibilityHint="Goes to that step"
          onPress={() => otherTimerIndex >= 0 && setIndex(otherTimerIndex)}
          android_ripple={ripple(colors.ripple)}
          style={({ pressed }) => [
            {
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.sm,
              alignSelf: 'flex-start',
              marginHorizontal: space.lg,
              marginTop: space.md,
              paddingHorizontal: space.md,
              minHeight: control.sm,
              borderRadius: radius.pill,
              backgroundColor: colors.primarySoft,
              overflow: 'hidden',
            },
            pressedStyle(pressed),
          ]}
        >
          <Text variant="captionStrong" tone="onAccentSoft">
            {otherTimer.label} · {formatTimerRemaining(otherTimer.remainingSeconds)}
          </Text>
        </Pressable>
      ) : null}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: space.lg,
          paddingTop: space.xl,
          paddingBottom: space.xxxl,
          gap: space.xxl,
        }}
      >
        <Text variant="title" accessibilityLiveRegion="polite">
          {renderStepInstruction(step, recipe.baseServings, servings)}
        </Text>

        {presets.length > 0 ? (
          <View style={{ alignItems: 'center', gap: space.lg }}>
            <View style={{ width: RING_SIZE, height: RING_SIZE }}>
              <TimerRing
                fraction={stepTimer ? stepTimer.remainingSeconds / stepTimer.totalSeconds : 1}
                active={Boolean(stepTimer)}
              />
              <View
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: 0,
                  right: 0,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text
                  variant="numeral"
                  accessibilityLabel={
                    stepTimer
                      ? `${formatTimerRemaining(stepTimer.remainingSeconds)} left`
                      : `${presets[0].label} timer, not started`
                  }
                >
                  {formatTimerRemaining(stepTimer ? stepTimer.remainingSeconds : presets[0].seconds)}
                </Text>
                <Text variant="caption" tone="secondary">
                  {stepTimer
                    ? stepTimer.isPaused
                      ? 'Paused'
                      : `of ${formatTimerRemaining(stepTimer.totalSeconds)}`
                    : presets[0].label}
                </Text>
              </View>
            </View>

            {stepTimer ? (
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <Button
                  label={stepTimer.isPaused ? 'Resume' : 'Pause'}
                  icon={stepTimer.isPaused ? 'play' : 'pause'}
                  variant="secondary"
                  onPress={togglePause}
                />
                <Button label="Stop" icon="stop" variant="secondary" onPress={stop} />
              </View>
            ) : (
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  justifyContent: 'center',
                  gap: space.sm,
                }}
              >
                {presets.map((preset) => (
                  <Chip
                    key={preset.key}
                    label={`Start ${preset.label}`}
                    icon="timer-outline"
                    accessibilityLabel={`Start ${preset.label} timer`}
                    accessibilityHint="Starts a countdown timer"
                    onPress={() => start(step.id, `Step ${index + 1} · ${preset.label}`, preset.seconds)}
                  />
                ))}
              </View>
            )}
          </View>
        ) : null}
      </ScrollView>

      <View
        style={{
          flexDirection: 'row',
          gap: space.sm,
          paddingHorizontal: space.lg,
          paddingTop: space.md,
          paddingBottom: insets.bottom + space.lg,
        }}
      >
        <Button
          label="Back"
          icon="chevron-back"
          variant="secondary"
          size="lg"
          disabled={index === 0}
          accessibilityLabel="Previous step"
          onPress={() => setIndex((i) => Math.max(0, i - 1))}
          style={{ flex: 1, minHeight: control.xl }}
        />
        <Button
          label={isLast ? 'Finish' : 'Next step'}
          icon={isLast ? 'checkmark' : 'chevron-forward'}
          size="lg"
          accessibilityHint={isLast ? 'Leaves cooking mode' : undefined}
          onPress={() => (isLast ? close() : setIndex((i) => i + 1))}
          style={{ flex: 2, minHeight: control.xl }}
        />
      </View>

    </View>
  );
}

/**
 * A dial of 60 ticks that empties clockwise as time runs down. Plain views,
 * rotated about the centre: no SVG dependency, so no native rebuild.
 */
function TimerRing({ fraction, active }: { fraction: number; active: boolean }) {
  const { colors } = useTheme();
  const lit = Math.round(Math.max(0, Math.min(1, fraction)) * TICKS);
  return (
    <>
      {Array.from({ length: TICKS }, (_, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: RING_SIZE / 2 - TICK_WIDTH / 2,
            top: 0,
            width: TICK_WIDTH,
            height: RING_SIZE,
            transform: [{ rotate: `${i * (360 / TICKS)}deg` }],
          }}
        >
          <View
            style={{
              width: TICK_WIDTH,
              height: i % 5 === 0 ? space.lg : space.md,
              borderRadius: radius.pill,
              backgroundColor:
                i < lit ? (active ? colors.primary : colors.borderStrong) : colors.surfaceMuted,
            }}
          />
        </View>
      ))}
    </>
  );
}
