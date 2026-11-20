#!/usr/bin/env node
// genome-check — the birth check. Runs a part's own hooks and admits it as a cell only when all four traits hold.
//   node bin/genome-check.mjs [dir] [--json <file>] [--timeout <ms>]
// Exit 0: admitted (a cell). Exit 1: not admitted (a part). Exit 2: usage.
import { writeFileSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { check } from '../src/run.mjs';

const args = process.argv.slice(2);
let dir = '.', json = null, timeoutMs = 60000;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--json') json = args[++i];
  else if (args[i] === '--timeout') timeoutMs = Number(args[++i]);
  else if (args[i].startsWith('--')) { console.error(`genome-check: unknown option ${args[i]}`); process.exit(2); }
  else dir = args[i];
}
if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || (json !== null && !json)) {
  console.error('usage: genome-check [dir] [--json <file>] [--timeout <ms>]');
  process.exit(2);
}
const c = check(resolve(dir), { timeoutMs });
console.log(`birth check · ${c.dir}`);
for (const t of c.result.traits) {
  console.log(`  ${t.trait.padEnd(9)} ${t.pass ? 'yes' : 'NO '}${t.reasons.length ? '  ' + t.reasons.join('; ') : ''}`);
}
console.log(c.line);
// the report holds the manifest too, so every hook's input (its cases and samples) sits beside its output
let seed = null;
try { seed = JSON.parse(readFileSync(join(c.dir, 'seed.json'), 'utf8')); } catch { seed = null; }
if (json) writeFileSync(json, JSON.stringify({ checked: new Date().toISOString(), dir: c.dir, seedFound: c.seedFound, seed, line: c.line, result: c.result, runs: c.runs }, null, 1) + '\n');
process.exit(c.result.admitted ? 0 : 1);
