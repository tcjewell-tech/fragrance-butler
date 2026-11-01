import {
  BACKUP_FILENAME,
  BACKUP_REMINDER_THRESHOLD,
  LAST_BACKUP_KEY,
  createBackupApi,
  type BackupDevice,
} from '@/data/backupApi';
import { createLocalRepositories, type KeyValueStorage, type LocalRepositories } from '@/data/local';
import { BackupError, parseBackup } from '@/domain/backup';
import type { NewCollectionItem } from '@/domain/types';
import { fixtureCatalog, fixtureIds } from './fixtures';

function fakeStorage() {
  const data = new Map<string, string>();
  const storage: KeyValueStorage & { data: Map<string, string> } = {
    data,
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => {
      data.set(key, value);
    },
  };
  return storage;
}

function fakeDevice() {
  const state = { files: new Map<string, string>(), shared: [] as string[], shareResult: true, picked: null as string | null };
  const io = {
    writeFile: jest.fn(async (name: string, text: string) => {
      state.files.set(name, text);
      return `file:///cache/${name}`;
    }),
    share: jest.fn(async (uri: string) => {
      state.shared.push(uri);
      return state.shareResult;
    }),
    pickFile: jest.fn(async () => state.picked),
  } satisfies BackupDevice;
  return Object.assign(state, io);
}

const newItem = (over: Partial<NewCollectionItem> = {}): NewCollectionItem => ({
  clientRequestId: crypto.randomUUID(),
  fragranceId: fixtureIds.sauvageEdtId,
  bottleSizeMl: 100,
  concentration: 'EDT',
  captureMethod: 'manual',
  ...over,
});

const NOW = new Date('2030-01-01T00:00:00.000Z');

async function setup() {
  const storage = fakeStorage();
  const repositories: LocalRepositories = await createLocalRepositories(storage, fixtureCatalog);
  const device = fakeDevice();
  const api = createBackupApi({ repositories, storage, device, now: () => NOW });
  return { storage, repositories, device, api };
}

const rejection = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => e,
  );

describe('backup API', () => {
  test('backUp writes the named file with a valid backup and shares it, then stamps last-backup', async () => {
    const { storage, repositories, device, api } = await setup();
    const custom = await repositories.catalog.createCustom({ house: 'Le Labo', name: 'Santal 33', concentration: 'EDP' });
    const item = await repositories.collection.add(newItem({ fragranceId: custom.id, concentration: 'EDP' }));

    expect(await api.backUp()).toBe(true);
    const backup = parseBackup(device.files.get(BACKUP_FILENAME)!);
    expect(backup.items).toEqual([item]);
    expect(backup.customFragrances).toEqual([custom]);
    expect(backup.exportedAt).toBe(NOW.toISOString());
    expect(device.shared).toEqual([`file:///cache/${BACKUP_FILENAME}`]);
    expect(storage.data.get(LAST_BACKUP_KEY)).toBe(NOW.toISOString());
  });

  test('backUp on an empty collection still writes a valid file', async () => {
    const { device, api } = await setup();
    expect(await api.backUp()).toBe(true);
    expect(parseBackup(device.files.get(BACKUP_FILENAME)!).items).toEqual([]);
  });

  test('a cancelled share sheet returns false and does not stamp last-backup', async () => {
    const { storage, device, api } = await setup();
    device.shareResult = false;
    expect(await api.backUp()).toBe(false);
    expect(storage.data.has(LAST_BACKUP_KEY)).toBe(false);
  });

  test('a failing writeFile rejects and does not stamp last-backup', async () => {
    const { storage, device, api } = await setup();
    device.writeFile.mockRejectedValueOnce(new Error('disk full'));
    expect(await rejection(api.backUp())).toBeInstanceOf(Error);
    expect(device.share).not.toHaveBeenCalled();
    expect(storage.data.has(LAST_BACKUP_KEY)).toBe(false);
  });

  test('restore of a valid file merges and returns added/alreadyPresent/skipped counts', async () => {
    const source = await setup();
    const custom = await source.repositories.catalog.createCustom({ house: 'Le Labo', name: 'Santal 33', concentration: 'EDP' });
    const kept = await source.repositories.collection.add(newItem());
    const restoredItem = await source.repositories.collection.add(newItem({ fragranceId: custom.id, concentration: 'EDP' }));
    await source.api.backUp();
    const file = JSON.parse(source.device.files.get(BACKUP_FILENAME)!);
    file.items.push({ ...file.items[0], id: 'orphan', fragranceId: 'catalog:gone|gone|EDT' });

    const target = await setup();
    await target.repositories.applyRestore({ addFragrances: [], addItems: [kept], alreadyPresent: 0, skipped: 0 });
    target.device.picked = JSON.stringify(file);

    expect(await target.api.restore()).toEqual({ added: 1, alreadyPresent: 1, skipped: 1 });
    const ids = (await target.repositories.collection.list()).map((e) => e.item.id).sort();
    expect(ids).toEqual([kept.id, restoredItem.id].sort());
    expect(await target.repositories.catalog.getById(custom.id)).toEqual(custom);
  });

  test('restoring the same file twice returns added 0 the second time', async () => {
    const source = await setup();
    await source.repositories.collection.add(newItem());
    await source.api.backUp();
    const target = await setup();
    target.device.picked = source.device.files.get(BACKUP_FILENAME)!;
    expect(await target.api.restore()).toEqual({ added: 1, alreadyPresent: 0, skipped: 0 });
    expect(await target.api.restore()).toEqual({ added: 0, alreadyPresent: 1, skipped: 0 });
    expect(await target.repositories.collection.list()).toHaveLength(1);
  });

  test('restore returns null when the picker is cancelled and changes nothing', async () => {
    const { storage, repositories, api } = await setup();
    await repositories.collection.add(newItem());
    const before = JSON.stringify([...storage.data]);
    expect(await api.restore()).toBeNull();
    expect(JSON.stringify([...storage.data])).toBe(before);
  });

  test('restore of a bad file rejects with BackupError and changes nothing', async () => {
    const { storage, repositories, device, api } = await setup();
    await repositories.collection.add(newItem());
    const before = JSON.stringify([...storage.data]);
    device.picked = '{"format":"something-else"}';
    expect(await rejection(api.restore())).toBeInstanceOf(BackupError);
    expect(JSON.stringify([...storage.data])).toBe(before);
  });

  test('restore does not change last-backup', async () => {
    const source = await setup();
    await source.repositories.collection.add(newItem());
    await source.api.backUp();
    const target = await setup();
    target.storage.data.set(LAST_BACKUP_KEY, '2029-06-01T00:00:00.000Z');
    target.device.picked = source.device.files.get(BACKUP_FILENAME)!;
    await target.api.restore();
    expect(target.storage.data.get(LAST_BACKUP_KEY)).toBe('2029-06-01T00:00:00.000Z');
  });

  test('unbackedCount counts items created after last-backup, or all items when never backed up', async () => {
    const { storage, repositories, api } = await setup();
    jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2029-01-01T00:00:00.000Z'));
    await repositories.collection.add(newItem());
    jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2029-03-01T00:00:00.000Z'));
    await repositories.collection.add(newItem());
    await repositories.collection.add(newItem());
    jest.restoreAllMocks();
    expect(await api.unbackedCount()).toBe(3);
    storage.data.set(LAST_BACKUP_KEY, '2029-02-01T00:00:00.000Z');
    expect(await api.unbackedCount()).toBe(2);
  });

  test('the reminder threshold is 3', () => {
    expect(BACKUP_REMINDER_THRESHOLD).toBe(3);
  });
});
