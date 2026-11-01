import { act, render, screen, userEvent } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { RepositoryError } from '@/data/errors';
import { createMemoryRepositories } from '@/data/memory';
import { BackupApiProvider } from '@/data/BackupApiContext';
import type { BackupApi } from '@/data/backupApi';
import { RepositoryProvider } from '@/data/RepositoryContext';
import type { Repositories } from '@/data/repositories';
import { butler } from '@/copy/butler';
import type { CollectionEntry, Concentration } from '@/domain/types';
import { fixtureCatalog, fixtureIds } from '../data/fixtures';
import CollectionScreen from '../../app/(tabs)/index';

const mockRouter = { push: jest.fn(), back: jest.fn(), navigate: jest.fn() };
jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  return {
    useRouter: () => mockRouter,
    // Behaves like a mount effect: the screen loads when it first appears.
    useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]),
  };
});

const { sauvageEdtId, sauvageEdpId, hermesId } = fixtureIds;
const BLEU_ID = 'fixture-bleu-edp';

function setup(repos: Repositories = createMemoryRepositories(fixtureCatalog)) {
  const wrap = (ui: ReactElement) => <RepositoryProvider value={repos}>{ui}</RepositoryProvider>;
  return { repos, wrap, user: userEvent.setup() };
}

async function addBottle(repos: Repositories, fragranceId: string, concentration: Concentration, ml = 100) {
  return repos.collection.add({
    clientRequestId: crypto.randomUUID(),
    fragranceId,
    bottleSizeMl: ml,
    concentration,
    captureMethod: 'manual',
  });
}

/** House order for the fixture: Chanel, Dior, Hermès. Added Dior, Hermès, Chanel, so "recent" is the reverse. */
async function addThree(repos: Repositories) {
  const dior = await addBottle(repos, sauvageEdtId, 'EDT', 100);
  const hermes = await addBottle(repos, hermesId, 'EDT', 50);
  const chanel = await addBottle(repos, BLEU_ID, 'EDP', 100);
  return { dior, hermes, chanel };
}

/** The collection rows, in screen order, as their accessibility labels. */
const rowLabels = (): string[] =>
  screen.getAllByRole('button', { name: /·/ }).map((el) => el.props.accessibilityLabel as string);

const pullToRefresh = async () => {
  const list = screen.getByTestId('collection-list');
  await act(async () => {
    list.props.refreshControl.props.onRefresh();
  });
};

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('collection screen', () => {
  test('an empty collection says so, and its CTA opens the Add tab', async () => {
    const { wrap, user } = setup();
    await render(wrap(<CollectionScreen />));
    expect(await screen.findByText(butler.emptyCollection.title)).toBeOnTheScreen();
    expect(screen.getByText(butler.emptyCollection.body)).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: butler.emptyCollection.cta }));
    expect(mockRouter.navigate).toHaveBeenCalledWith('/add');
  });

  test('does not flash the empty state while the first load is in flight', async () => {
    const { repos, wrap } = setup();
    const pending = deferred<CollectionEntry[]>();
    jest.spyOn(repos.collection, 'list').mockReturnValueOnce(pending.promise);
    await render(wrap(<CollectionScreen />));
    expect(screen.queryByText(butler.emptyCollection.title)).toBeNull();
    await act(async () => pending.resolve([]));
    expect(screen.getByText(butler.emptyCollection.title)).toBeOnTheScreen();
  });

  test('lists three bottles in house order by default', async () => {
    const { repos, wrap } = setup();
    await addThree(repos);
    await render(wrap(<CollectionScreen />));
    await screen.findByText('Dior · Sauvage');
    expect(rowLabels().map((l) => l.split(',')[0])).toEqual([
      'Chanel · Bleu de Chanel',
      'Dior · Sauvage',
      'Hermès · Terre d’Hermès',
    ]);
  });

  test('"Recent" reorders newest first', async () => {
    const { repos, wrap, user } = setup();
    await addThree(repos);
    await render(wrap(<CollectionScreen />));
    await screen.findByText('Dior · Sauvage');
    await user.press(screen.getByRole('button', { name: butler.sortRecent }));
    expect(rowLabels().map((l) => l.split(',')[0])).toEqual([
      'Chanel · Bleu de Chanel',
      'Hermès · Terre d’Hermès',
      'Dior · Sauvage',
    ]);
  });

  test('"Favourites" puts favourites first, then house order', async () => {
    const { repos, wrap, user } = setup();
    const { hermes } = await addThree(repos);
    await repos.collection.update(hermes.id, { favorite: true });
    await render(wrap(<CollectionScreen />));
    await screen.findByText('Dior · Sauvage');
    await user.press(screen.getByRole('button', { name: butler.sortFavorites }));
    expect(rowLabels().map((l) => l.split(',')[0])).toEqual([
      'Hermès · Terre d’Hermès',
      'Chanel · Bleu de Chanel',
      'Dior · Sauvage',
    ]);
  });

  test('the selected sort is marked, house by default', async () => {
    const { wrap, user } = setup();
    await render(wrap(<CollectionScreen />));
    await screen.findByText(butler.emptyCollection.title);
    expect(screen.getByRole('button', { name: butler.sortHouse })).toBeSelected();
    await user.press(screen.getByRole('button', { name: butler.sortRecent }));
    expect(screen.getByRole('button', { name: butler.sortRecent })).toBeSelected();
    expect(screen.getByRole('button', { name: butler.sortHouse })).not.toBeSelected();
  });

  test('each row shows house, name, concentration and size; favourites carry the mark', async () => {
    const { repos, wrap } = setup();
    const { chanel } = await addThree(repos);
    await repos.collection.update(chanel.id, { favorite: true });
    await render(wrap(<CollectionScreen />));
    expect(await screen.findByText('Dior · Sauvage')).toBeOnTheScreen();
    expect(screen.getByText(`EDT · ${butler.sizeLabel(100)}`)).toBeOnTheScreen();
    expect(screen.getByText(`EDT · ${butler.sizeLabel(50)}`)).toBeOnTheScreen();
    expect(screen.getByText(`EDP · ${butler.sizeLabel(100)} · ${butler.favoriteMark}`)).toBeOnTheScreen();
  });

  test('two bottles of the same fragrance are two rows', async () => {
    const { repos, wrap } = setup();
    await addBottle(repos, sauvageEdtId, 'EDT', 100);
    await addBottle(repos, sauvageEdtId, 'EDT', 50);
    await render(wrap(<CollectionScreen />));
    expect(await screen.findAllByText('Dior · Sauvage')).toHaveLength(2);
  });

  test('a row opens that bottle', async () => {
    const { repos, wrap, user } = setup();
    const { hermes } = await addThree(repos);
    await render(wrap(<CollectionScreen />));
    await user.press(await screen.findByRole('button', { name: /Hermès · Terre d’Hermès/ }));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/item/[id]', params: { id: hermes.id } });
  });

  test('the settings button opens settings', async () => {
    const { wrap, user } = setup();
    await render(wrap(<CollectionScreen />));
    await user.press(await screen.findByRole('button', { name: butler.settingsTitle }));
    expect(mockRouter.push).toHaveBeenCalledWith('/settings');
  });

  test('a failed load shows the banner, and the banner retry reloads', async () => {
    const { repos, wrap, user } = setup();
    await addBottle(repos, sauvageEdtId, 'EDT');
    jest.spyOn(repos.collection, 'list').mockRejectedValueOnce(new RepositoryError('network', 'offline'));
    await render(wrap(<CollectionScreen />));
    expect(await screen.findByText(butler.loadFailed)).toBeOnTheScreen();
    expect(screen.queryByText(butler.emptyCollection.title)).toBeNull();
    await user.press(screen.getByRole('button', { name: butler.retry }));
    expect(await screen.findByText('Dior · Sauvage')).toBeOnTheScreen();
    expect(screen.queryByText(butler.loadFailed)).toBeNull();
  });

  test('pull-to-refresh tries again after a failure', async () => {
    const { repos, wrap } = setup();
    await addBottle(repos, sauvageEdtId, 'EDT');
    const list = jest.spyOn(repos.collection, 'list').mockRejectedValueOnce(new Error('boom'));
    await render(wrap(<CollectionScreen />));
    expect(await screen.findByText(butler.loadFailed)).toBeOnTheScreen();
    await pullToRefresh();
    expect(list).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('Dior · Sauvage')).toBeOnTheScreen();
    expect(screen.queryByText(butler.loadFailed)).toBeNull();
  });

  test('a failed refresh keeps the bottles already shown', async () => {
    const { repos, wrap } = setup();
    await addBottle(repos, sauvageEdtId, 'EDT');
    await render(wrap(<CollectionScreen />));
    await screen.findByText('Dior · Sauvage');
    jest.spyOn(repos.collection, 'list').mockRejectedValueOnce(new Error('boom'));
    await pullToRefresh();
    expect(await screen.findByText(butler.loadFailed)).toBeOnTheScreen();
    expect(screen.getByText('Dior · Sauvage')).toBeOnTheScreen();
  });

  test('the latest load wins: a slower, older response is ignored', async () => {
    const { repos, wrap } = setup();
    const first = deferred<CollectionEntry[]>();
    const second = deferred<CollectionEntry[]>();
    jest.spyOn(repos.collection, 'list').mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const dior = await addBottle(repos, sauvageEdtId, 'EDT');
    const chanel = await addBottle(repos, BLEU_ID, 'EDP');
    const entry = async (id: string) => (await repos.collection.get(id)) as CollectionEntry;

    await render(wrap(<CollectionScreen />));
    await pullToRefresh();
    await act(async () => second.resolve([await entry(chanel.id)]));
    expect(screen.getByText('Chanel · Bleu de Chanel')).toBeOnTheScreen();
    await act(async () => first.resolve([await entry(dior.id)]));
    expect(screen.getByText('Chanel · Bleu de Chanel')).toBeOnTheScreen();
    expect(screen.queryByText('Dior · Sauvage')).toBeNull();
  });

  test('a stale failure does not hide newer results', async () => {
    const { repos, wrap } = setup();
    const first = deferred<CollectionEntry[]>();
    await addBottle(repos, sauvageEdpId, 'EDP');
    jest.spyOn(repos.collection, 'list').mockReturnValueOnce(first.promise);
    await render(wrap(<CollectionScreen />));
    await pullToRefresh();
    expect(await screen.findByText('Dior · Sauvage')).toBeOnTheScreen();
    await act(async () => first.reject(new Error('late')));
    expect(screen.queryByText(butler.loadFailed)).toBeNull();
    expect(screen.getByText('Dior · Sauvage')).toBeOnTheScreen();
  });
});

describe('collection screen backup reminder', () => {
  const backupApi = (count: number): BackupApi => ({
    backUp: jest.fn(async () => true),
    restore: jest.fn(async () => null),
    unbackedCount: jest.fn(async () => count),
  });

  async function renderWithBackup(api: BackupApi) {
    const { wrap, user } = setup();
    await render(wrap(<BackupApiProvider value={api}>{<CollectionScreen />}</BackupApiProvider>));
    return user;
  }

  test('shows the banner at 3 unbacked bottles, and Back up opens Settings', async () => {
    const user = await renderWithBackup(backupApi(3));
    expect(await screen.findByText(butler.backupReminder(3))).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: butler.backupReminderCta }));
    expect(mockRouter.push).toHaveBeenCalledWith('/settings');
  });

  test('does not show it at 2', async () => {
    const api = backupApi(2);
    await renderWithBackup(api);
    await screen.findByText(butler.emptyCollection.title);
    expect(api.unbackedCount).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: butler.backupReminderCta })).toBeNull();
  });

  test('Not now hides it', async () => {
    const user = await renderWithBackup(backupApi(5));
    await user.press(await screen.findByRole('button', { name: butler.backupReminderDismiss }));
    expect(screen.queryByText(butler.backupReminder(5))).toBeNull();
  });

  test('does not show it when there is no backup API', async () => {
    const { wrap } = setup();
    await render(wrap(<CollectionScreen />));
    await screen.findByText(butler.emptyCollection.title);
    expect(screen.queryByRole('button', { name: butler.backupReminderCta })).toBeNull();
  });
});
