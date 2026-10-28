import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { butler } from '@/copy/butler';
import { useRepositories } from '@/data/RepositoryContext';
import type { CollectionEntry } from '@/domain/types';
import { Button } from '@/ui/components/Button';
import { Chip } from '@/ui/components/Chip';
import { ErrorBanner } from '@/ui/components/ErrorBanner';
import { useTheme } from '@/ui/theme';

const first = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? '') : (v ?? ''));

type Loaded = { state: 'loading' } | { state: 'failed' } | { state: 'missing' } | { state: 'ready'; entry: CollectionEntry };
interface Outcome {
  key: string;
  result: Exclude<Loaded, { state: 'loading' }>;
}

export default function ItemScreen() {
  const { colors, fonts, spacing } = useTheme();
  const router = useRouter();
  const { collection } = useRepositories();
  const id = first(useLocalSearchParams<{ id?: string }>().id);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [attempt, setAttempt] = useState(0);
  const loadKey = `${id}#${attempt}`;

  useEffect(() => {
    let cancelled = false;
    collection.get(id).then(
      (entry) => {
        if (!cancelled) setOutcome({ key: loadKey, result: entry ? { state: 'ready', entry } : { state: 'missing' } });
      },
      () => {
        if (!cancelled) setOutcome({ key: loadKey, result: { state: 'failed' } });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [collection, id, loadKey]);

  const loaded: Loaded = outcome?.key === loadKey ? outcome.result : { state: 'loading' };

  if (loaded.state === 'ready') return <Detail entry={loaded.entry} />;

  return (
    <View style={[styles.screen, { backgroundColor: colors.parchment, padding: spacing.lg, gap: spacing.lg }]}>
      {loaded.state === 'failed' ? (
        <ErrorBanner message={butler.bottleLoadFailed} onRetry={() => setAttempt((n) => n + 1)} />
      ) : null}
      {loaded.state === 'missing' ? (
        <>
          <Text style={{ fontFamily: fonts.display, fontSize: 18, color: colors.ink }}>{butler.itemMissing}</Text>
          <Button label={butler.back} onPress={() => router.back()} />
        </>
      ) : null}
    </View>
  );
}

const ERROR_COPY = {
  save: butler.saveFailed,
  favorite: butler.favoriteFailed,
  remove: butler.removeFailed,
} as const;

function Detail({ entry }: { entry: CollectionEntry }) {
  const { colors, fonts, spacing } = useTheme();
  const router = useRouter();
  const { collection } = useRepositories();
  const { item, fragrance } = entry;
  const [favorite, setFavorite] = useState(item.favorite);
  const [notes, setNotes] = useState(item.userNotes ?? '');
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const [error, setError] = useState<'save' | 'favorite' | 'remove' | null>(null);
  // One favourite write at a time: a second press while one is in flight could not be reverted cleanly.
  const favoriteBusy = useRef(false);
  const removing = useRef(false);
  // A removal that outlives the screen must not pop whatever screen is on top by then.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const toggleFavorite = () => {
    if (favoriteBusy.current) return;
    favoriteBusy.current = true;
    const previous = favorite;
    setFavorite(!previous);
    setError(null);
    collection.update(item.id, { favorite: !previous }).then(
      () => {
        favoriteBusy.current = false;
      },
      () => {
        favoriteBusy.current = false;
        if (!mounted.current) return;
        setFavorite(previous);
        setError('favorite');
      },
    );
  };

  const saveNotes = () => {
    if (savingNotes) return;
    setSavingNotes(true);
    setError(null);
    setNotesSaved(false);
    collection.update(item.id, { userNotes: notes }).then(
      () => {
        if (!mounted.current) return;
        setSavingNotes(false);
        setNotesSaved(true);
        AccessibilityInfo.announceForAccessibility(butler.notesSaved);
      },
      () => {
        if (!mounted.current) return;
        setSavingNotes(false);
        setError('save');
      },
    );
  };

  const doRemove = () => {
    if (removing.current) return;
    removing.current = true;
    setError(null);
    collection.remove(item.id).then(
      () => {
        if (mounted.current) router.back();
      },
      () => {
        removing.current = false;
        if (mounted.current) setError('remove');
      },
    );
  };

  const confirmRemove = () =>
    Alert.alert(butler.removeConfirm, undefined, [
      { text: butler.cancel, style: 'cancel' },
      { text: butler.removeConfirmCta, style: 'destructive', onPress: doRemove },
    ]);

  const tiers = [
    { label: butler.notesTop, notes: fragrance.notePyramid.top },
    { label: butler.notesHeart, notes: fragrance.notePyramid.heart },
    { label: butler.notesBase, notes: fragrance.notePyramid.base },
  ].filter((t) => t.notes.length > 0);

  const heading = [styles.heading, { fontFamily: fonts.display, color: colors.ink }];

  return (
    <ScrollView
      style={{ backgroundColor: colors.parchment }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.xl }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ gap: spacing.xs }}>
        <Text style={{ fontSize: 16, color: colors.muted }}>{fragrance.house}</Text>
        <Text accessibilityRole="header" style={[styles.name, { fontFamily: fonts.display, color: colors.ink }]}>
          {fragrance.name}
        </Text>
        <View style={[styles.facts, { gap: spacing.lg }]}>
          <Text style={{ fontSize: 16, color: colors.ink }}>{item.concentration}</Text>
          <Text style={{ fontSize: 16, color: colors.ink }}>{butler.sizeLabel(item.bottleSizeMl)}</Text>
        </View>
      </View>

      <View style={{ gap: spacing.sm }}>
        {tiers.length > 0 ? (
          tiers.map((t) => (
            <View key={t.label} style={{ gap: spacing.xs }}>
              <Text style={{ fontSize: 14, color: colors.muted }}>{t.label}</Text>
              <Text style={{ fontSize: 16, color: colors.ink }}>{t.notes.join(', ')}</Text>
            </View>
          ))
        ) : (
          <Text style={{ fontSize: 16, color: colors.muted }}>{butler.notesUnknown}</Text>
        )}
      </View>

      <View style={styles.facts}>
        <Chip label={butler.favorite} selected={favorite} onPress={toggleFavorite} />
      </View>

      <View style={{ gap: spacing.md }}>
        <Text style={heading}>{butler.userNotesLabel}</Text>
        <TextInput
          accessibilityLabel={butler.userNotesLabel}
          value={notes}
          onChangeText={(text) => {
            setNotes(text);
            setNotesSaved(false);
          }}
          multiline
          maxLength={2000}
          textAlignVertical="top"
          style={[styles.notesInput, { borderColor: colors.brass, color: colors.ink, padding: spacing.md }]}
        />
        {notesSaved ? (
          <Text accessibilityLiveRegion="polite" style={{ fontSize: 15, color: colors.muted }}>
            {butler.notesSaved}
          </Text>
        ) : null}
        <Button label={butler.saveNotes} onPress={saveNotes} disabled={savingNotes} />
      </View>

      {error ? <ErrorBanner message={ERROR_COPY[error]} /> : null}

      <Button variant="danger" label={butler.removeCta} onPress={confirmRemove} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  name: { fontSize: 28 },
  heading: { fontSize: 18 },
  facts: { flexDirection: 'row', alignItems: 'center' },
  notesInput: { borderWidth: 1, borderRadius: 10, fontSize: 17, minHeight: 120 },
});
