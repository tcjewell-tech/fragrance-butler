import { act, render, screen, userEvent } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { AccessibilityInfo, Alert, type AlertButton } from 'react-native';
import { butler } from '@/copy/butler';
import { createMemoryRepositories } from '@/data/memory';
import { RepositoryProvider } from '@/data/RepositoryContext';
import type { Repositories } from '@/data/repositories';
import type { Concentration, Fragrance } from '@/domain/types';
import { fixtureCatalog, fixtureIds } from '../data/fixtures';
import ItemScreen from '../../app/item/[id]';

const mockRouter = { push: jest.fn(), back: jest.fn(), navigate: jest.fn() };
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
}));

const withNotes: Fragrance = {
  ...fixtureCatalog[0],
  id: 'with-notes',
  notePyramid: { top: ['Bergamot', 'Pepper'], heart: ['Lavender'], base: ['Ambroxan', 'Cedar'] },
};
const partialNotes: Fragrance = {
  ...fixtureCatalog[0],
  id: 'partial-notes',
  notePyramid: { top: ['Neroli'], heart: [], base: [] },
};

function setup() {
  const repos: Repositories = createMemoryRepositories([...fixtureCatalog, withNotes, partialNotes]);
  const wrap = (ui: ReactElement) => <RepositoryProvider value={repos}>{ui}</RepositoryProvider>;
  return { repos, wrap, user: userEvent.setup() };
}

async function addBottle(repos: Repositories, fragranceId: string, concentration: Concentration = 'EDT', ml = 100) {
  return repos.collection.add({
    clientRequestId: crypto.randomUUID(),
    fragranceId,
    bottleSizeMl: ml,
    concentration,
    captureMethod: 'manual',
  });
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

let alertSpy: jest.SpyInstance;
let announceSpy: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  announceSpy = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
});
afterEach(() => {
  alertSpy.mockRestore();
  announceSpy.mockRestore();
});

const favoriteChip = () => screen.getByRole('button', { name: butler.favorite });
const notesInput = () => screen.getByLabelText(butler.userNotesLabel);
const removeConfirmButton = () =>
  (alertSpy.mock.calls[0][2] as AlertButton[]).find((b) => b.style === 'destructive') as AlertButton;

describe('bottle detail screen', () => {
  test('shows house, name, concentration, size and the full note pyramid', async () => {
    const { repos, wrap } = setup();
    const item = await addBottle(repos, 'with-notes', 'EDP', 50);
    mockParams = { id: item.id };
    await render(wrap(<ItemScreen />));
    expect(await screen.findByText('Dior')).toBeOnTheScreen();
    expect(screen.getByText('Sauvage')).toBeOnTheScreen();
    expect(screen.getByText('EDP')).toBeOnTheScreen();
    expect(screen.getByText(butler.sizeLabel(50))).toBeOnTheScreen();
    expect(screen.getByText(butler.notesTop)).toBeOnTheScreen();
    expect(screen.getByText('Bergamot, Pepper')).toBeOnTheScreen();
    expect(screen.getByText(butler.notesHeart)).toBeOnTheScreen();
    expect(screen.getByText('Lavender')).toBeOnTheScreen();
    expect(screen.getByText(butler.notesBase)).toBeOnTheScreen();
    expect(screen.getByText('Ambroxan, Cedar')).toBeOnTheScreen();
    expect(screen.queryByText(butler.notesUnknown)).toBeNull();
  });

  test('shows only the tiers that have notes', async () => {
    const { repos, wrap } = setup();
    const item = await addBottle(repos, 'partial-notes');
    mockParams = { id: item.id };
    await render(wrap(<ItemScreen />));
    expect(await screen.findByText('Neroli')).toBeOnTheScreen();
    expect(screen.getByText(butler.notesTop)).toBeOnTheScreen();
    expect(screen.queryByText(butler.notesHeart)).toBeNull();
    expect(screen.queryByText(butler.notesBase)).toBeNull();
    expect(screen.queryByText(butler.notesUnknown)).toBeNull();
  });

  test('an empty pyramid says the notes are not yet known', async () => {
    const { repos, wrap } = setup();
    const item = await addBottle(repos, fixtureIds.sauvageEdtId);
    mockParams = { id: item.id };
    await render(wrap(<ItemScreen />));
    expect(await screen.findByText(butler.notesUnknown)).toBeOnTheScreen();
    expect(screen.queryByText(butler.notesTop)).toBeNull();
  });

  test('a missing bottle says so, with a way back', async () => {
    const { wrap, user } = setup();
    mockParams = { id: 'nope' };
    await render(wrap(<ItemScreen />));
    expect(await screen.findByText(butler.itemMissing)).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: butler.back }));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  test('a failed read offers a retry', async () => {
    const { repos, wrap, user } = setup();
    const item = await addBottle(repos, fixtureIds.sauvageEdtId);
    mockParams = { id: item.id };
    jest.spyOn(repos.collection, 'get').mockRejectedValueOnce(new Error('offline'));
    await render(wrap(<ItemScreen />));
    expect(await screen.findByText(butler.loadFailed)).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: butler.retry }));
    expect(await screen.findByText('Sauvage')).toBeOnTheScreen();
    expect(screen.queryByText(butler.loadFailed)).toBeNull();
  });

  test('toggling favourite updates the bottle', async () => {
    const { repos, wrap, user } = setup();
    const item = await addBottle(repos, fixtureIds.sauvageEdtId);
    mockParams = { id: item.id };
    const update = jest.spyOn(repos.collection, 'update');
    await render(wrap(<ItemScreen />));
    await screen.findByText('Sauvage');
    expect(favoriteChip()).not.toBeSelected();
    await user.press(favoriteChip());
    expect(update).toHaveBeenCalledWith(item.id, { favorite: true });
    expect(favoriteChip()).toBeSelected();
    expect((await repos.collection.get(item.id))?.item.favorite).toBe(true);
    await user.press(favoriteChip());
    expect(update).toHaveBeenLastCalledWith(item.id, { favorite: false });
    expect(favoriteChip()).not.toBeSelected();
  });

  test('the favourite toggle flips at once and settles when the save lands', async () => {
    const { repos, wrap, user } = setup();
    const item = await addBottle(repos, fixtureIds.sauvageEdtId);
    mockParams = { id: item.id };
    const pending = deferred<typeof item>();
    jest.spyOn(repos.collection, 'update').mockReturnValueOnce(pending.promise);
    await render(wrap(<ItemScreen />));
    await screen.findByText('Sauvage');
    await user.press(favoriteChip());
    expect(favoriteChip()).toBeSelected();
    await act(async () => pending.resolve({ ...item, favorite: true }));
    expect(favoriteChip()).toBeSelected();
    expect(screen.queryByText(butler.saveFailed)).toBeNull();
  });

  test('a failed favourite save reverts the toggle and says so', async () => {
    const { repos, wrap, user } = setup();
    const item = await addBottle(repos, fixtureIds.sauvageEdtId);
    mockParams = { id: item.id };
    jest.spyOn(repos.collection, 'update').mockRejectedValueOnce(new Error('offline'));
    await render(wrap(<ItemScreen />));
    await screen.findByText('Sauvage');
    await user.press(favoriteChip());
    expect(await screen.findByText(butler.saveFailed)).toBeOnTheScreen();
    expect(favoriteChip()).not.toBeSelected();
    expect((await repos.collection.get(item.id))?.item.favorite).toBe(false);
  });

  test('shows existing notes, and saving edits persists them with an announcement', async () => {
    const { repos, wrap, user } = setup();
    const item = await addBottle(repos, fixtureIds.sauvageEdtId);
    await repos.collection.update(item.id, { userNotes: 'Gift from Anna' });
    mockParams = { id: item.id };
    const update = jest.spyOn(repos.collection, 'update');
    await render(wrap(<ItemScreen />));
    await screen.findByText('Sauvage');
    expect(notesInput()).toHaveDisplayValue('Gift from Anna');
    expect(screen.queryByText(butler.notesSaved)).toBeNull();

    await user.clear(notesInput());
    await user.type(notesInput(), 'Winter evenings');
    await user.press(screen.getByRole('button', { name: butler.saveNotes }));
    expect(update).toHaveBeenCalledWith(item.id, { userNotes: 'Winter evenings' });
    expect(await screen.findByText(butler.notesSaved)).toBeOnTheScreen();
    expect(announceSpy).toHaveBeenCalledWith(butler.notesSaved);
    expect((await repos.collection.get(item.id))?.item.userNotes).toBe('Winter evenings');
  });

  test('editing after a save clears the confirmation', async () => {
    const { repos, wrap, user } = setup();
    const item = await addBottle(repos, fixtureIds.sauvageEdtId);
    mockParams = { id: item.id };
    await render(wrap(<ItemScreen />));
    await screen.findByText('Sauvage');
    await user.type(notesInput(), 'One');
    await user.press(screen.getByRole('button', { name: butler.saveNotes }));
    expect(await screen.findByText(butler.notesSaved)).toBeOnTheScreen();
    await user.type(notesInput(), ' two');
    expect(screen.queryByText(butler.notesSaved)).toBeNull();
  });

  test('a failed notes save keeps the text and says so', async () => {
    const { repos, wrap, user } = setup();
    const item = await addBottle(repos, fixtureIds.sauvageEdtId);
    mockParams = { id: item.id };
    jest.spyOn(repos.collection, 'update').mockRejectedValueOnce(new Error('offline'));
    await render(wrap(<ItemScreen />));
    await screen.findByText('Sauvage');
    await user.type(notesInput(), 'Keep me');
    await user.press(screen.getByRole('button', { name: butler.saveNotes }));
    expect(await screen.findByText(butler.saveFailed)).toBeOnTheScreen();
    expect(notesInput()).toHaveDisplayValue('Keep me');
    expect(screen.queryByText(butler.notesSaved)).toBeNull();
    expect(announceSpy).not.toHaveBeenCalled();
  });

  test('remove asks first; cancelling keeps the bottle', async () => {
    const { repos, wrap, user } = setup();
    const item = await addBottle(repos, fixtureIds.sauvageEdtId);
    mockParams = { id: item.id };
    const remove = jest.spyOn(repos.collection, 'remove');
    await render(wrap(<ItemScreen />));
    await screen.findByText('Sauvage');
    await user.press(screen.getByRole('button', { name: butler.removeCta }));
    expect(alertSpy).toHaveBeenCalledWith(butler.removeConfirm, undefined, expect.any(Array));
    const buttons = alertSpy.mock.calls[0][2] as AlertButton[];
    expect(buttons.map((b) => b.text)).toEqual([butler.cancel, butler.removeConfirmCta]);
    expect(buttons[0].style).toBe('cancel');
    await act(async () => buttons[0].onPress?.());
    expect(remove).not.toHaveBeenCalled();
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  test('confirming removes the bottle once and goes back', async () => {
    const { repos, wrap, user } = setup();
    const item = await addBottle(repos, fixtureIds.sauvageEdtId);
    mockParams = { id: item.id };
    const remove = jest.spyOn(repos.collection, 'remove');
    await render(wrap(<ItemScreen />));
    await screen.findByText('Sauvage');
    await user.press(screen.getByRole('button', { name: butler.removeCta }));
    const confirm = removeConfirmButton();
    await act(async () => {
      confirm.onPress?.();
      confirm.onPress?.();
    });
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith(item.id);
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(await repos.collection.get(item.id)).toBeNull();
  });

  test('a removal that finishes after the screen is gone does not call back()', async () => {
    const { repos, wrap, user } = setup();
    const item = await addBottle(repos, fixtureIds.sauvageEdtId);
    mockParams = { id: item.id };
    const pending = deferred<void>();
    jest.spyOn(repos.collection, 'remove').mockReturnValueOnce(pending.promise);
    await render(wrap(<ItemScreen />));
    await screen.findByText('Sauvage');
    await user.press(screen.getByRole('button', { name: butler.removeCta }));
    await act(async () => removeConfirmButton().onPress?.());
    await screen.unmount();
    await act(async () => pending.resolve());
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  test('a failed removal stays on the screen and can be tried again', async () => {
    const { repos, wrap, user } = setup();
    const item = await addBottle(repos, fixtureIds.sauvageEdtId);
    mockParams = { id: item.id };
    const remove = jest.spyOn(repos.collection, 'remove').mockRejectedValueOnce(new Error('offline'));
    await render(wrap(<ItemScreen />));
    await screen.findByText('Sauvage');
    await user.press(screen.getByRole('button', { name: butler.removeCta }));
    await act(async () => removeConfirmButton().onPress?.());
    expect(await screen.findByText(butler.removeFailed)).toBeOnTheScreen();
    expect(mockRouter.back).not.toHaveBeenCalled();
    await act(async () => removeConfirmButton().onPress?.());
    expect(remove).toHaveBeenCalledTimes(2);
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });
});
