// The guard's hands, on real cells: the worked examples, run through their own hooks under the supervisor.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import R, { call, answer, logLine, parseArgs, appendLog } from '../src/guardrun.mjs';

const made = [];
const scratch = () => { const d = mkdtempSync(join(tmpdir(), 'genome-test-')); made.push(d); return d; };
test.after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });

test('a right total: lane, act, judge, released', () => {
  const c = call('examples/sum-checker', { sum: [70, 45] });
  assert.equal(c.cell, 'sum-checker');
  assert.deepEqual(Object.keys(c.runs), ['lane', 'act', 'judge']);
  assert.deepEqual(c.decision, { status: 'verified', released: true, stage: 'judge', reason: 'its judge verified the output', escalate: '', output: { sum: [70, 45], claim: 115 } });
  assert.deepEqual(answer(c), { status: 'verified', cell: 'sum-checker', output: { sum: [70, 45], claim: 115 } });
  for (const k of ['lane', 'act', 'judge', 'total']) assert.equal(typeof c.ms[k], 'number', k);
  assert.ok(c.ms.total >= c.ms.lane + c.ms.act + c.ms.judge - 1);
  const line = logLine(c, { sum: [70, 45] }, '2026-11-21T00:00:00.000Z');
  assert.deepEqual({ ...line, ms: null }, { at: '2026-11-21T00:00:00.000Z', cell: 'sum-checker', input: { sum: [70, 45] }, status: 'verified', released: true, stage: 'judge',
    reason: 'its judge verified the output', escalate: '', output: { sum: [70, 45], claim: 115 }, hooks: { lane: 0, act: 0, judge: 0 }, ms: null });
});

test('the drifted act: admitted at birth, but its wrong total is withheld, and the log keeps what was held back', () => {
  const c = call('examples/drifted-act', { sum: [70, 45] });
  assert.equal(c.decision.released, false);
  assert.equal(c.decision.status, 'unverified');
  assert.deepEqual(answer(c), { status: 'unverified', cell: 'drifted-act', withheld: true, stage: 'judge', reason: 'its judge said unverified, so the output is withheld', escalate: 'kar' });
  const d = scratch(), log = join(d, 'calls.jsonl');
  appendLog(log, logLine(c, { sum: [70, 45] }, 'one'));
  appendLog(log, logLine(c, { sum: [70, 45] }, 'two'));
  const lines = readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(lines.map((l) => l.at), ['one', 'two']);
  assert.deepEqual(lines[0].withheld, { sum: [70, 45], claim: 116 });
  assert.equal('output' in lines[0], false);
  assert.deepEqual(lines[0].hooks, { lane: 0, act: 0, judge: 1 });
});

test('out of lane: only the lane check runs', () => {
  const c = call('examples/drifted-act', { question: 'What is the weather in Leeds?' }, { timeoutMs: 30000 });
  assert.deepEqual(Object.keys(c.runs), ['lane']);
  assert.equal(c.decision.stage, 'lane');
  assert.equal(c.decision.escalate, 'kar');
  const line = logLine(c, {}, 'x');
  assert.equal('withheld' in line, false); assert.equal('output' in line, false);
});

test('no seed.json, or a folder where it should be: refused, nothing runs', () => {
  const d = scratch();
  const none = call(d, { sum: [1, 2] });
  assert.deepEqual(none.runs, {});
  assert.deepEqual(none.decision, { status: 'refused', released: false, stage: 'lane', reason: 'not a cell: no seed.json', escalate: '' });
  assert.equal(none.cell, '');
  mkdirSync(join(d, 'seed.json'));
  assert.equal(call(d, {}).decision.reason, 'not a cell: no seed.json');
  const e = scratch(); writeFileSync(join(e, 'seed.json'), '{nope');
  assert.equal(call(e, {}).decision.reason, 'not a cell: seed.json is not valid JSON');
  const f = scratch(); writeFileSync(join(f, 'seed.json'), JSON.stringify({ name: 7 }));
  const g = call(f, {});
  assert.equal(g.cell, '');
  assert.equal(g.decision.reason, 'this cell declares no lane check (seed.json boundary.run), so it can take no input');
});

test('parseArgs: a folder and JSON input, an optional log and bound; anything else is a usage error', () => {
  assert.deepEqual(parseArgs(['cell', '--input', '{"sum":[1,2]}']), { dir: 'cell', input: { sum: [1, 2] }, log: null, timeoutMs: 60000 });
  assert.deepEqual(parseArgs(['--input', 'null', '--log', 'calls.jsonl', '--timeout', '5000', 'cell']), { dir: 'cell', input: null, log: 'calls.jsonl', timeoutMs: 5000 });
  const err = (a) => parseArgs(a).error;
  assert.equal(err(['cell']), 'a cell folder and --input are both needed');
  assert.equal(err(['--input', '{}']), 'a cell folder and --input are both needed');
  assert.equal(err(['cell', '--input', '{nope']), '--input must be JSON');
  assert.equal(err(['cell', '--input']), '--input must be JSON');
  assert.equal(err(['cell', '--input', '{}', '--log']), '--log needs a file and --timeout a whole number of milliseconds');
  for (const t of ['0', '-5', '1.5', 'soon']) assert.equal(err(['cell', '--input', '{}', '--timeout', t]), '--log needs a file and --timeout a whole number of milliseconds', t);
  assert.equal(err(['cell', '--input', '{}', '--fast']), 'unknown option --fast');
  assert.equal(err(null), 'a cell folder and --input are both needed');
  assert.equal(typeof R.call, 'function');
});
