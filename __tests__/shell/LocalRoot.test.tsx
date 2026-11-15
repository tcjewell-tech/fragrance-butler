import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { render, screen } from '@testing-library/react-native';
import { butler } from '@/copy/butler';
import { useBackupApi } from '@/data/BackupApiContext';
import { STATE_KEY } from '@/data/local';
import { useRepositories } from '@/data/RepositoryContext';
import { LocalRoot } from '@/shell/LocalRoot';

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
    expect(screen.queryByText(/\(tabs\)/)).toBeNull();
    expect(await AsyncStorage.getItem(STATE_KEY)).toBe('{corrupt');
  });
});
