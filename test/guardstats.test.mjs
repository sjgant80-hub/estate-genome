// The guard measurement's arithmetic, on hand-built call records: each rule passes exactly when data/guard-rules.json says.
import test from 'node:test';
import assert from 'node:assert/strict';
import S, { median, share, summarise, MAX_RATIO, MIN_CALLS, OUT_OF_LANE } from '../src/guardstats.mjs';

const call = (truth, claim, released, guardedMs = 7, bareMs = 2) => ({ truth, claim, released, guardedMs, bareMs });
const lane = (more = {}) => ({ status: 'refused', stage: 'lane', escalate: 'kar', actRan: false, ...more });
const lanes = (n = 6) => Array.from({ length: n }, () => lane());
const timedCalls = (n, g = 6, b = 2) => Array.from({ length: n }, () => call(3, 3, true, g, b));
const byId = (rs) => Object.fromEntries(rs.map((r) => [r.id, r]));
const good = () => ({
  'sum-checker': { calls: [...timedCalls(50), call(5, 5, true, 6, 2)], lanes: lanes() },
  'drifted-act': { calls: [call(5, 5, true), call(101, 102, false), call(120, 121, false), { truth: 1 }], lanes: lanes() },
});

test('median and share', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([10, 1, 2, 3]), 2.5);
  assert.equal(median([5]), 5);
  assert.equal(median([1, NaN, 'x', null, 3, Infinity]), 2);
  assert.equal(median([]), null);
  assert.equal(median('x'), null);
  assert.equal(share(1, 3), 33.3);
  assert.equal(share(2, 2), 100);
  assert.equal(share(0, 0), null);
  assert.equal(share(1, -1), null);
});

test('every rule passes on a clean run, with its counts', () => {
  const r = byId(summarise(good()));
  assert.deepEqual(r.withhold, { id: 'withhold', wrong: 2, withheld: 2, share: 100, pass: true });
  assert.deepEqual(r.release, { id: 'release', right: 52, released: 52, share: 100, pass: true });
  assert.deepEqual(r['lane-first'], { id: 'lane-first', calls: 12, refusedAtLaneEscalatedNoAct: 12, pass: true });
  assert.deepEqual(r.overhead, { id: 'overhead', calls: 51, medianGuardedMs: 6, medianBareActMs: 2, ratio: 3, medianOverheadMs: 4, pass: true });
  assert.deepEqual([MAX_RATIO, MIN_CALLS, OUT_OF_LANE, typeof S.summarise], [3.5, 50, 12, 'function']);
});

test('withhold fails when one wrong output is released, or when no wrong output was ever made', () => {
  const c = good(); c['drifted-act'].calls[1].released = true;
  assert.deepEqual(byId(summarise(c)).withhold, { id: 'withhold', wrong: 2, withheld: 1, share: 50, pass: false });
  const none = good(); none['drifted-act'].calls = [call(5, 5, true)];
  assert.deepEqual(byId(summarise(none)).withhold, { id: 'withhold', wrong: 0, withheld: 0, share: null, pass: false });
  // a wrong output from the honest cell is not counted against the drifted one, and a NaN claim is no output
  const h = good(); h['sum-checker'].calls.push(call(5, 6, true)); h['drifted-act'].calls.push(call(5, NaN, true));
  assert.equal(byId(summarise(h)).withhold.wrong, 2);
});

test('release fails when one right output is held back, on either cell', () => {
  for (const name of ['sum-checker', 'drifted-act']) {
    const c = good(); c[name].calls[0].released = false;
    const r = byId(summarise(c)).release;
    assert.deepEqual([r.released, r.pass], [51, false], name);
  }
  assert.deepEqual(byId(summarise({ 'drifted-act': { calls: [call(101, 102, false)] } })).release, { id: 'release', right: 0, released: 0, share: null, pass: false });
});

test('lane-first: all twelve refused at the lane, escalated, with no act run; anything else fails', () => {
  for (const bad of [{ status: 'verified' }, { stage: 'act' }, { escalate: '' }, { escalate: undefined }, { escalate: 5 }, { actRan: true }, { actRan: undefined }]) {
    const c = good(); c['drifted-act'].lanes[2] = lane(bad);
    const r = byId(summarise(c))['lane-first'];
    assert.deepEqual([r.refusedAtLaneEscalatedNoAct, r.pass], [11, false], JSON.stringify(bad));
  }
  const extra = good(); extra['sum-checker'].lanes.push(lane({ status: 'unverified' }));
  assert.deepEqual(byId(summarise(extra))['lane-first'], { id: 'lane-first', calls: 13, refusedAtLaneEscalatedNoAct: 12, pass: false });
  const more = good(); more['sum-checker'].lanes.push(lane());
  assert.equal(byId(summarise(more))['lane-first'].pass, false);
  const junk = good(); junk['sum-checker'].lanes.push(5, null);
  assert.equal(byId(summarise(junk))['lane-first'].calls, 12);
});

test('overhead: at least 50 timed calls, and the median guarded call at most 3.5 times the median bare act', () => {
  const at = (n, g, b) => byId(summarise({ 'sum-checker': { calls: timedCalls(n, g, b) } })).overhead;
  assert.equal(at(50, 7, 2).pass, true);                 // exactly 3.5 times, exactly 50 calls
  assert.equal(at(49, 6, 2).pass, false);
  assert.deepEqual(at(50, 7.2, 2), { id: 'overhead', calls: 50, medianGuardedMs: 7.2, medianBareActMs: 2, ratio: 3.6, medianOverheadMs: 5.2, pass: false });
  assert.deepEqual(at(60, 0, 0), { id: 'overhead', calls: 60, medianGuardedMs: 0, medianBareActMs: 0, ratio: null, medianOverheadMs: 0, pass: false });
  assert.deepEqual(at(0, 1, 1), { id: 'overhead', calls: 0, medianGuardedMs: null, medianBareActMs: null, ratio: null, medianOverheadMs: null, pass: false });
  // a call with no bare time (the drifted cell's, or a lost one) is not a timed call
  const c = { 'sum-checker': { calls: [...timedCalls(50), call(3, 3, true, 6, null), call(3, 3, true, NaN, 2)] } };
  assert.equal(byId(summarise(c)).overhead.calls, 50);
});

test('garbage never throws and passes nothing', () => {
  for (const g of [null, undefined, 5, 'x', [], {}, { 'sum-checker': null, 'drifted-act': 5 }, { 'sum-checker': { calls: 'x', lanes: [null, 7] } }, { 'drifted-act': { calls: [null, 5, 'x', {}] } }]) {
    const rs = summarise(g);
    assert.deepEqual(rs.map((r) => r.id), ['withhold', 'release', 'lane-first', 'overhead']);
    assert.ok(rs.every((r) => r.pass === false), JSON.stringify(g));
  }
});
