import type { AppearanceMode, ThemeColors } from '@/theme/colors';
import { palette } from '@/theme/colors';
import React, { createContext, useContext, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { getAppearance, setAppearance as persistAppearance } from '@/lib/secrets';

type Ctx = {
  mode: AppearanceMode;
  resolved: 'light' | 'dark';
  colors: ThemeColors;
  setMode: (m: AppearanceMode) => Promise<void>;
};

const ThemeCtx = createContext<Ctx | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<AppearanceMode>('system');

  React.useEffect(() => {
    let cancel = false;
    (async () => {
      const stored = await getAppearance();
      if (!cancel && stored) setModeState(stored);
    })();
    return () => {
      cancel = true;
    };
  }, []);

  const resolved: 'light' | 'dark' =
    mode === 'system' ? (system === 'dark' ? 'dark' : 'light') : mode;

  const colors = palette[resolved];

  const setMode = async (m: AppearanceMode) => {
    setModeState(m);
    await persistAppearance(m);
  };

  const value = useMemo(
    () => ({ mode, resolved, colors, setMode }),
    [mode, resolved, colors]
  );

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme(): Ctx {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error('useTheme outside ThemeProvider');
  return ctx;
}
