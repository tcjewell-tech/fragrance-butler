import { groupVariants, normalizeForSearch } from '@/domain/search';
import type { Concentration, Fragrance } from '@/domain/types';

const f = (house: string, name: string, concentration: Concentration): Fragrance => ({
  id: `${house}-${name}-${concentration}`,
  house,
  name,
  concentration,
  notePyramid: { top: [], heart: [], base: [] },
  olfactoryFamily: null,
  longevity: null,
  projection: null,
  seasonAffinity: [],
  timeAffinity: [],
  marketedGender: null,
  releaseYear: null,
  referenceImages: [],
  isCustom: false,
});

test('normalizes accents, curly apostrophes, case, whitespace', () =>
  expect(normalizeForSearch('  Hermès  Terre d’Hermès ')).toBe("hermes terre d'hermes"));

test('normalizes other apostrophe-like characters', () =>
  expect(normalizeForSearch('L‘Eau `a´')).toBe("l'eau 'a'"));

test('groups concentration variants of the same house+name', () => {
  const g = groupVariants([f('Dior', 'Sauvage', 'EDT'), f('Dior', 'Sauvage', 'EDP'), f('Chanel', 'Bleu', 'EDP')]);
  expect(g).toHaveLength(2);
  expect(g.find((x) => x.name === 'Sauvage')!.variants.map((v) => v.concentration)).toEqual(['EDT', 'EDP']);
});

test('orders variants by concentration order regardless of input order', () => {
  const g = groupVariants([f('Dior', 'Sauvage', 'Extrait'), f('Dior', 'Sauvage', 'EDT'), f('Dior', 'Sauvage', 'Parfum')]);
  expect(g[0].variants.map((v) => v.concentration)).toEqual(['EDT', 'Parfum', 'Extrait']);
});

test('keeps first-seen group order and uses first variant house/name; matches accent-insensitively', () => {
  const g = groupVariants([f('Chanel', 'Bleu', 'EDP'), f('Hermès', 'Terre', 'EDT'), f('Hermes', 'TERRE', 'EDP')]);
  expect(g.map((x) => x.house)).toEqual(['Chanel', 'Hermès']);
  expect(g[1].name).toBe('Terre');
  expect(g[1].variants).toHaveLength(2);
});

test('empty input gives empty output', () => expect(groupVariants([])).toEqual([]));
