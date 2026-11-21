// guard-measure.mjs — the guard, measured against the rules committed beforehand in data/guard-rules.json.
//   node scripts/guard-measure.mjs [--out data/guard-measure.json]
// The counting is src/guardstats.mjs (gated). Every call is a real call through bin/genome-run's code path (src/guardrun.mjs call): the cell's own hooks, each a
// process under the supervisor. Right and wrong are decided here, by adding the two numbers, never by asking the cell.
// The result is written whether each rule passes or fails.
import { readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { call } from '../src/guardrun.mjs';
import { hook } from '../src/run.mjs';
import { summarise } from '../src/guardstats.mjs';

const OUT = (() => { const i = process.argv.indexOf('--out'); return i > 0 ? process.argv[i + 1] : 'data/guard-measure.json'; })();
const rules = JSON.parse(readFileSync('data/guard-rules.json', 'utf8'));

// mulberry32: a small seeded generator, so anyone re-running this gets the same 60 sums
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const next = rng(20261121);
const IN_LANE = Array.from({ length: 60 }, () => ({ sum: [Math.floor(next() * 100), Math.floor(next() * 100)] }));
const OUT_OF_LANE = [{ question: 'What is the weather in Leeds?' }, null, 'add 2 and 3', { sum: [7] }, { sum: [1.5, 2] }, { sum: ['2', '3'] }];
const r1 = (x) => Math.round(x * 10) / 10;

export function observe(cells) {
  const none = Object.entries(cells).flatMap(([cell, c]) => c.calls.filter((x) => typeof x.claim !== 'number').map((x) => ({ cell, input: x.input, released: x.released, status: x.status, stage: x.stage, guardedMs: x.guardedMs })));
  return { noOutput: none, about: 'In-lane calls where the act made no output at all, so they are neither right nor wrong and no rule counts them. Each is listed with what the guard did.' };
}
if (process.argv.includes('--observe')) {   // recompute the observation on a recorded measurement, without re-running it
  const m = JSON.parse(readFileSync(OUT, 'utf8'));
  m.observed = observe(m.cells);
  writeFileSync(OUT, JSON.stringify(m, null, 1) + '\n');
  console.log(JSON.stringify(m.observed));
  process.exit(0);
}

const cells = {};
for (const dir of ['examples/sum-checker', 'examples/drifted-act']) {
  const seed = JSON.parse(readFileSync(`${dir}/seed.json`, 'utf8'));
  const timeBare = dir === 'examples/sum-checker';
  const calls = [];
  for (const input of IN_LANE) {
    let bareMs = null;
    if (timeBare) { const t = performance.now(); hook(seed.act.run, dir, input, 60000); bareMs = r1(performance.now() - t); }
    const t = performance.now();
    const c = call(dir, input);
    const guardedMs = r1(performance.now() - t);
    const d = c.decision, made = d.released ? d.output : d.withheld;
    const claim = made && typeof made === 'object' ? made.claim : undefined;
    const truth = input.sum[0] + input.sum[1];
    calls.push({ input, truth, claim, right: claim === truth, released: d.released, status: d.status, stage: d.stage, guardedMs, bareMs });
    process.stderr.write(`\r${dir}: ${calls.length}/${IN_LANE.length}`);
  }
  const lanes = OUT_OF_LANE.map((input) => {
    const c = call(dir, input);
    return { input, status: c.decision.status, stage: c.decision.stage, escalate: c.decision.escalate, actRan: 'act' in c.runs };
  });
  process.stderr.write('\n');
  cells[seed.name] = { dir, calls, lanes };
}

const results = summarise(cells);
const machine = {
  platform: `${os.type()} ${os.release()}`, cpu: os.cpus()[0] ? os.cpus()[0].model.trim() : 'unknown', threads: os.cpus().length,
  memoryGB: r1(os.totalmem() / 2 ** 30), freeGB: r1(os.freemem() / 2 ** 30), node: process.version,
  load: 'a shared laptop: eight other build agents were running on it during this measurement, so times are high and noisy',
};
// observed, not a rule: in-lane calls where the act made no output at all (neither right nor wrong), and what the guard did
const observed = observe(cells);
const out = { measured: new Date().toISOString(), rules: 'data/guard-rules.json', registered: rules.registered, machine, pass: results.every((r) => r.pass), results, observed, cells };
writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.id}: ${JSON.stringify(r)}`);
