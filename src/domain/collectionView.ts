import { normalizeForSearch } from './search';
import type { CollectionEntry } from './types';

export type SortMode = 'house' | 'recent' | 'favorites';

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const byRecent = (a: CollectionEntry, b: CollectionEntry): number => cmp(b.item.createdAt, a.item.createdAt);

const byHouse = (a: CollectionEntry, b: CollectionEntry): number =>
  cmp(normalizeForSearch(a.fragrance.house), normalizeForSearch(b.fragrance.house)) ||
  cmp(normalizeForSearch(a.fragrance.name), normalizeForSearch(b.fragrance.name)) ||
  byRecent(a, b);

/** Returns a new sorted array; the input is never mutated. */
export function sortCollection(entries: CollectionEntry[], mode: SortMode): CollectionEntry[] {
  const copy = [...entries];
  switch (mode) {
    case 'recent':
      return copy.sort(byRecent);
    case 'favorites':
      return copy.sort((a, b) => Number(b.item.favorite) - Number(a.item.favorite) || byHouse(a, b));
    case 'house':
    default:
      return copy.sort(byHouse);
  }
}
