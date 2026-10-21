import { readFileSync } from 'fs';
import { join } from 'path';
import { darkColors, lightColors } from '@/ui/theme';

type PluginEntry = string | [string, Record<string, unknown>];
const config = JSON.parse(readFileSync(join(__dirname, '../app.json'), 'utf8')) as {
  expo: { plugins: PluginEntry[] };
};

describe('app.json splash screen', () => {
  const entry = config.expo.plugins.find((p): p is [string, Record<string, unknown>] => Array.isArray(p) && p[0] === 'expo-splash-screen');
  const splash = entry?.[1] as { backgroundColor?: string; dark?: { backgroundColor?: string } } | undefined;

  it('uses the theme parchment in light mode, not the Expo template blue', () => {
    expect(splash?.backgroundColor).toBe(lightColors.parchment);
  });

  it('uses the theme ink-dark background in dark mode', () => {
    expect(splash?.dark?.backgroundColor).toBe(darkColors.parchment);
  });
});
