import { useTheme } from '@/theme/ThemeContext';
import { ActivityIndicator, View } from 'react-native';

/**
 * The full-screen spinner a screen shows while its first load resolves. It
 * paints the page background rather than sitting transparent, so the hand-off
 * to the loaded screen is not a colour flash.
 */
export function ScreenLoading() {
  const { colors } = useTheme();
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
