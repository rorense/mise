import { hitSlopFor, pressedStyle, ripple } from '@/components/ui/press';
import { control, radius, space } from '@/theme/tokens';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { Image, Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type FullscreenImageViewerProps = {
  imageUri: string | null;
  onClose: () => void;
};

// The lightbox is always black regardless of theme, so its chrome is defined
// here rather than coming from the palette — these are the only colours in the
// app that must not follow the appearance setting.
const CHROME_BG = 'rgba(0, 0, 0, 0.55)';
const CHROME_BORDER = 'rgba(255, 255, 255, 0.28)';
const CHROME_FG = '#FFFFFF';

export function FullscreenImageViewer({ imageUri, onClose }: FullscreenImageViewerProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={!!imageUri}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: '#000000' }}>
        <StatusBar hidden={!!imageUri} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close photo"
          onPress={onClose}
          hitSlop={hitSlopFor(control.sm)}
          android_ripple={ripple('rgba(255, 255, 255, 0.18)', true)}
          style={({ pressed }) => [
            {
              position: 'absolute',
              top: insets.top + space.md,
              right: space.lg,
              zIndex: 2,
              width: control.sm,
              height: control.sm,
              borderRadius: radius.pill,
              borderWidth: 1,
              borderColor: CHROME_BORDER,
              backgroundColor: CHROME_BG,
              alignItems: 'center',
              justifyContent: 'center',
            },
            pressedStyle(pressed),
          ]}
        >
          <Ionicons name="close" size={20} color={CHROME_FG} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Recipe photo, full screen"
          accessibilityHint="Tap anywhere to close"
          onPress={onClose}
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
        >
          {imageUri ? (
            <Image
              source={{ uri: imageUri }}
              resizeMode="contain"
              style={{ width: '100%', height: '100%' }}
            />
          ) : null}
        </Pressable>
      </View>
    </Modal>
  );
}
