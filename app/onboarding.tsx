import { BackButton } from '@/components/BackButton';
import { setOnboarded } from '@/lib/secrets';
import { useTheme } from '@/theme/ThemeContext';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

export default function OnboardingScreen() {
  const { colors } = useTheme();
  const router = useRouter();

  const finish = async () => {
    await setOnboarded(true);
    router.replace('/');
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BackButton />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 24, paddingTop: 80, gap: 16 }}
      >
        <Text
          style={{
            fontFamily: 'Lora_700Bold',
            fontSize: 32,
            color: colors.textPrimary,
          }}
        >
          Welcome to Mise
        </Text>
        <Text
          style={{
            fontFamily: 'DMSans_400Regular',
            color: colors.textSecondary,
            lineHeight: 22,
          }}
        >
          Save recipes, scale servings smoothly, and keep a cook journal with
          photos and notes. Everything works offline except imports and AI chat.
        </Text>

        <View
          style={{
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 16,
            padding: 14,
            gap: 8,
          }}
        >
          <Text style={{ fontFamily: 'DMSans_700Bold', color: colors.textPrimary }}>
            Quick start
          </Text>
          <Text style={{ fontFamily: 'DMSans_400Regular', color: colors.textSecondary }}>
            1. Add a recipe manually or import one from URL/Instagram/YouTube.
          </Text>
          <Text style={{ fontFamily: 'DMSans_400Regular', color: colors.textSecondary }}>
            2. Adjust servings and cook from the recipe detail page.
          </Text>
          <Text style={{ fontFamily: 'DMSans_400Regular', color: colors.textSecondary }}>
            3. Log each cook with a photo and notes.
          </Text>
        </View>

        <Pressable
          onPress={finish}
          style={{
            marginTop: 8,
            backgroundColor: colors.primary,
            paddingVertical: 14,
            borderRadius: 12,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontFamily: 'DMSans_700Bold' }}>
            Start using Mise
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
