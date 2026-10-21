import { StyleSheet, Text, View } from 'react-native';
import { butler } from '@/copy/butler';
import { useTheme } from '@/ui/theme';

/** Placeholder: replaced by the catalog search. */
export default function AddScreen() {
  const { colors, fonts } = useTheme();
  return (
    <View style={[styles.screen, { backgroundColor: colors.parchment }]}>
      <Text style={{ fontFamily: fonts.display, fontSize: 24, color: colors.ink }}>{butler.emptyCollection.cta}</Text>
    </View>
  );
}

const styles = StyleSheet.create({ screen: { flex: 1, alignItems: 'center', justifyContent: 'center' } });
