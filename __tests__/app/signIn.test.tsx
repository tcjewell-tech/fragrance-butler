import { render, screen, userEvent } from '@testing-library/react-native';
import { butler } from '@/copy/butler';
import { RepositoryError } from '@/data/errors';
import { SessionApiProvider, type SessionApi } from '@/data/SessionApiContext';
import SignIn from '../../app/sign-in';

function fakeApi(overrides: Partial<SessionApi> = {}): SessionApi {
  return {
    signInWithEmailOtp: jest.fn(async () => {}),
    verifyEmailOtp: jest.fn(async () => {}),
    signOut: jest.fn(async () => {}),
    deleteAccount: jest.fn(async () => {}),
    ...overrides,
  };
}

async function renderSignIn(api: SessionApi) {
  const user = userEvent.setup();
  await render(
    <SessionApiProvider value={api}>
      <SignIn />
    </SessionApiProvider>,
  );
  return user;
}

const emailInput = () => screen.getByLabelText('Email');
const codeInput = () => screen.getByLabelText(butler.signInCodeLabel);

describe('sign-in screen', () => {
  test('shows the greeting', async () => {
    await renderSignIn(fakeApi());
    expect(screen.getByText(butler.signInTitle)).toBeOnTheScreen();
    expect(screen.getByText(butler.signInBody)).toBeOnTheScreen();
  });

  test('sends the code to the trimmed email, then asks for it', async () => {
    const api = fakeApi();
    const user = await renderSignIn(api);
    await user.type(emailInput(), '  tom@example.com  ');
    await user.press(screen.getByRole('button', { name: butler.signInSendCode }));
    expect(api.signInWithEmailOtp).toHaveBeenCalledWith('tom@example.com');
    expect(await screen.findByLabelText(butler.signInCodeLabel)).toBeOnTheScreen();
  });

  test('an invalid email shows an inline error and makes no call', async () => {
    const api = fakeApi();
    const user = await renderSignIn(api);
    await user.type(emailInput(), 'not-an-email');
    await user.press(screen.getByRole('button', { name: butler.signInSendCode }));
    expect(screen.getByText(butler.signInInvalidEmail)).toBeOnTheScreen();
    expect(api.signInWithEmailOtp).not.toHaveBeenCalled();
  });

  test('a failure to send shows the failed copy and stays on the email step', async () => {
    const api = fakeApi({
      signInWithEmailOtp: jest.fn(async () => {
        throw new RepositoryError('network', 'offline');
      }),
    });
    const user = await renderSignIn(api);
    await user.type(emailInput(), 'tom@example.com');
    await user.press(screen.getByRole('button', { name: butler.signInSendCode }));
    expect(await screen.findByText(butler.signInFailed)).toBeOnTheScreen();
    expect(screen.queryByLabelText(butler.signInCodeLabel)).toBeNull();
  });

  describe('code step', () => {
    async function toCodeStep(api: SessionApi) {
      const user = await renderSignIn(api);
      await user.type(emailInput(), 'tom@example.com');
      await user.press(screen.getByRole('button', { name: butler.signInSendCode }));
      await screen.findByLabelText(butler.signInCodeLabel);
      return user;
    }

    test('accepts digits only, 6 at most, and enables Sign in at 6 digits', async () => {
      const user = await toCodeStep(fakeApi());
      const verify = () => screen.getByRole('button', { name: butler.signInVerify });
      expect(verify()).toBeDisabled();
      await user.type(codeInput(), '12a3-45');
      expect(codeInput()).toHaveDisplayValue('12345');
      expect(verify()).toBeDisabled();
      await user.type(codeInput(), '678');
      expect(codeInput()).toHaveDisplayValue('123456');
      expect(verify()).toBeEnabled();
    });

    test('verifies with the trimmed email and the code', async () => {
      const api = fakeApi();
      const user = await toCodeStep(api);
      await user.type(codeInput(), '123456');
      await user.press(screen.getByRole('button', { name: butler.signInVerify }));
      expect(api.verifyEmailOtp).toHaveBeenCalledWith('tom@example.com', '123456');
    });

    test('an auth error says the code did not work and offers another', async () => {
      const api = fakeApi({
        verifyEmailOtp: jest.fn(async () => {
          throw new RepositoryError('auth', 'expired');
        }),
      });
      const user = await toCodeStep(api);
      await user.type(codeInput(), '123456');
      await user.press(screen.getByRole('button', { name: butler.signInVerify }));
      expect(await screen.findByText(butler.signInCodeInvalid)).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: butler.signInResend })).toBeOnTheScreen();
    });

    test.each(['network', 'unknown'] as const)('a %s error shows the failed copy', async (kind) => {
      const api = fakeApi({
        verifyEmailOtp: jest.fn(async () => {
          throw new RepositoryError(kind, 'boom');
        }),
      });
      const user = await toCodeStep(api);
      await user.type(codeInput(), '123456');
      await user.press(screen.getByRole('button', { name: butler.signInVerify }));
      expect(await screen.findByText(butler.signInFailed)).toBeOnTheScreen();
    });

    test('sending another code requests it again for the same email', async () => {
      const api = fakeApi();
      const user = await toCodeStep(api);
      await user.press(screen.getByRole('button', { name: butler.signInResend }));
      expect(api.signInWithEmailOtp).toHaveBeenCalledTimes(2);
      expect(api.signInWithEmailOtp).toHaveBeenLastCalledWith('tom@example.com');
    });
  });
});
