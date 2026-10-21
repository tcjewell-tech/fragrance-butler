/**
 * Runs the shared repository contract against a real Supabase stack as a signed-in test user.
 * Skipped unless SUPABASE_TEST_URL is set. To run (local stack via `supabase start`, with the
 * migration and seed applied, e.g. `supabase db reset`):
 *
 *   SUPABASE_TEST_URL=http://127.0.0.1:54321 \
 *   SUPABASE_TEST_ANON_KEY=<anon key from `supabase status`> \
 *   SUPABASE_TEST_EMAIL=<email of a confirmed test user> \
 *   SUPABASE_TEST_PASSWORD=<its password> \
 *   npm run test:integration
 *
 * The test user must already exist with a password (create it in Studio, or POST /auth/v1/admin/users
 * with the service-role key and email_confirm: true). The suite deletes ALL of that user's collection
 * items before each test, so use a dedicated account. Custom fragrances it creates are kept (users
 * cannot delete them), so reruns accumulate a few "Le Labo Santal 33" rows for that user.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseRepositories } from '@/data/supabase';
import { runRepositoryContract, type RepositoryHarness } from './repositoryContract';

const url = process.env.SUPABASE_TEST_URL;

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} must be set when SUPABASE_TEST_URL is set`);
  return v;
}

let signedIn: Promise<SupabaseClient> | undefined;

function signedInClient(): Promise<SupabaseClient> {
  signedIn ??= (async () => {
    const client = createClient(requiredEnv('SUPABASE_TEST_URL'), requiredEnv('SUPABASE_TEST_ANON_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { error } = await client.auth.signInWithPassword({
      email: requiredEnv('SUPABASE_TEST_EMAIL'),
      password: requiredEnv('SUPABASE_TEST_PASSWORD'),
    });
    if (error) throw new Error(`Could not sign in the test user: ${error.message}`);
    return client;
  })();
  return signedIn;
}

async function harness(): Promise<RepositoryHarness> {
  const client = await signedInClient();
  const { error } = await client.from('collection_items').delete().not('id', 'is', null);
  if (error) throw new Error(`Could not empty the test user's collection: ${error.message}`);

  const repos = createSupabaseRepositories(client);
  const ids = async (query: string, house: string, name: string, concentration: string) => {
    const groups = await repos.catalog.search(query);
    const hit = groups
      .filter((g) => g.house === house && g.name === name)
      .flatMap((g) => g.variants)
      .find((v) => v.concentration === concentration && !v.isCustom);
    if (!hit) throw new Error(`Seed catalog is missing ${house} ${name} ${concentration}; run the seed first`);
    return hit.id;
  };
  return {
    ...repos,
    fixtures: {
      sauvageEdtId: await ids('sauvage', 'Dior', 'Sauvage', 'EDT'),
      sauvageEdpId: await ids('sauvage', 'Dior', 'Sauvage', 'EDP'),
      hermesId: await ids('terre d’hermes', 'Hermès', 'Terre d’Hermès', 'EDT'),
    },
  };
}

afterAll(async () => {
  if (signedIn) await (await signedIn).auth.signOut();
});

if (url) {
  runRepositoryContract('supabase', harness);
} else {
  describe.skip('repository contract: supabase (set SUPABASE_TEST_URL to run against a real stack)', () => {
    test('skipped', () => undefined);
  });
}
