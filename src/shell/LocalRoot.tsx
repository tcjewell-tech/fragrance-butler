import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { butler } from '@/copy/butler';
import { BackupApiProvider } from '@/data/BackupApiContext';
import { createBackupApi, type BackupApi } from '@/data/backupApi';
import { expoBackupDevice } from '@/data/expoBackupDevice';
import { createLocalRepositories, type LocalRepositories } from '@/data/local';
import { RepositoryProvider } from '@/data/RepositoryContext';
import { ErrorBanner } from '@/ui/components/ErrorBanner';
import { useTheme } from '@/ui/theme';
import { RootStack } from './RootStack';

type Loaded = { repositories: LocalRepositories; backupApi: BackupApi };

/** The local-mode build: the collection lives on the phone and there is no sign-in. */
export function LocalRoot() {
  const { colors, spacing } = useTheme();
  const [loaded, setLoaded] = useState<Loaded | 'unreadable' | null>(null);

  useEffect(() => {
    let live = true;
    createLocalRepositories(AsyncStorage).then(
      (repositories) => {
        if (live) setLoaded({ repositories, backupApi: createBackupApi({ repositories, storage: AsyncStorage, device: expoBackupDevice }) });
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
  if (loaded === 'unreadable') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.parchment, justifyContent: 'center', padding: spacing.lg }}>
        <ErrorBanner message={butler.storageUnreadable} />
      </View>
    );
  }
  return (
    <RepositoryProvider value={loaded.repositories}>
      <BackupApiProvider value={loaded.backupApi}>
        <RootStack signedIn />
      </BackupApiProvider>
    </RepositoryProvider>
  );
}
