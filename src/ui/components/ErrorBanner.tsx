import { Pressable, StyleSheet, Text, View } from 'react-native';
import { butler } from '@/copy/butler';
import { useTheme } from '../theme';

export interface ErrorBannerProps {
  message: string;
  onRetry?(): void;
  retryLabel?: string;
}

export function ErrorBanner({ message, onRetry, retryLabel }: ErrorBannerProps) {
  const { colors, spacing } = useTheme();
  const label = retryLabel ?? butler.retry;
  return (
    <View style={[styles.banner, { borderColor: colors.danger, padding: spacing.md, gap: spacing.sm }]}>
      {/* The alert role sits on the text, not the container, so the retry button stays separately reachable. */}
      <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ fontSize: 15, color: colors.danger }}>
        {message}
      </Text>
      {onRetry ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={onRetry}
          style={styles.retry}
        >
          <Text style={{ fontSize: 15, color: colors.brass, textDecorationLine: 'underline' }}>{label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { borderWidth: 1, borderRadius: 10 },
  retry: { minHeight: 44, justifyContent: 'center' },
});
