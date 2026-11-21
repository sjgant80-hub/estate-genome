// guardrun.mjs — the guard's hands: one call to a cell, through its own hooks, in the order src/guard.mjs plans, under
// the same bounded, tree-killing supervisor the birth check uses. The lane check runs first; the act runs only when
// the lane took the input; the judge runs on the act's output. src/guard.mjs decides what is released.
import { readFileSync, existsSync, statSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { parseSeed } from './genome.mjs';
import { hook } from './run.mjs';
import { plan, decide } from './guard.mjs';

const ms = (t) => Math.round((performance.now() - t) * 10) / 10;

// call(dir, input, opts) → { cell, seed, runs, decision, ms }: every hook's run, how long each took, and the decision
export function call(dir, input, opts = {}) {
  const timeoutMs = Number.isInteger(opts.timeoutMs) ? opts.timeoutMs : 60000;
  const path = join(dir, 'seed.json');
  const found = existsSync(path) && statSync(path).isFile();
  const parsed = found ? parseSeed(readFileSync(path, 'utf8')) : { ok: false, why: 'no seed.json' };
  const seed = parsed.ok ? parsed.seed : {};
  const runs = {}, took = {}, start = performance.now();
  for (let p = plan(seed, runs, input); p !== null; p = plan(seed, runs, input)) {
    const t = performance.now();
    runs[p.step] = hook(p.run, dir, p.input, timeoutMs);
    took[p.step] = ms(t);
  }
  const decision = parsed.ok ? decide(seed, runs, input)
    : { status: 'refused', released: false, stage: 'lane', reason: `not a cell: ${parsed.why}`, escalate: '' };
  took.total = ms(start);
  return { cell: typeof seed.name === 'string' ? seed.name : '', seed, runs, decision, ms: took };
}

// answer(c) → what the caller is handed: the output when released, otherwise the reason and who it escalates to
export function answer(c) {
  const d = c.decision;
  return d.released ? { status: d.status, cell: c.cell, output: d.output }
    : { status: d.status, cell: c.cell, withheld: true, stage: d.stage, reason: d.reason, escalate: d.escalate };
}

// logLine(c, input, when) → the call log's record of one call: what came in, what the guard decided, what it held back
export function logLine(c, input, when) {
  const d = c.decision;
  const hooks = Object.fromEntries(Object.entries(c.runs).map(([k, r]) => [k, r.code]));
  return { at: when, cell: c.cell, input, status: d.status, released: d.released, stage: d.stage, reason: d.reason,
    escalate: d.escalate, ...(d.released ? { output: d.output } : 'withheld' in d ? { withheld: d.withheld } : {}), hooks, ms: c.ms };
}

// parseArgs(argv) → { dir, input, log, timeoutMs } or { error }
export function parseArgs(argv) {
  const a = Array.isArray(argv) ? argv.map(String) : [];
  const o = { dir: null, input: undefined, log: null, timeoutMs: 60000 };
  let raw = null;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--input') raw = a[++i] ?? '';
    else if (a[i] === '--log') o.log = a[++i] ?? '';
    else if (a[i] === '--timeout') o.timeoutMs = Number(a[++i]);
    else if (a[i].startsWith('--')) return { error: `unknown option ${a[i]}` };
    else o.dir = a[i];
  }
  if (o.dir === null || raw === null) return { error: 'a cell folder and --input are both needed' };
  if (o.log === '' || !Number.isInteger(o.timeoutMs) || o.timeoutMs <= 0) return { error: '--log needs a file and --timeout a whole number of milliseconds' };
  try { o.input = JSON.parse(raw); } catch { return { error: '--input must be JSON' }; }
  return o;
}

// appendLog(file, line) → one JSON line added to the call log
export function appendLog(file, line) {
  appendFileSync(file, JSON.stringify(line) + '\n');
}

export default { call, answer, logLine, parseArgs, appendLog };
