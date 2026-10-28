import { StyleSheet, Text, View } from 'react-native';
import { butler } from '@/copy/butler';
import { useTheme } from '../theme';
import { Button } from './Button';

export interface TrayPick {
  /** The collection item id. */
  id: string;
  house: string;
  name: string;
  /** Concentration and size: "EDP · 50 ml". */
  detail: string;
  rationale: string;
}

export interface TrayProps {
  /** Two or three, already in the butler's order. */
  picks: TrayPick[];
  /** Once set, that pick shows `chosenLabel` and the others shrink to their name. */
  chosenId: string | null;
  chosenLabel: string;
  onChoose(id: string): void;
  /** Disables "Wear this" while a choice is being recorded. */
  busy?: boolean;
}

/** The signature surface: the butler's picks on a brass-rimmed tray. */
export function Tray({ picks, chosenId, chosenLabel, onChoose, busy = false }: TrayProps) {
  const { colors, fonts, spacing } = useTheme();
  return (
    <View
      style={[styles.tray, { backgroundColor: colors.tray, borderColor: colors.brass, paddingHorizontal: spacing.lg }]}
    >
      {picks.map((pick, index) => {
        const title = `${pick.house} · ${pick.name}`;
        const divider = index > 0 ? { borderTopWidth: 1, borderTopColor: colors.muted } : null;
        // A chosen tray keeps the others in view as a single quiet line each.
        if (chosenId !== null && pick.id !== chosenId) {
          return (
            <View key={pick.id} style={[{ paddingVertical: spacing.md }, divider]}>
              <Text style={{ fontFamily: fonts.display, fontSize: 18, color: colors.muted }}>{title}</Text>
            </View>
          );
        }
        return (
          <View key={pick.id} style={[{ paddingVertical: spacing.lg, gap: spacing.xs }, divider]}>
            <Text style={{ fontSize: 14, color: colors.brass }}>{butler.trayRank[index]}</Text>
            <Text style={{ fontFamily: fonts.display, fontSize: 22, color: colors.ink }}>{title}</Text>
            <Text style={{ fontSize: 14, color: colors.muted }}>{pick.detail}</Text>
            <Text style={{ fontSize: 16, lineHeight: 22, color: colors.ink, marginTop: spacing.sm }}>{pick.rationale}</Text>
            {pick.id === chosenId ? (
              <Text accessibilityLiveRegion="polite" style={{ fontSize: 14, color: colors.brass, marginTop: spacing.sm }}>
                {chosenLabel}
              </Text>
            ) : (
              <View style={[styles.wear, { marginLeft: -spacing.xl }]}>
                <Button
                  variant="quiet"
                  label={butler.trayWear}
                  accessibilityLabel={butler.trayWearLabel(pick.house, pick.name)}
                  onPress={() => onChoose(pick.id)}
                  disabled={busy}
                />
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tray: { borderWidth: 1, borderRadius: 10 },
  wear: { alignSelf: 'flex-start' },
});
