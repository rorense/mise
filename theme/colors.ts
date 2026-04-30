export type AppearanceMode = 'light' | 'dark' | 'system';

export const palette = {
  light: {
    background: '#FAF8F5',
    surface: '#FFFFFF',
    primary: '#C4622D',
    textPrimary: '#1A1A1A',
    textSecondary: '#6B6B6B',
    border: '#EBEBEB',
    destructive: '#D93025',
  },
  dark: {
    background: '#121211',
    surface: '#1E1E1C',
    primary: '#D4783D',
    textPrimary: '#F2F0EC',
    textSecondary: '#A8A7A2',
    border: '#33322E',
    destructive: '#F28E86',
  },
} as const;

export type ThemeColors =
  | (typeof palette)['light']
  | (typeof palette)['dark'];
