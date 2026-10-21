export const CONCENTRATIONS = ['EDT', 'EDP', 'Parfum', 'Extrait', 'Other'] as const;
export type Concentration = (typeof CONCENTRATIONS)[number];

export const PRESET_BOTTLE_SIZES_ML = [30, 50, 100, 150, 200] as const;

export type CaptureMethod = 'barcode' | 'image' | 'manual';
export type MarketedGender = 'feminine' | 'masculine' | 'unisex';

export interface NotePyramid {
  top: string[];
  heart: string[];
  base: string[];
}

export interface Fragrance {
  id: string;
  house: string;
  name: string;
  concentration: Concentration;
  notePyramid: NotePyramid;
  olfactoryFamily: string | null;
  longevity: number | null; // 1-5
  projection: number | null; // 1-5
  seasonAffinity: string[];
  timeAffinity: string[];
  marketedGender: MarketedGender | null;
  releaseYear: number | null;
  referenceImages: string[];
  isCustom: boolean;
}

export interface FragranceGroup {
  house: string;
  name: string;
  variants: Fragrance[];
}

export interface CollectionItem {
  id: string;
  userId: string;
  fragranceId: string;
  bottleSizeMl: number;
  concentration: Concentration;
  acquisitionDate: string | null; // ISO date
  captureMethod: CaptureMethod;
  userNotes: string | null;
  favorite: boolean;
  wearCount: number;
  createdAt: string;
}

export interface CollectionEntry {
  item: CollectionItem;
  fragrance: Fragrance;
}

export interface NewCollectionItem {
  clientRequestId: string;
  fragranceId: string;
  bottleSizeMl: number;
  concentration: Concentration;
  captureMethod: CaptureMethod;
  acquisitionDate?: string | null;
  userNotes?: string | null;
}

export type CollectionItemPatch = Partial<
  Pick<CollectionItem, 'bottleSizeMl' | 'acquisitionDate' | 'userNotes' | 'favorite'>
>;

export interface CustomFragranceInput {
  house: string;
  name: string;
  concentration: Concentration;
  releaseYear?: number | null;
}
