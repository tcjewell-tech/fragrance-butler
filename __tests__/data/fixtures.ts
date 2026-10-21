import type { Concentration, Fragrance } from '@/domain/types';

function fragrance(id: string, house: string, name: string, concentration: Concentration): Fragrance {
  return {
    id,
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
  };
}

export const SAUVAGE_EDT_ID = 'fixture-sauvage-edt';
export const SAUVAGE_EDP_ID = 'fixture-sauvage-edp';
export const HERMES_ID = 'fixture-terre-d-hermes-edt';

/** Small catalog for in-memory repository tests. Terre d’Hermès uses a curly apostrophe on purpose. */
export const fixtureCatalog: Fragrance[] = [
  fragrance(SAUVAGE_EDT_ID, 'Dior', 'Sauvage', 'EDT'),
  fragrance(SAUVAGE_EDP_ID, 'Dior', 'Sauvage', 'EDP'),
  fragrance(HERMES_ID, 'Hermès', 'Terre d’Hermès', 'EDT'),
  fragrance('fixture-bleu-edp', 'Chanel', 'Bleu de Chanel', 'EDP'),
];

export const fixtureIds = {
  sauvageEdtId: SAUVAGE_EDT_ID,
  sauvageEdpId: SAUVAGE_EDP_ID,
  hermesId: HERMES_ID,
};
