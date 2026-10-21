import { useColorScheme } from 'react-native';

export interface Colors {
  /** Text. */
  ink: string;
  /** Background. */
  parchment: string;
  /** Accent. Also used for accent text, so it meets 4.5:1 on parchment. */
  brass: string;
  /** Secondary text. */
  muted: string;
  danger: string;
}

export const lightColors: Colors = {
  ink: '#1F1A14',
  parchment: '#F6F0E1',
  brass: '#7A5710',
  muted: '#6B6254',
  danger: '#A12B1E',
};

export const darkColors: Colors = {
  ink: '#F3ECDA',
  parchment: '#15120E',
  brass: '#D0A650',
  muted: '#A99F8C',
  danger: '#EE8A78',
};

export const fonts = {
  /** Display serif: the platform serif on iOS. No font assets are bundled. */
  display: 'Georgia',
  /** Body: the system default. */
  body: undefined,
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export interface Theme {
  colors: Colors;
  fonts: typeof fonts;
  spacing: typeof spacing;
}

export function useTheme(): Theme {
  const scheme = useColorScheme();
  return { colors: scheme === 'dark' ? darkColors : lightColors, fonts, spacing };
}
