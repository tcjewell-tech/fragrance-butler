type Features = { localMode: boolean; askTab: boolean };

function load(env: Record<string, string | undefined>): Features {
  const saved = { ...process.env };
  delete process.env.EXPO_PUBLIC_LOCAL_MODE;
  delete process.env.EXPO_PUBLIC_FEATURE_ASK;
  for (const [k, v] of Object.entries(env)) {
    if (v !== undefined) process.env[k] = v;
  }
  let result!: Features;
  try {
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      result = require('@/config/features').features as Features;
    });
  } finally {
    process.env = saved;
  }
  return result;
}

describe('features', () => {
  it('localMode is off by default', () => {
    expect(load({}).localMode).toBe(false);
  });

  it('localMode is on when EXPO_PUBLIC_LOCAL_MODE=1', () => {
    expect(load({ EXPO_PUBLIC_LOCAL_MODE: '1' }).localMode).toBe(true);
  });

  it('askTab is off in local mode even with EXPO_PUBLIC_FEATURE_ASK=1', () => {
    expect(load({ EXPO_PUBLIC_LOCAL_MODE: '1', EXPO_PUBLIC_FEATURE_ASK: '1' }).askTab).toBe(false);
  });

  it('askTab is on with only EXPO_PUBLIC_FEATURE_ASK=1', () => {
    expect(load({ EXPO_PUBLIC_FEATURE_ASK: '1' }).askTab).toBe(true);
  });
});
