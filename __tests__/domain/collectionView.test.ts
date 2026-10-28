import { sortCollection } from '@/domain/collectionView';
import type { CollectionEntry } from '@/domain/types';

let n = 0;
const e = (house: string, name: string, createdAt: string, favorite = false): CollectionEntry => {
  n += 1;
  return {
    item: {
      id: `item-${n}`,
      userId: 'u1',
      fragranceId: `frag-${n}`,
      bottleSizeMl: 50,
      concentration: 'EDP',
      acquisitionDate: null,
      captureMethod: 'manual',
      userNotes: null,
      favorite,
      wearCount: 0,
      createdAt,
    },
    fragrance: {
      id: `frag-${n}`,
      house,
      name,
      concentration: 'EDP',
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
    },
  };
};
const label = (xs: CollectionEntry[]) => xs.map((x) => `${x.fragrance.house}/${x.fragrance.name}`);

test('house sort is alphabetical by house then name, accent-insensitive', () => {
  const entries = [
    e('Hermès', 'Terre', '2025-01-01T00:00:00Z'),
    e('Dior', 'Sauvage', '2025-01-02T00:00:00Z'),
    e('Hermes', 'Calèche', '2025-01-03T00:00:00Z'),
    e('Chanel', 'Bleu', '2025-01-04T00:00:00Z'),
    e('Dior', 'Fahrenheit', '2025-01-05T00:00:00Z'),
  ];
  expect(label(sortCollection(entries, 'house'))).toEqual([
    'Chanel/Bleu',
    'Dior/Fahrenheit',
    'Dior/Sauvage',
    'Hermes/Calèche',
    'Hermès/Terre',
  ]);
});

test('house sort breaks full ties by newest createdAt first', () => {
  const older = e('Dior', 'Sauvage', '2025-01-01T00:00:00Z');
  const newer = e('Dior', 'Sauvage', '2025-02-01T00:00:00Z');
  expect(sortCollection([older, newer], 'house')).toEqual([newer, older]);
});

test('recent sort is newest createdAt first', () => {
  const a = e('A', 'a', '2025-01-01T00:00:00Z');
  const b = e('B', 'b', '2025-03-01T00:00:00Z');
  const c = e('C', 'c', '2025-02-01T00:00:00Z');
  expect(sortCollection([a, b, c], 'recent')).toEqual([b, c, a]);
});

test('favorites sort puts favorites first, then house order', () => {
  const dior = e('Dior', 'Sauvage', '2025-01-01T00:00:00Z');
  const chanel = e('Chanel', 'Bleu', '2025-01-02T00:00:00Z');
  const guerlain = e('Guerlain', 'Shalimar', '2025-01-03T00:00:00Z', true);
  const byredo = e('Byredo', 'Gypsy Water', '2025-01-04T00:00:00Z', true);
  expect(sortCollection([dior, chanel, guerlain, byredo], 'favorites')).toEqual([byredo, guerlain, chanel, dior]);
});

test('does not mutate its input', () => {
  const entries = [e('B', 'b', '2025-01-01T00:00:00Z'), e('A', 'a', '2025-01-02T00:00:00Z')];
  const copy = [...entries];
  const out = sortCollection(entries, 'house');
  expect(entries).toEqual(copy);
  expect(out).not.toBe(entries);
});
