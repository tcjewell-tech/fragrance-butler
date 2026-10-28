import { render, screen, userEvent } from '@testing-library/react-native';
import { butler } from '@/copy/butler';
import { Tray, type TrayPick } from '@/ui/components/Tray';

const picks: TrayPick[] = [
  { id: 'a', house: 'Guerlain', name: 'Shalimar', detail: 'EDP · 50 ml', rationale: 'Warm enough for a festive room.' },
  { id: 'b', house: 'Chanel', name: 'Bois des Îles', detail: 'Parfum · 75 ml', rationale: 'Quieter, if you prefer.' },
];

describe('Tray', () => {
  test('shows each pick with its rank, name, detail and reason', async () => {
    await render(<Tray picks={picks} chosenId={null} chosenLabel="Chosen." onChoose={() => {}} />);
    expect(screen.getByText(butler.trayRank[0])).toBeOnTheScreen();
    expect(screen.getByText(butler.trayRank[1])).toBeOnTheScreen();
    expect(screen.getByText('Guerlain · Shalimar')).toBeOnTheScreen();
    expect(screen.getByText('EDP · 50 ml')).toBeOnTheScreen();
    expect(screen.getByText('Warm enough for a festive room.')).toBeOnTheScreen();
  });

  test('"Wear this" names its bottle for screen readers and reports the pick', async () => {
    const onChoose = jest.fn();
    await render(<Tray picks={picks} chosenId={null} chosenLabel="Chosen." onChoose={onChoose} />);
    await userEvent.press(screen.getByRole('button', { name: butler.trayWearLabel('Chanel', 'Bois des Îles') }));
    expect(onChoose).toHaveBeenCalledWith('b');
  });

  test('once chosen, the pick shows the label and the others shrink to their name', async () => {
    await render(<Tray picks={picks} chosenId="a" chosenLabel="Chosen for this evening." onChoose={() => {}} />);
    expect(screen.getByText('Chosen for this evening.')).toBeOnTheScreen();
    expect(screen.getByText('Chanel · Bois des Îles')).toBeOnTheScreen();
    expect(screen.queryByText('Quieter, if you prefer.')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Wear/ })).toBeNull();
  });

  test('busy disables "Wear this"', async () => {
    await render(<Tray picks={picks} chosenId={null} chosenLabel="Chosen." onChoose={() => {}} busy />);
    expect(screen.getByRole('button', { name: butler.trayWearLabel('Guerlain', 'Shalimar') })).toBeDisabled();
  });
});
