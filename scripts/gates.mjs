// gates.mjs — run the witness mutation gate on every gated file and record the result in data/gates.json.
//   node scripts/gates.mjs --witness <path to witness.mjs> [--check] [--only <file>]
// --check (CI): every gate must be CLEAN and match the committed counts, or this exits 1. Nothing is exempted:
// a file listed under "nothing to mutate" is listed with its reason, and is never counted as a pass.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

export const GATED = [
  ['src/genome.mjs', ['test/genome.test.mjs']],
  ['src/run.mjs', ['test/run.test.mjs']],
  ['src/supervise.mjs', ['test/run.test.mjs']],
  ['src/grow.mjs', ['test/grow.test.mjs']],
  ['template/genome/judge.mjs', ['test/grow.test.mjs']],
  ['template/genome/lane.mjs', ['test/grow.test.mjs']],
  ['template/genome/health.mjs', ['test/grow.test.mjs']],
  ['template/genome/tombstone.mjs', ['test/grow.test.mjs']],
  ['genome/cell.mjs', ['test/self.test.mjs']],
  ['src/census.mjs', ['test/census.test.mjs']],
  ['src/route.mjs', ['test/route.test.mjs']],
  ['src/cost.mjs', ['test/cost.test.mjs']],
  ['src/guard.mjs', ['test/guard.test.mjs']],
  ['src/guardrun.mjs', ['test/guardrun.test.mjs']],
  ['template/genome/act.mjs', ['test/grow.test.mjs']],
  ['examples/sum-checker/genome/cell.mjs', ['test/examples.test.mjs']],
  ['examples/drifted-act/genome/cell.mjs', ['test/examples.test.mjs']],
  ['src/guardstats.mjs', ['test/guardstats.test.mjs']],
  ['src/drift.mjs', ['test/drift.test.mjs']],
  ['src/foldcache.mjs', ['test/foldcache.test.mjs']],
];
export const NOTHING_TO_MUTATE = {
  'template/genome/io.mjs': 'reads seed.json and one line of stdin: no comparison or logic for the gate to flip; its behaviour is tested through every hook in test/grow.test.mjs',
  'template/genome/cell.mjs': 'the stub an author replaces: four functions that return constants',
};

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i < 0 ? null : args[i + 1]; };
const witness = opt('--witness'), only = opt('--only'), checkMode = args.includes('--check');
if (!witness || !existsSync(witness)) { console.error('usage: node scripts/gates.mjs --witness <witness.mjs> [--check] [--only <file>]'); process.exit(2); }

const committed = existsSync('data/gates.json') ? JSON.parse(readFileSync('data/gates.json', 'utf8')) : { files: {} };
const files = { ...committed.files };
let bad = 0;
for (const [file, tests] of GATED) {
  if (only && only !== file) continue;
  const r = spawnSync(process.execPath, [witness, 'mutate', file, '--cap', '100000', '--timeout', '120000', '--test', 'node', '--test', ...tests], { encoding: 'utf8', maxBuffer: 64 << 20 });
  const out = r.stdout || '';
  let j = null;
  try { j = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1)); } catch { j = null; }
  const got = j ? { total: j.total, killed: j.killed, clean: j.clean === true } : { total: 0, killed: 0, clean: false };
  const was = committed.files[file];
  const drift = checkMode && (!was || was.total !== got.total || was.killed !== got.killed);
  if (!got.clean || drift) bad++;
  console.log(`${got.clean ? 'CLEAN' : 'NOT CLEAN'} ${got.killed}/${got.total}  ${file}${drift ? '  (differs from data/gates.json)' : ''}`);
  if (j && !got.clean) for (const s of j.survived || []) console.log('  survivor: ' + JSON.stringify(s).slice(0, 200));
  files[file] = got;
}
if (!checkMode) {
  const total = Object.values(files).reduce((a, f) => a + f.total, 0), killed = Object.values(files).reduce((a, f) => a + f.killed, 0);
  writeFileSync('data/gates.json', JSON.stringify({ witness: 'v0.6', total, killed, clean: Object.values(files).every((f) => f.clean), files, nothingToMutate: NOTHING_TO_MUTATE }, null, 1) + '\n');
}
process.exit(bad ? 1 : 0);
