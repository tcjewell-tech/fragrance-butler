import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { butler } from '@/copy/butler';
import { useRepositories } from '@/data/RepositoryContext';
import { CONCENTRATIONS, type Concentration } from '@/domain/types';
import { parseCustomFragrance, ValidationError } from '@/domain/validation';
import { Button } from '@/ui/components/Button';
import { Chip } from '@/ui/components/Chip';
import { ErrorBanner } from '@/ui/components/ErrorBanner';
import { useTheme } from '@/ui/theme';

const first = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? '') : (v ?? ''));

type Field = 'house' | 'name' | 'concentration' | 'releaseYear';
type Errors = Partial<Record<Field, string>>;

interface Draft {
  house: string;
  name: string;
  concentration: Concentration | null;
  year: string;
}

// Same whitespace tidying `parseCustomFragrance` applies, so "too long" is judged on what would be stored.
const tidyLength = (s: string) => s.replace(/\s+/g, ' ').trim().length;

/** An empty year means "unknown"; anything else non-numeric becomes NaN, which the schema rejects. */
const yearValue = (text: string): number | null => {
  const t = text.trim();
  if (t === '') return null;
  return /^\d+$/.test(t) ? Number(t) : NaN;
};

/** Everything is checked, not just the first failure, by validating each field against known-good others. */
function validate(draft: Draft): Errors {
  const good = { house: 'x', name: 'x', concentration: 'EDT', releaseYear: null };
  const values = {
    house: draft.house,
    name: draft.name,
    concentration: draft.concentration ?? undefined,
    releaseYear: yearValue(draft.year),
  };
  const errors: Errors = {};
  for (const field of ['house', 'name', 'concentration', 'releaseYear'] as const) {
    try {
      parseCustomFragrance({ ...good, [field]: values[field] });
    } catch (e) {
      if (!(e instanceof ValidationError)) throw e;
      if (field === 'house' || field === 'name') {
        errors[field] = tidyLength(draft[field]) > 120 ? butler.customFieldTooLong : butler.customFieldRequired;
      } else if (field === 'concentration') {
        errors.concentration = butler.customConcentrationRequired;
      } else {
        errors.releaseYear = butler.customYearInvalid;
      }
    }
  }
  return errors;
}

export default function CustomScreen() {
  const { colors, fonts, spacing } = useTheme();
  const router = useRouter();
  const { catalog } = useRepositories();
  const params = useLocalSearchParams<{ house?: string; name?: string }>();
  const [draft, setDraft] = useState<Draft>({
    house: first(params.house),
    name: first(params.name),
    concentration: null,
    year: '',
  });
  const [errors, setErrors] = useState<Errors>({});
  const [failed, setFailed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submitGuard = useRef(false);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const submit = async () => {
    if (submitGuard.current) return;
    const found = validate(draft);
    setErrors(found);
    setFailed(false);
    if (Object.keys(found).length > 0) return;
    submitGuard.current = true;
    setSubmitting(true);
    try {
      const input = parseCustomFragrance({
        house: draft.house,
        name: draft.name,
        concentration: draft.concentration,
        releaseYear: yearValue(draft.year),
      });
      const created = await catalog.createCustom(input);
      // Stay latched: the screen is replaced, so a second press must not create a second fragrance.
      router.replace({
        pathname: '/add/confirm',
        params: { house: created.house, name: created.name, ids: created.id },
      });
    } catch {
      submitGuard.current = false;
      setSubmitting(false);
      setFailed(true);
    }
  };

  const textField = (field: 'house' | 'name', label: string) => (
    <View style={{ gap: spacing.xs }}>
      <Text style={[styles.label, { fontFamily: fonts.display, color: colors.ink }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={draft[field]}
        onChangeText={(t) => set(field, t)}
        autoCorrect={false}
        style={[styles.input, { borderColor: errors[field] ? colors.danger : colors.brass, color: colors.ink, padding: spacing.md }]}
      />
      {errors[field] ? (
        <Text accessibilityRole="alert" style={{ fontSize: 14, color: colors.danger }}>
          {errors[field]}
        </Text>
      ) : null}
    </View>
  );

  return (
    <ScrollView
      style={{ backgroundColor: colors.parchment }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.xl }}
      keyboardShouldPersistTaps="handled"
    >
      {textField('house', butler.customHouseLabel)}
      {textField('name', butler.customNameLabel)}

      <View style={{ gap: spacing.md }}>
        <Text
          accessibilityRole="header"
          style={[styles.label, { fontFamily: fonts.display, color: errors.concentration ? colors.danger : colors.ink }]}
        >
          {butler.chooseConcentration}
        </Text>
        <View style={[styles.wrap, { gap: spacing.sm }]}>
          {CONCENTRATIONS.map((c) => (
            <Chip key={c} label={c} selected={draft.concentration === c} onPress={() => set('concentration', c)} />
          ))}
        </View>
        {/* Its own line, not just a colour change, so the problem is announced and readable without colour. */}
        {errors.concentration ? (
          <Text accessibilityRole="alert" style={{ fontSize: 14, color: colors.danger }}>
            {errors.concentration}
          </Text>
        ) : null}
      </View>

      <View style={{ gap: spacing.xs }}>
        <Text style={[styles.label, { fontFamily: fonts.display, color: colors.ink }]}>{butler.customYearLabel}</Text>
        <TextInput
          accessibilityLabel={butler.customYearLabel}
          value={draft.year}
          onChangeText={(t) => set('year', t)}
          keyboardType="number-pad"
          maxLength={4}
          style={[styles.input, { borderColor: errors.releaseYear ? colors.danger : colors.brass, color: colors.ink, padding: spacing.md }]}
        />
        {errors.releaseYear ? (
          <Text accessibilityRole="alert" style={{ fontSize: 14, color: colors.danger }}>
            {errors.releaseYear}
          </Text>
        ) : null}
      </View>

      {failed ? <ErrorBanner message={butler.saveFailed} onRetry={() => void submit()} /> : null}

      <Button label={butler.customContinue} onPress={() => void submit()} loading={submitting} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 18 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  input: { borderWidth: 1, borderRadius: 10, fontSize: 17, minHeight: 44 },
});
