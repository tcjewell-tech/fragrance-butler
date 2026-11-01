import type { CollectionItem, Fragrance } from './types';

/** What a restore adds to the phone, and what it leaves out. Built by `planRestore`. */
export interface RestorePlan {
  addFragrances: Fragrance[];
  addItems: CollectionItem[];
  alreadyPresent: number;
  skipped: number;
}
