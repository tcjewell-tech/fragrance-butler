// Builds supabase/seed.sql from supabase/seed/catalog.csv.
//   node scripts/build-seed.mjs        (npm run seed:build)
// Exports buildSeedSql(csvText) for tests. Plain ES module, no dependencies.
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

// Keep in step with CONCENTRATIONS in src/domain/types.ts (a Jest test checks this).
const CONCENTRATIONS = ['EDT', 'EDP', 'Parfum', 'Extrait', 'Other'];
const COLUMNS = ['house', 'name', 'concentration', 'release_year'];

/**
 * Minimal RFC 4180 parser: quoted fields, doubled quotes, commas and newlines inside
 * quotes, CRLF or LF. Lines whose first character is '#' and blank lines are skipped.
 * Returns records as { line, fields } where line is the 1-based physical line the record starts on.
 */
function parseCsv(text) {
  const records = [];
  const src = text.replace(/^﻿/, '');
  let fields = [];
  let field = '';
  let inQuotes = false;
  let quotedField = false;
  let line = 1;
  let startLine = 1;
  let atRecordStart = true;

  const endField = () => {
    fields.push(field);
    field = '';
    quotedField = false;
  };
  const endRecord = () => {
    endField();
    const blank = fields.length === 1 && fields[0].trim() === '' && !quotedField;
    if (!blank) records.push({ line: startLine, fields });
    fields = [];
    atRecordStart = true;
  };

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (atRecordStart) {
      startLine = line;
      if (c === '#') {
        // comment line: skip to end of line
        while (i < src.length && src[i] !== '\n') i++;
        line++;
        continue;
      }
      atRecordStart = false;
    }
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (c === '\n') line++;
        field += c;
      }
    } else if (c === '"' && field.trim() === '') {
      inQuotes = true;
      quotedField = true;
      field = '';
    } else if (c === ',') {
      endField();
    } else if (c === '\r') {
      // swallowed; the following \n (or end of input) ends the record
      if (src[i + 1] !== '\n') {
        endRecord();
        line++;
      }
    } else if (c === '\n') {
      endRecord();
      line++;
    } else {
      field += c;
    }
  }
  if (inQuotes) throw new Error(`row ${startLine}: unterminated quoted field`);
  if (!atRecordStart) endRecord();
  return records;
}

/**
 * The key duplicates are detected by. Mirrors normalizeForSearch in src/domain/search.ts (a Jest test
 * asserts they agree), so 'Hermes' and 'Hermès' are the same fragrance. The database index
 * fragrances_reference_unique only folds case; this catches the accent-folded duplicates before they ship.
 */
const FOLD = { œ: 'oe', Œ: 'oe', æ: 'ae', Æ: 'ae', ø: 'o', Ø: 'o', ß: 'ss', ł: 'l', Ł: 'l', đ: 'd', Đ: 'd' };
export function normalizeKey(s) {
  return s
    .replace(/[’‘`´ʼ]/g, "'")
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[œŒæÆøØßłŁđĐ]/g, (c) => FOLD[c])
    .replace(/[“”]/g, '"')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const sqlString = (s) => `'${s.replaceAll("'", "''")}'`;

/** Stable id for a bundled catalog row: the duplicate key, so 'Hermes' and 'Hermès' share one. */
export function catalogId(house, name, concentration) {
  return `catalog:${normalizeKey(house)}|${normalizeKey(name)}|${concentration}`;
}

/**
 * Parses and validates catalog CSV text into { house, name, concentration, year } rows (year is the
 * trimmed text, '' when blank). Errors are reported as `row N: ...` where N is the physical line in
 * the file (the header is row 1 when there are no leading comment lines).
 */
function parseCatalogRows(csvText) {
  const records = parseCsv(csvText);
  if (records.length === 0) throw new Error('header: catalog is empty (expected a header row)');

  const [head, ...rows] = records;
  const header = head.fields.map((f) => f.trim());
  if (header.join(',') !== COLUMNS.join(',')) {
    throw new Error(`header: expected "${COLUMNS.join(',')}" but found "${header.join(',')}"`);
  }

  const seen = new Set();
  return rows.map(({ line, fields }) => {
    if (fields.length !== COLUMNS.length) {
      throw new Error(`row ${line}: expected ${COLUMNS.length} columns but found ${fields.length}`);
    }
    const [house, name, concentration, year] = fields.map((f) => f.trim());
    if (!house) throw new Error(`row ${line}: house is blank`);
    if (!name) throw new Error(`row ${line}: name is blank`);
    if (!CONCENTRATIONS.includes(concentration)) {
      throw new Error(`row ${line}: unknown concentration "${concentration}" (expected one of ${CONCENTRATIONS.join(', ')})`);
    }
    if (year !== '' && !/^\d{4}$/.test(year)) {
      throw new Error(`row ${line}: release_year "${year}" is not a four-digit integer`);
    }
    const key = [normalizeKey(house), normalizeKey(name), concentration].join('|');
    if (seen.has(key)) {
      throw new Error(`row ${line}: duplicate house + name + concentration, ignoring case and accents (${house} / ${name} / ${concentration})`);
    }
    seen.add(key);
    return { house, name, concentration, year };
  });
}

/** Converts catalog CSV text into an additive SQL insert (on conflict do nothing) for public.fragrances. */
export function buildSeedSql(csvText) {
  const values = parseCatalogRows(csvText).map(
    ({ house, name, concentration, year }) =>
      `  (${sqlString(house)}, ${sqlString(name)}, ${sqlString(concentration)}, ${year === '' ? 'null' : year})`,
  );
  const banner = '-- GENERATED by scripts/build-seed.mjs from supabase/seed/catalog.csv. Do not edit by hand.\n';
  if (values.length === 0) return banner;
  // Additive: re-running the seed skips rows that already exist (the partial unique index in 0001_init.sql).
  const onConflict = 'on conflict (lower(house), lower(name), concentration) where created_by is null do nothing';
  return `${banner}insert into public.fragrances (house, name, concentration, release_year) values\n${values.join(',\n')}\n${onConflict};\n`;
}

/** Converts catalog CSV text into the TypeScript source of src/data/catalogSeed.ts (the local-mode catalog). */
export function buildCatalogModule(csvText) {
  const entries = parseCatalogRows(csvText).map(({ house, name, concentration, year }) => {
    const fields = [
      `id: ${JSON.stringify(catalogId(house, name, concentration))}`,
      `house: ${JSON.stringify(house)}`,
      `name: ${JSON.stringify(name)}`,
      `concentration: ${JSON.stringify(concentration)}`,
      `releaseYear: ${year === '' ? 'null' : Number(year)}`,
    ];
    return `  { ${fields.join(', ')} },\n`;
  });
  return (
    '// GENERATED by scripts/build-seed.mjs from supabase/seed/catalog.csv. Do not edit by hand.\n' +
    "import type { Concentration } from '@/domain/types';\n\n" +
    'export interface CatalogSeedRow {\n' +
    '  id: string;\n  house: string;\n  name: string;\n  concentration: Concentration;\n  releaseYear: number | null;\n}\n\n' +
    `export const catalogSeed: readonly CatalogSeedRow[] = [\n${entries.join('')}];\n`
  );
}

// Run directly: node scripts/build-seed.mjs
if (process.argv[1] && basename(process.argv[1]) === 'build-seed.mjs') {
  const root = resolve(dirname(process.argv[1]), '..');
  const csvPath = join(root, 'supabase', 'seed', 'catalog.csv');
  const outputs = [
    [join(root, 'supabase', 'seed.sql'), buildSeedSql],
    [join(root, 'src', 'data', 'catalogSeed.ts'), buildCatalogModule],
  ];
  try {
    const csvText = readFileSync(csvPath, 'utf8');
    // Build both before writing either, so a bad CSV leaves both files as they were.
    const built = outputs.map(([path, build]) => [path, build(csvText)]);
    for (const [path, text] of built) {
      writeFileSync(path, text);
      console.log(`wrote ${path}`);
    }
  } catch (err) {
    console.error(`seed:build failed (${csvPath}): ${err.message}`);
    process.exitCode = 1;
  }
}
