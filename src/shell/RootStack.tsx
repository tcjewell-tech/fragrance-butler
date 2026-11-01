import { Stack } from 'expo-router';
import { butler } from '@/copy/butler';
import { useTheme } from '@/ui/theme';

/** The app's screens. `signedIn` picks between the sign-in screen and the app. */
export function RootStack({ signedIn }: { signedIn: boolean }) {
  const { colors, fonts } = useTheme();

  // Screens pushed over the tabs get a header; the tabs and sign-in draw their own.
  const pushedHeader = {
    headerShown: true,
    headerBackButtonDisplayMode: 'minimal',
    headerTintColor: colors.brass,
    headerStyle: { backgroundColor: colors.parchment },
    headerTitleStyle: { color: colors.ink, fontFamily: fonts.display },
    headerShadowVisible: false,
  } as const;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.parchment } }}>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="add/confirm" options={{ ...pushedHeader, title: butler.confirmTitle }} />
        <Stack.Screen name="add/custom" options={{ ...pushedHeader, title: butler.customTitle }} />
        <Stack.Screen name="item/[id]" options={{ ...pushedHeader, title: butler.detailTitle }} />
        <Stack.Screen name="settings" options={{ ...pushedHeader, title: butler.settingsTitle }} />
        <Stack.Screen name="tray" options={{ ...pushedHeader, title: butler.trayTitle }} />
      </Stack.Protected>
    </Stack>
  );
}
