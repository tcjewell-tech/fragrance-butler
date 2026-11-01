import type { Fragrance } from '@/domain/types';
import { catalogSeed } from './catalogSeed';

/** The starter catalog bundled with local-mode builds, generated from supabase/seed/catalog.csv. */
export function bundledCatalog(): Fragrance[] {
  return catalogSeed.map((row) => ({
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
  }));
}
