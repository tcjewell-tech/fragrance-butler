import { Redirect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ScrollView, StyleSheet, Text, View } from 'react-native';
import { butler } from '@/copy/butler';
import { useRepositories } from '@/data/RepositoryContext';
import type { Recommendation } from '@/domain/recommendation';
import type { CollectionEntry } from '@/domain/types';
import { handOverAsk, pendingAsk, type PendingAsk } from '@/features/ask/pendingAsk';
import { Button } from '@/ui/components/Button';
import { ErrorBanner } from '@/ui/components/ErrorBanner';
import { Tray, type TrayPick } from '@/ui/components/Tray';
import { useTheme } from '@/ui/theme';

/** Joins the butler's picks to the bottles they name. Null when fewer than two can be shown. */
function toTray(recommendation: Recommendation, entries: CollectionEntry[]): TrayPick[] | null {
  const byId = new Map(entries.map((e) => [e.item.id, e]));
  const picks = recommendation.picks.flatMap(({ itemId, rationale }) => {
    const entry = byId.get(itemId);
    if (!entry) return [];
    const { item, fragrance } = entry;
    return [
      {
        id: item.id,
        house: fragrance.house,
        name: fragrance.name,
        detail: `${item.concentration} · ${butler.sizeLabel(item.bottleSizeMl)}`,
        rationale,
      },
    ];
  });
  return picks.length >= 2 ? picks : null;
}

type Shown =
  | { state: 'choosing' }
  | { state: 'failed' }
  | { state: 'ready'; requestId: string; picks: TrayPick[]; bottles: number };

const NOTES = {
  others: butler.trayOthersFailed,
  noOthers: butler.trayNoOthers,
  choose: butler.trayChooseFailed,
} as const;

/**
 * Asks only with what the Ask screen handed over, read once at mount. Nothing comes from the URL, so a link
 * to /tray can neither start a request nor change one already on screen; with nothing handed over it goes home.
 */
export default function TrayScreen() {
  const [ask] = useState(pendingAsk);
  useEffect(() => handOverAsk(null), []);
  return ask ? <TrayFor {...ask} /> : <Redirect href="/" />;
}

function TrayFor({ occasion, timeOfDay }: PendingAsk) {
  const { colors, fonts, spacing } = useTheme();
  const { collection, recommendations } = useRepositories();

  const [shown, setShown] = useState<Shown>({ state: 'choosing' });
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<keyof typeof NOTES | null>(null);
  const [attempt, setAttempt] = useState(0);
  // Every bottle offered so far, so "Show me others" doesn't offer them again.
  const offered = useRef(new Set<string>());
  // Each request takes a number; only the newest may write results.
  const latest = useRef(0);

  const choose = useCallback(
    async (excludeItemIds: string[]) => {
      const id = ++latest.current;
      const [entries, recommendation] = await Promise.all([
        collection.list(),
        recommendations.recommend({ occasion, timeOfDay, excludeItemIds }),
      ]);
      const picks = toTray(recommendation, entries);
      if (!picks) throw new Error('Too few of the picks are in the collection');
      return { id, requestId: recommendation.requestId, picks, bottles: entries.length };
    },
    [collection, recommendations, occasion, timeOfDay],
  );

  const settle = useCallback((result: { requestId: string; picks: TrayPick[]; bottles: number }) => {
    for (const p of result.picks) offered.current.add(p.id);
    setShown({ state: 'ready', ...result });
    setChosenId(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    choose([]).then(
      (result) => {
        if (!cancelled && result.id === latest.current) settle(result);
      },
      () => {
        if (!cancelled) setShown({ state: 'failed' });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [choose, settle, attempt]);

  const showOthers = async () => {
    if (shown.state !== 'ready' || busy) return;
    const current = shown.picks.map((p) => p.id);
    // Leave out everything offered so far; once that leaves too few, leave out only the current picks.
    let exclude = [...offered.current];
    if (shown.bottles - exclude.length < 2) exclude = current;
    if (shown.bottles - exclude.length < 2) {
      setNote('noOthers');
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      const result = await choose(exclude);
      if (result.id === latest.current) settle(result);
    } catch {
      setNote('others');
    }
    setBusy(false);
  };

  const wear = async (itemId: string) => {
    if (shown.state !== 'ready' || busy) return;
    setBusy(true);
    setNote(null);
    try {
      await recommendations.recordSelection(shown.requestId, itemId);
      setChosenId(itemId);
      AccessibilityInfo.announceForAccessibility(butler.trayChosen(timeOfDay));
    } catch {
      setNote('choose');
    }
    setBusy(false);
  };

  if (shown.state === 'choosing') {
    return (
      <View style={[styles.centre, { backgroundColor: colors.parchment, gap: spacing.md }]}>
        <Text
          accessibilityRole="header"
          accessibilityLiveRegion="polite"
          style={[styles.greeting, styles.centred, { fontFamily: fonts.display, color: colors.ink }]}
        >
          {butler.trayChoosing}
        </Text>
        <View style={[styles.dots, { gap: spacing.sm }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {[0, 1, 2].map((i) => (
            <View
              key={i}
              style={[styles.dot, { borderColor: colors.brass, backgroundColor: i === 0 ? colors.brass : 'transparent' }]}
            />
          ))}
        </View>
      </View>
    );
  }

  if (shown.state === 'failed') {
    return (
      <View style={[styles.screen, { backgroundColor: colors.parchment, padding: spacing.lg }]}>
        <ErrorBanner
          message={butler.trayFailed}
          onRetry={() => {
            setShown({ state: 'choosing' });
            setAttempt((n) => n + 1);
          }}
        />
      </View>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: colors.parchment }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
      <Text style={{ fontSize: 14, lineHeight: 21, color: colors.muted }}>
        <Text style={{ color: colors.ink }}>{occasion}</Text>
        {` · ${butler.askConditions(timeOfDay).toLowerCase()}`}
      </Text>
      <Text accessibilityRole="header" style={[styles.greeting, { fontFamily: fonts.display, color: colors.ink }]}>
        {chosenId ? butler.trayEnjoy(timeOfDay) : butler.trayGreeting(timeOfDay)}
      </Text>
      <Tray
        picks={shown.picks}
        chosenId={chosenId}
        chosenLabel={butler.trayChosen(timeOfDay)}
        onChoose={(id) => void wear(id)}
        busy={busy}
      />
      {note ? <ErrorBanner message={NOTES[note]} /> : null}
      <View style={styles.after}>
        {chosenId ? (
          <Button variant="quiet" label={butler.trayChangeMind} onPress={() => setChosenId(null)} />
        ) : (
          <Button variant="quiet" label={butler.trayOthers} onPress={() => void showOthers()} disabled={busy} />
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  centred: { textAlign: 'center' },
  greeting: { fontSize: 26 },
  dots: { flexDirection: 'row' },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 1 },
  after: { alignItems: 'center' },
});
