import { Button, Card, Screen, Text } from '@/components/ui';
import { setOnboarded } from '@/lib/secrets';
import { space } from '@/theme/tokens';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { useTheme } from '@/theme/ThemeContext';

const STEPS: { icon: keyof typeof Ionicons.glyphMap; text: string }[] = [
  { icon: 'download-outline', text: 'Add a recipe manually or import one from a web page.' },
  { icon: 'options-outline', text: 'Adjust servings and cook from the recipe detail page.' },
  { icon: 'camera-outline', text: 'Log each cook with a photo and notes.' },
];

export default function OnboardingScreen() {
  const { colors } = useTheme();
  const router = useRouter();

  const finish = async () => {
    await setOnboarded(true);
    router.replace('/');
  };

  return (
    <Screen
      scroll
      gutter={space.xxl}
      gap={space.lg}
      footer={
        <Button
          label="Start using Mise en"
          size="lg"
          fullWidth
          onPress={finish}
        />
      }
    >
      <View style={{ gap: space.md, paddingTop: space.xxl }}>
        <Text variant="display" accessibilityRole="header">
          Welcome to Mise en
        </Text>
        <Text variant="body" tone="secondary">
          Save recipes, scale servings smoothly, and keep a cook journal with
          photos and notes. Everything works offline except imports and AI chat.
        </Text>
      </View>

      <Card level={0} style={{ gap: space.md }}>
        <Text variant="overline" tone="secondary">
          Quick start
        </Text>
        {STEPS.map((step, i) => (
          <View
            key={step.icon}
            style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start' }}
          >
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: colors.primarySoft,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name={step.icon} size={15} color={colors.onPrimarySoft} />
            </View>
            <Text variant="body" tone="secondary" style={{ flex: 1 }}>
              {i + 1}. {step.text}
            </Text>
          </View>
        ))}
      </Card>
    </Screen>
  );
}
