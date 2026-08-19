import { getDatabase } from '@/db/client';
import { configureGlobalNotificationHandler } from '@/lib/timerNotifications';
import { palette } from '@/theme/colors';
import { ThemeProvider as AppThemeProvider, useTheme } from '@/theme/ThemeContext';
import { fontFamily, space, typeScale } from '@/theme/tokens';
import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans';
import { Lora_400Regular, Lora_700Bold } from '@expo-google-fonts/lora';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import {
  DarkTheme as NavigationDarkTheme,
  DefaultTheme as NavigationDefaultTheme,
  ThemeProvider as NavigationThemeProvider,
} from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Text, View, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

SplashScreen.preventAutoHideAsync();

function ThemedStack() {
  const { resolved, colors } = useTheme();
  const navigationTheme = useMemo(
    () => ({
      ...(resolved === 'dark' ? NavigationDarkTheme : NavigationDefaultTheme),
      colors: {
        ...(resolved === 'dark' ? NavigationDarkTheme.colors : NavigationDefaultTheme.colors),
        primary: colors.primary,
        background: colors.background,
        card: colors.surface,
        text: colors.textPrimary,
        border: colors.border,
      },
    }),
    [resolved, colors]
  );

  return (
    <>
      <StatusBar
        style={resolved === 'dark' ? 'light' : 'dark'}
        translucent={false}
        backgroundColor={colors.background}
      />
      <NavigationThemeProvider value={navigationTheme}>
        <Stack
          screenOptions={{
            headerShown: false,
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.textPrimary,
            headerTitleStyle: { fontFamily: fontFamily.serifBold },
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="index" />
        </Stack>
      </NavigationThemeProvider>
    </>
  );
}

/**
 * Shown while the fonts and the database open. It cannot use the theme — the
 * provider is not mounted yet — so it reads the palette directly off the
 * system colour scheme rather than hard-coding a second set of hexes that
 * would drift from the real one.
 */
function InitialLoadingScreen({ dark }: { dark: boolean }) {
  const colors = palette[dark ? 'dark' : 'light'];
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.background,
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.md,
      }}
    >
      <Image
        source={require('../assets/icon.png')}
        style={{ width: 84, height: 84, borderRadius: 20 }}
      />
      {/* Sizes from the type scale, but no `fontFamily`: this renders before
          `useFonts` resolves, and naming a family that has not loaded yet
          leaves the text blank on Android. */}
      <Text
        style={{
          fontSize: typeScale.display.fontSize,
          lineHeight: typeScale.display.lineHeight,
          color: colors.textPrimary,
        }}
      >
        Mise en
      </Text>
      <ActivityIndicator size="small" color={colors.primary} />
      <Text
        style={{
          fontSize: typeScale.caption.fontSize,
          lineHeight: typeScale.caption.lineHeight,
          color: colors.textSecondary,
        }}
      >
        Preparing your kitchen…
      </Text>
    </View>
  );
}

export default function RootLayout() {
  const system = useColorScheme();
  const [loaded] = useFonts({
    Lora_400Regular,
    Lora_700Bold,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
  });
  const [dbReady, setDbReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getDatabase()
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) {
          setDbReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void configureGlobalNotificationHandler();
  }, []);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  const appReady = loaded && dbReady;
  const bootDark = system === 'dark';

  return (
    <GestureHandlerRootView
      style={{
        flex: 1,
        backgroundColor: palette[bootDark ? 'dark' : 'light'].background,
      }}
    >
      {appReady ? (
        <AppThemeProvider>
          <BottomSheetModalProvider>
            <ThemedStack />
          </BottomSheetModalProvider>
        </AppThemeProvider>
      ) : (
        <InitialLoadingScreen dark={bootDark} />
      )}
    </GestureHandlerRootView>
  );
}
