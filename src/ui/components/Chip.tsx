import { Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '../theme';

export interface ChipProps {
  label: string;
  selected: boolean;
  onPress(): void;
}

export function Chip({ label, selected, onPress }: ChipProps) {
  const { colors, spacing } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.base,
        {
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.sm,
          borderColor: colors.brass,
          backgroundColor: selected ? colors.brass : 'transparent',
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
