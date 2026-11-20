#!/usr/bin/env node
// grow — plant the genome in a folder: seed.json, genome/ hooks and the birth-check workflow. Never overwrites.
//   node bin/grow.mjs <dir> --name <slug> --purpose "<what it does>" --lane <slug> --accepts "<...>" --refuses "<...>"
//        --in "<...>" --out "<...>" --judge-what "<...>" --escalate <who> --repo <owner/name> --by "<who made it>" [--kind repo]
// Then write genome/cell.mjs (judge, inLane, health) and the cases and samples in seed.json, and run the birth check.
import { resolve } from 'node:path';
import { buildSeed, plant } from '../src/grow.mjs';
import { check } from '../src/run.mjs';

const args = process.argv.slice(2);
const dir = args[0] && !args[0].startsWith('--') ? args.shift() : null;
if (!dir) { console.error('usage: grow <dir> --name <slug> --purpose "..." ... (see the top of bin/grow.mjs)'); process.exit(2); }
const o = { born: new Date().toISOString().slice(0, 10) };
for (let i = 0; i < args.length; i += 2) o[args[i].replace(/^--/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = args[i + 1];
try {
  const r = plant(resolve(dir), buildSeed(o));
  console.log('planted: ' + r.written.join(', ') + (r.kept.length ? '\nkept (already there): ' + r.kept.join(', ') : ''));
} catch (e) { console.error('grow: ' + e.message); process.exit(1); }
const c = check(resolve(dir));
console.log(c.line);
for (const t of c.result.traits) if (!t.pass) console.log(`  to write (${t.trait}): ${t.reasons.join('; ')}`);
