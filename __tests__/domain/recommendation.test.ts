import { OCCASION_MAX, parseOccasion, parseRecommendation, timeOfDayAt } from '@/domain/recommendation';
import { ValidationError } from '@/domain/validation';

const at = (hour: number, minute = 0) => new Date(2026, 9, 27, hour, minute);

describe('timeOfDayAt', () => {
  test.each([
    [4, 59, 'night'],
    [5, 0, 'morning'],
    [11, 59, 'morning'],
    [12, 0, 'afternoon'],
    [16, 59, 'afternoon'],
    [17, 0, 'evening'],
    [21, 59, 'evening'],
    [22, 0, 'night'],
    [0, 0, 'night'],
  ] as const)('%i:%i is %s', (h, m, expected) => {
    expect(timeOfDayAt(at(h, m))).toBe(expected);
  });
});

describe('parseOccasion', () => {
  test('tidies whitespace', () => {
    expect(parseOccasion('  Office   Christmas\nparty ')).toBe('Office Christmas party');
  });

  test('rejects blank text', () => {
    expect(() => parseOccasion('   ')).toThrow(ValidationError);
  });

  test(`accepts ${OCCASION_MAX} characters and rejects one more`, () => {
    expect(parseOccasion('a'.repeat(OCCASION_MAX))).toHaveLength(OCCASION_MAX);
    expect(() => parseOccasion('a'.repeat(OCCASION_MAX + 1))).toThrow(ValidationError);
  });
});

describe('parseRecommendation', () => {
  const pick = (itemId: string) => ({ itemId, rationale: 'Warm enough for a festive room.' });

  test('accepts two or three distinct picks', () => {
    expect(parseRecommendation({ requestId: 'r1', picks: [pick('a'), pick('b')] }).picks).toHaveLength(2);
    expect(parseRecommendation({ requestId: 'r1', picks: [pick('a'), pick('b'), pick('c')] }).picks).toHaveLength(3);
  });

  test.each([
    ['one pick', [pick('a')]],
    ['four picks', [pick('a'), pick('b'), pick('c'), pick('d')]],
    ['a repeated pick', [pick('a'), pick('a')]],
    ['an empty rationale', [pick('a'), { itemId: 'b', rationale: '  ' }]],
  ])('rejects %s', (_label, picks) => {
    expect(() => parseRecommendation({ requestId: 'r1', picks })).toThrow(ValidationError);
  });

  test('rejects a missing request id', () => {
    expect(() => parseRecommendation({ picks: [pick('a'), pick('b')] })).toThrow(ValidationError);
  });
});
