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
import { getDatabase } from '@/db/client';
import {
  configureGlobalNotificationHandler,
  configureTimerNotifications,
} from '@/lib/timerNotifications';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Text, View, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { ThemeProvider as AppThemeProvider, useTheme } from '@/theme/ThemeContext';

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
            headerTitleStyle: { fontFamily: 'Lora_700Bold' },
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="index" />
        </Stack>
      </NavigationThemeProvider>
    </>
  );
}

function InitialLoadingScreen({ dark }: { dark: boolean }) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: dark ? '#0B0B0B' : '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Image
        source={require('../assets/icon.png')}
        style={{ width: 84, height: 84, borderRadius: 20, marginBottom: 14 }}
      />
      <Text
        style={{
          fontSize: 34,
          color: dark ? '#F2F2F2' : '#1A1A1A',
          marginBottom: 12,
        }}
      >
        Mise
      </Text>
      <ActivityIndicator size="small" color="#C4622D" />
      <Text
        style={{
          marginTop: 10,
          color: dark ? '#B3B3B3' : '#6B6B6B',
          fontSize: 13,
        }}
      >
        Preparing your kitchen...
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
  const [bootDelayDone, setBootDelayDone] = useState(false);

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
    void configureTimerNotifications();
  }, []);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setBootDelayDone(true);
    }, 700);
    return () => clearTimeout(timer);
  }, []);

  const appReady = loaded && dbReady && bootDelayDone;
  const bootDark = system === 'dark';

  return (
    <GestureHandlerRootView
      style={{ flex: 1, backgroundColor: bootDark ? '#0B0B0B' : '#FFFFFF' }}
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
