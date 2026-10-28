import { Tabs } from 'expo-router';
import { butler } from '@/copy/butler';
import { features } from '@/config/features';
import { useTheme } from '@/ui/theme';

// With the Ask tab on, the app opens on it: asking is the core loop.
export const unstable_settings = { initialRouteName: features.askTab ? 'ask' : 'index' };

export default function TabsLayout() {
  const { colors } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brass,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.parchment, borderTopColor: colors.muted },
        sceneStyle: { backgroundColor: colors.parchment },
      }}
    >
      {/* href: null keeps the route but hides its tab while the flag is off. */}
      <Tabs.Screen name="ask" options={{ title: butler.tabs.ask, href: features.askTab ? undefined : null }} />
      <Tabs.Screen name="index" options={{ title: butler.tabs.collection }} />
      <Tabs.Screen name="add" options={{ title: butler.tabs.add }} />
    </Tabs>
  );
}
