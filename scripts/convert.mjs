// convert.mjs — from counting cells to making them. Reads the census and, when it is on this machine, the estate
// metabolism's latest plan, and ranks the live repositories that still have no genome: in use and proved first;
// the measured-dead ones go to the retirement path instead (src/convert.mjs, gated).
//   node scripts/convert.mjs [--census <file>] [--plan <file>]
// --census: a census file with every repository's row (default ~/.estate-genome/census-full.json, else census-public.json)
// --plan:   a metabolism plan (default the newest ~/.estate-metabolism/plan-*.json; none on this machine: all unmeasured)
// Writes the worklist, which may name private repositories, to ~/.estate-genome/convert-worklist.json (never committed),
// and only counts to data/convert.json's queue. The ledger of conversion attempts in data/convert.json is kept as it is:
// attempts are merged in by whoever runs the conversions, public repositories only.
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, basename } from 'node:path';
import { rank, queue, OUTCOMES } from '../src/convert.mjs';

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const STATE = join(homedir(), '.estate-genome'), MET = join(homedir(), '.estate-metabolism');
const censusFile = arg('--census') || [join(STATE, 'census-full.json'), join(STATE, 'census-public.json')].find((f) => existsSync(f));
if (!censusFile || !existsSync(censusFile)) { console.error('no census on this machine: run scripts/census.mjs first'); process.exit(2); }
const census = JSON.parse(readFileSync(censusFile, 'utf8'));
const planFile = arg('--plan') || (existsSync(MET) ? readdirSync(MET).filter((f) => /^plan-.*\.json$/.test(f)).sort().map((f) => join(MET, f)).pop() : null);
const plan = planFile && existsSync(planFile) ? JSON.parse(readFileSync(planFile, 'utf8')) : null;

const ranked = rank(census.rows, plan ? plan.rows : []);
const q = queue(ranked);
const generated = new Date().toISOString();
const sources = { census: { generated: census.generated, scope: census.rows.some((r) => r.private) ? 'every repository the owner holds' : 'public repositories' },
  plan: plan ? { file: basename(planFile), scannedAt: plan.scannedAt } : null };
mkdirSync(STATE, { recursive: true });
writeFileSync(join(STATE, 'convert-worklist.json'), JSON.stringify({ generated, ...sources,
  note: plan ? '' : 'no metabolism plan on this machine: every repository is ranked as not measured', ...q, worklist: ranked.worklist, retire: ranked.retire }, null, 1) + '\n');

const LEDGER = 'data/convert.json';
const doc = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : { attempts: [] };
const out = {
  about: 'The conversion ledger: each attempt to give a genome-less public repository its genome, and how it came out. Only public repositories are listed. The queue holds counts only; the ranked names stay on the machine that ran scripts/convert.mjs.',
  format: { repo: 'the public repository\'s name', private: 'false: an attempt without it is not published', outcome: OUTCOMES.join(' or '),
    reason: 'why it was escalated (needed for escalated, empty for admitted)', day: 'YYYY-MM-DD of the attempt', batch: 'which conversion batch made it (optional)' },
  queue: { generated, census: sources.census.generated, plan: sources.plan ? sources.plan.scannedAt : null, ...q },
  attempts: Array.isArray(doc.attempts) ? doc.attempts : [],
};
writeFileSync(LEDGER, JSON.stringify(out, null, 1) + '\n');
console.log(`convert: ${q.ranked} genome-less live repositories ranked (${q.publicRanked} public), ${q.retire} measured dead sent to retirement`);
for (const [label, n] of Object.entries(q.byTier)) console.log(`  ${String(n).padStart(5)}  ${label}`);
console.log(`worklist: ${join(STATE, 'convert-worklist.json')} (local only) · ledger: ${LEDGER} (${out.attempts.length} attempts kept)`);
