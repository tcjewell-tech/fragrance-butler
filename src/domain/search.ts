import { CONCENTRATIONS, type Fragrance, type FragranceGroup } from './types';

/** Lowercased, accent-stripped, apostrophe-unified, whitespace-collapsed form used for matching and sorting. */
export function normalizeForSearch(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[’‘`´]/g, "'")
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Groups concentration variants of the same house + name. Groups keep first-seen order. */
export function groupVariants(fs: Fragrance[]): FragranceGroup[] {
  const groups = new Map<string, FragranceGroup>();
  for (const f of fs) {
    const key = `${normalizeForSearch(f.house)}|${normalizeForSearch(f.name)}`;
    const existing = groups.get(key);
    if (existing) {
      existing.variants.push(f);
    } else {
      groups.set(key, { house: f.house, name: f.name, variants: [f] });
    }
  }
  const out = [...groups.values()];
  for (const g of out) {
    g.variants.sort((a, b) => CONCENTRATIONS.indexOf(a.concentration) - CONCENTRATIONS.indexOf(b.concentration));
  }
  return out;
}
