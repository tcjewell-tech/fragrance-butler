import { readFileSync } from 'fs';
import { join } from 'path';
import { buildSeedSql } from '../../scripts/build-seed.mjs';
import { CONCENTRATIONS } from '@/domain/types';

const HEADER = 'house,name,concentration,release_year';
const csv = (...lines: string[]) => lines.join('\n');

describe('buildSeedSql', () => {
  it('emits an insert with single quotes doubled and accents/curly apostrophes preserved', () => {
    const sql = buildSeedSql(csv(HEADER, 'Hermès,Terre d’Hermès,EDT,2006'));
    expect(sql).toContain('insert into public.fragrances (house, name, concentration, release_year) values');
    expect(sql).toContain("'Terre d’Hermès'");
    const ascii = buildSeedSql(csv(HEADER, "Hermès,Terre d'Hermès,EDT,2006"));
    expect(ascii).toContain("'Terre d''Hermès'");
  });

  it('round-trips quoted values containing commas and doubled quotes', () => {
    const sql = buildSeedSql(csv(HEADER, '"Maison, Test","The ""Big"" One, Deluxe",EDP,2020'));
    expect(sql).toContain("'Maison, Test'");
    expect(sql).toContain(`'The "Big" One, Deluxe'`);
  });

  it('skips # lines, blank lines and CRLF line endings', () => {
    const sql = buildSeedSql(`# PLACEHOLDER\r\n${HEADER}\r\n\r\n# another\r\nDior,Sauvage,EDT,2015\r\n`);
    expect(sql).toContain("('Dior', 'Sauvage', 'EDT', 2015)");
    expect(sql).not.toContain('PLACEHOLDER');
  });

  it('trims values and writes null for an empty year', () => {
    const sql = buildSeedSql(csv(HEADER, ' Guerlain , Shalimar , EDP , '));
    expect(sql).toContain("('Guerlain', 'Shalimar', 'EDP', null)");
  });

  it('keeps one fragrance in two concentrations', () => {
    const sql = buildSeedSql(csv(HEADER, 'Dior,Sauvage,EDT,2015', 'Dior,Sauvage,EDP,2018'));
    expect(sql).toContain("'EDT'");
    expect(sql).toContain("'EDP'");
  });

  it('throws with the row number for an unknown concentration', () => {
    expect(() => buildSeedSql(csv(HEADER, 'Dior,Sauvage,EDT,2015', 'Dior,Eau Sauvage,Cologne,1966'))).toThrow(/row 3/);
  });

  it('throws on a duplicate house + name + concentration', () => {
    expect(() => buildSeedSql(csv(HEADER, 'Dior,Sauvage,EDT,2015', 'Dior,Sauvage,EDT,2016'))).toThrow(/row 3.*duplicate/i);
  });

  it('throws on a blank name or house', () => {
    expect(() => buildSeedSql(csv(HEADER, 'Dior,  ,EDT,2015'))).toThrow(/row 2.*name/i);
    expect(() => buildSeedSql(csv(HEADER, ',Sauvage,EDT,2015'))).toThrow(/row 2.*house/i);
  });

  it('throws on a non-integer year', () => {
    expect(() => buildSeedSql(csv(HEADER, 'Dior,Sauvage,EDT,20x5'))).toThrow(/row 2.*year/i);
    expect(() => buildSeedSql(csv(HEADER, 'Dior,Sauvage,EDT,2015.5'))).toThrow(/row 2.*year/i);
  });

  it('throws on a wrong header or a wrong column count', () => {
    expect(() => buildSeedSql(csv('house,name', 'Dior,Sauvage'))).toThrow(/header/i);
    expect(() => buildSeedSql(csv(HEADER, 'Dior,Sauvage,EDT'))).toThrow(/row 2/);
  });

  it('accepts exactly the concentrations the app knows', () => {
    for (const c of CONCENTRATIONS) {
      expect(() => buildSeedSql(csv(HEADER, `House,Name ${c},${c},`))).not.toThrow();
    }
  });
});

describe('placeholder catalog', () => {
  const text = readFileSync(join(__dirname, '../../supabase/seed/catalog.csv'), 'utf8');

  it('starts with the PLACEHOLDER marker and builds into valid SQL', () => {
    expect(text.split('\n')[0]).toMatch(/^# PLACEHOLDER/);
    const sql = buildSeedSql(text);
    expect(sql).toContain("'Terre d’Hermès'");
    expect((sql.match(/\n\s*\('/g) ?? []).length).toBeLessThanOrEqual(10);
  });

  it('matches the committed supabase/seed.sql', () => {
    const committed = readFileSync(join(__dirname, '../../supabase/seed.sql'), 'utf8');
    expect(committed).toBe(buildSeedSql(text));
  });
});
