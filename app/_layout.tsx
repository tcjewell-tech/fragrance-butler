import { Stack } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { AppState, View } from 'react-native';
import { butler } from '@/copy/butler';
import { RepositoryProvider } from '@/data/RepositoryContext';
import { useSession } from '@/data/session';
import { defaultSessionApi, SessionApiProvider } from '@/data/SessionApiContext';
import { createSupabaseRepositories } from '@/data/supabase';
import { supabaseClient } from '@/data/supabaseClient';
import { useTheme } from '@/ui/theme';

/** Supabase's React Native guidance: refresh tokens only while the app is in the foreground. */
function useAutoRefreshWhileActive() {
  useEffect(() => {
    if (AppState.currentState === 'active') supabaseClient.auth.startAutoRefresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') supabaseClient.auth.startAutoRefresh();
      else supabaseClient.auth.stopAutoRefresh();
    });
    return () => {
      subscription.remove();
      supabaseClient.auth.stopAutoRefresh();
    };
  }, []);
}

export default function RootLayout() {
  const { colors, fonts } = useTheme();
  const { session, loading } = useSession();
  const repositories = useMemo(() => createSupabaseRepositories(supabaseClient), []);
  useAutoRefreshWhileActive();

  // Screens pushed over the tabs get a header; the tabs and sign-in draw their own.
  const pushedHeader = {
    headerShown: true,
    headerBackButtonDisplayMode: 'minimal',
    headerTintColor: colors.brass,
    headerStyle: { backgroundColor: colors.parchment },
    headerTitleStyle: { color: colors.ink, fontFamily: fonts.display },
    headerShadowVisible: false,
  } as const;

  // Hold on a plain splash until the stored session is read, so signed-in users never see the sign-in screen flash.
  if (loading) return <View style={{ flex: 1, backgroundColor: colors.parchment }} />;

  return (
    <SessionApiProvider value={defaultSessionApi}>
      <RepositoryProvider value={repositories}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.parchment } }}>
          <Stack.Protected guard={!session}>
            <Stack.Screen name="sign-in" />
          </Stack.Protected>
          <Stack.Protected guard={!!session}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="add/confirm" options={{ ...pushedHeader, title: butler.confirmTitle }} />
            <Stack.Screen name="add/custom" options={{ ...pushedHeader, title: butler.customTitle }} />
            <Stack.Screen name="item/[id]" options={{ ...pushedHeader, title: butler.detailTitle }} />
            <Stack.Screen name="settings" options={{ ...pushedHeader, title: butler.settingsTitle }} />
          </Stack.Protected>
        </Stack>
      </RepositoryProvider>
    </SessionApiProvider>
  );
}
