import { act, render, screen, userEvent } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { AccessibilityInfo } from 'react-native';
import { butler } from '@/copy/butler';
import { createMemoryRepositories } from '@/data/memory';
import { RepositoryProvider } from '@/data/RepositoryContext';
import type { Repositories } from '@/data/repositories';
import type { Recommendation } from '@/domain/recommendation';
import type { Fragrance } from '@/domain/types';
import { fixtureCatalog } from '../data/fixtures';
import TrayScreen from '../../app/tray';

let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
}));

const extra: Fragrance[] = ['Shalimar', 'Mitsouko'].map((name, i) => ({
  ...fixtureCatalog[0],
  id: `guerlain-${i}`,
  house: 'Guerlain',
  name,
}));

/** A memory collection of `n` bottles; returns the repos and the bottles' item ids in list order. */
async function setup(n: number) {
  const repos: Repositories = createMemoryRepositories([...fixtureCatalog, ...extra]);
  const catalog = [...fixtureCatalog, ...extra];
  for (const f of catalog.slice(0, n)) {
    await repos.collection.add({
      clientRequestId: crypto.randomUUID(),
      fragranceId: f.id,
      bottleSizeMl: 50,
      concentration: f.concentration,
      captureMethod: 'manual',
    });
  }
  const itemIds = (await repos.collection.list()).map((e) => e.item.id);
  const wrap = (ui: ReactElement) => <RepositoryProvider value={repos}>{ui}</RepositoryProvider>;
  return { repos, itemIds, wrap, user: userEvent.setup() };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const wearButtons = () => screen.getAllByRole('button', { name: /^Wear / });

let announceSpy: jest.SpyInstance;
beforeEach(() => {
  mockParams = { occasion: 'Office Christmas party', timeOfDay: 'evening' };
  announceSpy = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
});
afterEach(() => {
  announceSpy.mockRestore();
});

describe('tray screen', () => {
  test('shows the butler choosing, then the tray', async () => {
    const { repos, wrap } = await setup(3);
    const pending = deferred<Recommendation>();
    const real = repos.recommendations.recommend.bind(repos.recommendations);
    jest.spyOn(repos.recommendations, 'recommend').mockImplementationOnce(() => pending.promise);
    await render(wrap(<TrayScreen />));
    expect(screen.getByText(butler.trayChoosing)).toBeOnTheScreen();
    await act(async () => pending.resolve(await real({ occasion: 'Office Christmas party', timeOfDay: 'evening' })));
    expect(screen.getByText(butler.trayGreeting('evening'))).toBeOnTheScreen();
    expect(wearButtons()).toHaveLength(3);
  });

  test('asks with the occasion and time of day it was given', async () => {
    const { repos, wrap } = await setup(3);
    const recommend = jest.spyOn(repos.recommendations, 'recommend');
    await render(wrap(<TrayScreen />));
    await screen.findByText(butler.trayGreeting('evening'));
    expect(recommend).toHaveBeenCalledWith({
      occasion: 'Office Christmas party',
      timeOfDay: 'evening',
      excludeItemIds: [],
    });
    expect(screen.getByText('Office Christmas party')).toBeOnTheScreen();
  });

  test('"Wear this" records the choice and sets the others aside', async () => {
    const { repos, wrap, user } = await setup(3);
    const record = jest.spyOn(repos.recommendations, 'recordSelection');
    await render(wrap(<TrayScreen />));
    await screen.findByText(butler.trayGreeting('evening'));
    await user.press(wearButtons()[0]);
    expect(record).toHaveBeenCalledTimes(1);
    expect(screen.getByText(butler.trayEnjoy('evening'))).toBeOnTheScreen();
    expect(screen.getByText(butler.trayChosen('evening'))).toBeOnTheScreen();
    expect(announceSpy).toHaveBeenCalledWith(butler.trayChosen('evening'));
    expect(screen.queryAllByRole('button', { name: /^Wear / })).toHaveLength(0);
  });

  test('"Change my mind" brings the full tray back', async () => {
    const { wrap, user } = await setup(3);
    await render(wrap(<TrayScreen />));
    await screen.findByText(butler.trayGreeting('evening'));
    await user.press(wearButtons()[1]);
    await user.press(screen.getByRole('button', { name: butler.trayChangeMind }));
    expect(screen.getByText(butler.trayGreeting('evening'))).toBeOnTheScreen();
    expect(wearButtons()).toHaveLength(3);
  });

  test('a failed choice says nothing has changed', async () => {
    const { repos, wrap, user } = await setup(3);
    jest.spyOn(repos.recommendations, 'recordSelection').mockRejectedValueOnce(new Error('offline'));
    await render(wrap(<TrayScreen />));
    await screen.findByText(butler.trayGreeting('evening'));
    await user.press(wearButtons()[0]);
    expect(screen.getByText(butler.trayChooseFailed)).toBeOnTheScreen();
    expect(wearButtons()).toHaveLength(3);
  });

  test('"Show me others" leaves out what was already offered', async () => {
    const { repos, itemIds, wrap, user } = await setup(6);
    const recommend = jest.spyOn(repos.recommendations, 'recommend');
    await render(wrap(<TrayScreen />));
    await screen.findByText(butler.trayGreeting('evening'));
    await user.press(screen.getByRole('button', { name: butler.trayOthers }));
    const firstThree = itemIds.slice(0, 3);
    expect(recommend).toHaveBeenLastCalledWith(expect.objectContaining({ excludeItemIds: firstThree }));
    const offeredNow = (await recommend.mock.results[1].value).picks.map((p: { itemId: string }) => p.itemId);
    for (const id of offeredNow) expect(firstThree).not.toContain(id);
  });

  test('with nothing else to offer, it says so without asking again', async () => {
    const { repos, wrap, user } = await setup(3);
    const recommend = jest.spyOn(repos.recommendations, 'recommend');
    await render(wrap(<TrayScreen />));
    await screen.findByText(butler.trayGreeting('evening'));
    await user.press(screen.getByRole('button', { name: butler.trayOthers }));
    expect(recommend).toHaveBeenCalledTimes(1);
    expect(screen.getByText(butler.trayNoOthers)).toBeOnTheScreen();
  });

  test('a failed "Show me others" keeps the current tray', async () => {
    const { repos, wrap, user } = await setup(6);
    await render(wrap(<TrayScreen />));
    await screen.findByText(butler.trayGreeting('evening'));
    jest.spyOn(repos.recommendations, 'recommend').mockRejectedValueOnce(new Error('offline'));
    await user.press(screen.getByRole('button', { name: butler.trayOthers }));
    expect(screen.getByText(butler.trayOthersFailed)).toBeOnTheScreen();
    expect(wearButtons()).toHaveLength(3);
  });

  test('a failed request offers to try again', async () => {
    const { repos, wrap, user } = await setup(3);
    const recommend = jest.spyOn(repos.recommendations, 'recommend').mockRejectedValueOnce(new Error('offline'));
    await render(wrap(<TrayScreen />));
    expect(await screen.findByText(butler.trayFailed)).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: butler.retry }));
    expect(await screen.findByText(butler.trayGreeting('evening'))).toBeOnTheScreen();
    expect(recommend).toHaveBeenCalledTimes(2);
  });

  test('picks that are no longer in the collection are dropped; too few left is a failure', async () => {
    const { repos, itemIds, wrap } = await setup(3);
    jest.spyOn(repos.recommendations, 'recommend').mockResolvedValueOnce({
      requestId: 'r1',
      picks: [
        { itemId: itemIds[0], rationale: 'Still here.' },
        { itemId: 'gone', rationale: 'Removed meanwhile.' },
      ],
    });
    await render(wrap(<TrayScreen />));
    expect(await screen.findByText(butler.trayFailed)).toBeOnTheScreen();
  });

  test('an unknown time of day falls back to the clock', async () => {
    mockParams = { occasion: 'Dinner out', timeOfDay: 'teatime' };
    const { repos, wrap } = await setup(2);
    const recommend = jest.spyOn(repos.recommendations, 'recommend');
    await render(wrap(<TrayScreen />));
    await screen.findAllByRole('button', { name: /^Wear / });
    const sent = recommend.mock.calls[0][0].timeOfDay;
    expect(['morning', 'afternoon', 'evening', 'night']).toContain(sent);
  });
});
