#!/usr/bin/env node
// route — the conductor: pick the admitted cell for a request by its manifest, then ask THAT cell's own lane hook
// before anything is handed over.
//   node bin/route.mjs --need "<plain words>" [--input '<json>'] [--index data/genome-index.json] [--local <dir>]
//   node bin/route.mjs --lane <lane-id>      [--input '<json>'] ...
// With --input, each candidate (best first) is shallow-cloned (or read from --local <dir>/<repo name>) and its
// genome/lane hook is run on the input: the first cell whose own lane check takes it gets the request. If none does,
// the request is refused and escalated. Without --input it reports the ranking only (what the manifests say).
import { readFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { route } from '../src/route.mjs';
import { hook } from '../src/run.mjs';
import { lastJson } from '../src/genome.mjs';

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i < 0 ? null : args[i + 1]; };
const indexPath = opt('--index') || new URL('../data/genome-index.json', import.meta.url);
const index = JSON.parse(readFileSync(indexPath, 'utf8'));
const r = route(index, { need: opt('--need') || '', lane: opt('--lane') || '' });
const raw = opt('--input');
if (r.status === 'refused' || raw === null) { console.log(JSON.stringify(r, null, 1)); process.exit(r.status === 'routed' ? 0 : 1); }

let input;
try { input = JSON.parse(raw); } catch { console.error('--input must be JSON'); process.exit(2); }
const local = opt('--local');
const tried = [];
for (const c of r.candidates) {
  const cell = index.cells.find((x) => x.name === c.name);
  let dir = local ? join(local, cell.name) : null, tmp = null;
  if (!dir || !existsSync(dir)) {
    tmp = mkdtempSync(join(tmpdir(), 'genome-route-'));
    dir = join(tmp, 'repo');
    spawnSync('gh', ['repo', 'clone', cell.repo, dir, '--', '--depth', '1', '--quiet'], { encoding: 'utf8', timeout: 300000 });
  }
  try {
    const seed = JSON.parse(readFileSync(join(dir, 'seed.json'), 'utf8'));
    const v = lastJson(hook(seed.boundary.run, dir, input, 60000).out) || {};
    tried.push({ cell: cell.name, inLane: v.inLane === true });
    if (v.inLane === true) { console.log(JSON.stringify({ ...r, cell: cell.name, confirmed: 'its own lane check took the input', tried }, null, 1)); process.exit(0); }
  } catch (e) { tried.push({ cell: cell.name, inLane: false, error: String(e.message).slice(0, 120) }); }
  finally { if (tmp && resolve(tmp).startsWith(resolve(tmpdir()) + sep + 'genome-route-')) rmSync(tmp, { recursive: true, force: true }); }
}
console.log(JSON.stringify({ status: 'refused', cell: null, candidates: r.candidates, escalate: 'kar', why: 'every candidate’s own lane check turned the input away', tried }, null, 1));
process.exit(1);
