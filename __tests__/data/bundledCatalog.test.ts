import { bundledCatalog } from '@/data/bundledCatalog';
import { catalogSeed } from '@/data/catalogSeed';

describe('bundledCatalog', () => {
  it('returns one fragrance per row with unique ids', () => {
    const catalog = bundledCatalog();
    expect(catalog).toHaveLength(catalogSeed.length);
    expect(catalog.length).toBeGreaterThan(0);
    expect(new Set(catalog.map((f) => f.id)).size).toBe(catalog.length);
    expect(catalog.every((f) => f.id.startsWith('catalog:'))).toBe(true);
  });

  it('builds catalog fragrances the way createCustom builds custom ones, with the catalog id', () => {
    const [row] = catalogSeed;
    expect(bundledCatalog()[0]).toEqual({
      id: row.id,
      house: row.house,
      name: row.name,
      concentration: row.concentration,
      notePyramid: { top: [], heart: [], base: [] },
      olfactoryFamily: null,
      longevity: null,
      projection: null,
      seasonAffinity: [],
      timeAffinity: [],
      marketedGender: null,
      releaseYear: row.releaseYear,
      referenceImages: [],
      isCustom: false,
    });
  });

  it('returns fresh objects each call', () => {
    const first = bundledCatalog();
    first[0].notePyramid.top.push('changed');
    expect(bundledCatalog()[0].notePyramid.top).toEqual([]);
  });
});
