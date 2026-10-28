import { render, screen, userEvent } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { butler } from '@/copy/butler';
import { createMemoryRepositories } from '@/data/memory';
import { RepositoryProvider } from '@/data/RepositoryContext';
import type { Repositories } from '@/data/repositories';
import { OCCASION_MAX, timeOfDayAt } from '@/domain/recommendation';
import { fixtureCatalog, fixtureIds } from '../data/fixtures';
import AskScreen from '../../app/(tabs)/ask';

const mockRouter = { push: jest.fn(), back: jest.fn(), navigate: jest.fn() };
jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  return {
    useRouter: () => mockRouter,
    useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]),
  };
});

async function setup(bottles: number, repos: Repositories = createMemoryRepositories(fixtureCatalog)) {
  const ids = [fixtureIds.sauvageEdtId, fixtureIds.hermesId, fixtureIds.sauvageEdpId];
  for (const fragranceId of ids.slice(0, bottles)) {
    await repos.collection.add({
      clientRequestId: crypto.randomUUID(),
      fragranceId,
      bottleSizeMl: 100,
      concentration: 'EDT',
      captureMethod: 'manual',
    });
  }
  const wrap = (ui: ReactElement) => <RepositoryProvider value={repos}>{ui}</RepositoryProvider>;
  return { repos, wrap, user: userEvent.setup() };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ask screen', () => {
  test('greets for the time of day and asks where the user is headed', async () => {
    const { wrap } = await setup(2);
    await render(wrap(<AskScreen />));
    expect(await screen.findByText(butler.askGreeting(timeOfDayAt(new Date())))).toBeOnTheScreen();
    expect(screen.getByLabelText(butler.askOccasionLabel)).toBeOnTheScreen();
  });

  test('opens the tray with the tidied occasion and the time of day', async () => {
    const { wrap, user } = await setup(2);
    await render(wrap(<AskScreen />));
    await user.type(await screen.findByLabelText(butler.askOccasionLabel), '  Office   Christmas party ');
    await user.press(screen.getByRole('button', { name: butler.askCta }));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/tray',
      params: { occasion: 'Office Christmas party', timeOfDay: timeOfDayAt(new Date()) },
    });
  });

  test('an empty occasion explains instead of asking', async () => {
    const { wrap, user } = await setup(2);
    await render(wrap(<AskScreen />));
    const ask = screen.getByRole('button', { name: butler.askCta });
    await screen.findByLabelText(butler.askOccasionLabel);
    expect(ask).toBeEnabled();
    await user.press(ask);
    expect(screen.getByRole('alert')).toHaveTextContent(butler.askOccasionRequired);
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  test('an occasion over the limit says so', async () => {
    const { wrap, user } = await setup(2);
    await render(wrap(<AskScreen />));
    const field = await screen.findByLabelText(butler.askOccasionLabel);
    await user.paste(field, 'a'.repeat(OCCASION_MAX + 1));
    await user.press(screen.getByRole('button', { name: butler.askCta }));
    expect(screen.getByRole('alert')).toHaveTextContent(butler.askOccasionTooLong);
  });

  test('typing clears the error', async () => {
    const { wrap, user } = await setup(2);
    await render(wrap(<AskScreen />));
    await screen.findByLabelText(butler.askOccasionLabel);
    await user.press(screen.getByRole('button', { name: butler.askCta }));
    await user.type(screen.getByLabelText(butler.askOccasionLabel), 'D');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test('with fewer than two bottles it invites the user to add one', async () => {
    const { wrap, user } = await setup(1);
    await render(wrap(<AskScreen />));
    expect(await screen.findByText(butler.askTooFew.title)).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: butler.askTooFew.cta }));
    expect(mockRouter.navigate).toHaveBeenCalledWith('/add');
  });

  test('a failed load says so and retries', async () => {
    const repos = createMemoryRepositories(fixtureCatalog);
    const list = jest.spyOn(repos.collection, 'list').mockRejectedValueOnce(new Error('offline'));
    const { wrap, user } = await setup(2, repos);
    await render(wrap(<AskScreen />));
    expect(await screen.findByText(butler.askLoadFailed)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: butler.askCta })).toBeDisabled();
    await user.press(screen.getByRole('button', { name: butler.retry }));
    expect(list).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(butler.askLoadFailed)).toBeNull();
    expect(screen.getByRole('button', { name: butler.askCta })).toBeEnabled();
  });
});
