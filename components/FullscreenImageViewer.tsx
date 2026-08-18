import { useTheme } from '@/theme/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { Image, Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type FullscreenImageViewerProps = {
  imageUri: string | null;
  onClose: () => void;
};

export function FullscreenImageViewer({ imageUri, onClose }: FullscreenImageViewerProps) {
  const { colors } = useTheme();
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
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <StatusBar hidden={!!imageUri} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close photo"
          onPress={onClose}
          style={{
            position: 'absolute',
            top: insets.top + 12,
            right: 18,
            zIndex: 2,
            width: 38,
            height: 38,
            borderRadius: 19,
            borderWidth: 1,
            borderColor: '#ffffff44',
            backgroundColor: '#00000088',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="close" size={20} color="#fff" />
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
          ) : (
            <View style={{ width: 1, height: 1, backgroundColor: colors.background }} />
          )}
        </Pressable>
      </View>
    </Modal>
  );
}
