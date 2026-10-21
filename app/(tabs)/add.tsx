import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { butler } from '@/copy/butler';
import { useRepositories } from '@/data/RepositoryContext';
import type { FragranceGroup } from '@/domain/types';
import { prefillFromQuery } from '@/features/add/customPrefill';
import { subscribeSaved } from '@/features/add/savedSignal';
import { Button } from '@/ui/components/Button';
import { ErrorBanner } from '@/ui/components/ErrorBanner';
import { FragranceRow } from '@/ui/components/FragranceRow';
import { useTheme } from '@/ui/theme';

const DEBOUNCE_MS = 250;
const TOAST_MS = 2500;

interface Settled {
  query: string;
  groups: FragranceGroup[];
}

export default function AddScreen() {
  const { colors, fonts, spacing } = useTheme();
  const router = useRouter();
  const { catalog } = useRepositories();
  const [query, setQuery] = useState('');
  const [settled, setSettled] = useState<Settled | null>(null);
  // The query whose search failed, so a banner never outlives the text it is about.
  const [failedQuery, setFailedQuery] = useState<string | null>(null);
  const [toast, setToast] = useState(false);
  // Each search takes a number; only the newest may write results.
  const latest = useRef(0);
  const trimmed = query.trim();

  const runSearch = useCallback(
    async (q: string) => {
      const id = ++latest.current;
      setFailedQuery(null);
      try {
        const groups = await catalog.search(q);
        if (id === latest.current) setSettled({ query: q, groups });
      } catch {
        if (id === latest.current) setFailedQuery(q);
      }
    },
    [catalog],
  );

  useEffect(() => {
    if (trimmed === '') {
      latest.current++; // drop any search still in flight
      return;
    }
    const timer = setTimeout(() => void runSearch(trimmed), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [trimmed, runSearch]);

  // The confirm screen reports a successful add; show the note briefly and announce it.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = subscribeSaved(() => {
      clearTimeout(timer);
      setToast(true);
      AccessibilityInfo.announceForAccessibility(butler.saved);
      timer = setTimeout(() => setToast(false), TOAST_MS);
    });
    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  const openCustom = () => router.push({ pathname: '/add/custom', params: prefillFromQuery(trimmed) });
  const openConfirm = (g: FragranceGroup) =>
    router.push({
      pathname: '/add/confirm',
      params: { house: g.house, name: g.name, ids: g.variants.map((v) => v.id).join(',') },
    });

  // Results only count while they answer the query on screen: no stale "I don't know" while typing on.
  const current = settled && settled.query === trimmed ? settled : null;
  const noResults = current !== null && current.groups.length === 0;

  const footer = noResults ? (
    <View style={{ gap: spacing.lg, padding: spacing.lg }}>
      <Text style={{ fontSize: 16, color: colors.ink }}>{butler.noResults(current.query)}</Text>
      <Button label={butler.addCustomCta} onPress={openCustom} />
    </View>
  ) : (
    <View style={{ padding: spacing.lg }}>
      <Button variant="quiet" label={butler.addCustomCta} onPress={openCustom} />
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor: colors.parchment }]}>
      <TextInput
        accessibilityLabel={butler.searchPlaceholder}
        placeholder={butler.searchPlaceholder}
        placeholderTextColor={colors.muted}
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="while-editing"
        style={[
          styles.input,
          { borderColor: colors.brass, color: colors.ink, margin: spacing.lg, padding: spacing.md },
        ]}
      />
      {failedQuery !== null && failedQuery === trimmed ? (
        <View style={{ paddingHorizontal: spacing.lg }}>
          <ErrorBanner message={butler.searchFailed} onRetry={() => void runSearch(trimmed)} />
        </View>
      ) : null}
      {toast ? (
        <Text
          style={[styles.toast, { color: colors.parchment, backgroundColor: colors.brass, fontFamily: fonts.display }]}
        >
          {butler.saved}
        </Text>
      ) : null}
      <FlatList
        data={current?.groups ?? []}
        keyExtractor={(g) => `${g.house}|${g.name}`}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <FragranceRow
            house={item.house}
            name={item.name}
            detail={item.variants.map((v) => v.concentration).join(' · ')}
            onPress={() => openConfirm(item)}
          />
        )}
        ListFooterComponent={footer}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  input: { borderWidth: 1, borderRadius: 10, fontSize: 17, minHeight: 44 },
  toast: { alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 18, overflow: 'hidden', fontSize: 15 },
});
