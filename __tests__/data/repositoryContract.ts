import type { CatalogRepository, CollectionRepository } from '@/data/repositories';
import type { NewCollectionItem } from '@/domain/types';

export interface RepositoryHarness {
  catalog: CatalogRepository;
  collection: CollectionRepository;
  fixtures: { sauvageEdtId: string; sauvageEdpId: string; hermesId: string };
}

/**
 * Behaviour every repository implementation must honour. Run it against the in-memory
 * repositories and (Task 5) the Supabase ones. The factory must return fresh, empty-collection
 * repositories per call. Search assertions use substring queries only (the DB also does fuzzy).
 */
export function runRepositoryContract(name: string, factory: () => Promise<RepositoryHarness> | RepositoryHarness): void {
  describe(`repository contract: ${name}`, () => {
    let h: RepositoryHarness;

    beforeEach(async () => {
      h = await factory();
    });

    const newItem = (over: Partial<NewCollectionItem> = {}): NewCollectionItem => ({
      clientRequestId: crypto.randomUUID(),
      fragranceId: h.fixtures.sauvageEdtId,
      bottleSizeMl: 100,
      concentration: 'EDT',
      captureMethod: 'manual',
      ...over,
    });

    describe('catalog', () => {
      test('search with a blank or whitespace-only query returns []', async () => {
        expect(await h.catalog.search('')).toEqual([]);
        expect(await h.catalog.search('   ')).toEqual([]);
      });

      test('search groups concentration variants of the same fragrance', async () => {
        const groups = await h.catalog.search('sauvage');
        const sauvage = groups.filter((g) => g.name === 'Sauvage');
        expect(sauvage).toHaveLength(1);
        const ids = sauvage[0].variants.map((v) => v.id);
        expect(ids).toEqual(expect.arrayContaining([h.fixtures.sauvageEdtId, h.fixtures.sauvageEdpId]));
        expect(sauvage[0].variants.map((v) => v.concentration)).toEqual(
          expect.arrayContaining(['EDT', 'EDP']),
        );
      });

      test('search ignores case and accents and matches curly or straight apostrophes', async () => {
        for (const q of ['hermes', 'HERMÈS', 'terre d’hermes', "terre d'hermes"]) {
          const groups = await h.catalog.search(q);
          const ids = groups.flatMap((g) => g.variants.map((v) => v.id));
          expect(ids).toContain(h.fixtures.hermesId);
        }
      });

      test('search matches across house and name', async () => {
        const groups = await h.catalog.search('dior sauvage');
        const ids = groups.flatMap((g) => g.variants.map((v) => v.id));
        expect(ids).toEqual(expect.arrayContaining([h.fixtures.sauvageEdtId, h.fixtures.sauvageEdpId]));
      });

      test('search with no match returns []', async () => {
        expect(await h.catalog.search('zzzzqqqq')).toEqual([]);
      });

      test('getById returns a known fragrance and null for an unknown id', async () => {
        const f = await h.catalog.getById(h.fixtures.hermesId);
        expect(f?.id).toBe(h.fixtures.hermesId);
        expect(f?.isCustom).toBe(false);
        expect(await h.catalog.getById(crypto.randomUUID())).toBeNull();
      });

      test('createCustom returns a custom fragrance that appears in search and getById', async () => {
        const created = await h.catalog.createCustom({ house: 'Le Labo', name: 'Santal 33', concentration: 'EDP' });
        expect(created.isCustom).toBe(true);
        expect(created.house).toBe('Le Labo');
        expect(created.name).toBe('Santal 33');
        expect(created.concentration).toBe('EDP');
        const groups = await h.catalog.search('santal');
        expect(groups.flatMap((g) => g.variants.map((v) => v.id))).toContain(created.id);
        expect((await h.catalog.getById(created.id))?.id).toBe(created.id);
      });

      test('createCustom rejects invalid input', async () => {
        await expect(
          h.catalog.createCustom({ house: '   ', name: 'X', concentration: 'EDP' }),
        ).rejects.toThrow();
      });
    });

    describe('collection', () => {
      test('add then list returns one entry joined to its fragrance', async () => {
        const item = await h.collection.add(newItem());
        const list = await h.collection.list();
        expect(list).toHaveLength(1);
        expect(list[0].item.id).toBe(item.id);
        expect(list[0].fragrance.id).toBe(h.fixtures.sauvageEdtId);
      });

      test('add applies defaults', async () => {
        const item = await h.collection.add(newItem({ bottleSizeMl: 50, concentration: 'EDP' }));
        expect(item.fragranceId).toBe(h.fixtures.sauvageEdtId);
        expect(item.bottleSizeMl).toBe(50);
        expect(item.concentration).toBe('EDP');
        expect(item.captureMethod).toBe('manual');
        expect(item.favorite).toBe(false);
        expect(item.wearCount).toBe(0);
        expect(item.acquisitionDate).toBeNull();
        expect(item.userNotes).toBeNull();
        expect(Number.isNaN(Date.parse(item.createdAt))).toBe(false);
      });

      test('add is idempotent on clientRequestId', async () => {
        const input = newItem();
        const a = await h.collection.add(input);
        const b = await h.collection.add(input);
        expect(b.id).toBe(a.id);
        expect(await h.collection.list()).toHaveLength(1);
      });

      test('a repeated add returns the existing item unchanged', async () => {
        const input = newItem({ bottleSizeMl: 50 });
        const a = await h.collection.add(input);
        const b = await h.collection.add({ ...input, bottleSizeMl: 100 });
        expect(b).toEqual(a);
        expect(b.bottleSizeMl).toBe(50);
      });

      test('two adds of the same fragrance with different request ids create two bottles', async () => {
        const a = await h.collection.add(newItem({ bottleSizeMl: 50 }));
        const b = await h.collection.add(newItem({ bottleSizeMl: 100 }));
        expect(a.id).not.toBe(b.id);
        expect(await h.collection.list()).toHaveLength(2);
      });

      test('add rejects invalid input and stores nothing', async () => {
        await expect(h.collection.add(newItem({ bottleSizeMl: 0 }))).rejects.toThrow();
        await expect(h.collection.add(newItem({ clientRequestId: 'not-a-uuid' }))).rejects.toThrow();
        expect(await h.collection.list()).toEqual([]);
      });

      test('add rejects a fragrance that is not in the catalog', async () => {
        await expect(h.collection.add(newItem({ fragranceId: crypto.randomUUID() }))).rejects.toThrow();
        expect(await h.collection.list()).toEqual([]);
      });

      test('a custom fragrance can be added to the collection', async () => {
        const custom = await h.catalog.createCustom({ house: 'Le Labo', name: 'Santal 33', concentration: 'EDP' });
        const item = await h.collection.add(newItem({ fragranceId: custom.id, concentration: 'EDP' }));
        const entry = await h.collection.get(item.id);
        expect(entry?.fragrance.id).toBe(custom.id);
        expect(entry?.fragrance.isCustom).toBe(true);
      });

      test('list returns the newest bottle first', async () => {
        const first = await h.collection.add(newItem({ bottleSizeMl: 50 }));
        const second = await h.collection.add(newItem({ bottleSizeMl: 100 }));
        const third = await h.collection.add(newItem({ fragranceId: h.fixtures.hermesId, concentration: 'EDT' }));
        const ids = (await h.collection.list()).map((e) => e.item.id);
        expect(ids).toEqual([third.id, second.id, first.id]);
      });

      test('get returns the entry, and null for an unknown id', async () => {
        const item = await h.collection.add(newItem());
        const entry = await h.collection.get(item.id);
        expect(entry?.item.id).toBe(item.id);
        expect(entry?.fragrance.id).toBe(h.fixtures.sauvageEdtId);
        expect(await h.collection.get(crypto.randomUUID())).toBeNull();
      });

      test('update persists a favorite flag', async () => {
        const item = await h.collection.add(newItem());
        const updated = await h.collection.update(item.id, { favorite: true });
        expect(updated.favorite).toBe(true);
        expect((await h.collection.get(item.id))?.item.favorite).toBe(true);
      });

      test('update changes only the fields in the patch', async () => {
        const item = await h.collection.add(newItem({ bottleSizeMl: 50, userNotes: 'gift' }));
        const updated = await h.collection.update(item.id, { bottleSizeMl: 100 });
        expect(updated.bottleSizeMl).toBe(100);
        expect(updated.userNotes).toBe('gift');
        expect(updated.favorite).toBe(false);
      });

      test('update trims notes, and clears them with an empty value', async () => {
        const item = await h.collection.add(newItem());
        expect((await h.collection.update(item.id, { userNotes: '  smells like summer ' })).userNotes).toBe(
          'smells like summer',
        );
        expect((await h.collection.update(item.id, { userNotes: '   ' })).userNotes).toBeNull();
      });

      test('update sets and clears the acquisition date', async () => {
        const item = await h.collection.add(newItem());
        expect((await h.collection.update(item.id, { acquisitionDate: '2025-03-09' })).acquisitionDate).toBe(
          '2025-03-09',
        );
        expect((await h.collection.update(item.id, { acquisitionDate: null })).acquisitionDate).toBeNull();
      });

      test('update rejects an invalid patch and leaves the bottle unchanged', async () => {
        const item = await h.collection.add(newItem({ bottleSizeMl: 50 }));
        await expect(h.collection.update(item.id, { bottleSizeMl: 0 })).rejects.toThrow();
        await expect(h.collection.update(item.id, { bottleSizeMl: 1001 })).rejects.toThrow();
        await expect(h.collection.update(item.id, { acquisitionDate: '09/03/2025' })).rejects.toThrow();
        await expect(h.collection.update(item.id, { userNotes: 'n'.repeat(2001) })).rejects.toThrow();
        expect((await h.collection.get(item.id))?.item.bottleSizeMl).toBe(50);
      });

      test('update of an unknown id rejects', async () => {
        await expect(h.collection.update(crypto.randomUUID(), { favorite: true })).rejects.toThrow();
      });

      test('remove deletes the bottle', async () => {
        const keep = await h.collection.add(newItem({ bottleSizeMl: 50 }));
        const gone = await h.collection.add(newItem({ bottleSizeMl: 100 }));
        await h.collection.remove(gone.id);
        expect(await h.collection.get(gone.id)).toBeNull();
        expect((await h.collection.list()).map((e) => e.item.id)).toEqual([keep.id]);
      });

      test('remove of an unknown id resolves without error', async () => {
        await expect(h.collection.remove(crypto.randomUUID())).resolves.toBeUndefined();
      });
    });
  });
}
