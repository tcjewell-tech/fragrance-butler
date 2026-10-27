import { z } from 'zod';
import { ValidationError } from './validation';

export const TIMES_OF_DAY = ['morning', 'afternoon', 'evening', 'night'] as const;
export type TimeOfDay = (typeof TIMES_OF_DAY)[number];

/** Morning 05:00–11:59, afternoon 12:00–16:59, evening 17:00–21:59, night otherwise. Local time. */
export function timeOfDayAt(date: Date): TimeOfDay {
  const h = date.getHours();
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  if (h >= 17 && h < 22) return 'evening';
  return 'night';
}

export const OCCASION_MAX = 200;

export interface RecommendationInput {
  /** The user's own words: "Office Christmas party". */
  occasion: string;
  timeOfDay: TimeOfDay;
  /** Collection item ids to leave out, for "Show me others". */
  excludeItemIds?: string[];
}

export interface RecommendationPick {
  /** A collection item id: picks only ever come from the user's own collection. */
  itemId: string;
  /** One sentence in the butler's voice: why this suits the moment. */
  rationale: string;
}

export interface Recommendation {
  requestId: string;
  /** Two or three, in the butler's order. */
  picks: RecommendationPick[];
}

const tidy = (s: string) => s.replace(/\s+/g, ' ').trim();

const occasionSchema = z
  .string()
  .transform(tidy)
  .pipe(z.string().min(1, 'Required').max(OCCASION_MAX, 'Too long'));

/** Tidies whitespace and checks 1–200 characters. Throws ValidationError on `occasion`. */
export function parseOccasion(x: unknown): string {
  const result = occasionSchema.safeParse(x);
  if (result.success) return result.data;
  throw new ValidationError('occasion', result.error.issues[0].message);
}

const recommendationSchema = z.object({
  requestId: z.string().min(1),
  picks: z
    .array(
      z.object({
        itemId: z.string().min(1),
        rationale: z.string().transform(tidy).pipe(z.string().min(1).max(280)),
      }),
    )
    .min(2)
    .max(3)
    .refine((picks) => new Set(picks.map((p) => p.itemId)).size === picks.length, 'Duplicate pick'),
});

/** Validates what the `recommend` function returned: 2–3 distinct picks, each with a rationale. */
export function parseRecommendation(x: unknown): Recommendation {
  const result = recommendationSchema.safeParse(x);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  throw new ValidationError(issue.path.join('.') || 'recommendation', issue.message);
}
