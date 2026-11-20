// traces.mjs — regenerate the real runs the page traces: birth checks of the worked examples and of DocDec (from a
// fresh clone), and three routings through the conductor. Each birth trace carries the part's seed.json, so the page
// re-judges the recorded hook outputs with the inlined kernel and shows it reaches the same verdict.
//   GH_TOKEN=$(gh auth token) node scripts/traces.mjs
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { check } from '../src/run.mjs';

mkdirSync('data/traces', { recursive: true });
const birth = (dir, part, file) => {
  const c = check(dir);
  const seed = JSON.parse(readFileSync(join(dir, 'seed.json'), 'utf8'));
  writeFileSync(`data/traces/${file}`, JSON.stringify({ checked: new Date().toISOString(), part, seed, line: c.line, result: c.result, runs: c.runs }, null, 1) + '\n');
  console.log(`${part}: ${c.line}`);
};
birth('examples/sum-checker', 'examples/sum-checker', 'birth-sum-checker.json');
birth('examples/bluffing-judge', 'examples/bluffing-judge', 'birth-bluffing-judge.json');
const tmp = mkdtempSync(join(tmpdir(), 'genome-route-'));
try {
  const dir = join(tmp, 'docdecdemo');
  const c = spawnSync('gh', ['repo', 'clone', 'sjgant80-hub/docdecdemo', dir, '--', '--depth', '1', '--quiet'], { encoding: 'utf8', timeout: 300000 });
  if (c.status !== 0) throw new Error('clone failed: ' + c.stderr);
  birth(dir, 'sjgant80-hub/docdecdemo (fresh clone)', 'birth-docdec.json');
} finally { if (resolve(tmp).startsWith(resolve(tmpdir()) + sep + 'genome-route-')) rmSync(tmp, { recursive: true, force: true }); }

const routes = [
  ['route-in.json', ['--need', 'answer a question from our documents about the Normans', '--input', '{"question":"Who used the church to unify themselves?"}']],
  ['route-out.json', ['--need', 'answer a question from our documents', '--input', '{"question":"What is the best pizza topping?"}']],
  ['route-none.json', ['--need', 'book me a flight to Lisbon']],
];
for (const [file, args] of routes) {
  const r = spawnSync(process.execPath, ['bin/route.mjs', ...args], { encoding: 'utf8', timeout: 600000 });
  const out = JSON.parse(r.stdout);
  writeFileSync(`data/traces/${file}`, JSON.stringify({ checked: new Date().toISOString(), request: args, ...out }, null, 1) + '\n');
  console.log(`${file}: ${out.status} ${out.cell || out.escalate}`);
}
