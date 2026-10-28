import { createMemoryRepositories } from '@/data/memory';
import { fixtureCatalog, fixtureIds } from './fixtures';
import { runRepositoryContract } from './repositoryContract';

runRepositoryContract('memory', () => ({
  ...createMemoryRepositories(fixtureCatalog),
  fixtures: fixtureIds,
}));

describe('memory repositories', () => {
  test('instances do not share state', async () => {
    const a = createMemoryRepositories(fixtureCatalog);
    const b = createMemoryRepositories(fixtureCatalog);
    await a.catalog.createCustom({ house: 'Le Labo', name: 'Santal 33', concentration: 'EDP' });
    expect(await b.catalog.search('santal')).toEqual([]);
  });

  test('mutating a returned value does not change the store', async () => {
    const { catalog, collection } = createMemoryRepositories(fixtureCatalog);
    const item = await collection.add({
      clientRequestId: crypto.randomUUID(),
      fragranceId: fixtureIds.sauvageEdtId,
      bottleSizeMl: 100,
      concentration: 'EDT',
      captureMethod: 'manual',
    });
    item.favorite = true;
    (await catalog.getById(fixtureIds.sauvageEdtId))!.house = 'Tampered';
    expect((await collection.get(item.id))?.item.favorite).toBe(false);
    expect((await catalog.getById(fixtureIds.sauvageEdtId))?.house).toBe('Dior');
  });

  test('starts with an empty catalog when no seed is given', async () => {
    const { catalog } = createMemoryRepositories();
    expect(await catalog.search('sauvage')).toEqual([]);
  });

  test('bottles added in the same millisecond keep their order', async () => {
    const { collection } = createMemoryRepositories(fixtureCatalog);
    jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    const items: { id: string; createdAt: string }[] = [];
    for (let i = 0; i < 5; i++) {
      items.push(
        await collection.add({
          clientRequestId: crypto.randomUUID(),
          fragranceId: fixtureIds.sauvageEdtId,
          bottleSizeMl: 10 + i,
          concentration: 'EDT',
          captureMethod: 'manual',
        }),
      );
    }
    jest.restoreAllMocks();
    const listed = (await collection.list()).map((e) => e.item.id);
    expect(listed).toEqual(items.map((i) => i.id).reverse());
    expect(new Set(items.map((i) => i.createdAt)).size).toBe(5);
  });
});
