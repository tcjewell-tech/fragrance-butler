import { rowToCollectionItem, rowToFragrance } from '@/data/supabase';

const fragranceRow = {
  id: 'f1',
  house: 'Dior',
  name: 'Sauvage',
  concentration: 'EDT',
  note_pyramid: { top: ['Bergamot'], heart: ['Pepper'], base: ['Ambroxan'] },
  olfactory_family: 'Aromatic',
  longevity: 4,
  projection: 3,
  season_affinity: ['spring', 'summer'],
  time_affinity: ['day'],
  marketed_gender: 'masculine',
  release_year: 2015,
  reference_images: ['https://example.test/a.jpg'],
  created_by: null,
  created_at: '2026-10-21T10:00:00+00:00',
};

describe('rowToFragrance', () => {
  test('maps snake_case columns to the camelCase Fragrance', () => {
    expect(rowToFragrance(fragranceRow)).toEqual({
      id: 'f1',
      house: 'Dior',
      name: 'Sauvage',
      concentration: 'EDT',
      notePyramid: { top: ['Bergamot'], heart: ['Pepper'], base: ['Ambroxan'] },
      olfactoryFamily: 'Aromatic',
      longevity: 4,
      projection: 3,
      seasonAffinity: ['spring', 'summer'],
      timeAffinity: ['day'],
      marketedGender: 'masculine',
      releaseYear: 2015,
      referenceImages: ['https://example.test/a.jpg'],
      isCustom: false,
    });
  });

  test('created_by set means isCustom, null means a catalog entry', () => {
    expect(rowToFragrance({ ...fragranceRow, created_by: 'user-1' }).isCustom).toBe(true);
    expect(rowToFragrance({ ...fragranceRow, created_by: null }).isCustom).toBe(false);
  });

  test('a note_pyramid missing a key gets an empty array for it', () => {
    const f = rowToFragrance({ ...fragranceRow, note_pyramid: { top: ['Lemon'] } });
    expect(f.notePyramid).toEqual({ top: ['Lemon'], heart: [], base: [] });
  });

  test('a null or empty note_pyramid gives three empty arrays', () => {
    const empty = { top: [], heart: [], base: [] };
    expect(rowToFragrance({ ...fragranceRow, note_pyramid: null }).notePyramid).toEqual(empty);
    expect(rowToFragrance({ ...fragranceRow, note_pyramid: {} }).notePyramid).toEqual(empty);
  });

  test('null arrays become empty arrays and null scalars stay null', () => {
    const f = rowToFragrance({
      ...fragranceRow,
      season_affinity: null,
      time_affinity: null,
      reference_images: null,
      olfactory_family: null,
      longevity: null,
      projection: null,
      marketed_gender: null,
      release_year: null,
    });
    expect(f.seasonAffinity).toEqual([]);
    expect(f.timeAffinity).toEqual([]);
    expect(f.referenceImages).toEqual([]);
    expect(f.olfactoryFamily).toBeNull();
    expect(f.longevity).toBeNull();
    expect(f.projection).toBeNull();
    expect(f.marketedGender).toBeNull();
    expect(f.releaseYear).toBeNull();
  });
});

const itemRow = {
  id: 'i1',
  user_id: 'u1',
  fragrance_id: 'f1',
  bottle_size_ml: 100,
  concentration: 'EDP',
  acquisition_date: '2025-03-09',
  capture_method: 'manual',
  user_notes: 'gift',
  favorite_flag: true,
  wear_count: 3,
  client_request_id: 'c1',
  created_at: '2026-10-21T10:00:00.123456+00:00',
  updated_at: '2026-10-21T10:00:00.123456+00:00',
};

describe('rowToCollectionItem', () => {
  test('maps snake_case columns, favorite_flag to favorite', () => {
    expect(rowToCollectionItem(itemRow)).toEqual({
      id: 'i1',
      userId: 'u1',
      fragranceId: 'f1',
      bottleSizeMl: 100,
      concentration: 'EDP',
      acquisitionDate: '2025-03-09',
      captureMethod: 'manual',
      userNotes: 'gift',
      favorite: true,
      wearCount: 3,
      createdAt: '2026-10-21T10:00:00.123Z',
    });
  });

  test('keeps a null acquisition_date and user_notes as null', () => {
    const item = rowToCollectionItem({ ...itemRow, acquisition_date: null, user_notes: null });
    expect(item.acquisitionDate).toBeNull();
    expect(item.userNotes).toBeNull();
  });

  test.each([
    ['2026-10-21T10:00:00+00:00', '2026-10-21T10:00:00.000Z'],
    ['2026-10-21T10:00:00.5+00:00', '2026-10-21T10:00:00.500Z'],
    ['2026-10-21T12:00:00.987654+02:00', '2026-10-21T10:00:00.987Z'],
    ['2026-10-21T10:00:00Z', '2026-10-21T10:00:00.000Z'],
  ])('normalizes created_at %s to ISO-8601 UTC (%s)', (input, expected) => {
    expect(rowToCollectionItem({ ...itemRow, created_at: input }).createdAt).toBe(expected);
  });

  test('rejects an unparseable created_at', () => {
    expect(() => rowToCollectionItem({ ...itemRow, created_at: 'not a date' })).toThrow();
  });
});
