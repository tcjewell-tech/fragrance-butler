import { Tabs } from 'expo-router';
import { butler } from '@/copy/butler';
import { useTheme } from '@/ui/theme';

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
      <Tabs.Screen name="index" options={{ title: butler.tabs.collection }} />
      <Tabs.Screen name="add" options={{ title: butler.tabs.add }} />
    </Tabs>
  );
}
