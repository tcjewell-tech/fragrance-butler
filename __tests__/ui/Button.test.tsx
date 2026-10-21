import { render, screen, userEvent } from '@testing-library/react-native';
import { butler } from '@/copy/butler';
import { Button } from '@/ui/components/Button';

describe('Button', () => {
  test('calls onPress when pressed', async () => {
    const onPress = jest.fn();
    await render(<Button label="Continue" onPress={onPress} />);
    await userEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('while loading it shows the saving copy, is busy and does not call onPress', async () => {
    const onPress = jest.fn();
    await render(<Button label="Continue" onPress={onPress} loading />);
    const button = screen.getByRole('button', { name: butler.saving });
    expect(button).toBeDisabled();
    expect(button).toBeBusy();
    expect(screen.queryByText('Continue')).toBeNull();
    await userEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  test('disabled does not call onPress', async () => {
    const onPress = jest.fn();
    await render(<Button label="Continue" onPress={onPress} disabled />);
    const button = screen.getByRole('button', { name: 'Continue' });
    expect(button).toBeDisabled();
    await userEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  test('renders the quiet variant', async () => {
    await render(<Button label="Cancel" onPress={() => {}} variant="quiet" />);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
  });
});
