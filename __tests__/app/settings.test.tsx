import { act, fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import { Alert, type AlertButton } from 'react-native';
import { butler } from '@/copy/butler';
import { BackupApiProvider } from '@/data/BackupApiContext';
import type { BackupApi, RestoreSummary } from '@/data/backupApi';
import { SessionApiProvider, type SessionApi } from '@/data/SessionApiContext';
import { BackupError } from '@/domain/backup';
import SettingsScreen from '../../app/settings';

function fakeApi(overrides: Partial<SessionApi> = {}): SessionApi {
  return {
    signInWithEmailOtp: jest.fn(async () => {}),
    verifyEmailOtp: jest.fn(async () => {}),
    signOut: jest.fn(async () => {}),
    deleteAccount: jest.fn(async () => {}),
    ...overrides,
  };
}

async function renderSettings(api: SessionApi) {
  const user = userEvent.setup();
  await render(
    <SessionApiProvider value={api}>
      <SettingsScreen />
    </SessionApiProvider>,
  );
  return user;
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
beforeEach(() => {
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => {
  alertSpy.mockRestore();
});

const deleteButton = () => screen.getByRole('button', { name: butler.deleteAccount });
const alertButtons = (): AlertButton[] => alertSpy.mock.calls[0][2] as AlertButton[];
const confirm = () => alertButtons().find((b) => b.style === 'destructive') as AlertButton;
const cancel = () => alertButtons().find((b) => b.style === 'cancel') as AlertButton;

describe('settings screen', () => {
  test('"Sign out" signs out', async () => {
    const api = fakeApi();
    const user = await renderSettings(api);
    await user.press(screen.getByRole('button', { name: butler.signOut }));
    expect(api.signOut).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(butler.signOutFailed)).toBeNull();
  });

  test('a failed sign-out says so', async () => {
    const api = fakeApi({ signOut: jest.fn(async () => Promise.reject(new Error('offline'))) });
    const user = await renderSettings(api);
    await user.press(screen.getByRole('button', { name: butler.signOut }));
    expect(await screen.findByText(butler.signOutFailed)).toBeOnTheScreen();
  });

  test('"Delete account" asks first, with the permanent warning', async () => {
    const api = fakeApi();
    const user = await renderSettings(api);
    await user.press(deleteButton());
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalledWith(butler.deleteAccount, butler.deleteAccountConfirm, expect.any(Array));
    expect(cancel().text).toBe(butler.cancel);
    expect(confirm().text).toBe(butler.deleteAccountConfirmCta);
    expect(api.deleteAccount).not.toHaveBeenCalled();
  });

  test('cancelling does not delete anything', async () => {
    const api = fakeApi();
    const user = await renderSettings(api);
    await user.press(deleteButton());
    await act(async () => cancel().onPress?.());
    expect(api.deleteAccount).not.toHaveBeenCalled();
  });

  test('confirming deletes once, even when pressed twice', async () => {
    const pending = deferred<void>();
    const api = fakeApi({ deleteAccount: jest.fn(() => pending.promise) });
    const user = await renderSettings(api);
    await user.press(deleteButton());
    await act(async () => {
      confirm().onPress?.();
      confirm().onPress?.();
    });
    expect(api.deleteAccount).toHaveBeenCalledTimes(1);
    // While it runs the button is disabled.
    expect(deleteButton()).toBeDisabled();
    await act(async () => pending.resolve());
    expect(api.deleteAccount).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(butler.deleteAccountFailed)).toBeNull();
  });

  test('a failed deletion shows the banner and lets the user try again', async () => {
    const deleteAccount = jest
      .fn<Promise<void>, []>()
      .mockRejectedValueOnce(new Error('server'))
      .mockResolvedValueOnce(undefined);
    const user = await renderSettings(fakeApi({ deleteAccount }));
    await user.press(deleteButton());
    await act(async () => confirm().onPress?.());
    expect(await screen.findByText(butler.deleteAccountFailed)).toBeOnTheScreen();
    expect(deleteButton()).toBeEnabled();

    await user.press(deleteButton());
    expect(alertSpy).toHaveBeenCalledTimes(2);
    const retry = (alertSpy.mock.calls[1][2] as AlertButton[]).find((b) => b.style === 'destructive') as AlertButton;
    await act(async () => retry.onPress?.());
    expect(deleteAccount).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(butler.deleteAccountFailed)).toBeNull();
  });
});

function fakeBackupApi(overrides: Partial<BackupApi> = {}): BackupApi {
  return {
    backUp: jest.fn(async () => true),
    restore: jest.fn(async () => ({ added: 0, alreadyPresent: 0, skipped: 0 })),
    unbackedCount: jest.fn(async () => 0),
    ...overrides,
  };
}

async function renderLocalSettings(backupApi: BackupApi, api: SessionApi = fakeApi()) {
  const user = userEvent.setup();
  await render(
    <SessionApiProvider value={api}>
      <BackupApiProvider value={backupApi}>
        <SettingsScreen />
      </BackupApiProvider>
    </SessionApiProvider>,
  );
  return user;
}

const backUpButton = () => screen.getByRole('button', { name: butler.backUpCta });
const restoreButton = () => screen.getByRole('button', { name: butler.restoreCta });

describe('settings screen backup section', () => {
  test('without a backup API the account actions show and the backup section does not', async () => {
    await renderSettings(fakeApi());
    expect(screen.getByRole('button', { name: butler.signOut })).toBeOnTheScreen();
    expect(deleteButton()).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: butler.backUpCta })).toBeNull();
    expect(screen.queryByRole('button', { name: butler.restoreCta })).toBeNull();
  });

  test('with a backup API the backup buttons show and Sign out and Delete account do not', async () => {
    await renderLocalSettings(fakeBackupApi());
    expect(screen.getByText(butler.backupSection)).toBeOnTheScreen();
    expect(backUpButton()).toBeOnTheScreen();
    expect(restoreButton()).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: butler.signOut })).toBeNull();
    expect(screen.queryByRole('button', { name: butler.deleteAccount })).toBeNull();
  });

  test('Back up collection calls backUp once even if pressed twice quickly, then confirms', async () => {
    const pending = deferred<boolean>();
    const backupApi = fakeBackupApi({ backUp: jest.fn(() => pending.promise) });
    await renderLocalSettings(backupApi);
    await act(async () => {
      fireEvent.press(backUpButton());
      fireEvent.press(backUpButton());
    });
    expect(backupApi.backUp).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve(true));
    expect(await screen.findByText(butler.backUpDone)).toBeOnTheScreen();
  });

  test('a failing backUp shows backUpFailed', async () => {
    const user = await renderLocalSettings(fakeBackupApi({ backUp: jest.fn(async () => Promise.reject(new Error('disk'))) }));
    await user.press(backUpButton());
    expect(await screen.findByText(butler.backUpFailed)).toBeOnTheScreen();
  });

  test('a dismissed share sheet (false) shows nothing', async () => {
    const user = await renderLocalSettings(fakeBackupApi({ backUp: jest.fn(async () => false) }));
    await user.press(backUpButton());
    expect(screen.queryByText(butler.backUpDone)).toBeNull();
    expect(screen.queryByText(butler.backUpFailed)).toBeNull();
  });

  test('Restore shows the summary, including the skipped count when it is above zero', async () => {
    const restore = jest
      .fn<Promise<RestoreSummary | null>, []>()
      .mockResolvedValueOnce({ added: 12, alreadyPresent: 3, skipped: 0 })
      .mockResolvedValueOnce({ added: 1, alreadyPresent: 0, skipped: 2 });
    const user = await renderLocalSettings(fakeBackupApi({ restore }));
    await user.press(restoreButton());
    expect(await screen.findByText('Added 12 bottles; 3 were already here.')).toBeOnTheScreen();
    expect(screen.queryByText(butler.restoreSkipped(0))).toBeNull();

    await user.press(restoreButton());
    expect(await screen.findByText('Added 1 bottle.')).toBeOnTheScreen();
    expect(screen.getByText(butler.restoreSkipped(2))).toBeOnTheScreen();
  });

  test('Restore shows restoreBadFile when the API rejects with BackupError', async () => {
    const user = await renderLocalSettings(
      fakeBackupApi({ restore: jest.fn(async () => Promise.reject(new BackupError('too-new', 'newer'))) }),
    );
    await user.press(restoreButton());
    expect(await screen.findByText(butler.restoreBadFile)).toBeOnTheScreen();
  });

  test('Restore shows restoreFailed for any other error', async () => {
    const user = await renderLocalSettings(fakeBackupApi({ restore: jest.fn(async () => Promise.reject(new Error('io'))) }));
    await user.press(restoreButton());
    expect(await screen.findByText(butler.restoreFailed)).toBeOnTheScreen();
  });

  test('a cancelled picker (null) shows nothing', async () => {
    const restore = jest.fn(async () => null);
    const user = await renderLocalSettings(fakeBackupApi({ restore }));
    await user.press(restoreButton());
    expect(restore).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Added/)).toBeNull();
    expect(screen.queryByText(butler.restoreBadFile)).toBeNull();
    expect(screen.queryByText(butler.restoreFailed)).toBeNull();
  });
});
