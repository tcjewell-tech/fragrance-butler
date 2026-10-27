/**
 * Feature flags, read from EXPO_PUBLIC_* variables at build time (Expo inlines them).
 *
 * `askTab`: the Ask tab and the tray. Off until the `recommend` Edge Function exists, so a build never
 * shows a screen that cannot answer. Turn on with EXPO_PUBLIC_FEATURE_ASK=1.
 */
export const features = {
  askTab: process.env.EXPO_PUBLIC_FEATURE_ASK === '1',
} as const;
