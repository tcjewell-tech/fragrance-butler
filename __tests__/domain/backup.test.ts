import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  BackupError,
  buildBackup,
  parseBackup,
  planRestore,
  type Backup,
} from '@/domain/backup';
import type { CollectionEntry, CollectionItem, Fragrance } from '@/domain/types';

const NOW = new Date('2026-11-01T12:00:00.000Z');

const fragrance = (over: Partial<Fragrance> = {}): Fragrance => ({
  id: 'catalog:dior|sauvage|EDT',
  house: 'Dior',
  name: 'Sauvage',
  concentration: 'EDT',
  notePyramid: { top: [], heart: [], base: [] },
  olfactoryFamily: null,
  longevity: null,
  projection: null,
  seasonAffinity: [],
  timeAffinity: [],
  marketedGender: null,
  releaseYear: 2015,
  referenceImages: [],
  isCustom: false,
  ...over,
});

const jazz = fragrance({
  id: 'custom-jazz',
  house: 'Maison Margiela',
  name: 'Maison Margiela, Replica “Jazz Club” — café ☕',
  concentration: 'EDT',
  releaseYear: null,
  isCustom: true,
});

const item = (over: Partial<CollectionItem> = {}): CollectionItem => ({
  id: 'item-1',
  userId: 'local-user',
  fragranceId: 'catalog:dior|sauvage|EDT',
  bottleSizeMl: 100,
  concentration: 'EDT',
  acquisitionDate: '2025-12-24',
  captureMethod: 'manual',
  userNotes: 'A gift',
  favorite: true,
  wearCount: 7,
  createdAt: '2026-01-01T09:00:00.000Z',
  ...over,
});

const entries: CollectionEntry[] = [
  { item: item(), fragrance: fragrance() },
  { item: item({ id: 'item-2', fragranceId: jazz.id, userNotes: null, favorite: false, wearCount: 0 }), fragrance: jazz },
  { item: item({ id: 'item-3', fragranceId: jazz.id, bottleSizeMl: 50 }), fragrance: jazz },
];

const ids = (...xs: string[]) => new Set(xs);
const catalogIds = ids('catalog:dior|sauvage|EDT');

describe('buildBackup and parseBackup', () => {
  test('round trip returns the input, including a custom fragrance with commas, curly quotes and emoji', () => {
    const backup = buildBackup(entries, NOW);
    expect(backup).toEqual({
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: NOW.toISOString(),
      items: entries.map((e) => e.item),
      customFragrances: [jazz],
    });
    expect(parseBackup(JSON.stringify(backup))).toEqual(backup);
  });

  test('an empty collection builds a valid backup that plans to add nothing', () => {
    const backup = parseBackup(JSON.stringify(buildBackup([], NOW)));
    expect(backup.items).toEqual([]);
    expect(backup.customFragrances).toEqual([]);
    expect(planRestore(backup, { fragranceIds: catalogIds, itemIds: ids() })).toEqual({
      addFragrances: [],
      addItems: [],
      alreadyPresent: 0,
      skipped: 0,
    });
  });

  const kindOf = (text: string) => {
    try {
      parseBackup(text);
    } catch (e) {
      expect(e).toBeInstanceOf(BackupError);
      return (e as BackupError).kind;
    }
    return 'parsed';
  };
  const valid = () => JSON.parse(JSON.stringify(buildBackup(entries, NOW)));

  test('parseBackup throws kind not-json for text that is not JSON', () => {
    expect(kindOf('not json {')).toBe('not-json');
    expect(kindOf('')).toBe('not-json');
  });

  test('parseBackup throws kind wrong-format for another JSON document', () => {
    expect(kindOf(JSON.stringify({ name: 'package.json' }))).toBe('wrong-format');
    expect(kindOf('[1, 2]')).toBe('wrong-format');
    expect(kindOf('null')).toBe('wrong-format');
  });

  test('parseBackup throws kind too-new for version 2', () => {
    expect(kindOf(JSON.stringify({ ...valid(), version: 2, items: 'whatever a newer app writes' }))).toBe('too-new');
  });

  test('parseBackup throws kind invalid for an item with a negative wearCount, an unknown concentration or a missing field', () => {
    const negative = valid();
    negative.items[0].wearCount = -1;
    const unknown = valid();
    unknown.items[0].concentration = 'Cologne';
    const missing = valid();
    delete missing.items[0].createdAt;
    const noExportedAt = valid();
    delete noExportedAt.exportedAt;
    const badVersion = valid();
    badVersion.version = '1';
    for (const doc of [negative, unknown, missing, noExportedAt, badVersion]) {
      expect(kindOf(JSON.stringify(doc))).toBe('invalid');
    }
  });
});

describe('planRestore', () => {
  const backup: Backup = buildBackup(entries, NOW);

  test('adds items whose id is absent', () => {
    const plan = planRestore(backup, { fragranceIds: catalogIds, itemIds: ids() });
    expect(plan.addItems).toEqual(entries.map((e) => e.item));
    expect(plan.alreadyPresent).toBe(0);
    expect(plan.skipped).toBe(0);
  });

  test('counts items already present and leaves them out of addItems', () => {
    const plan = planRestore(backup, { fragranceIds: ids(...catalogIds, jazz.id), itemIds: ids('item-1', 'item-3') });
    expect(plan.addItems.map((i) => i.id)).toEqual(['item-2']);
    expect(plan.alreadyPresent).toBe(2);
  });

  test('skips an item whose fragrance is not in current ids or the backup custom fragrances and counts it in skipped', () => {
    const orphan: Backup = { ...backup, items: [...backup.items, item({ id: 'item-9', fragranceId: 'catalog:gone|renamed|EDT' })] };
    const plan = planRestore(orphan, { fragranceIds: catalogIds, itemIds: ids() });
    expect(plan.addItems.map((i) => i.id)).toEqual(['item-1', 'item-2', 'item-3']);
    expect(plan.skipped).toBe(1);
  });

  test('adds a custom fragrance only when its id is absent', () => {
    expect(planRestore(backup, { fragranceIds: catalogIds, itemIds: ids() }).addFragrances).toEqual([jazz]);
    expect(planRestore(backup, { fragranceIds: ids(...catalogIds, jazz.id), itemIds: ids() }).addFragrances).toEqual([]);
  });

  test('two items with the same id in one file are added once', () => {
    const doubled: Backup = { ...backup, items: [item(), item({ bottleSizeMl: 30 })] };
    const plan = planRestore(doubled, { fragranceIds: catalogIds, itemIds: ids() });
    expect(plan.addItems).toEqual([item()]);
  });

  test('applying the plan twice (second plan computed from the updated ids) adds nothing', () => {
    const fragranceIds = new Set(catalogIds);
    const itemIds = new Set<string>();
    const first = planRestore(backup, { fragranceIds, itemIds });
    first.addFragrances.forEach((f) => fragranceIds.add(f.id));
    first.addItems.forEach((i) => itemIds.add(i.id));
    const second = planRestore(backup, { fragranceIds, itemIds });
    expect(second.addFragrances).toEqual([]);
    expect(second.addItems).toEqual([]);
    expect(second.alreadyPresent).toBe(3);
  });
});
