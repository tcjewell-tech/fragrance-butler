import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { butler } from '@/copy/butler';
import { useRepositories } from '@/data/RepositoryContext';
import { parseOccasion, timeOfDayAt } from '@/domain/recommendation';
import { ValidationError } from '@/domain/validation';
import { handOverAsk } from '@/features/ask/pendingAsk';
import { Button } from '@/ui/components/Button';
import { EmptyState } from '@/ui/components/EmptyState';
import { ErrorBanner } from '@/ui/components/ErrorBanner';
import { useTheme } from '@/ui/theme';

/** The tray needs at least two bottles to choose between. */
const MIN_BOTTLES = 2;

type Load = { state: 'loading' } | { state: 'failed' } | { state: 'ready'; bottles: number };

export default function AskScreen() {
  const { colors, fonts, spacing } = useTheme();
  const router = useRouter();
  const { collection } = useRepositories();
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [occasion, setOccasion] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Each load takes a number; only the newest may write results.
  const latest = useRef(0);
  const timeOfDay = timeOfDayAt(new Date());

  const refresh = useCallback(async () => {
    const id = ++latest.current;
    try {
      const entries = await collection.list();
      if (id === latest.current) setLoad({ state: 'ready', bottles: entries.length });
    } catch {
      if (id === latest.current) setLoad({ state: 'failed' });
    }
  }, [collection]);

  // Bottles are added and removed on other tabs, so count them again whenever this one gains focus.
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const ask = () => {
    let parsed: string;
    try {
      parsed = parseOccasion(occasion);
    } catch (err) {
      const tooLong = err instanceof ValidationError && occasion.trim() !== '';
      setError(tooLong ? butler.askOccasionTooLong : butler.askOccasionRequired);
      return;
    }
    setError(null);
    handOverAsk({ occasion: parsed, timeOfDay });
    router.push('/tray');
  };

  if (load.state === 'ready' && load.bottles < MIN_BOTTLES) {
    return (
      <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor: colors.parchment }]}>
        <EmptyState
          title={butler.askTooFew.title}
          body={butler.askTooFew.body}
          ctaLabel={butler.askTooFew.cta}
          onCta={() => router.navigate('/add')}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor: colors.parchment }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { padding: spacing.lg, gap: spacing.xl }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text accessibilityRole="header" style={[styles.greeting, { fontFamily: fonts.display, color: colors.ink }]}>
          {butler.askGreeting(timeOfDay)}
        </Text>

        {load.state === 'failed' ? <ErrorBanner message={butler.askLoadFailed} onRetry={() => void refresh()} /> : null}

        <View style={{ gap: spacing.xs }}>
          <Text style={[styles.label, { fontFamily: fonts.display, color: colors.ink }]}>{butler.askOccasionLabel}</Text>
          <TextInput
            accessibilityLabel={butler.askOccasionLabel}
            placeholder={butler.askOccasionPlaceholder}
            placeholderTextColor={colors.muted}
            value={occasion}
            onChangeText={(text) => {
              setOccasion(text);
              setError(null);
            }}
            multiline
            textAlignVertical="top"
            style={[styles.input, { borderColor: error ? colors.danger : colors.brass, color: colors.ink, padding: spacing.md }]}
          />
          {error ? (
            <Text accessibilityRole="alert" style={{ fontSize: 14, color: colors.danger }}>
              {error}
            </Text>
          ) : null}
        </View>

        <View style={[styles.conditions, { borderTopColor: colors.muted, paddingTop: spacing.md }]}>
          <Text style={{ fontSize: 15, color: colors.ink }}>{butler.askConditions(timeOfDay)}</Text>
        </View>

        <View style={styles.spacer} />
        <Button label={butler.askCta} onPress={ask} disabled={load.state !== 'ready'} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { flexGrow: 1 },
  greeting: { fontSize: 26 },
  label: { fontSize: 18 },
  input: { borderWidth: 1, borderRadius: 10, fontSize: 17, minHeight: 96 },
  conditions: { borderTopWidth: 1 },
  spacer: { flex: 1 },
});
