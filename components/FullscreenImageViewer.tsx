import { useTheme } from '@/theme/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { Image, Modal, Pressable, View } from 'react-native';

type FullscreenImageViewerProps = {
  imageUri: string | null;
  onClose: () => void;
};

export function FullscreenImageViewer({ imageUri, onClose }: FullscreenImageViewerProps) {
  const { colors } = useTheme();

  return (
    <Modal
      visible={!!imageUri}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <Pressable
          onPress={onClose}
          style={{
            position: 'absolute',
            top: 46,
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
        <Pressable onPress={onClose} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
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
