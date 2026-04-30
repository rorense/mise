import { useTheme } from '@/theme/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function BackButton({ topOffset = 0 }: { topOffset?: number }) {
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const handlePress = () => {
    const maybeRouter = router as unknown as {
      canGoBack?: () => boolean;
      back: () => void;
      replace: (href: string) => void;
    };
    if (maybeRouter.canGoBack?.()) {
      maybeRouter.back();
      return;
    }
    maybeRouter.replace('/');
  };

  return (
    <View
      style={{
        position: 'absolute',
        left: 16,
        top: insets.top + 10 + topOffset,
        zIndex: 50,
      }}
    >
      <Pressable
        onPress={handlePress}
        hitSlop={10}
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
      </Pressable>
    </View>
  );
}
