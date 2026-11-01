import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { butler } from '@/copy/butler';
import { useBackupApi } from '@/data/BackupApiContext';
import { useRepositories } from '@/data/RepositoryContext';
import { sortCollection, type SortMode } from '@/domain/collectionView';
import type { CollectionEntry } from '@/domain/types';
import { BackupReminder } from '@/ui/components/BackupReminder';
import { Chip } from '@/ui/components/Chip';
import { EmptyState } from '@/ui/components/EmptyState';
import { ErrorBanner } from '@/ui/components/ErrorBanner';
import { FragranceRow } from '@/ui/components/FragranceRow';
import { useTheme } from '@/ui/theme';

const SORTS: { mode: SortMode; label: string }[] = [
  { mode: 'house', label: butler.sortHouse },
  { mode: 'recent', label: butler.sortRecent },
  { mode: 'favorites', label: butler.sortFavorites },
];

const detailLine = ({ item }: CollectionEntry): string =>
  [item.concentration, butler.sizeLabel(item.bottleSizeMl), ...(item.favorite ? [butler.favoriteMark] : [])].join(' · ');

export default function CollectionScreen() {
  const { colors, fonts, spacing } = useTheme();
  const router = useRouter();
  const { collection } = useRepositories();
  const [entries, setEntries] = useState<CollectionEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sort, setSort] = useState<SortMode>('house');
  const backupApi = useBackupApi();
  const [unbacked, setUnbacked] = useState(0);
  // Component state, so "Not now" lasts until the app is next opened.
  const [reminderDismissed, setReminderDismissed] = useState(false);
  // Each load takes a number; only the newest may write results.
  const latest = useRef(0);

  const load = useCallback(
    async (pulled: boolean) => {
      const id = ++latest.current;
      if (pulled) setRefreshing(true);
      try {
        const next = await collection.list();
        if (id !== latest.current) return;
        setEntries(next);
        setFailed(false);
      } catch {
        if (id === latest.current) setFailed(true);
      }
      if (id === latest.current) setRefreshing(false);
    },
    [collection],
  );

  // Reload whenever the tab gains focus: bottles are added and removed on other screens.
  useFocusEffect(
    useCallback(() => {
      void load(false);
      // The reminder is a nudge: if the count cannot be read, it simply does not show.
      backupApi?.unbackedCount().then(setUnbacked, () => setUnbacked(0));
    }, [load, backupApi]),
  );

  const sorted = useMemo(() => (entries ? sortCollection(entries, sort) : []), [entries, sort]);

  return (
    <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor: colors.parchment }]}>
      <View style={[styles.header, { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm }]}>
        <Text accessibilityRole="header" style={[styles.title, { fontFamily: fonts.display, color: colors.ink }]}>
          {butler.tabs.collection}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={butler.settingsTitle}
          onPress={() => router.push('/settings')}
          style={styles.settings}
        >
          <Text style={{ fontSize: 16, color: colors.brass }}>{butler.settingsTitle}</Text>
        </Pressable>
      </View>
      <View style={[styles.sorts, { paddingHorizontal: spacing.lg, gap: spacing.sm }]}>
        {SORTS.map(({ mode, label }) => (
          <Chip key={mode} label={label} selected={sort === mode} onPress={() => setSort(mode)} />
        ))}
      </View>
      {backupApi && !reminderDismissed ? (
        <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}>
          <BackupReminder
            count={unbacked}
            onBackUp={() => router.push('/settings')}
            onDismiss={() => setReminderDismissed(true)}
          />
        </View>
      ) : null}
      <FlatList
        testID="collection-list"
        data={sorted}
        keyExtractor={(entry) => entry.item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.brass} />}
        ListHeaderComponent={
          failed ? (
            <View style={{ padding: spacing.lg }}>
              <ErrorBanner message={butler.loadFailed} onRetry={() => void load(false)} />
            </View>
          ) : undefined
        }
        ListEmptyComponent={
          entries !== null && !failed ? (
            <EmptyState
              title={butler.emptyCollection.title}
              body={butler.emptyCollection.body}
              ctaLabel={butler.emptyCollection.cta}
              onCta={() => router.navigate('/add')}
            />
          ) : undefined
        }
        renderItem={({ item: entry }) => (
          <FragranceRow
            house={entry.fragrance.house}
            name={entry.fragrance.name}
            detail={detailLine(entry)}
            onPress={() => router.push({ pathname: '/item/[id]', params: { id: entry.item.id } })}
          />
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 28 },
  settings: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'flex-end' },
  sorts: { flexDirection: 'row', flexWrap: 'wrap', paddingBottom: 8 },
  listContent: { flexGrow: 1 },
});
