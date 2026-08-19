import { useTheme } from '@/theme/ThemeContext';
import { control, space } from '@/theme/tokens';
import { useRouter } from 'expo-router';
import {
  ScrollView,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton } from './IconButton';
import { Text } from './Text';

export type ScreenHeader = {
  title: string;
  /** Shows an inline back arrow to the left of the title. */
  back?: boolean;
  /** Overrides the default `router.back()`. */
  onBack?: () => void;
  /** Buttons pinned to the right of the title row. */
  actions?: React.ReactNode;
  /** Renders the title at display size. Reserved for the library home. */
  large?: boolean;
};

export type ScreenProps = {
  children: React.ReactNode;
  header?: ScreenHeader;
  /** Wraps the body in a `ScrollView`. */
  scroll?: boolean;
  /** Horizontal padding for the header and body. */
  gutter?: number;
  /** Vertical spacing between direct children of the body. */
  gap?: number;
  /** Pinned below the body, outside the scroll area. */
  footer?: React.ReactNode;
  /** Extra bottom padding on top of the safe-area inset — clear a FAB with this. */
  bottomInset?: number;
  scrollProps?: Omit<ScrollViewProps, 'contentContainerStyle' | 'style'>;
  /** Needed by `useKeyboardSafeScroll` to bring a focused input into view. */
  scrollRef?: React.Ref<ScrollView>;
  contentStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
};

/**
 * The shared screen shell: safe-area handling, background, gutter, header.
 *
 * Screens used to hand-roll this with an absolutely positioned `BackButton`
 * plus `paddingTop: 72` — a magic number that assumed a small status bar and
 * let the button overlap the title on devices with a taller inset. The header
 * here is laid out in flow, so it cannot collide with anything.
 */
export function Screen({
  children,
  header,
  scroll = false,
  gutter = space.xl,
  gap = space.lg,
  footer,
  bottomInset = 0,
  scrollProps,
  scrollRef,
  contentStyle,
  style,
}: ScreenProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const goBack = () => {
    if (header?.onBack) {
      header.onBack();
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const body = (
    <View
      style={[
        { gap, paddingHorizontal: gutter },
        // Without `scroll` the body owns the remaining height, so a child can
        // legitimately ask to fill it.
        scroll ? null : { flex: 1 },
        contentStyle,
      ]}
    >
      {children}
    </View>
  );

  return (
    <View
      style={[
        { flex: 1, backgroundColor: colors.background, paddingTop: insets.top },
        style,
      ]}
    >
      {header ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.md,
            paddingHorizontal: gutter,
            paddingTop: space.md,
            paddingBottom: space.md,
            minHeight: control.md,
          }}
        >
          {header.back ? (
            <IconButton
              icon="chevron-back"
              accessibilityLabel="Go back"
              onPress={goBack}
              variant="surface"
            />
          ) : null}
          <Text
            variant={header.large ? 'display' : 'title'}
            numberOfLines={1}
            style={{ flex: 1 }}
          >
            {header.title}
          </Text>
          {header.actions}
        </View>
      ) : null}

      {scroll ? (
        <ScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"
          {...scrollProps}
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingTop: header ? 0 : space.md,
            paddingBottom: insets.bottom + space.xxxl + bottomInset,
          }}
        >
          {body}
        </ScrollView>
      ) : (
        <View style={{ flex: 1, paddingTop: header ? 0 : space.md }}>{body}</View>
      )}

      {footer ? (
        <View
          style={{
            paddingHorizontal: gutter,
            paddingTop: space.md,
            paddingBottom: insets.bottom + space.md,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            backgroundColor: colors.surface,
          }}
        >
          {footer}
        </View>
      ) : null}
    </View>
  );
}
