import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { butler } from '@/copy/butler';
import { BackupApiProvider } from '@/data/BackupApiContext';
import { createBackupApi, type BackupApi } from '@/data/backupApi';
import { expoBackupDevice } from '@/data/expoBackupDevice';
import { createLocalRepositories, replaceWithBackup, STATE_KEY, type LocalRepositories } from '@/data/local';
import { RepositoryProvider } from '@/data/RepositoryContext';
import { BackupError, parseBackup } from '@/domain/backup';
import { Button } from '@/ui/components/Button';
import { ErrorBanner } from '@/ui/components/ErrorBanner';
import { useTheme } from '@/ui/theme';
import { RootStack } from './RootStack';

export const RAW_RECOVERY_FILENAME = 'fragrance-butler-raw-recovery.txt';

type Loaded = { repositories: LocalRepositories; backupApi: BackupApi };

const withBackupApi = (repositories: LocalRepositories): Loaded => ({
  repositories,
  backupApi: createBackupApi({ repositories, storage: AsyncStorage, device: expoBackupDevice }),
});

/** The local-mode build: the collection lives on the phone and there is no sign-in. */
export function LocalRoot() {
  const { colors } = useTheme();
  const [loaded, setLoaded] = useState<Loaded | 'unreadable' | null>(null);

  useEffect(() => {
    let live = true;
    createLocalRepositories(AsyncStorage).then(
      (repositories) => {
        if (live) setLoaded(withBackupApi(repositories));
      },
      () => {
        if (live) setLoaded('unreadable');
      },
    );
    return () => {
      live = false;
    };
  }, []);

  if (loaded === null) return <View style={{ flex: 1, backgroundColor: colors.parchment }} />;
  if (loaded === 'unreadable') return <UnreadableStorage onRecovered={(r) => setLoaded(withBackupApi(r))} />;
  return (
    <RepositoryProvider value={loaded.repositories}>
      <BackupApiProvider value={loaded.backupApi}>
        <RootStack signedIn />
      </BackupApiProvider>
    </RepositoryProvider>
  );
}

/**
 * Shown when the stored collection cannot be read. Nothing here writes to storage except a restore,
 * and only after the user picked a file that parses as a backup.
 */
function UnreadableStorage({ onRecovered }: { onRecovered(repositories: LocalRepositories): void }) {
  const { colors, spacing } = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exported, setExported] = useState(false);
  // Shared by both buttons: an export and a restore never run at once.
  const inFlight = useRef(false);

  const run = async (action: () => Promise<void>, failure: (err: unknown) => string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(failure(err));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const exportRaw = () =>
    run(
      async () => {
        const raw = await AsyncStorage.getItem(STATE_KEY);
        if (raw === null) throw new Error('Nothing is stored');
        const uri = await expoBackupDevice.writeFile(RAW_RECOVERY_FILENAME, raw);
        if (await expoBackupDevice.share(uri)) setExported(true);
      },
      () => butler.rawExportFailed,
    );

  const restore = () =>
    run(
      async () => {
        const text = await expoBackupDevice.pickFile();
        if (text === null) return;
        onRecovered(await replaceWithBackup(AsyncStorage, parseBackup(text)));
      },
      (err) => (err instanceof BackupError ? butler.restoreBadFile : butler.restoreFailed),
    );

  const note = { fontSize: 15, color: colors.ink };
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.parchment }}
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: spacing.lg, gap: spacing.md }}
    >
      <ErrorBanner message={butler.storageUnreadable} />
      {error ? <ErrorBanner message={error} /> : null}
      {exported ? (
        <Text accessibilityLiveRegion="polite" style={note}>
          {butler.rawExportDone}
        </Text>
      ) : null}
      <Button variant="quiet" label={butler.rawExportCta} onPress={() => void exportRaw()} disabled={busy} />
      <Text style={note}>{butler.recoveryRestoreNote}</Text>
      <Button label={butler.restoreCta} onPress={() => void restore()} disabled={busy} />
    </ScrollView>
  );
}
