#!/usr/bin/env node
// Runs evals/recommend/scenarios.json through the same prompt, schema and model request the
// `recommend` Edge Function uses, and writes a results file to score by hand (1–5 per scenario).
//
//   ANTHROPIC_API_KEY=sk-ant-... npm run evals
//   npm run evals -- --only tuxedo-opera,tuxedo-office-party
//
// Each run calls Claude once per scenario and costs real money: roughly $0.02 a scenario at
// Sonnet 5.5 prices, so about $0.50 for the full set. The cost is printed at the end.
import Anthropic from '@anthropic-ai/sdk';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SYSTEM_PROMPT,
  buildUserMessage,
  labelCandidates,
  modelRequest,
  outputSchema,
  readPicks,
} from '../supabase/functions/_shared/recommend-core.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'evals', 'recommend');
// Sonnet 5.5, US$ per million tokens.
const PRICE = { input: 2, output: 10 };

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('run-evals: set ANTHROPIC_API_KEY first.');
  process.exit(2);
}

const onlyArg = process.argv.indexOf('--only');
const only = onlyArg > -1 ? new Set(process.argv[onlyArg + 1].split(',')) : null;

const { collections, scenarios } = JSON.parse(readFileSync(join(DIR, 'scenarios.json'), 'utf8'));

const toCandidates = (bottles) =>
  bottles.map((b, i) => ({
    itemId: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
    fragranceId: `00000000-0000-4000-9000-${String(i + 1).padStart(12, '0')}`,
    house: b.house,
    name: b.name,
    concentration: b.concentration,
    bottleSizeMl: b.bottleSizeMl,
    olfactoryFamily: b.olfactoryFamily ?? null,
    notes: { top: [], heart: [], base: [], ...b.notes },
    longevity: b.longevity ?? null,
    projection: b.projection ?? null,
    seasonAffinity: b.seasonAffinity ?? [],
    timeAffinity: b.timeAffinity ?? [],
    marketedGender: b.marketedGender ?? null,
    favorite: b.favorite ?? false,
    wearCount: b.wearCount ?? 0,
    userNotes: b.userNotes ?? null,
  }));

const client = new Anthropic({ timeout: 60_000, maxRetries: 2 });
const usage = { input: 0, output: 0 };
const sections = [];

for (const s of scenarios) {
  if (only && !only.has(s.id)) continue;
  process.stdout.write(`${s.id} … `);
  const candidates = toCandidates(collections[s.collection]);
  const labelled = labelCandidates(candidates);
  const byItem = new Map(candidates.map((c) => [c.itemId, c]));
  const started = Date.now();
  let body;
  try {
    const message = await client.beta.messages.create(
      modelRequest(SYSTEM_PROMPT, buildUserMessage(s, labelled), outputSchema([...labelled.keys()])),
    );
    usage.input += message.usage.input_tokens;
    usage.output += message.usage.output_tokens;
    if (message.stop_reason === 'refusal' || message.stop_reason === 'max_tokens') {
      throw new Error(`stop reason ${message.stop_reason}`);
    }
    const text = message.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
    const picks = readPicks(JSON.parse(text), labelled);
    body = picks
      .map((p, i) => {
        const c = byItem.get(p.itemId);
        return `${i + 1}. **${c.house} · ${c.name}** (${c.concentration})  \n   ${p.rationale}`;
      })
      .join('\n');
    console.log(`ok (${((Date.now() - started) / 1000).toFixed(1)} s)`);
  } catch (err) {
    body = `**Failed:** ${err.message}`;
    console.log(`failed: ${err.message}`);
  }
  sections.push(
    [
      `## ${s.id}${s.mustPass ? ' (must pass)' : ''}`,
      `*${s.timeOfDay}* · “${s.occasion}”`,
      '',
      `Look for: ${s.lookFor}`,
      '',
      body,
      '',
      'Score (1–5): ',
      'Notes: ',
    ].join('\n'),
  );
}

const cost = (usage.input * PRICE.input + usage.output * PRICE.output) / 1e6;
const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
const header = [
  `# recommend evals, ${stamp}`,
  '',
  `Model request: see modelRequest() in supabase/functions/_shared/recommend-core.ts.`,
  `Tokens: ${usage.input} in, ${usage.output} out. Estimated cost: $${cost.toFixed(3)}.`,
  '',
  'Score each scenario 1 (wrong for the moment) to 5 (what a good butler would offer). The two',
  'tuxedo scenarios must pass: their picks should differ in register.',
  '',
].join('\n');

mkdirSync(join(DIR, 'results'), { recursive: true });
const out = join(DIR, 'results', `${stamp}.md`);
writeFileSync(out, `${header}\n${sections.join('\n\n')}\n`);
console.log(`\nWrote ${out.slice(ROOT.length + 1)}. Estimated cost: $${cost.toFixed(3)}.`);
