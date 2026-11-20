// census.mjs — count the genome across a whole estate. READ-ONLY on GitHub.
//   GH_TOKEN=$(gh auth token) node scripts/census.mjs [--owner sjgant80-hub] [--no-clone] [--public-only]
// 1. Lists every repository the owner holds (GraphQL, owner-only) with its seed.json at HEAD.
// 2. For each live repository that declares a genome, shallow-clones it to a scratch folder and runs the full birth
//    check on it (its own hooks, under the per-hook bound). --no-clone skips this: verdicts are then left unchecked.
// --public-only lists public repositories only: the daily census on GitHub's runner (census.yml) runs this way, so the
// published figures are ones anyone can re-derive from the public API.
// Writes the full census (it may name private repositories) to ~/.estate-genome/census-full.json, never committed; the
// public view (counts, and public cells by name) to data/census.json; and the genome index (each admitted public cell's
// seed.json essentials, for any agent or conductor to route by) to data/genome-index.json.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { publicView, tally } from '../src/census.mjs';
import { check } from '../src/run.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OWNER = arg('--owner', 'sjgant80-hub');
const CLONE = !process.argv.includes('--no-clone');
const PUBLIC_ONLY = process.argv.includes('--public-only');
const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if (!TOKEN) { console.error('set GH_TOKEN (e.g. GH_TOKEN=$(gh auth token))'); process.exit(2); }

const Q = `query($c:String){ repositoryOwner(login:"${OWNER}"){ repositories(first:100, after:$c, ownerAffiliations:OWNER, ${PUBLIC_ONLY ? 'privacy:PUBLIC, ' : ''}orderBy:{field:NAME, direction:ASC}){
  totalCount pageInfo{ hasNextPage endCursor }
  nodes{ name isPrivate isArchived seed:object(expression:"HEAD:seed.json"){ ... on Blob{ text } } } } } }`;
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
  for (const n of p.nodes) rows.push({ name: n.name, private: n.isPrivate, archived: n.isArchived, seedText: n.seed && typeof n.seed.text === 'string' ? n.seed.text : null, verdict: null });
  cursor = p.pageInfo.hasNextPage ? p.pageInfo.endCursor : null;
  process.stderr.write(`\rlisted ${rows.length}/${total}`);
} while (cursor);
process.stderr.write('\n');
if (rows.length !== total) { console.error(`incomplete listing: ${rows.length} of ${total}; refusing to publish a partial census`); process.exit(1); }

const checks = [];
if (CLONE) {
  for (const r of rows.filter((x) => !x.archived && x.seedText !== null)) {
    const tmp = mkdtempSync(join(tmpdir(), 'genome-census-'));
    try {
      const dir = join(tmp, 'repo');
      const c = spawnSync('gh', ['repo', 'clone', `${OWNER}/${r.name}`, dir, '--', '--depth', '1', '--quiet'], { encoding: 'utf8', timeout: 300000 });
      if (c.status !== 0) { checks.push({ name: r.name, private: r.private, error: 'clone failed: ' + String(c.stderr).trim().slice(0, 160) }); continue; }
      const k = check(dir, { timeoutMs: 120000 });
      r.verdict = k.result.cell;
      checks.push({ name: r.name, private: r.private, line: k.line, reasons: k.result.traits.filter((t) => !t.pass).map((t) => `${t.trait}: ${t.reasons.join('; ')}`) });
      console.log(`${r.private ? '[private] ' : ''}${r.name}: ${k.line}`);
    } finally {
      if (resolve(tmp).startsWith(resolve(tmpdir()) + sep + 'genome-census-')) rmSync(tmp, { recursive: true, force: true });
    }
  }
}

const generated = new Date().toISOString();
const STATE = join(homedir(), '.estate-genome');
mkdirSync(STATE, { recursive: true });
writeFileSync(join(STATE, PUBLIC_ONLY ? 'census-public.json' : 'census-full.json'), JSON.stringify({ generated, owner: OWNER, tally: tally(rows), checks, rows: rows.map(({ seedText, ...r }) => ({ ...r, declared: seedText !== null })) }, null, 1) + '\n');
const pub = publicView(rows, generated);
pub.owner = OWNER;
pub.cloned = CLONE;
pub.scope = PUBLIC_ONLY ? 'public repositories' : 'every repository the owner holds (private ones counted, never named)';
pub.checks = checks.filter((c) => !c.private).map(({ private: _p, ...c }) => c);
mkdirSync('data', { recursive: true });
writeFileSync('data/census.json', JSON.stringify(pub, null, 1) + '\n');
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
writeFileSync('data/genome-index.json', JSON.stringify(index, null, 1) + '\n');
const t = tally(rows);
console.log(`census: ${t.scanned} repositories, ${t.live} live · ${t.declared} declare a genome · ${t.admitted} admitted as cells · ${t.notAdmitted} refused · ${t.genomeLess} genome-less`);
