import { Pressable, StyleSheet, Text } from 'react-native';
import { butler } from '@/copy/butler';
import { useTheme } from '../theme';

export interface ButtonProps {
  label: string;
  onPress(): void;
  disabled?: boolean;
  loading?: boolean;
  /** `danger` is quiet, in the warning colour: for destructive actions that must not draw the eye first. */
  variant?: 'primary' | 'quiet' | 'danger';
}

export function Button({ label, onPress, disabled = false, loading = false, variant = 'primary' }: ButtonProps) {
  const { colors, fonts, spacing } = useTheme();
  const inactive = disabled || loading;
  const text = loading ? butler.saving : label;
  const primary = variant === 'primary';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={text}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.xl,
          backgroundColor: primary ? colors.brass : 'transparent',
          opacity: inactive ? 0.5 : pressed ? 0.8 : 1,
        },
      ]}
    >
      <Text
        style={{
          fontFamily: fonts.display,
          fontSize: 17,
          color: primary ? colors.parchment : variant === 'danger' ? colors.danger : colors.brass,
        }}
      >
        {text}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
