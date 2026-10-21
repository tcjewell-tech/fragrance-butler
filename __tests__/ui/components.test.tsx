import { render, screen, userEvent } from '@testing-library/react-native';
import { Chip } from '@/ui/components/Chip';
import { EmptyState } from '@/ui/components/EmptyState';
import { ErrorBanner } from '@/ui/components/ErrorBanner';
import { FragranceRow } from '@/ui/components/FragranceRow';

describe('Chip', () => {
  test('is a toggle exposing selected state and calling onPress', async () => {
    const onPress = jest.fn();
    await render(<Chip label="EDP" selected onPress={onPress} />);
    const chip = screen.getByRole('button', { name: 'EDP' });
    expect(chip).toBeSelected();
    await userEvent.press(chip);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('is not selected when selected is false', async () => {
    await render(<Chip label="EDT" selected={false} onPress={() => {}} />);
    expect(screen.getByRole('button', { name: 'EDT' })).not.toBeSelected();
  });
});

describe('FragranceRow', () => {
  test('shows house and name with an optional detail line', async () => {
    await render(<FragranceRow house="Guerlain" name="Habit Rouge" detail="100 ml · EDP" />);
    expect(screen.getByText('Guerlain · Habit Rouge')).toBeOnTheScreen();
    expect(screen.getByText('100 ml · EDP')).toBeOnTheScreen();
  });

  test('is pressable only when onPress is given', async () => {
    const onPress = jest.fn();
    await render(<FragranceRow house="Dior" name="Sauvage" onPress={onPress} />);
    await userEvent.press(screen.getByRole('button', { name: 'Dior · Sauvage' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('is not a button without onPress', async () => {
    await render(<FragranceRow house="Dior" name="Sauvage" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('EmptyState', () => {
  test('shows title, body and a call to action', async () => {
    const onCta = jest.fn();
    await render(<EmptyState title="Nothing yet" body="Shall we begin?" ctaLabel="Begin" onCta={onCta} />);
    expect(screen.getByText('Nothing yet')).toBeOnTheScreen();
    expect(screen.getByText('Shall we begin?')).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('button', { name: 'Begin' }));
    expect(onCta).toHaveBeenCalledTimes(1);
  });

  test('omits the button without a label', async () => {
    await render(<EmptyState title="Nothing yet" body="Shall we begin?" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('ErrorBanner', () => {
  test('is an alert with the message and a retry action', async () => {
    const onRetry = jest.fn();
    await render(<ErrorBanner message="Could not reach you." onRetry={onRetry} retryLabel="Try again" />);
    expect(screen.getByRole('alert')).toBeOnTheScreen();
    expect(screen.getByText('Could not reach you.')).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  test('omits retry without a handler', async () => {
    await render(<ErrorBanner message="Could not reach you." />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
