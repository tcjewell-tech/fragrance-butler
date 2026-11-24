/**
 * Feature flags, read from EXPO_PUBLIC_* variables at build time (Expo inlines them).
 *
 * `localMode`: on-device storage and file backup, no sign-in. The default, so the app runs with no backend.
 * The Supabase build (sign-in, cloud tables) is opt-in with EXPO_PUBLIC_CLOUD=1 and needs the
 * EXPO_PUBLIC_SUPABASE_* variables.
 *
 * `askTab`: the Ask tab and the tray. Off until the `recommend` Edge Function exists, so a build never
 * shows a screen that cannot answer. Turn on with EXPO_PUBLIC_FEATURE_ASK=1. Always off in local mode,
 * because the Ask feature needs the server.
 */
const localMode = process.env.EXPO_PUBLIC_CLOUD !== '1';

export const features = {
  localMode,
  askTab: !localMode && process.env.EXPO_PUBLIC_FEATURE_ASK === '1',
} as const;
