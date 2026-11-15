import { useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { butler } from '@/copy/butler';
import { useBackupApi } from '@/data/BackupApiContext';
import type { BackupApi, RestoreSummary } from '@/data/backupApi';
import { useSessionApi } from '@/data/SessionApiContext';
import { BackupError } from '@/domain/backup';
import { Button } from '@/ui/components/Button';
import { ErrorBanner } from '@/ui/components/ErrorBanner';
import { useTheme } from '@/ui/theme';

export default function SettingsScreen() {
  const { colors, spacing } = useTheme();
  const { signOut, deleteAccount } = useSessionApi();
  const backupApi = useBackupApi();
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

  // Local mode has no account: the backup section takes the account actions' place.
  if (backupApi) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.parchment, padding: spacing.lg, gap: spacing.lg }]}>
        <BackupSection api={backupApi} />
      </View>
    );
  }

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

type BackupStatus =
  | { kind: 'idle' }
  | { kind: 'backedUp' }
  | { kind: 'restored'; summary: RestoreSummary }
  | { kind: 'error'; message: string };

function BackupSection({ api }: { api: BackupApi }) {
  const { colors, fonts, spacing } = useTheme();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<BackupStatus>({ kind: 'idle' });
  // Shared by both buttons: a backup and a restore never run at once.
  const inFlight = useRef(false);

  const run = async (action: () => Promise<BackupStatus | null>, failure: (err: unknown) => string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setStatus({ kind: 'idle' });
    try {
      const next = await action();
      if (next) setStatus(next);
    } catch (err) {
      setStatus({ kind: 'error', message: failure(err) });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const backUp = () =>
    run(
      async () => ((await api.backUp()) ? { kind: 'backedUp' } : null),
      () => butler.backUpFailed,
    );

  const restore = () =>
    run(
      async () => {
        const summary = await api.restore();
        return summary ? { kind: 'restored', summary } : null;
      },
      (err) => (err instanceof BackupError ? butler.restoreBadFile : butler.restoreFailed),
    );

  const note = { fontSize: 15, color: colors.ink };
  return (
    <View style={{ gap: spacing.md }}>
      <Text accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: 18, color: colors.ink }}>
        {butler.backupSection}
      </Text>
      {status.kind === 'error' ? <ErrorBanner message={status.message} /> : null}
      {status.kind === 'backedUp' ? (
        <Text accessibilityLiveRegion="polite" style={note}>
          {butler.backUpDone}
        </Text>
      ) : null}
      {status.kind === 'restored' ? (
        <View accessibilityLiveRegion="polite" style={{ gap: spacing.xs }}>
          <Text style={note}>{butler.restoreDone(status.summary)}</Text>
          {status.summary.skipped > 0 ? <Text style={note}>{butler.restoreSkipped(status.summary.skipped)}</Text> : null}
        </View>
      ) : null}
      <Button label={butler.backUpCta} onPress={() => void backUp()} disabled={busy} />
      <Button variant="quiet" label={butler.restoreCta} onPress={() => void restore()} disabled={busy} />
    </View>
  );
}

const styles = StyleSheet.create({ screen: { flex: 1 } });
