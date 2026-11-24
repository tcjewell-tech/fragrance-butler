import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { render, screen, userEvent } from '@testing-library/react-native';
import { butler } from '@/copy/butler';
import { useBackupApi } from '@/data/BackupApiContext';
import { bundledCatalog } from '@/data/bundledCatalog';
import { expoBackupDevice } from '@/data/expoBackupDevice';
import { STATE_KEY } from '@/data/local';
import { useRepositories } from '@/data/RepositoryContext';
import { LocalRoot, RAW_RECOVERY_FILENAME } from '@/shell/LocalRoot';

jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
jest.mock('@/data/expoBackupDevice', () => ({
  expoBackupDevice: { writeFile: jest.fn(), share: jest.fn(), pickFile: jest.fn() },
}));

// Stand-in for a screen: shows which providers it can reach.
function MockProbe({ name }: { name: string }) {
  const { Text } = require('react-native');
  const repositories = useRepositories();
  const backupApi = useBackupApi();
  return <Text>{`${name} repositories:${repositories ? 'yes' : 'no'} backup:${backupApi ? 'yes' : 'no'}`}</Text>;
}

jest.mock('expo-router', () => {
  const Stack = ({ children }: { children: unknown }) => children;
  Stack.Protected = ({ guard, children }: { guard: boolean; children: unknown }) => (guard ? children : null);
  Stack.Screen = ({ name }: { name: string }) => <MockProbe name={name} />;
  return { Stack };
});

const ENV_KEYS = ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY'] as const;
const savedEnv = ENV_KEYS.map((k) => process.env[k]);

beforeEach(async () => {
  ENV_KEYS.forEach((k) => delete process.env[k]);
  await AsyncStorage.clear();
});

afterAll(() => {
  ENV_KEYS.forEach((k, i) => {
    if (savedEnv[i] !== undefined) process.env[k] = savedEnv[i];
  });
});

describe('LocalRoot', () => {
  test('renders the app without any Supabase environment variable and never touches the Supabase client', async () => {
    await render(<LocalRoot />);
    expect(await screen.findByText('(tabs) repositories:yes backup:yes')).toBeTruthy();
    expect(screen.getByText('settings repositories:yes backup:yes')).toBeTruthy();
    expect(screen.queryByText(/^sign-in /)).toBeNull();
    expect(createClient).not.toHaveBeenCalled();
  });

  test('shows the unreadable-storage message and does not render the app when the stored state is corrupt', async () => {
    await AsyncStorage.setItem(STATE_KEY, '{corrupt');
    await render(<LocalRoot />);
    expect(await screen.findByText(butler.storageUnreadable)).toBeTruthy();
    expect(screen.getByRole('button', { name: butler.rawExportCta })).toBeTruthy();
    expect(screen.getByRole('button', { name: butler.restoreCta })).toBeTruthy();
    expect(screen.queryByText(/\(tabs\)/)).toBeNull();
    expect(await AsyncStorage.getItem(STATE_KEY)).toBe('{corrupt');
  });
});

describe('LocalRoot recovery from unreadable storage', () => {
  const device = expoBackupDevice as jest.Mocked<typeof expoBackupDevice>;
  const catalogId = bundledCatalog()[0].id;
  const backupText = JSON.stringify({
    format: 'fragrance-butler-backup',
    version: 1,
    exportedAt: '2026-11-01T12:00:00.000Z',
    items: [
      {
        id: 'item-1',
        userId: 'local-user',
        fragranceId: catalogId,
        bottleSizeMl: 100,
        concentration: 'EDT',
        acquisitionDate: null,
        captureMethod: 'manual',
        userNotes: null,
        favorite: false,
        wearCount: 2,
        createdAt: '2026-10-01T12:00:00.000Z',
      },
    ],
    customFragrances: [],
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.setItem(STATE_KEY, '{corrupt');
  });

  const showRecovery = async () => {
    const user = userEvent.setup();
    await render(<LocalRoot />);
    await screen.findByText(butler.storageUnreadable);
    return user;
  };

  test('saving a copy shares the raw stored text and leaves it in place', async () => {
    device.writeFile.mockResolvedValue('file:///cache/raw');
    device.share.mockResolvedValue(true);
    const user = await showRecovery();
    await user.press(screen.getByRole('button', { name: butler.rawExportCta }));
    expect(await screen.findByText(butler.rawExportDone)).toBeTruthy();
    expect(device.writeFile).toHaveBeenCalledWith(RAW_RECOVERY_FILENAME, '{corrupt');
    expect(device.share).toHaveBeenCalledWith('file:///cache/raw');
    expect(await AsyncStorage.getItem(STATE_KEY)).toBe('{corrupt');
  });

  test('a file that is not a backup is refused and nothing is overwritten', async () => {
    device.pickFile.mockResolvedValue('not a backup');
    const user = await showRecovery();
    await user.press(screen.getByRole('button', { name: butler.restoreCta }));
    expect(await screen.findByText(butler.restoreBadFile)).toBeTruthy();
    expect(await AsyncStorage.getItem(STATE_KEY)).toBe('{corrupt');
  });

  test('a cancelled picker changes nothing', async () => {
    device.pickFile.mockResolvedValue(null);
    const user = await showRecovery();
    await user.press(screen.getByRole('button', { name: butler.restoreCta }));
    expect(screen.getByText(butler.storageUnreadable)).toBeTruthy();
    expect(await AsyncStorage.getItem(STATE_KEY)).toBe('{corrupt');
  });

  test('restoring a valid backup replaces the stored collection and opens the app', async () => {
    device.pickFile.mockResolvedValue(backupText);
    const user = await showRecovery();
    await user.press(screen.getByRole('button', { name: butler.restoreCta }));
    expect(await screen.findByText('(tabs) repositories:yes backup:yes')).toBeTruthy();
    const stored = JSON.parse((await AsyncStorage.getItem(STATE_KEY))!);
    expect(stored.items).toEqual([expect.objectContaining({ id: 'item-1', fragranceId: catalogId, wearCount: 2 })]);
  });
});
