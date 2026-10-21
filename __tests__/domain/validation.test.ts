import {
  isValidBottleSizeMl,
  parseCollectionItemPatch,
  parseCustomFragrance,
  parseNewCollectionItem,
  ValidationError,
} from '@/domain/validation';

const valid = (over: Record<string, unknown> = {}) => ({
  clientRequestId: '3f2b8a52-7c1e-4d0a-9a53-0d1f6b0c9e11',
  fragranceId: 'frag-1',
  bottleSizeMl: 50,
  concentration: 'EDP',
  captureMethod: 'manual',
  ...over,
});

describe('parseNewCollectionItem', () => {
  test('accepts preset and custom sizes', () => {
    expect(parseNewCollectionItem(valid({ bottleSizeMl: 100 })).bottleSizeMl).toBe(100);
    expect(parseNewCollectionItem(valid({ bottleSizeMl: 75 })).bottleSizeMl).toBe(75);
  });

  test.each([0, -5, 12.5, 1001])('rejects size %p', (s) =>
    expect(() => parseNewCollectionItem(valid({ bottleSizeMl: s }))).toThrow(ValidationError));

  test('rejects unknown concentration', () =>
    expect(() => parseNewCollectionItem(valid({ concentration: 'Cologne' }))).toThrow(ValidationError));

  test('rejects unknown capture method', () =>
    expect(() => parseNewCollectionItem(valid({ captureMethod: 'psychic' }))).toThrow(ValidationError));

  test('rejects non-uuid clientRequestId and empty fragranceId', () => {
    expect(() => parseNewCollectionItem(valid({ clientRequestId: 'abc' }))).toThrow(ValidationError);
    expect(() => parseNewCollectionItem(valid({ fragranceId: '' }))).toThrow(ValidationError);
  });

  test('rejects non-object input', () => {
    expect(() => parseNewCollectionItem(null)).toThrow(ValidationError);
    expect(() => parseNewCollectionItem('x')).toThrow(ValidationError);
  });

  test('normalizes omitted optional fields to null', () => {
    const out = parseNewCollectionItem(valid());
    expect(out.acquisitionDate).toBeNull();
    expect(out.userNotes).toBeNull();
  });

  test('accepts valid acquisition date, rejects malformed or impossible ones', () => {
    expect(parseNewCollectionItem(valid({ acquisitionDate: '2025-03-09' })).acquisitionDate).toBe('2025-03-09');
    expect(parseNewCollectionItem(valid({ acquisitionDate: null })).acquisitionDate).toBeNull();
    expect(() => parseNewCollectionItem(valid({ acquisitionDate: '09/03/2025' }))).toThrow(ValidationError);
    expect(() => parseNewCollectionItem(valid({ acquisitionDate: '2025-02-30' }))).toThrow(ValidationError);
  });

  test('trims notes, empty notes become null, over 2000 chars rejected', () => {
    expect(parseNewCollectionItem(valid({ userNotes: '  gift  ' })).userNotes).toBe('gift');
    expect(parseNewCollectionItem(valid({ userNotes: '   ' })).userNotes).toBeNull();
    expect(() => parseNewCollectionItem(valid({ userNotes: 'n'.repeat(2001) }))).toThrow(ValidationError);
  });

  test('error carries the offending field', () => {
    try {
      parseNewCollectionItem(valid({ bottleSizeMl: 0 }));
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      expect((e as ValidationError).field).toBe('bottleSizeMl');
    }
  });
});

describe('parseCustomFragrance', () => {
  test('trims custom house/name and rejects blank', () => {
    expect(parseCustomFragrance({ house: '  Le Labo ', name: ' Santal 33 ', concentration: 'EDP' })).toEqual({
      house: 'Le Labo',
      name: 'Santal 33',
      concentration: 'EDP',
      releaseYear: null,
    });
    expect(() => parseCustomFragrance({ house: '   ', name: 'X', concentration: 'EDP' })).toThrow(ValidationError);
  });

  test('rejects custom names over 120 chars', () =>
    expect(() => parseCustomFragrance({ house: 'A', name: 'x'.repeat(121), concentration: 'EDT' })).toThrow());

  test('collapses internal whitespace runs', () => {
    const out = parseCustomFragrance({ house: 'Maison   Francis\tKurkdjian', name: 'Baccarat  Rouge', concentration: 'Extrait' });
    expect(out.house).toBe('Maison Francis Kurkdjian');
    expect(out.name).toBe('Baccarat Rouge');
  });

  test('release year: optional, bounded', () => {
    const base = { house: 'A', name: 'B', concentration: 'EDT' };
    expect(parseCustomFragrance({ ...base, releaseYear: 2012 }).releaseYear).toBe(2012);
    expect(parseCustomFragrance({ ...base, releaseYear: null }).releaseYear).toBeNull();
    expect(() => parseCustomFragrance({ ...base, releaseYear: 1699 })).toThrow(ValidationError);
    expect(() => parseCustomFragrance({ ...base, releaseYear: new Date().getFullYear() + 2 })).toThrow(ValidationError);
    expect(() => parseCustomFragrance({ ...base, releaseYear: 2012.5 })).toThrow(ValidationError);
  });

  test('rejects unknown concentration with field name', () => {
    try {
      parseCustomFragrance({ house: 'A', name: 'B', concentration: 'Cologne' });
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as ValidationError).field).toBe('concentration');
    }
  });
});

describe('parseCollectionItemPatch', () => {
  test('accepts a partial patch and keeps absent fields absent', () => {
    expect(parseCollectionItemPatch({ favorite: true })).toEqual({ favorite: true });
    expect(parseCollectionItemPatch({})).toEqual({});
  });

  test('accepts every patchable field', () => {
    expect(
      parseCollectionItemPatch({ bottleSizeMl: 75, acquisitionDate: '2025-03-09', userNotes: ' gift ', favorite: false }),
    ).toEqual({ bottleSizeMl: 75, acquisitionDate: '2025-03-09', userNotes: 'gift', favorite: false });
  });

  test.each([0, -5, 12.5, 1001])('rejects size %p', (s) =>
    expect(() => parseCollectionItemPatch({ bottleSizeMl: s })).toThrow(ValidationError));

  test('acquisition date is null or a valid YYYY-MM-DD', () => {
    expect(parseCollectionItemPatch({ acquisitionDate: null })).toEqual({ acquisitionDate: null });
    expect(() => parseCollectionItemPatch({ acquisitionDate: '09/03/2025' })).toThrow(ValidationError);
    expect(() => parseCollectionItemPatch({ acquisitionDate: '2025-02-30' })).toThrow(ValidationError);
  });

  test('notes are trimmed, empty becomes null, over 2000 chars rejected', () => {
    expect(parseCollectionItemPatch({ userNotes: '  gift  ' })).toEqual({ userNotes: 'gift' });
    expect(parseCollectionItemPatch({ userNotes: '   ' })).toEqual({ userNotes: null });
    expect(parseCollectionItemPatch({ userNotes: null })).toEqual({ userNotes: null });
    expect(() => parseCollectionItemPatch({ userNotes: 'n'.repeat(2001) })).toThrow(ValidationError);
  });

  test('favorite must be a boolean', () =>
    expect(() => parseCollectionItemPatch({ favorite: 'yes' })).toThrow(ValidationError));

  test('drops undefined values and ignores unknown keys such as wearCount', () => {
    expect(parseCollectionItemPatch({ favorite: undefined, wearCount: 99, userId: 'x' })).toEqual({});
  });

  test('rejects non-object input', () => {
    expect(() => parseCollectionItemPatch(null)).toThrow(ValidationError);
    expect(() => parseCollectionItemPatch('x')).toThrow(ValidationError);
  });

  test('error carries the offending field', () => {
    try {
      parseCollectionItemPatch({ bottleSizeMl: 0 });
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as ValidationError).field).toBe('bottleSizeMl');
    }
  });
});

describe('isValidBottleSizeMl', () => {
  test.each([1, 30, 75, 1000])('accepts %p', (n) => expect(isValidBottleSizeMl(n)).toBe(true));
  test.each([0, -5, 12.5, 1001, NaN, '50', null])('rejects %p', (n) => expect(isValidBottleSizeMl(n)).toBe(false));
});
