import { readFileSync } from 'fs';
import { join } from 'path';
import { buildCatalogModule, catalogId } from '../../scripts/build-seed.mjs';

const HEADER = 'house,name,concentration,release_year';
const csv = (...lines: string[]) => lines.join('\n');

describe('catalogId', () => {
  it('ignores case and accents', () => {
    expect(catalogId('Hermès', 'Terre d’Hermès', 'EDT')).toBe(catalogId('hermes', "TERRE D'HERMES", 'EDT'));
    expect(catalogId('Hermès', 'Terre d’Hermès', 'EDT')).toBe("catalog:hermes|terre d'hermes|EDT");
  });

  it('keeps concentrations apart', () => {
    expect(catalogId('Dior', 'Sauvage', 'EDT')).not.toBe(catalogId('Dior', 'Sauvage', 'EDP'));
  });
});

describe('buildCatalogModule', () => {
  const text = csv(HEADER, 'Hermès,Terre d’Hermès,EDT,2006', '"Maison, Test","The ""Big"" One",EDP,');

  it('is deterministic', () => {
    expect(buildCatalogModule(text)).toBe(buildCatalogModule(text));
  });

  it('emits one entry per row with id, trimmed fields and a null year when blank', () => {
    const source = buildCatalogModule(text);
    expect(source).toContain(JSON.stringify(catalogId('Hermès', 'Terre d’Hermès', 'EDT')));
    expect(source).toContain('"Terre d’Hermès"');
    expect(source).toContain('"The \\"Big\\" One"');
    expect(source).toMatch(/releaseYear: null/);
    expect(source).toMatch(/releaseYear: 2006/);
  });

  it('reuses the CSV validation errors', () => {
    expect(() => buildCatalogModule(csv(HEADER, ',Sauvage,EDT,2015'))).toThrow('row 2: house is blank');
    expect(() => buildCatalogModule(csv(HEADER, 'Dior,Sauvage,EDT,2015', 'dior,SAUVAGE,EDT,'))).toThrow(/row 3: duplicate/);
  });

  it('catalogSeed.ts is in sync with catalog.csv', () => {
    const catalog = readFileSync(join(__dirname, '../../supabase/seed/catalog.csv'), 'utf8');
    const committed = readFileSync(join(__dirname, '../../src/data/catalogSeed.ts'), 'utf8');
    expect(committed).toBe(buildCatalogModule(catalog));
  });
});
