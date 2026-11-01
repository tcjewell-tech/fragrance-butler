import { StyleSheet, Text, View } from 'react-native';
import { butler } from '@/copy/butler';
import { BACKUP_REMINDER_THRESHOLD } from '@/data/backupApi';
import { useTheme } from '../theme';
import { Button } from './Button';

export interface BackupReminderProps {
  count: number;
  onBackUp(): void;
  onDismiss(): void;
}

/** Local mode only: nudges a backup once enough bottles have been added since the last one. */
export function BackupReminder({ count, onBackUp, onDismiss }: BackupReminderProps) {
  const { colors, spacing } = useTheme();
  if (count < BACKUP_REMINDER_THRESHOLD) return null;
  return (
    <View style={[styles.banner, { borderColor: colors.brass, padding: spacing.md, gap: spacing.sm }]}>
      <Text accessibilityLiveRegion="polite" style={{ fontSize: 15, color: colors.ink }}>
        {butler.backupReminder(count)}
      </Text>
      <View style={[styles.actions, { gap: spacing.sm }]}>
        <Button label={butler.backupReminderCta} onPress={onBackUp} />
        <Button variant="quiet" label={butler.backupReminderDismiss} onPress={onDismiss} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { borderWidth: 1, borderRadius: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap' },
});
