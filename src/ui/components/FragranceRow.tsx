import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';

export interface FragranceRowProps {
  house: string;
  name: string;
  detail?: string;
  onPress?(): void;
}

export function FragranceRow({ house, name, detail, onPress }: FragranceRowProps) {
  const { colors, fonts, spacing } = useTheme();
  const title = `${house} · ${name}`;
  const body = (
    <View style={{ paddingVertical: spacing.md, paddingHorizontal: spacing.lg }}>
      <Text style={{ fontFamily: fonts.display, fontSize: 18, color: colors.ink }}>{title}</Text>
      {detail ? <Text style={{ fontSize: 14, color: colors.muted, marginTop: spacing.xs }}>{detail}</Text> : null}
    </View>
  );

  if (!onPress) {
    return <View accessible accessibilityLabel={detail ? `${title}, ${detail}` : title}>{body}</View>;
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={detail ? `${title}, ${detail}` : title}
      onPress={onPress}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({ row: { minHeight: 44 } });
