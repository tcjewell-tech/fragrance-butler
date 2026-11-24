import { Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '../theme';

export interface ChipProps {
  label: string;
  selected: boolean;
  onPress(): void;
  disabled?: boolean;
}

export function Chip({ label, selected, onPress, disabled = false }: ChipProps) {
  const { colors, spacing } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.base,
        {
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.sm,
          borderColor: colors.brass,
          backgroundColor: selected ? colors.brass : 'transparent',
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      <Text style={{ fontSize: 15, color: selected ? colors.parchment : colors.ink }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
