import { act, fireEvent, render, renderHook, screen, userEvent } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { AccessibilityInfo } from 'react-native';
import { butler } from '@/copy/butler';
import { RepositoryError } from '@/data/errors';
import { createMemoryRepositories } from '@/data/memory';
import { RepositoryProvider } from '@/data/RepositoryContext';
import type { Repositories } from '@/data/repositories';
import { useSaveBottle } from '@/features/add/useSaveBottle';
import { fixtureCatalog, fixtureIds } from '../data/fixtures';
import AddScreen from '../../app/(tabs)/add';
import ConfirmScreen from '../../app/add/confirm';
import CustomScreen from '../../app/add/custom';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn() };
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
}));

const { sauvageEdtId, sauvageEdpId, hermesId } = fixtureIds;

function setup(repos: Repositories = createMemoryRepositories(fixtureCatalog)) {
  const wrap = (ui: ReactElement) => <RepositoryProvider value={repos}>{ui}</RepositoryProvider>;
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  return { repos, wrap, user };
}

const advance = (ms: number) =>
  act(async () => {
    jest.advanceTimersByTime(ms);
  });

const searchInput = () => screen.getByLabelText(butler.searchPlaceholder);
const button = (name: string) => screen.getByRole('button', { name });

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
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockParams = {};
});

afterEach(() => {
  jest.useRealTimers();
});

describe('search screen', () => {
  test('typing "sauvage" shows a single grouped row after the debounce', async () => {
    const { wrap, user } = setup();
    await render(wrap(<AddScreen />));
    await user.type(searchInput(), 'sauvage');
    await advance(250);
    expect(await screen.findByText('Dior · Sauvage')).toBeOnTheScreen();
    expect(screen.getByText('EDT · EDP')).toBeOnTheScreen();
    expect(screen.queryByText(/Hermès/)).toBeNull();
    expect(screen.getAllByText('Dior · Sauvage')).toHaveLength(1);
  });

  test('waits 250 ms after the last keystroke before searching', async () => {
    const { repos, wrap, user } = setup();
    const search = jest.spyOn(repos.catalog, 'search');
    await render(wrap(<AddScreen />));
    await user.type(searchInput(), 'sauvage');
    await advance(249);
    expect(search).not.toHaveBeenCalled();
    await advance(1);
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith('sauvage');
  });

  test('a row opens the confirm step with house, name and every variant id', async () => {
    const { wrap, user } = setup();
    await render(wrap(<AddScreen />));
    await user.type(searchInput(), 'sauvage');
    await advance(250);
    await user.press(await screen.findByRole('button', { name: /Dior · Sauvage/ }));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/add/confirm',
      params: { house: 'Dior', name: 'Sauvage', ids: `${sauvageEdtId},${sauvageEdpId}` },
    });
  });

  test('"zzz" says so and offers a custom entry, prefilled with the name', async () => {
    const { wrap, user } = setup();
    await render(wrap(<AddScreen />));
    await user.type(searchInput(), 'zzz');
    await advance(250);
    expect(await screen.findByText(butler.noResults('zzz'))).toBeOnTheScreen();
    // The prominent button replaces the quiet link: exactly one custom-entry action.
    await user.press(button(butler.addCustomCta));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/add/custom', params: { house: '', name: 'zzz' } });
  });

  test('uses the trimmed query in the no-results line', async () => {
    const { wrap, user } = setup();
    await render(wrap(<AddScreen />));
    await user.type(searchInput(), '  zzz  ');
    await advance(250);
    expect(await screen.findByText(butler.noResults('zzz'))).toBeOnTheScreen();
  });

  test('a query with a space prefills house (before the first space) and name (the rest)', async () => {
    const { wrap, user } = setup();
    await render(wrap(<AddScreen />));
    await user.type(searchInput(), 'Roja  Elysium Pour Homme');
    await advance(250);
    await user.press(await screen.findByRole('button', { name: butler.addCustomCta }));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/add/custom',
      params: { house: 'Roja', name: 'Elysium Pour Homme' },
    });
  });

  test('a quiet custom-entry link stays below real results', async () => {
    const { wrap, user } = setup();
    await render(wrap(<AddScreen />));
    await user.type(searchInput(), 'sauvage');
    await advance(250);
    await screen.findByText('Dior · Sauvage');
    expect(screen.queryByText(butler.noResults('sauvage'))).toBeNull();
    await user.press(button(butler.addCustomCta));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/add/custom', params: { house: '', name: 'sauvage' } });
  });

  test('a blank query shows no results and no "unknown" line, but the custom link is there', async () => {
    const { repos, wrap, user } = setup();
    const search = jest.spyOn(repos.catalog, 'search');
    await render(wrap(<AddScreen />));
    await user.type(searchInput(), '   ');
    await advance(250);
    expect(search).not.toHaveBeenCalled();
    expect(screen.queryByText(/I don’t know/)).toBeNull();
    expect(button(butler.addCustomCta)).toBeOnTheScreen();
  });

  test('clearing the query clears the results', async () => {
    const { wrap, user } = setup();
    await render(wrap(<AddScreen />));
    await user.type(searchInput(), 'sauvage');
    await advance(250);
    await screen.findByText('Dior · Sauvage');
    await user.clear(searchInput());
    await advance(250);
    expect(screen.queryByText('Dior · Sauvage')).toBeNull();
  });

  test('only the latest query renders when responses arrive out of order', async () => {
    const { repos, wrap, user } = setup();
    const first = deferred<Awaited<ReturnType<typeof repos.catalog.search>>>();
    const second = deferred<Awaited<ReturnType<typeof repos.catalog.search>>>();
    const real = repos.catalog.search.bind(repos.catalog);
    const sauvage = await real('sauvage');
    const hermes = await real('hermes');
    jest
      .spyOn(repos.catalog, 'search')
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    await render(wrap(<AddScreen />));

    await user.type(searchInput(), 'sauvage');
    await advance(250);
    await user.clear(searchInput());
    await user.type(searchInput(), 'hermes');
    await advance(250);

    await act(async () => second.resolve(hermes));
    expect(await screen.findByText('Hermès · Terre d’Hermès')).toBeOnTheScreen();
    await act(async () => first.resolve(sauvage));
    expect(screen.getByText('Hermès · Terre d’Hermès')).toBeOnTheScreen();
    expect(screen.queryByText('Dior · Sauvage')).toBeNull();
  });

  test('a late response for an earlier query does not hide the newer one pending', async () => {
    const { repos, wrap, user } = setup();
    const first = deferred<Awaited<ReturnType<typeof repos.catalog.search>>>();
    const second = deferred<Awaited<ReturnType<typeof repos.catalog.search>>>();
    const real = repos.catalog.search.bind(repos.catalog);
    const sauvage = await real('sauvage');
    jest
      .spyOn(repos.catalog, 'search')
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    await render(wrap(<AddScreen />));
    await user.type(searchInput(), 'sauvage');
    await advance(250);
    await user.type(searchInput(), 'x');
    await advance(250);
    await act(async () => first.resolve(sauvage));
    // The first query is stale: nothing renders until the second answers.
    expect(screen.queryByText('Dior · Sauvage')).toBeNull();
  });

  test('a search failure shows the load-failed banner, and retry searches again', async () => {
    const { repos, wrap, user } = setup();
    jest.spyOn(repos.catalog, 'search').mockRejectedValueOnce(new RepositoryError('network', 'offline'));
    await render(wrap(<AddScreen />));
    await user.type(searchInput(), 'sauvage');
    await advance(250);
    expect(await screen.findByText(butler.loadFailed)).toBeOnTheScreen();
    await user.press(button(butler.retry));
    expect(await screen.findByText('Dior · Sauvage')).toBeOnTheScreen();
    expect(screen.queryByText(butler.loadFailed)).toBeNull();
  });
});

describe('confirm screen', () => {
  const idsParam = (...ids: string[]) => ({ house: 'Dior', name: 'Sauvage', ids: ids.join(',') });
  const saveButton = () => button(butler.save);

  async function renderConfirm(params: Record<string, string>, repos?: Repositories) {
    mockParams = params;
    const s = setup(repos);
    await render(s.wrap(<ConfirmScreen />));
    return s;
  }

  test('hides the concentration picker for a single-variant group', async () => {
    await renderConfirm({ house: 'Hermès', name: 'Terre d’Hermès', ids: hermesId });
    expect(await screen.findByText('Hermès · Terre d’Hermès')).toBeOnTheScreen();
    expect(screen.queryByText(butler.chooseConcentration)).toBeNull();
    expect(screen.getByText(butler.chooseSize)).toBeOnTheScreen();
  });

  test('shows the picker for a multi-variant group, in canonical order, with nothing selected', async () => {
    await renderConfirm(idsParam(sauvageEdpId, sauvageEdtId));
    expect(await screen.findByText(butler.chooseConcentration)).toBeOnTheScreen();
    const edt = button('EDT');
    const edp = button('EDP');
    expect(edt).not.toBeSelected();
    expect(edp).not.toBeSelected();
    const labels = screen.getAllByRole('button').map((b) => b.props.accessibilityLabel);
    expect(labels.indexOf('EDT')).toBeLessThan(labels.indexOf('EDP'));
  });

  test('preselects no size and keeps Save disabled until one is chosen', async () => {
    const { user } = await renderConfirm({ house: 'Hermès', name: 'Terre d’Hermès', ids: hermesId });
    await screen.findByText(butler.chooseSize);
    for (const ml of [30, 50, 100, 150, 200]) {
      expect(button(butler.sizeLabel(ml))).not.toBeSelected();
    }
    expect(button(butler.sizeOther)).not.toBeSelected();
    expect(saveButton()).toBeDisabled();
    await user.press(button(butler.sizeLabel(100)));
    expect(button(butler.sizeLabel(100))).toBeSelected();
    expect(saveButton()).toBeEnabled();
  });

  test('a multi-variant group needs a concentration as well as a size', async () => {
    const { user } = await renderConfirm(idsParam(sauvageEdtId, sauvageEdpId));
    await user.press(await screen.findByRole('button', { name: butler.sizeLabel(50) }));
    expect(saveButton()).toBeDisabled();
    await user.press(button('EDP'));
    expect(saveButton()).toBeEnabled();
  });

  test('saves the chosen variant, preset size and manual capture', async () => {
    const { repos, user } = await renderConfirm(idsParam(sauvageEdtId, sauvageEdpId));
    await user.press(await screen.findByRole('button', { name: 'EDP' }));
    await user.press(button(butler.sizeLabel(100)));
    await user.press(saveButton());
    const [entry] = await repos.collection.list();
    expect(entry.item).toMatchObject({
      fragranceId: sauvageEdpId,
      concentration: 'EDP',
      bottleSizeMl: 100,
      captureMethod: 'manual',
    });
  });

  test('a single variant is implicitly selected and supplies its concentration', async () => {
    const { repos, user } = await renderConfirm({ house: 'Hermès', name: 'Terre d’Hermès', ids: hermesId });
    await user.press(await screen.findByRole('button', { name: butler.sizeLabel(30) }));
    await user.press(saveButton());
    const [entry] = await repos.collection.list();
    expect(entry.item).toMatchObject({ fragranceId: hermesId, concentration: 'EDT', bottleSizeMl: 30 });
  });

  test('"Other" reveals a numeric field, and a size of 75 saves bottleSizeMl 75', async () => {
    const { repos, user } = await renderConfirm({ house: 'Hermès', name: 'Terre d’Hermès', ids: hermesId });
    expect(screen.queryByLabelText(butler.sizeOtherLabel)).toBeNull();
    await user.press(await screen.findByRole('button', { name: butler.sizeOther }));
    expect(button(butler.sizeOther)).toBeSelected();
    expect(saveButton()).toBeDisabled();
    await user.type(screen.getByLabelText(butler.sizeOtherLabel), '75');
    expect(saveButton()).toBeEnabled();
    await user.press(saveButton());
    const [entry] = await repos.collection.list();
    expect(entry.item.bottleSizeMl).toBe(75);
  });

  test.each(['0', '1001', '7.5', 'abc', '-3'])('"Other" size %p shows the size error and blocks Save', async (text) => {
    const { user } = await renderConfirm({ house: 'Hermès', name: 'Terre d’Hermès', ids: hermesId });
    await user.press(await screen.findByRole('button', { name: butler.sizeOther }));
    await user.type(screen.getByLabelText(butler.sizeOtherLabel), text);
    expect(screen.getByText(butler.customSizeInvalid)).toBeOnTheScreen();
    expect(saveButton()).toBeDisabled();
  });

  test('"Other" size error clears once the value is valid, and 1 and 1000 are accepted', async () => {
    const { user } = await renderConfirm({ house: 'Hermès', name: 'Terre d’Hermès', ids: hermesId });
    await user.press(await screen.findByRole('button', { name: butler.sizeOther }));
    const field = screen.getByLabelText(butler.sizeOtherLabel);
    await user.type(field, '1001');
    expect(screen.getByText(butler.customSizeInvalid)).toBeOnTheScreen();
    await user.clear(field);
    await user.type(field, '1000');
    expect(screen.queryByText(butler.customSizeInvalid)).toBeNull();
    expect(saveButton()).toBeEnabled();
    await user.clear(field);
    await user.type(field, '1');
    expect(saveButton()).toBeEnabled();
  });

  test('an empty "Other" field blocks Save without scolding', async () => {
    const { user } = await renderConfirm({ house: 'Hermès', name: 'Terre d’Hermès', ids: hermesId });
    await user.press(await screen.findByRole('button', { name: butler.sizeOther }));
    expect(screen.queryByText(butler.customSizeInvalid)).toBeNull();
    expect(saveButton()).toBeDisabled();
  });

  test('pressing Save twice quickly adds one bottle', async () => {
    const { repos, user } = await renderConfirm({ house: 'Hermès', name: 'Terre d’Hermès', ids: hermesId });
    const add = jest.spyOn(repos.collection, 'add');
    await user.press(await screen.findByRole('button', { name: butler.sizeLabel(50) }));
    const save = saveButton();
    // Both presses land in one act: React has not re-rendered between them, as in a real double tap.
    await act(async () => {
      await fireEvent.press(save);
      await fireEvent.press(save);
    });
    await act(async () => {});
    expect(add).toHaveBeenCalledTimes(1);
    expect(await repos.collection.list()).toHaveLength(1);
  });

  test('a failed save shows the failure, keeps the selection, and Retry reuses the request id', async () => {
    const { repos, user } = await renderConfirm(idsParam(sauvageEdtId, sauvageEdpId));
    const realAdd = repos.collection.add.bind(repos.collection);
    const add = jest
      .spyOn(repos.collection, 'add')
      .mockRejectedValueOnce(new RepositoryError('network', 'offline'))
      .mockImplementation(realAdd);

    await user.press(await screen.findByRole('button', { name: 'EDP' }));
    await user.press(button(butler.sizeLabel(100)));
    await user.press(saveButton());

    expect(await screen.findByText(butler.saveFailed)).toBeOnTheScreen();
    expect(button('EDP')).toBeSelected();
    expect(button(butler.sizeLabel(100))).toBeSelected();
    expect(mockRouter.back).not.toHaveBeenCalled();

    await user.press(button(butler.retry));
    await act(async () => {});

    expect(add).toHaveBeenCalledTimes(2);
    const [firstCall, secondCall] = add.mock.calls.map(([input]) => input);
    expect(secondCall.clientRequestId).toBe(firstCall.clientRequestId);
    expect(secondCall).toMatchObject({ fragranceId: sauvageEdpId, bottleSizeMl: 100, concentration: 'EDP' });
    expect(await repos.collection.list()).toHaveLength(1);
    expect(screen.queryByText(butler.saveFailed)).toBeNull();
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  test('shows the loading-failed banner when the fragrance cannot be read, and retry recovers', async () => {
    const repos = createMemoryRepositories(fixtureCatalog);
    jest.spyOn(repos.catalog, 'getById').mockRejectedValueOnce(new RepositoryError('network', 'offline'));
    const { user } = await renderConfirm({ house: 'Hermès', name: 'Terre d’Hermès', ids: hermesId }, repos);
    expect(await screen.findByText(butler.loadFailed)).toBeOnTheScreen();
    await user.press(button(butler.retry));
    expect(await screen.findByText(butler.chooseSize)).toBeOnTheScreen();
  });

  test('success goes back to search, which keeps its query and shows the confirmation for ~2.5 s', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    const repos = createMemoryRepositories(fixtureCatalog);
    const { wrap, user } = setup(repos);
    mockParams = { house: 'Hermès', name: 'Terre d’Hermès', ids: hermesId };
    // Search stays mounted under the pushed confirm screen: render both.
    await render(
      wrap(
        <>
          <AddScreen />
          <ConfirmScreen />
        </>,
      ),
    );
    await user.type(searchInput(), 'hermes');
    await advance(250);
    await user.press(await screen.findByRole('button', { name: butler.sizeLabel(50) }));
    expect(screen.queryByText(butler.saved)).toBeNull();
    await user.press(button(butler.save));

    expect(await screen.findByText(butler.saved)).toBeOnTheScreen();
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith(butler.saved);
    expect(searchInput()).toHaveDisplayValue('hermes');
    expect(screen.getByRole('button', { name: /Terre d’Hermès/ })).toBeOnTheScreen();

    await advance(2400);
    expect(screen.getByText(butler.saved)).toBeOnTheScreen();
    await advance(200);
    expect(screen.queryByText(butler.saved)).toBeNull();
    expect(searchInput()).toHaveDisplayValue('hermes');
  });
});

describe('useSaveBottle', () => {
  const input = {
    fragranceId: hermesId,
    bottleSizeMl: 50,
    concentration: 'EDT',
    captureMethod: 'manual',
  } as const;

  test('two saves in the same tick call add once', async () => {
    const repos = createMemoryRepositories(fixtureCatalog);
    const add = jest.spyOn(repos.collection, 'add');
    const { result } = await renderHook(() => useSaveBottle(), {
      wrapper: ({ children }) => <RepositoryProvider value={repos}>{children}</RepositoryProvider>,
    });
    await act(async () => {
      void result.current.save(input);
      void result.current.save(input);
    });
    expect(add).toHaveBeenCalledTimes(1);
    expect(await repos.collection.list()).toHaveLength(1);
    expect(result.current.status).toBe('idle');
  });

  test('a failure sets status error, rejects, and keeps the same request id for the retry', async () => {
    const repos = createMemoryRepositories(fixtureCatalog);
    const add = jest
      .spyOn(repos.collection, 'add')
      .mockRejectedValueOnce(new RepositoryError('network', 'offline'));
    const { result } = await renderHook(() => useSaveBottle(), {
      wrapper: ({ children }) => <RepositoryProvider value={repos}>{children}</RepositoryProvider>,
    });
    await act(async () => {
      await expect(result.current.save(input)).rejects.toBeInstanceOf(RepositoryError);
    });
    expect(result.current.status).toBe('error');
    await act(async () => {
      await result.current.save(input);
    });
    expect(result.current.status).toBe('idle');
    const [a, b] = add.mock.calls.map(([i]) => i.clientRequestId);
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
    expect(b).toBe(a);
  });

  test('a new mount gets a new request id', async () => {
    const repos = createMemoryRepositories(fixtureCatalog);
    const add = jest.spyOn(repos.collection, 'add');
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <RepositoryProvider value={repos}>{children}</RepositoryProvider>
    );
    const one = await renderHook(() => useSaveBottle(), { wrapper });
    await act(async () => one.result.current.save(input));
    const two = await renderHook(() => useSaveBottle(), { wrapper });
    await act(async () => two.result.current.save(input));
    const [a, b] = add.mock.calls.map(([i]) => i.clientRequestId);
    expect(a).not.toBe(b);
  });
});

describe('custom screen', () => {
  const houseInput = () => screen.getByLabelText(butler.customHouseLabel);
  const nameInput = () => screen.getByLabelText(butler.customNameLabel);
  const yearInput = () => screen.getByLabelText(butler.customYearLabel);
  const continueButton = () => button(butler.customContinue);

  async function renderCustom(params: Record<string, string> = {}, repos?: Repositories) {
    mockParams = params;
    const s = setup(repos);
    await render(s.wrap(<CustomScreen />));
    return s;
  }

  test('prefills house and name from the params, and preselects nothing', async () => {
    await renderCustom({ house: 'Roja', name: 'Elysium' });
    expect(houseInput()).toHaveDisplayValue('Roja');
    expect(nameInput()).toHaveDisplayValue('Elysium');
    for (const c of ['EDT', 'EDP', 'Parfum', 'Extrait', 'Other']) {
      expect(button(c)).not.toBeSelected();
    }
  });

  test('a blank house shows the required error and creates nothing', async () => {
    const { repos, user } = await renderCustom();
    const createCustom = jest.spyOn(repos.catalog, 'createCustom');
    await user.type(nameInput(), 'Elysium');
    await user.press(button('EDP'));
    await user.press(continueButton());
    expect(screen.getByText(butler.customFieldRequired)).toBeOnTheScreen();
    expect(createCustom).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  test('shows every problem at once: house, name and concentration', async () => {
    const { user } = await renderCustom();
    await user.press(continueButton());
    expect(screen.getAllByText(butler.customFieldRequired)).toHaveLength(2);
    expect(screen.getByText(butler.customConcentrationRequired)).toBeOnTheScreen();
  });

  test('a missing concentration shows its own error', async () => {
    const { repos, user } = await renderCustom();
    const createCustom = jest.spyOn(repos.catalog, 'createCustom');
    await user.type(houseInput(), 'Roja');
    await user.type(nameInput(), 'Elysium');
    await user.press(continueButton());
    expect(screen.getByText(butler.customConcentrationRequired)).toBeOnTheScreen();
    expect(screen.queryByText(butler.customFieldRequired)).toBeNull();
    expect(createCustom).not.toHaveBeenCalled();
  });

  test('a name over 120 characters is too long', async () => {
    const { user } = await renderCustom();
    await user.type(houseInput(), 'Roja');
    await user.type(nameInput(), 'x'.repeat(121));
    await user.press(button('EDP'));
    await user.press(continueButton());
    expect(screen.getByText(butler.customFieldTooLong)).toBeOnTheScreen();
  });

  test.each(['20x5', '1500', '99999'])('release year %p is rejected', async (year) => {
    const { user } = await renderCustom();
    await user.type(houseInput(), 'Roja');
    await user.type(nameInput(), 'Elysium');
    await user.press(button('EDP'));
    await user.type(yearInput(), year);
    await user.press(continueButton());
    expect(screen.getByText(butler.customYearInvalid)).toBeOnTheScreen();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  test('a valid entry creates the fragrance and opens the confirm step with its id', async () => {
    const { repos, user } = await renderCustom({ house: 'Roja', name: 'Elysium' });
    const createCustom = jest.spyOn(repos.catalog, 'createCustom');
    await user.press(button('Parfum'));
    await user.type(yearInput(), '2017');
    await user.press(continueButton());
    await act(async () => {});
    expect(createCustom).toHaveBeenCalledWith({
      house: 'Roja',
      name: 'Elysium',
      concentration: 'Parfum',
      releaseYear: 2017,
    });
    const created = await createCustom.mock.results[0].value;
    expect(mockRouter.replace).toHaveBeenCalledWith({
      pathname: '/add/confirm',
      params: { house: 'Roja', name: 'Elysium', ids: created.id },
    });
  });

  test('the year is optional', async () => {
    const { repos, user } = await renderCustom({ house: 'Roja', name: 'Elysium' });
    const createCustom = jest.spyOn(repos.catalog, 'createCustom');
    await user.press(button('EDP'));
    await user.press(continueButton());
    await act(async () => {});
    expect(createCustom).toHaveBeenCalledWith({
      house: 'Roja',
      name: 'Elysium',
      concentration: 'EDP',
      releaseYear: null,
    });
  });

  test('a createCustom failure shows the failure banner, and retry succeeds', async () => {
    const { repos, user } = await renderCustom({ house: 'Roja', name: 'Elysium' });
    jest.spyOn(repos.catalog, 'createCustom').mockRejectedValueOnce(new RepositoryError('network', 'offline'));
    await user.press(button('EDP'));
    await user.press(continueButton());
    expect(await screen.findByText(butler.saveFailed)).toBeOnTheScreen();
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(button('EDP')).toBeSelected();
    await user.press(button(butler.retry));
    await act(async () => {});
    expect(mockRouter.replace).toHaveBeenCalledTimes(1);
  });

  test('double submit creates one fragrance', async () => {
    const { repos, user } = await renderCustom({ house: 'Roja', name: 'Elysium' });
    const createCustom = jest.spyOn(repos.catalog, 'createCustom');
    await user.press(button('EDP'));
    const submit = continueButton();
    await act(async () => {
      await fireEvent.press(submit);
      await fireEvent.press(submit);
    });
    await act(async () => {});
    expect(createCustom).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).toHaveBeenCalledTimes(1);
  });

  test('a blank house and name never reach the repository even with stray whitespace', async () => {
    const { repos, user } = await renderCustom();
    const createCustom = jest.spyOn(repos.catalog, 'createCustom');
    await user.type(houseInput(), '   ');
    await user.type(nameInput(), '  ');
    await user.press(button('EDP'));
    await user.press(continueButton());
    expect(screen.getAllByText(butler.customFieldRequired)).toHaveLength(2);
    expect(createCustom).not.toHaveBeenCalled();
  });
});
