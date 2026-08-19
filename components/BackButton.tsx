import { IconButton } from '@/components/ui';
import { space } from '@/theme/tokens';
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * A back arrow that floats over the content beneath it. Use this only where the
 * screen opens on full-bleed media; anywhere else the inline header on
 * `components/ui/Screen` is the right choice, because it cannot overlap the
 * title.
 */
export function BackButton({
  topOffset = 0,
  onPress,
  /** Set when the button sits over a photo rather than the page background. */
  overImage = false,
}: {
  topOffset?: number;
  onPress?: () => void;
  overImage?: boolean;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handlePress = () => {
    if (onPress) {
      onPress();
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  return (
    <View
      style={{
        position: 'absolute',
        left: space.lg,
        top: insets.top + space.md + topOffset,
        zIndex: 50,
      }}
    >
      <IconButton
        icon="chevron-back"
        accessibilityLabel="Go back"
        onPress={handlePress}
        variant={overImage ? 'onImage' : 'surface'}
      />
    </View>
  );
}
