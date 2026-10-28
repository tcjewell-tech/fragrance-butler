// The `recommend` Edge Function (Deno). See docs/recommend-contract.md for the contract and
// ../_shared/recommend-core.ts for the logic; this file only connects it to Supabase and Claude.
//
// Secrets: ANTHROPIC_API_KEY (set it yourself, see docs/release/testflight.md). SUPABASE_URL,
// SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import Anthropic from 'npm:@anthropic-ai/sdk@1.3.0';
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { type Candidate, HttpError, modelRequest, recommend } from '../_shared/recommend-core.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new HttpError(500, `${name} is not set`);
  return v;
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

interface Row {
  id: string;
  fragrance_id: string;
  bottle_size_ml: number;
  concentration: string;
  favorite_flag: boolean;
  wear_count: number;
  user_notes: string | null;
  fragrances: {
    house: string;
    name: string;
    olfactory_family: string | null;
    note_pyramid: { top?: unknown; heart?: unknown; base?: unknown } | null;
    longevity: number | null;
    projection: number | null;
    season_affinity: string[] | null;
    time_affinity: string[] | null;
    marketed_gender: string | null;
  } | null;
}

function toCandidate(r: Row): Candidate | null {
  const f = r.fragrances;
  if (!f) return null;
  return {
    itemId: r.id,
    fragranceId: r.fragrance_id,
    house: f.house,
    name: f.name,
    concentration: r.concentration,
    bottleSizeMl: r.bottle_size_ml,
    olfactoryFamily: f.olfactory_family,
    notes: { top: strings(f.note_pyramid?.top), heart: strings(f.note_pyramid?.heart), base: strings(f.note_pyramid?.base) },
    longevity: f.longevity,
    projection: f.projection,
    seasonAffinity: strings(f.season_affinity),
    timeAffinity: strings(f.time_affinity),
    marketedGender: f.marketed_gender,
    favorite: r.favorite_flag,
    wearCount: r.wear_count,
    userNotes: r.user_notes,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });

  try {
    const authorization = req.headers.get('Authorization');
    if (!authorization) throw new HttpError(401, 'Sign in first');

    // Reads run as the caller, so row-level security limits them to the caller's own collection.
    const asUser = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userError } = await asUser.auth.getUser();
    if (userError || !userData.user) throw new HttpError(401, 'Sign in first');
    const userId = userData.user.id;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      throw new HttpError(400, 'Expected a JSON body');
    }

    const anthropic = new Anthropic({ apiKey: env('ANTHROPIC_API_KEY'), timeout: 45_000, maxRetries: 1 });

    const result = await recommend(body, {
      async listCollection() {
        const { data, error } = await asUser
          .from('collection_items')
          .select(
            'id, fragrance_id, bottle_size_ml, concentration, favorite_flag, wear_count, user_notes, ' +
              'fragrances(house, name, olfactory_family, note_pyramid, longevity, projection, season_affinity, time_affinity, marketed_gender)',
          )
          .order('created_at', { ascending: true });
        if (error) throw new HttpError(500, `Could not read the collection: ${error.message}`);
        return ((data ?? []) as unknown as Row[]).map(toCandidate).filter((c): c is Candidate => c !== null);
      },

      async askModel(system, user, schema) {
        let message;
        try {
          message = await anthropic.beta.messages.create(modelRequest(system, user, schema));
        } catch (err) {
          if (err instanceof Anthropic.APIError) {
            console.error('recommend: Claude API error', err.status, err.message);
            throw new HttpError(502, 'The butler could not be reached');
          }
          throw err;
        }
        if (message.stop_reason === 'refusal' || message.stop_reason === 'max_tokens') {
          console.error('recommend: unusable stop reason', message.stop_reason);
          throw new HttpError(502, 'The butler could not choose');
        }
        const text = message.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
        try {
          return JSON.parse(text);
        } catch {
          throw new HttpError(502, 'The butler’s answer was not valid JSON');
        }
      },

      async saveRequest(row) {
        // The service role writes the log: users can read their requests but not create or edit them.
        const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
          auth: { persistSession: false },
        });
        const { data, error } = await admin
          .from('recommendation_requests')
          .insert({
            user_id: userId,
            occasion_text: row.occasion,
            time_of_day: row.timeOfDay,
            excluded_item_ids: row.excludeItemIds,
            results: row.picks.map((p) => ({ item_id: p.itemId, fragrance_id: p.fragranceId, rationale: p.rationale })),
            model: row.model,
          })
          .select('id')
          .single();
        if (error || !data) throw new HttpError(500, `Could not log the request: ${error?.message}`);
        return data.id as string;
      },
    });

    return json(200, result);
  } catch (err) {
    if (err instanceof HttpError) {
      if (err.status >= 500) console.error('recommend:', err.message);
      return json(err.status, { error: err.message });
    }
    console.error('recommend: unexpected error', err);
    return json(500, { error: 'Something went wrong' });
  }
});
