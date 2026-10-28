import { useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { butler } from '@/copy/butler';
import { useSessionApi } from '@/data/SessionApiContext';
import { Button } from '@/ui/components/Button';
import { ErrorBanner } from '@/ui/components/ErrorBanner';
import { useTheme } from '@/ui/theme';

export default function SettingsScreen() {
  const { colors, spacing } = useTheme();
  const { signOut, deleteAccount } = useSessionApi();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutFailed, setSignOutFailed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);
  // Refs close the window before a re-render could disable the button: one call per intent.
  const signOutInFlight = useRef(false);
  const deleteInFlight = useRef(false);

  // On success the auth gate in the root layout takes over; no navigation here.
  const doSignOut = async () => {
    if (signOutInFlight.current) return;
    signOutInFlight.current = true;
    setSigningOut(true);
    setSignOutFailed(false);
    try {
      await signOut();
    } catch {
      setSignOutFailed(true);
    } finally {
      signOutInFlight.current = false;
      setSigningOut(false);
    }
  };

  const doDelete = async () => {
    if (deleteInFlight.current) return;
    deleteInFlight.current = true;
    setDeleting(true);
    setDeleteFailed(false);
    try {
      await deleteAccount();
      // Success: stay busy. The gate removes this screen, and no second deletion should start.
    } catch {
      deleteInFlight.current = false;
      setDeleting(false);
      setDeleteFailed(true);
    }
  };

  const confirmDelete = () =>
    Alert.alert(butler.deleteAccount, butler.deleteAccountConfirm, [
      { text: butler.cancel, style: 'cancel' },
      { text: butler.deleteAccountConfirmCta, style: 'destructive', onPress: () => void doDelete() },
    ]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.parchment, padding: spacing.lg, gap: spacing.lg }]}>
      {signOutFailed ? <ErrorBanner message={butler.signOutFailed} /> : null}
      <Button variant="quiet" label={butler.signOut} onPress={() => void doSignOut()} disabled={signingOut} />
      <View style={{ marginTop: spacing.xl, gap: spacing.md }}>
        {deleteFailed ? <ErrorBanner message={butler.deleteAccountFailed} /> : null}
        <Button variant="danger" label={butler.deleteAccount} onPress={confirmDelete} disabled={deleting} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({ screen: { flex: 1 } });
