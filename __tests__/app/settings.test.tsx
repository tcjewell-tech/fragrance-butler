import { act, render, screen, userEvent } from '@testing-library/react-native';
import { Alert, type AlertButton } from 'react-native';
import { butler } from '@/copy/butler';
import { SessionApiProvider, type SessionApi } from '@/data/SessionApiContext';
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
