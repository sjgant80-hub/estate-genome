// The guard's kernel: the order of the hooks (lane, then act, then judge, stopping at the first no) and what is released.
import test from 'node:test';
import assert from 'node:assert/strict';
import G, { command, uncarried, plan, decide } from '../src/guard.mjs';

const seed = () => ({
  name: 'sum-checker',
  act: { run: 'node genome/act.mjs', carries: ['sum'] },
  judge: { run: 'node genome/judge.mjs' },
  boundary: { run: 'node genome/lane.mjs', escalate: 'kar' },
});
const j = (o) => JSON.stringify(o);
const IN = { sum: [70, 45] };
const took = { code: 0, out: j({ inLane: true }) };
const refusedLane = { code: 0, out: j({ inLane: false, status: 'refused', escalate: 'kar' }) };
const made = (v) => ({ code: 0, out: 'adding\n' + j({ output: v }) });
const said = (status, code = status === 'verified' ? 0 : 1) => ({ code, out: j({ status }) });
const right = { sum: [70, 45], claim: 115 }, wrong = { sum: [70, 45], claim: 116 };

// drive(seed, input, answers) → the steps the plan asked for, in order, and the decision: answers[step] is each hook's run
function drive(s, input, answers) {
  const runs = {}, steps = [];
  for (let n = 0; n < 5; n++) {
    const p = plan(s, runs, input);
    if (p === null) break;
    steps.push(p.step);
    runs[p.step] = answers[p.step];
  }
  return { steps, decision: decide(s, runs, input), runs };
}

test('command reads each step from seed.json, and nothing for anything else', () => {
  const s = seed();
  assert.equal(command(s, 'lane'), 'node genome/lane.mjs');
  assert.equal(command(s, 'act'), 'node genome/act.mjs');
  assert.equal(command(s, 'judge'), 'node genome/judge.mjs');
  assert.equal(command(s, 'health'), '');
  assert.equal(command({ act: { run: '  ' } }, 'act'), '');
  assert.equal(command(null, 'lane'), '');
});

test('a right output: lane, then act, then the judge on the act output; released', () => {
  const r = drive(seed(), IN, { lane: took, act: made(right), judge: said('verified') });
  assert.deepEqual(r.steps, ['lane', 'act', 'judge']);
  assert.deepEqual(r.decision, { status: 'verified', released: true, stage: 'judge', reason: 'its judge verified the output', escalate: '', output: right });
});

test('the plan hands each hook its own input: the call input to lane and act, the act output to the judge', () => {
  const s = seed();
  assert.deepEqual(plan(s, {}, IN), { step: 'lane', run: 'node genome/lane.mjs', input: IN });
  assert.deepEqual(plan(s, { lane: took }, IN), { step: 'act', run: 'node genome/act.mjs', input: IN });
  assert.deepEqual(plan(s, { lane: took, act: made(right) }, IN), { step: 'judge', run: 'node genome/judge.mjs', input: right });
  assert.equal(plan(s, { lane: took, act: made(right), judge: said('verified') }, IN), null);
});

test('a wrong output: the judge says unverified, and it is withheld with the reason', () => {
  const r = drive(seed(), IN, { lane: took, act: made(wrong), judge: said('unverified') });
  assert.deepEqual(r.steps, ['lane', 'act', 'judge']);
  assert.deepEqual(r.decision, { status: 'unverified', released: false, stage: 'judge', reason: 'its judge said unverified, so the output is withheld', escalate: 'kar', withheld: wrong });
  const q = drive(seed(), IN, { lane: took, act: made(wrong), judge: said('refused') }).decision;
  assert.equal(q.status, 'refused'); assert.equal(q.reason, 'its judge said refused, so the output is withheld'); assert.equal(q.released, false);
});

test('out of lane: refused and escalated, and the act never runs', () => {
  const r = drive(seed(), { question: 'weather?' }, { lane: refusedLane, act: made(right), judge: said('verified') });
  assert.deepEqual(r.steps, ['lane']);
  assert.deepEqual(r.decision, { status: 'refused', released: false, stage: 'lane', reason: 'out of lane: its lane check refused the input, so the act never ran', escalate: 'kar' });
  // the party the lane check names wins; with none named, the seed's
  const other = drive(seed(), {}, { lane: { code: 0, out: j({ inLane: false, status: 'refused', escalate: 'legal-team' }) } });
  assert.equal(other.decision.escalate, 'legal-team');
  const none = drive(seed(), {}, { lane: { code: 0, out: j({ inLane: false }) } });
  assert.deepEqual([none.steps, none.decision.escalate, none.decision.stage], [['lane'], 'kar', 'lane']);
  // inLane true but refused is still a refusal; a lane that printed nothing took nothing
  assert.deepEqual(drive(seed(), IN, { lane: { code: 0, out: j({ inLane: true, status: 'refused' }) } }).steps, ['lane']);
  assert.equal(drive(seed(), IN, { lane: { code: 0, out: 'hello' } }).decision.stage, 'lane');
});

test('an act that refuses, crashes or makes nothing: refused, and the judge never runs', () => {
  const s = seed();
  const why = drive(s, IN, { lane: took, act: { code: 1, out: j({ status: 'refused', why: 'act() threw: bang' }) }, judge: said('verified') });
  assert.deepEqual(why.steps, ['lane', 'act']);
  assert.deepEqual(why.decision, { status: 'refused', released: false, stage: 'act', reason: 'the act refused: act() threw: bang', escalate: 'kar' });
  assert.equal(drive(s, IN, { lane: took, act: { code: 1, out: '' } }).decision.reason, 'the act made no output');
  // an output printed with a failing exit is not an output; a clean exit with no output is not one either
  const crashed = drive(s, IN, { lane: took, act: { code: 3, out: j({ output: right }) }, judge: said('verified') });
  assert.deepEqual([crashed.steps, crashed.decision.reason], [['lane', 'act'], 'the act made no output']);
  const empty = drive(s, IN, { lane: took, act: { code: 0, out: j({ done: true }) }, judge: said('verified') });
  assert.deepEqual([empty.steps, empty.decision.released], [['lane', 'act'], false]);
  // with no carries declared, a refused act still stops the call before the judge
  const loose = { ...s, act: { run: 'node genome/act.mjs' } };
  assert.deepEqual(drive(loose, IN, { lane: took, act: { code: 1, out: '' }, judge: said('verified') }).steps, ['lane', 'act']);
  // an output of null is still an output
  assert.deepEqual(drive(loose, IN, { lane: took, act: made(null), judge: said('verified') }).decision.output, null);
});

test('an output that answers a different question is withheld before the judge sees it', () => {
  const r = drive(seed(), IN, { lane: took, act: made({ sum: [1, 1], claim: 2 }), judge: said('verified') });
  assert.deepEqual(r.steps, ['lane', 'act']);
  assert.deepEqual(r.decision, { status: 'unverified', released: false, stage: 'act', reason: 'the output does not answer the input it was given: "sum" came back changed', escalate: 'kar', withheld: { sum: [1, 1], claim: 2 } });
});

test('uncarried names the first declared field that came back changed', () => {
  const s = { act: { carries: ['a', 7, 'b'] } };
  assert.equal(uncarried(s, { a: 1, b: [2] }, { a: 1, b: [2], c: 3 }), '');
  assert.equal(uncarried(s, { a: 1, b: [2] }, { a: 1, b: [3] }), 'b');
  assert.equal(uncarried(s, { a: 1 }, { a: 2 }), 'a');
  assert.equal(uncarried(s, { a: 1 }, { a: 1, b: 2 }), 'b');
  assert.equal(uncarried({ act: { carries: 'a' } }, { a: 1 }, { a: 2 }), '');
  assert.equal(uncarried({}, { a: 1 }, { a: 2 }), '');
  assert.equal(uncarried({ act: { carries: ['a'] } }, { a: 1n }, { a: 1n }), 'a');   // not JSON: never counted as carried
});

test('a cell with no lane check, act or judge declared: refused, and nothing past the gap runs', () => {
  const s = seed();
  const noLane = drive({ ...s, boundary: { escalate: 'kar' } }, IN, { lane: took });
  assert.deepEqual([noLane.steps, noLane.decision.stage, noLane.decision.reason], [[], 'lane', 'this cell declares no lane check (seed.json boundary.run), so it can take no input']);
  const noAct = drive({ ...s, act: undefined }, IN, { lane: took, act: made(right) });
  assert.deepEqual([noAct.steps, noAct.decision.stage, noAct.decision.reason], [['lane'], 'act', 'this cell declares no act (seed.json act.run): it checks work, it does not do it']);
  const noJudge = drive({ ...s, judge: {} }, IN, { lane: took, act: made(right), judge: said('verified') });
  assert.deepEqual([noJudge.steps, noJudge.decision.released, noJudge.decision.withheld], [['lane', 'act'], false, right]);
  assert.equal(noJudge.decision.reason, 'this cell declares no judge (seed.json judge.run), so nothing can verify the output');
});

test('hooks declared but not run: refused, never released', () => {
  const s = seed();
  assert.equal(decide(s, {}, IN).reason, 'the lane check did not run');
  assert.equal(decide(s, { lane: took }, IN).reason, 'the act did not run');
  assert.deepEqual(decide(s, { lane: took, act: made(right) }, IN), { status: 'refused', released: false, stage: 'judge', reason: 'the judge did not run on the output', escalate: 'kar', withheld: right });
});

test('a judge must say verified AND exit cleanly; no status is a refusal', () => {
  const s = seed();
  const bad = decide(s, { lane: took, act: made(right), judge: said('verified', 1) }, IN);
  assert.deepEqual([bad.released, bad.status, bad.reason], [false, 'refused', 'its judge said verified but exited 1']);
  const mute = decide(s, { lane: took, act: made(right), judge: { code: 0, out: 'ok' } }, IN);
  assert.deepEqual([mute.released, mute.status, mute.reason, mute.withheld], [false, 'refused', 'its judge gave no status on the output', right]);
  const odd = decide(s, { lane: took, act: made(right), judge: { code: 0, out: j({ status: 'maybe' }) } }, IN);
  assert.deepEqual([odd.status, odd.reason], ['refused', 'its judge gave no status on the output']);
  // logs before the JSON line, and a broken line after it, are skipped
  const noisy = decide(s, { lane: { code: 0, out: 'checking\n' + j({ inLane: true }) + '\n{oops' }, act: made(right), judge: { code: 0, out: 'judging\r\n' + j({ status: 'verified' }) + '\r\n' } }, IN);
  assert.equal(noisy.released, true);
});

test('only plain objects are read: a run that is an array or a function is not a run', () => {
  const s = seed();
  const arr = Object.assign([], { code: 0, out: j({ inLane: true }) });
  const fn = Object.assign(() => {}, { code: 0, out: j({ inLane: true }) });
  assert.equal(decide(s, { lane: arr }, IN).reason, 'the lane check did not run');
  assert.equal(decide(s, { lane: fn }, IN).reason, 'the lane check did not run');
  assert.equal(plan(s, { lane: fn }, IN).step, 'lane');
  assert.equal(plan(s, Object.assign([], { lane: took }), IN).step, 'lane');
  assert.equal(command(Object.assign([], { boundary: { run: 'x' } }), 'lane'), '');
});

test('garbage never throws and is never released', () => {
  const hostile = Object.defineProperty({}, 'lane', { get() { throw new Error('x'); } });
  for (const s of [null, undefined, 7, 'x', [], {}, seed(), hostile]) {
    for (const runs of [null, undefined, 'x', [], {}, hostile, { lane: took, act: made(right), judge: 'x' }, { lane: took, act: { code: 0, out: 5 } }]) {
      assert.doesNotThrow(() => plan(s, runs, IN));
      const d = decide(s, runs, IN);
      assert.equal(d.released, false);
      assert.equal(typeof d.reason, 'string');
    }
  }
  assert.equal(typeof G.decide, 'function');
});
