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

  test('HTTP 429 when sending shows the too-soon copy and stays on the email step', async () => {
    const api = fakeApi({
      signInWithEmailOtp: jest.fn(async () => {
        throw new RepositoryError('unknown', 'rate limited', { cause: { status: 429 } });
      }),
    });
    const user = await renderSignIn(api);
    await user.type(emailInput(), 'tom@example.com');
    await user.press(screen.getByRole('button', { name: butler.signInSendCode }));
    expect(await screen.findByText(butler.signInTooSoon)).toBeOnTheScreen();
    expect(screen.queryByText(butler.signInFailed)).toBeNull();
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

    test('a successful resend says so inline, and the note clears on the next action', async () => {
      const user = await toCodeStep(fakeApi());
      expect(screen.queryByText(butler.signInCodeResent)).toBeNull();
      await user.press(screen.getByRole('button', { name: butler.signInResend }));
      expect(await screen.findByText(butler.signInCodeResent)).toBeOnTheScreen();
      await user.type(codeInput(), '123456');
      await user.press(screen.getByRole('button', { name: butler.signInVerify }));
      expect(screen.queryByText(butler.signInCodeResent)).toBeNull();
    });

    test('a failed resend shows the error, not the resent note', async () => {
      let calls = 0;
      const api = fakeApi({
        signInWithEmailOtp: jest.fn(async () => {
          if (++calls > 1) throw new RepositoryError('network', 'offline');
        }),
      });
      const user = await toCodeStep(api);
      await user.press(screen.getByRole('button', { name: butler.signInResend }));
      expect(await screen.findByText(butler.signInFailed)).toBeOnTheScreen();
      expect(screen.queryByText(butler.signInCodeResent)).toBeNull();
    });

    test('HTTP 429 on resend shows the too-soon copy and keeps the code step', async () => {
      let calls = 0;
      const api = fakeApi({
        signInWithEmailOtp: jest.fn(async () => {
          if (++calls > 1) throw new RepositoryError('unknown', 'rate limited', { cause: { status: 429 } });
        }),
      });
      const user = await toCodeStep(api);
      await user.press(screen.getByRole('button', { name: butler.signInResend }));
      expect(await screen.findByText(butler.signInTooSoon)).toBeOnTheScreen();
      expect(screen.getByLabelText(butler.signInCodeLabel)).toBeOnTheScreen();
    });

    test('a 429 on verify is still the generic failure, not "too soon"', async () => {
      const api = fakeApi({
        verifyEmailOtp: jest.fn(async () => {
          throw new RepositoryError('unknown', 'rate limited', { cause: { status: 429 } });
        }),
      });
      const user = await toCodeStep(api);
      await user.type(codeInput(), '123456');
      await user.press(screen.getByRole('button', { name: butler.signInVerify }));
      expect(await screen.findByText(butler.signInFailed)).toBeOnTheScreen();
    });

    test('"Use a different email" returns to the email step, keeps the email, clears the code and the error', async () => {
      const api = fakeApi({
        verifyEmailOtp: jest.fn(async () => {
          throw new RepositoryError('auth', 'expired');
        }),
      });
      const user = await toCodeStep(api);
      await user.type(codeInput(), '123456');
      await user.press(screen.getByRole('button', { name: butler.signInVerify }));
      await screen.findByText(butler.signInCodeInvalid);

      await user.press(screen.getByRole('button', { name: butler.signInChangeEmail }));
      expect(screen.queryByText(butler.signInCodeInvalid)).toBeNull();
      expect(screen.queryByLabelText(butler.signInCodeLabel)).toBeNull();
      expect(emailInput()).toHaveDisplayValue('tom@example.com');

      await user.clear(emailInput());
      await user.type(emailInput(), 'sam@example.com');
      await user.press(screen.getByRole('button', { name: butler.signInSendCode }));
      expect(api.signInWithEmailOtp).toHaveBeenLastCalledWith('sam@example.com');
      expect(codeInput()).toHaveDisplayValue('');
    });

    test('changing the email also clears the resent note', async () => {
      const user = await toCodeStep(fakeApi());
      await user.press(screen.getByRole('button', { name: butler.signInResend }));
      await screen.findByText(butler.signInCodeResent);
      await user.press(screen.getByRole('button', { name: butler.signInChangeEmail }));
      expect(screen.queryByText(butler.signInCodeResent)).toBeNull();
    });
  });
});
