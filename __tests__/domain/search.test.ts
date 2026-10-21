import { readFileSync } from 'fs';
import { join } from 'path';
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

// The same input and expected string are asserted in supabase/tests/0002_search.test.sql, so the
// app and the database cannot drift apart (Ruling R1).
const PARITY_INPUT = 'Cœur Œillet Æther Ørsted Straße Łódź \ufb01g “quoted” Hermès Terre d’Hermès';
const PARITY_EXPECTED = 'coeur oeillet aether orsted strasse lodz fig "quoted" hermes terre d\'hermes';

test('folds Latin perfume text: ligatures, stroked letters, sharp s, curly quotes', () =>
  expect(normalizeForSearch(PARITY_INPUT)).toBe(PARITY_EXPECTED));

test('folds each mapped letter in both cases', () =>
  expect(normalizeForSearch('œŒ æÆ øØ ß łŁ đĐ')).toBe('oeoe aeae oo ss ll dd'));

test('unifies the modifier-letter apostrophe and curly double quotes', () =>
  expect(normalizeForSearch('d\u02bcHermès “a”')).toBe('d\'hermes "a"'));

test('NFKD folds compatibility characters and decomposes kana voicing marks', () => {
  expect(normalizeForSearch('ﬁﬂ ２')).toBe('fifl 2');
  expect(normalizeForSearch('ガ ２ ʼ ™')).toBe("カ 2 ' tm");
});

test('the database test asserts the same input and expected literal', () => {
  const sql = readFileSync(join(__dirname, '../../supabase/tests/0002_search.test.sql'), 'utf8');
  expect(sql).toContain(PARITY_INPUT);
  expect(sql).toContain(PARITY_EXPECTED.replaceAll("'", "''"));
});

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
