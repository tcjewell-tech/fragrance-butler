import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { butler } from '@/copy/butler';
import { useRepositories } from '@/data/RepositoryContext';
import { CONCENTRATIONS, PRESET_BOTTLE_SIZES_ML, type Fragrance } from '@/domain/types';
import { isValidBottleSizeMl } from '@/domain/validation';
import { announceSaved } from '@/features/add/savedSignal';
import { useSaveBottle } from '@/features/add/useSaveBottle';
import { Button } from '@/ui/components/Button';
import { Chip } from '@/ui/components/Chip';
import { ErrorBanner } from '@/ui/components/ErrorBanner';
import { FragranceRow } from '@/ui/components/FragranceRow';
import { useTheme } from '@/ui/theme';

const first = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? '') : (v ?? ''));

const NO_VARIANTS: Fragrance[] = [];

type SizeChoice = { kind: 'preset'; ml: number } | { kind: 'other' } | null;
type Loaded = { state: 'loading' } | { state: 'failed' } | { state: 'ready'; variants: Fragrance[] };
interface Outcome {
  key: string;
  variants: Fragrance[] | null; // null: the read failed
}

/** The shared confirmation step: every way of finding a bottle ends here. */
export default function ConfirmScreen() {
  const { colors, fonts, spacing } = useTheme();
  const router = useRouter();
  const { catalog } = useRepositories();
  const params = useLocalSearchParams<{ house?: string; name?: string; ids?: string }>();
  const house = first(params.house);
  const name = first(params.name);
  const ids = first(params.ids);

  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [attempt, setAttempt] = useState(0);
  const loadKey = `${ids}#${attempt}`;
  const [variantId, setVariantId] = useState<string | null>(null);
  const [size, setSize] = useState<SizeChoice>(null);
  const [otherText, setOtherText] = useState('');
  const { save, status } = useSaveBottle();
  // Success side effects (announce, go back) must run once however many presses reached `save`.
  const submitted = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const wanted = ids.split(',').filter((id) => id !== '');
    Promise.all(wanted.map((id) => catalog.getById(id))).then(
      (found) => {
        if (cancelled) return;
        const variants = found
          .filter((f): f is Fragrance => f !== null)
          .sort((a, b) => CONCENTRATIONS.indexOf(a.concentration) - CONCENTRATIONS.indexOf(b.concentration));
        setOutcome({ key: loadKey, variants: variants.length > 0 ? variants : null });
      },
      () => {
        if (!cancelled) setOutcome({ key: loadKey, variants: null });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [catalog, ids, loadKey]);

  const loaded: Loaded =
    outcome?.key !== loadKey
      ? { state: 'loading' }
      : outcome.variants
        ? { state: 'ready', variants: outcome.variants }
        : { state: 'failed' };
  const variants = loaded.state === 'ready' ? loaded.variants : NO_VARIANTS;
  const selected = variants.length === 1 ? variants[0] : (variants.find((v) => v.id === variantId) ?? null);

  const otherMl = /^\d+$/.test(otherText.trim()) ? Number(otherText.trim()) : NaN;
  const otherInvalid = size?.kind === 'other' && otherText.trim() !== '' && !isValidBottleSizeMl(otherMl);
  const bottleSizeMl = size?.kind === 'preset' ? size.ml : size?.kind === 'other' && isValidBottleSizeMl(otherMl) ? otherMl : null;
  const canSave = selected !== null && bottleSizeMl !== null;

  const submit = () => {
    if (!selected || bottleSizeMl === null || submitted.current) return;
    submitted.current = true;
    save({
      fragranceId: selected.id,
      bottleSizeMl,
      concentration: selected.concentration,
      captureMethod: 'manual',
    }).then(
      () => {
        announceSaved();
        router.back();
      },
      () => {
        submitted.current = false;
      },
    );
  };

  const label = [styles.label, { fontFamily: fonts.display, color: colors.ink }];
  const wrap = [styles.wrap, { gap: spacing.sm }];

  return (
    <ScrollView
      style={{ backgroundColor: colors.parchment }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.xl }}
      keyboardShouldPersistTaps="handled"
    >
      <FragranceRow house={house} name={name} />

      {loaded.state === 'failed' ? <ErrorBanner message={butler.loadFailed} onRetry={() => setAttempt((n) => n + 1)} /> : null}

      {variants.length > 1 ? (
        <View style={{ gap: spacing.md }}>
          <Text accessibilityRole="header" style={label}>
            {butler.chooseConcentration}
          </Text>
          <View style={wrap}>
            {variants.map((v) => (
              <Chip
                key={v.id}
                label={v.concentration}
                selected={v.id === variantId}
                onPress={() => setVariantId(v.id)}
              />
            ))}
          </View>
        </View>
      ) : null}

      {loaded.state === 'ready' ? (
        <View style={{ gap: spacing.md }}>
          <Text accessibilityRole="header" style={label}>
            {butler.chooseSize}
          </Text>
          <View style={wrap}>
            {PRESET_BOTTLE_SIZES_ML.map((ml) => (
              <Chip
                key={ml}
                label={butler.sizeLabel(ml)}
                selected={size?.kind === 'preset' && size.ml === ml}
                onPress={() => setSize({ kind: 'preset', ml })}
              />
            ))}
            <Chip label={butler.sizeOther} selected={size?.kind === 'other'} onPress={() => setSize({ kind: 'other' })} />
          </View>
          {size?.kind === 'other' ? (
            <View style={{ gap: spacing.xs }}>
              <TextInput
                accessibilityLabel={butler.sizeOtherLabel}
                placeholder={butler.sizeOtherLabel}
                placeholderTextColor={colors.muted}
                value={otherText}
                onChangeText={setOtherText}
                keyboardType="number-pad"
                autoFocus
                style={[styles.input, { borderColor: colors.brass, color: colors.ink, padding: spacing.md }]}
              />
              {otherInvalid ? (
                <Text accessibilityLiveRegion="polite" style={{ fontSize: 14, color: colors.danger }}>
                  {butler.customSizeInvalid}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}

      {status === 'error' ? <ErrorBanner message={butler.saveFailed} onRetry={submit} /> : null}

      {loaded.state === 'ready' ? (
        <Button label={butler.save} onPress={submit} disabled={!canSave} loading={status === 'saving'} />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 18 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  input: { borderWidth: 1, borderRadius: 10, fontSize: 17, minHeight: 44 },
});
