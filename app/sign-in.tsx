import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { butler } from '@/copy/butler';
import { RepositoryError } from '@/data/errors';
import { useSessionApi } from '@/data/SessionApiContext';
import { Button } from '@/ui/components/Button';
import { ErrorBanner } from '@/ui/components/ErrorBanner';
import { useTheme } from '@/ui/theme';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_LENGTH = 6;

type Step = 'email' | 'code';

export default function SignIn() {
  const { colors, fonts, spacing } = useTheme();
  const { signInWithEmailOtp, verifyEmailOtp } = useSessionApi();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const trimmedEmail = email.trim();

  async function sendCode() {
    if (!EMAIL_PATTERN.test(trimmedEmail)) {
      setError(butler.signInInvalidEmail);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await signInWithEmailOtp(trimmedEmail);
      setCode('');
      setStep('code');
    } catch {
      setError(butler.signInFailed);
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setError(null);
    setBusy(true);
    try {
      await verifyEmailOtp(trimmedEmail, code);
      // The session listener in the root layout takes it from here.
    } catch (e) {
      // An expired or wrong code is an auth failure; anything else is the connection or the server.
      setError(e instanceof RepositoryError && e.kind === 'auth' ? butler.signInCodeInvalid : butler.signInFailed);
      setBusy(false);
    }
  }

  const inputStyle = [
    styles.input,
    { borderColor: colors.muted, color: colors.ink, padding: spacing.md, marginTop: spacing.sm },
  ];

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.parchment }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.content, { padding: spacing.xl, gap: spacing.lg }]}
      >
        <Text accessibilityRole="header" style={[styles.title, { fontFamily: fonts.display, color: colors.ink }]}>
          {butler.signInTitle}
        </Text>
        <Text style={[styles.body, { color: colors.muted }]}>{butler.signInBody}</Text>

        {step === 'email' ? (
          <View>
            <TextInput
              accessibilityLabel={butler.signInEmailLabel}
              placeholder={butler.signInEmailLabel}
              placeholderTextColor={colors.muted}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              editable={!busy}
              style={inputStyle}
            />
          </View>
        ) : (
          <View>
            <Text style={[styles.label, { color: colors.ink }]}>{butler.signInCodeLabel}</Text>
            <TextInput
              accessibilityLabel={butler.signInCodeLabel}
              value={code}
              onChangeText={(text) => setCode(text.replace(/\D/g, '').slice(0, CODE_LENGTH))}
              keyboardType="number-pad"
              maxLength={CODE_LENGTH}
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              editable={!busy}
              style={inputStyle}
            />
          </View>
        )}

        {error ? <ErrorBanner message={error} /> : null}

        {step === 'email' ? (
          <Button label={butler.signInSendCode} onPress={sendCode} disabled={busy} />
        ) : (
          <>
            <Button label={butler.signInVerify} onPress={verify} disabled={busy || code.length !== CODE_LENGTH} />
            <Button label={butler.signInResend} onPress={sendCode} disabled={busy} variant="quiet" />
          </>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { flex: 1, justifyContent: 'center' },
  title: { fontSize: 34 },
  body: { fontSize: 17 },
  label: { fontSize: 15 },
  input: { borderWidth: 1, borderRadius: 10, fontSize: 18, minHeight: 48 },
});
