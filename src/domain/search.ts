import { CONCENTRATIONS, type Fragrance, type FragranceGroup } from './types';

// Letters that NFKD leaves alone. Both cases map to lowercase output.
const FOLD: Readonly<Record<string, string>> = {
  œ: 'oe',
  Œ: 'oe',
  æ: 'ae',
  Æ: 'ae',
  ø: 'o',
  Ø: 'o',
  ß: 'ss',
  ł: 'l',
  Ł: 'l',
  đ: 'd',
  Đ: 'd',
};
const FOLD_PATTERN = new RegExp(`[${Object.keys(FOLD).join('')}]`, 'g');

/**
 * Lowercased, accent-stripped, apostrophe- and quote-unified, whitespace-collapsed form used for matching and sorting.
 *
 * Must stay in step with public.normalize_for_search in supabase/migrations/0001_init.sql
 * (both are asserted against the same literal). Steps, in order: unify apostrophes (’ ‘ ` ´ ʼ),
 * NFKD, strip combining marks, fold œ æ ø ß ł đ, unify “ ” to ", lowercase, collapse whitespace, trim.
 * Parity is guaranteed for Latin text. The database strips only the combining-mark blocks listed in
 * that function (Latin, Arabic, extended, symbol and half marks, and the kana voicing marks), while
 * \p{M} here covers every script, so marks in other scripts (e.g. Indic vowel signs) may differ.
 */
export function normalizeForSearch(s: string): string {
  return s
    // Before NFKD: it would turn ´ (U+00B4) into a space plus a combining mark, which is then stripped.
    .replace(/[’‘`´ʼ]/g, "'")
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(FOLD_PATTERN, (c) => FOLD[c])
    .replace(/[“”]/g, '"')
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
