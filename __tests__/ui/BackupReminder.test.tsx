import { render, screen, userEvent } from '@testing-library/react-native';
import { butler } from '@/copy/butler';
import { BackupReminder } from '@/ui/components/BackupReminder';

describe('BackupReminder', () => {
  test('renders nothing at 2', async () => {
    await render(<BackupReminder count={2} onBackUp={jest.fn()} onDismiss={jest.fn()} />);
    expect(screen.toJSON()).toBeNull();
  });

  test('renders the count at 3', async () => {
    await render(<BackupReminder count={3} onBackUp={jest.fn()} onDismiss={jest.fn()} />);
    expect(screen.getByText('You have 3 bottles not yet backed up.')).toBeOnTheScreen();
  });

  test('Back up and Not now call their handlers', async () => {
    const onBackUp = jest.fn();
    const onDismiss = jest.fn();
    const user = userEvent.setup();
    await render(<BackupReminder count={4} onBackUp={onBackUp} onDismiss={onDismiss} />);
    await user.press(screen.getByRole('button', { name: butler.backupReminderCta }));
    expect(onBackUp).toHaveBeenCalledTimes(1);
    await user.press(screen.getByRole('button', { name: butler.backupReminderDismiss }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
