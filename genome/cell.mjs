// cell.mjs — estate-genome's own four answers. The birth check is itself a cell: its judge is "re-run me and see", and its act is the check itself.
import { existsSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { ROOT } from './io.mjs';
import { check } from '../src/run.mjs';

// a part named by a relative folder inside this repository (never outside it)
function partDir(input) {
  if (input === null || typeof input !== 'object' || typeof input.part !== 'string' || input.part.trim() === '') return null;
  const d = resolve(ROOT, input.part);
  if (!(d + sep).startsWith(resolve(ROOT) + sep) || d === resolve(ROOT)) return null;
  return existsSync(join(d, 'seed.json')) && statSync(d).isDirectory() ? d : null;
}

// judge: a claimed verdict ("cell" or "part") is verified when re-running the birth check on that part agrees, and,
// when the claim carries the verdict line too (act's output does), that line agrees trait by trait
export async function judge(input) {
  const d = partDir(input);
  if (d === null || !['cell', 'part'].includes(input.verdict)) return 'refused';
  const c = check(d);
  if (c.result.cell !== input.verdict) return 'unverified';
  return input.line === undefined || input.line === c.line ? 'verified' : 'unverified';
}

// act: run the birth check on a part folder in this repository, and hand back the verdict record for the judge
export async function act(input) {
  const d = partDir(input);
  if (d === null) return undefined;
  const c = check(d);
  return { part: input.part, verdict: c.result.cell, line: c.line };
}

// inLane: a folder in this repository that holds a part to check
export async function inLane(input) {
  return partDir(input) !== null;
}

// health: use is not measured from inside the repository (the census and CI runs are where use shows), so null
export async function health() {
  return { used: null, dependedOn: null, lastEarned: null };
}
