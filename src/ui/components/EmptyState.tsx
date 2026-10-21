import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Button } from './Button';

export interface EmptyStateProps {
  title: string;
  body: string;
  ctaLabel?: string;
  onCta?(): void;
}

export function EmptyState({ title, body, ctaLabel, onCta }: EmptyStateProps) {
  const { colors, fonts, spacing } = useTheme();
  return (
    <View style={[styles.container, { padding: spacing.xxl, gap: spacing.md }]}>
      <Text accessibilityRole="header" style={[styles.title, { fontFamily: fonts.display, color: colors.ink }]}>
        {title}
      </Text>
      <Text style={[styles.body, { color: colors.muted }]}>{body}</Text>
      {ctaLabel && onCta ? (
        <View style={{ marginTop: spacing.lg }}>
          <Button label={ctaLabel} onPress={onCta} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 26, textAlign: 'center' },
  body: { fontSize: 16, textAlign: 'center' },
});
