const URL_KEY = 'EXPO_PUBLIC_SUPABASE_URL';
const ANON_KEY = 'EXPO_PUBLIC_SUPABASE_ANON_KEY';

describe('supabase client', () => {
  const saved = { url: process.env[URL_KEY], key: process.env[ANON_KEY] };

  beforeEach(() => {
    jest.resetModules();
    delete process.env[URL_KEY];
    delete process.env[ANON_KEY];
  });

  afterAll(() => {
    if (saved.url === undefined) delete process.env[URL_KEY];
    else process.env[URL_KEY] = saved.url;
    if (saved.key === undefined) delete process.env[ANON_KEY];
    else process.env[ANON_KEY] = saved.key;
  });

  test('importing the module does not throw without configuration', () => {
    expect(() => require('@/data/supabaseClient')).not.toThrow();
  });

  test('first use without configuration throws a clear error naming the variables', () => {
    const { supabaseClient, getSupabaseClient } = require('@/data/supabaseClient');
    expect(() => getSupabaseClient()).toThrow(/EXPO_PUBLIC_SUPABASE_URL.*EXPO_PUBLIC_SUPABASE_ANON_KEY/);
    expect(() => supabaseClient.auth).toThrow(/EXPO_PUBLIC_SUPABASE_URL/);
  });

  test('with configuration it creates one client and reuses it', () => {
    process.env[URL_KEY] = 'http://localhost:54321';
    process.env[ANON_KEY] = 'anon-key';
    const { supabaseClient, getSupabaseClient } = require('@/data/supabaseClient');
    const a = getSupabaseClient();
    expect(getSupabaseClient()).toBe(a);
    expect(supabaseClient.auth).toBe(a.auth);
    expect(typeof supabaseClient.rpc).toBe('function');
  });
});
