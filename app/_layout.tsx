import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans';
import { Lora_400Regular, Lora_700Bold } from '@expo-google-fonts/lora';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { getDatabase } from '@/db/client';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { ThemeProvider, useTheme } from '@/theme/ThemeContext';

SplashScreen.preventAutoHideAsync();

function ThemedStack() {
  const { resolved, colors } = useTheme();
  return (
    <>
      <StatusBar style={resolved === 'dark' ? 'light' : 'dark'} />
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
    </>
  );
}

function InitialLoadingScreen() {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#FAF8F5',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          fontSize: 34,
          color: '#1A1A1A',
          marginBottom: 14,
        }}
      >
        Mise
      </Text>
      <ActivityIndicator size="small" color="#C4622D" />
      <Text
        style={{
          marginTop: 10,
          color: '#6B6B6B',
          fontSize: 13,
        }}
      >
        Preparing your kitchen...
      </Text>
    </View>
  );
}

export default function RootLayout() {
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

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {appReady ? (
        <ThemeProvider>
          <BottomSheetModalProvider>
            <ThemedStack />
          </BottomSheetModalProvider>
        </ThemeProvider>
      ) : (
        <InitialLoadingScreen />
      )}
    </GestureHandlerRootView>
  );
}
