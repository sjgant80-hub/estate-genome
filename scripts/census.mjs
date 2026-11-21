// census.mjs — count the genome across a whole estate. READ-ONLY on GitHub.
//   GH_TOKEN=$(gh auth token) node scripts/census.mjs [--owner sjgant80-hub] [--no-clone] [--public-only] [--out <dir>]
// --out: where the public view and the genome index go (default data/, this repo's published copy). The estate
// metabolism's nightly loop passes a folder outside every repository.
// 1. Lists every repository the owner holds (GraphQL, owner-only) with its seed.json at HEAD.
// 2. For each live repository that declares a genome, shallow-clones it to a scratch folder and runs the full birth
//    check on it (its own hooks, under the per-hook bound). --no-clone skips this: verdicts are then left unchecked.
//    The fold-cache conserves instead of recomputing: a repository whose HEAD commit and the checker's version are both
//    unchanged since its last full check, under seven days ago, keeps that verdict without a clone (src/foldcache.mjs).
//    The listing reads each repository's HEAD commit for this. --cache <file> or --no-cache change where it is kept.
//    --only a,b checks only the named repositories (a test, or one re-check); the others are left unchecked.
// --public-only lists public repositories only: the daily census on GitHub's runner (census.yml) runs this way, so the
// published figures are ones anyone can re-derive from the public API.
// Writes the full census (it may name private repositories) to ~/.estate-genome/census-full.json, never committed; the
// public view (counts, and public cells by name) to data/census.json; and the genome index (each admitted public cell's
// seed.json essentials, for any agent or conductor to route by) to data/genome-index.json.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir, tmpdir } from 'node:os';
import { join, resolve, sep, dirname } from 'node:path';
import { reuse, remember, keepOnly, tally as tallyCache, MAX_AGE_DAYS } from '../src/foldcache.mjs';
import { publicView, tally } from '../src/census.mjs';
import { check } from '../src/run.mjs';
import { rowsOf, merge, ABOUT as HISTORY_ABOUT } from '../src/drift.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OWNER = arg('--owner', 'sjgant80-hub');
const CLONE = !process.argv.includes('--no-clone');
const PUBLIC_ONLY = process.argv.includes('--public-only');
const OUT = arg('--out', 'data');
const STATE = join(homedir(), '.estate-genome');
// the fold-cache (src/foldcache.mjs): the public census keeps its cache beside its output; a full census keeps its own,
// which may name private repositories, outside every repository. --cache <file> picks another; --no-cache checks all.
const USE_CACHE = !process.argv.includes('--no-cache');
// the full census (it may name private repositories): never committed. --full <file> writes it elsewhere, so a quick
// listing-only run does not replace the checked one other tools read (the metabolism's nightly digest, scripts/convert.mjs)
const FULL = arg('--full', join(STATE, PUBLIC_ONLY ? 'census-public.json' : 'census-full.json'));
const ONLY = arg('--only', '') ? new Set(arg('--only', '').split(',')) : null;   // check only these (the rest are left unchecked)
const CACHE = arg('--cache', PUBLIC_ONLY ? join(OUT, 'census-cache.json') : join(STATE, 'census-cache-full.json'));
// the checker's version: a verdict made by different birth-check code is never reused
const src = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8').split('\r\n').join('\n');
const CHECKER = createHash('sha256').update(['genome.mjs', 'run.mjs', 'supervise.mjs'].map(src).join('\0')).digest('hex').slice(0, 16);
const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if (!TOKEN) { console.error('set GH_TOKEN (e.g. GH_TOKEN=$(gh auth token))'); process.exit(2); }
const started = Date.now();

const Q = `query($c:String){ repositoryOwner(login:"${OWNER}"){ repositories(first:100, after:$c, ownerAffiliations:OWNER, ${PUBLIC_ONLY ? 'privacy:PUBLIC, ' : ''}orderBy:{field:NAME, direction:ASC}){
  totalCount pageInfo{ hasNextPage endCursor }
  nodes{ name isPrivate isArchived head:object(expression:"HEAD"){ oid } seed:object(expression:"HEAD:seed.json"){ ... on Blob{ text } } } } } }`;
async function page(cursor) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const r = await fetch('https://api.github.com/graphql', { method: 'POST', signal: AbortSignal.timeout(60000),
        headers: { authorization: `bearer ${TOKEN}`, 'user-agent': 'estate-genome-census' }, body: JSON.stringify({ query: Q, variables: { c: cursor } }) });
      const j = await r.json();
      if (r.ok && j.data && j.data.repositoryOwner) return j.data.repositoryOwner.repositories;
      console.error(`graphql attempt ${attempt}: ${r.status} ${JSON.stringify(j.errors || j).slice(0, 160)}`);
    } catch (e) { console.error(`graphql attempt ${attempt}: ${e.message}`); }
    await new Promise((res) => setTimeout(res, 2000 * attempt));
  }
  throw new Error('graphql failed four times');
}

const rows = [];
let cursor = null, total = null;
do {
  const p = await page(cursor);
  total = p.totalCount;
  for (const n of p.nodes) rows.push({ name: n.name, private: n.isPrivate, archived: n.isArchived, oid: n.head && typeof n.head.oid === 'string' ? n.head.oid : '', seedText: n.seed && typeof n.seed.text === 'string' ? n.seed.text : null, verdict: null });
  cursor = p.pageInfo.hasNextPage ? p.pageInfo.endCursor : null;
  process.stderr.write(`\rlisted ${rows.length}/${total}`);
} while (cursor);
process.stderr.write('\n');
if (rows.length !== total) { console.error(`incomplete listing: ${rows.length} of ${total}; refusing to publish a partial census`); process.exit(1); }

const listed = Date.now();
const checks = [], decisions = [];
let cache = USE_CACHE && existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : { entries: {} };
const declaring = rows.filter((x) => !x.archived && x.seedText !== null);
if (CLONE) {
  for (const r of declaring.filter((x) => ONLY === null || ONLY.has(x.name))) {
    // conserve: the same HEAD, the same checker and a verdict under seven days old is reused, not proved again
    const was = cache.entries ? cache.entries[r.name] : undefined;
    const d = USE_CACHE ? reuse(was, { oid: r.oid, checker: CHECKER, at: Date.now() }) : { hit: false, why: 'the cache is off' };
    decisions.push(d);
    if (d.hit) {
      r.verdict = was.verdict;
      checks.push({ name: r.name, private: r.private, line: was.line, reasons: was.reasons, oid: r.oid, reused: true, checkedAt: was.checkedAt });
      console.log(`${r.private ? '[private] ' : ''}${r.name}: ${was.line} (reused: ${d.why})`);
      continue;
    }
    const tmp = mkdtempSync(join(tmpdir(), 'genome-census-'));
    try {
      const dir = join(tmp, 'repo');
      const c = spawnSync('gh', ['repo', 'clone', `${OWNER}/${r.name}`, dir, '--', '--depth', '1', '--quiet'], { encoding: 'utf8', timeout: 300000 });
      if (c.status !== 0) { checks.push({ name: r.name, private: r.private, error: 'clone failed: ' + String(c.stderr).trim().slice(0, 160) }); continue; }
      const k = check(dir, { timeoutMs: 120000 });
      r.verdict = k.result.cell;
      const reasons = k.result.traits.filter((t) => !t.pass).map((t) => `${t.trait}: ${t.reasons.join('; ')}`), checkedAt = new Date().toISOString();
      checks.push({ name: r.name, private: r.private, line: k.line, reasons, oid: r.oid, reused: false, checkedAt, why: d.why });
      cache = remember(cache, r.name, { oid: r.oid, checker: CHECKER, verdict: k.result.cell, line: k.line, reasons, checkedAt });
      console.log(`${r.private ? '[private] ' : ''}${r.name}: ${k.line} (checked: ${d.why})`);
    } finally {
      if (resolve(tmp).startsWith(resolve(tmpdir()) + sep + 'genome-census-')) rmSync(tmp, { recursive: true, force: true });
    }
  }
}
const done = Date.now();
if (USE_CACHE && CLONE) {
  mkdirSync(dirname(CACHE), { recursive: true });
  writeFileSync(CACHE, JSON.stringify({ about: 'The census fold-cache: each declaring repository\'s last full birth-check verdict, with the HEAD commit and checker version it was made on. Reused only when both match and it is under 7 days old (src/foldcache.mjs).',
    checker: CHECKER, maxAgeDays: MAX_AGE_DAYS, ...keepOnly(cache, declaring.map((r) => r.name)) }, null, 1) + '\n');
}

const generated = new Date().toISOString();
mkdirSync(dirname(FULL), { recursive: true });
writeFileSync(FULL, JSON.stringify({ generated, owner: OWNER, tally: tally(rows), checks, rows: rows.map(({ seedText, ...r }) => ({ ...r, declared: seedText !== null })) }, null, 1) + '\n');
const pub = publicView(rows, generated);
pub.owner = OWNER;
pub.cloned = CLONE;
pub.scope = PUBLIC_ONLY ? 'public repositories' : 'every repository the owner holds (private ones counted, never named)';
pub.checks = checks.filter((c) => !c.private).map(({ private: _p, ...c }) => c);
pub.cache = { on: USE_CACHE && CLONE, checker: CHECKER, maxAgeDays: MAX_AGE_DAYS, ...tallyCache(decisions) };
pub.took = { listingMs: listed - started, checkingMs: done - listed, totalMs: done - started };
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'census.json'), JSON.stringify(pub, null, 1) + '\n');
// the genome index: what a conductor routes by. Admitted public cells only; a part is not routable.
const essentials = (r) => {
  const s = JSON.parse(r.seedText);
  const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o && typeof o[k] === 'string' ? o[k] : '']));
  return { name: r.name, repo: `${OWNER}/${r.name}`, kind: s.kind, purpose: s.purpose, lane: pick(s.lane, ['id', 'accepts', 'refuses']),
    interface: pick(s.interface, ['in', 'out']), judge: pick(s.judge, ['what']),
    escalate: s.boundary && typeof s.boundary.escalate === 'string' ? s.boundary.escalate : '', verdict: r.verdict };
};
const index = { generated, owner: OWNER, about: 'Admitted cells of the estate genome: each passed its birth check on a fresh clone when this was made. Route by lane.',
  cells: rows.filter((r) => !r.private && !r.archived && r.verdict === 'cell').map(essentials) };
writeFileSync(join(OUT, 'genome-index.json'), JSON.stringify(index, null, 1) + '\n');
// the history (src/drift.mjs): one row per day per declaring public repository, so a cell that slips is caught and named.
// A live public repository the history knows that no longer ships a seed.json gets a row too, refused on describe.
const HISTORY = join(OUT, 'census-history.json');
const history = existsSync(HISTORY) ? JSON.parse(readFileSync(HISTORY, 'utf8')) : { rows: [] };
const known = new Set((Array.isArray(history.rows) ? history.rows : []).map((r) => r && r.repo));
const lost = rows.filter((r) => !r.private && !r.archived && r.seedText === null && known.has(r.name)).map((r) => r.name);
writeFileSync(HISTORY, JSON.stringify({ about: HISTORY_ABOUT, ...merge(history, rowsOf(pub, lost)) }, null, 1) + '\n');
const t = tally(rows);
console.log(`census: ${t.scanned} repositories, ${t.live} live · ${t.declared} declare a genome · ${t.admitted} admitted as cells · ${t.notAdmitted} refused · ${t.genomeLess} genome-less`);
