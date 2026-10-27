import { darkColors, lightColors } from '@/ui/theme';

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe.each([
  ['light', lightColors],
  ['dark', darkColors],
])('%s palette contrast (WCAG AA 4.5:1)', (_name, colors) => {
  test.each(['ink', 'brass', 'muted', 'danger'] as const)('%s on parchment', (key) => {
    expect(contrast(colors[key], colors.parchment)).toBeGreaterThanOrEqual(4.5);
  });

  test.each(['ink', 'brass', 'muted', 'danger'] as const)('%s on tray', (key) => {
    expect(contrast(colors[key], colors.tray)).toBeGreaterThanOrEqual(4.5);
  });

  test('parchment on brass (primary button label)', () => {
    expect(contrast(colors.parchment, colors.brass)).toBeGreaterThanOrEqual(4.5);
  });
});
