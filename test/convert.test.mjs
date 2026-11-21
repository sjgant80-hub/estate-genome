// Convert, not count: genome-less live repositories ranked for conversion, in use and proved first; measured-dead ones
// sent to retirement instead; and the public ledger of conversion attempts.
import test from 'node:test';
import assert from 'node:assert/strict';
import C, { TIERS, OUTCOMES, tierOf, rank, queue, ledger } from '../src/convert.mjs';

const plan = (name, status, used, verified, more = {}) => ({ name, status, measured: { used, passes: more.passes ?? null, verified, superseded: null }, callers: more.callers ?? 0, liveCallers: more.liveCallers ?? 0 });
const repo = (name, more = {}) => ({ name, private: false, archived: false, declared: false, ...more });

test('the tiers, in order', () => {
  assert.deepEqual(TIERS, ['in use and proved', 'in use', 'proved, not in use', 'no measured signal', 'not in the metabolism plan']);
  assert.deepEqual(OUTCOMES, ['admitted', 'escalated']);
  assert.equal(typeof C.rank, 'function');
});

test('tierOf: in use and proved first; a live caller counts as use', () => {
  assert.equal(tierOf(plan('a', 'vital', true, true)), 0);
  assert.equal(tierOf(plan('a', 'improvable', true, false)), 1);
  assert.equal(tierOf(plan('a', 'vital', false, true)), 2);
  assert.equal(tierOf(plan('a', 'no-signal', null, null)), 3);
  assert.equal(tierOf(plan('a', 'vital', false, true, { liveCallers: 1 })), 0);
  assert.equal(tierOf(plan('a', 'vital', false, null, { liveCallers: 2 })), 1);
  assert.equal(tierOf(plan('a', 'vital', false, null, { liveCallers: 0 })), 3);
  assert.equal(tierOf(plan('a', 'vital', 'yes', 'yes', { liveCallers: 1.5 })), 3);
  assert.equal(tierOf(undefined), 4);
  assert.equal(tierOf(null), 3);
});

test('rank: genome-less live repositories only, best first; measured-dead ones go to retirement', () => {
  const census = [repo('zeta'), repo('alpha'), repo('dead-one'), repo('cell', { declared: true }), repo('old', { archived: true }), repo('secret', { private: true }),
    repo('loose'), repo('unknown'), repo('beta'), repo(''), null, repo('gamma')];
  const plans = [plan('zeta', 'vital', true, true, { passes: true }), plan('alpha', 'vital', true, true, { callers: 3 }), plan('beta', 'vital', true, true, { callers: 3 }),
    plan('gamma', 'vital', true, true, { callers: 5 }), plan('dead-one', 'dead', false, false), plan('secret', 'improvable', true, false), plan('loose', 'no-signal', null, null),
    plan('cell', 'vital', true, true), plan('', 'vital', true, true), null];
  const r = rank(census, plans);
  assert.deepEqual(r.worklist.map((w) => [w.rank, w.name, w.tier]), [[1, 'zeta', 0], [2, 'gamma', 0], [3, 'alpha', 0], [4, 'beta', 0], [5, 'secret', 1], [6, 'loose', 3], [7, 'unknown', 4]]);
  assert.deepEqual(r.worklist[0], { rank: 1, name: 'zeta', private: false, tier: 0, label: 'in use and proved', passes: true, callers: 0 });
  assert.deepEqual(r.worklist[4], { rank: 5, name: 'secret', private: true, tier: 1, label: 'in use', passes: false, callers: 0 });
  assert.deepEqual(r.retire, [{ name: 'dead-one', private: false }]);
});

test('rank: ties broken by a green build, then callers, then name; the retire list sorted', () => {
  const r = rank([repo('b'), repo('a'), repo('c'), repo('d', { private: true }), repo('y'), repo('x')],
    [plan('a', 'vital', false, true), plan('b', 'vital', false, true, { passes: true }), plan('c', 'vital', false, true, { callers: 2 }), plan('d', 'vital', false, true, { callers: 2 }),
      plan('y', 'dead', false, false), plan('x', 'dead', false, false)]);
  assert.deepEqual(r.worklist.map((w) => w.name), ['b', 'c', 'd', 'a']);
  assert.deepEqual(r.retire.map((x) => x.name), ['x', 'y']);
  assert.deepEqual(rank([repo(' padded ')], [plan('padded', 'dead', false, false)]).retire, [{ name: 'padded', private: false }]);
});

test('queue: counts only, never a name', () => {
  const r = rank([repo('a'), repo('b', { private: true }), repo('c'), repo('d')], [plan('a', 'vital', true, true), plan('b', 'vital', true, true), plan('c', 'dead', false, false)]);
  const q = queue(r);
  assert.deepEqual(q, { ranked: 3, publicRanked: 2, retire: 1, byTier: { 'in use and proved': 2, 'in use': 0, 'proved, not in use': 0, 'no measured signal': 0, 'not in the metabolism plan': 1 } });
  assert.equal(JSON.stringify(q).includes('"a"'), false);
  assert.deepEqual(queue(null), { ranked: 0, publicRanked: 0, retire: 0, byTier: Object.fromEntries(TIERS.map((t) => [t, 0])) });
  assert.equal(queue({ worklist: [{ label: 'in use', private: 'no' }] }).publicRanked, 0);
});

test('ledger: public attempts only, admitted or escalated with a reason; sorted by day then repository', () => {
  const doc = { attempts: [
    { repo: 'kar-veil', private: false, outcome: 'admitted', reason: 'ignored when admitted', day: '2026-11-21', batch: 'b2' },
    { repo: 'break-it', private: false, outcome: 'escalated', reason: 'its tests need a browser', day: '2026-11-21', batch: 'b1' },
    { repo: 'alpha', private: false, outcome: 'admitted', day: '2026-11-20' },
    { repo: 'hidden', private: true, outcome: 'admitted', day: '2026-11-21' },
    { repo: 'unsaid', outcome: 'admitted', day: '2026-11-21' },
    { repo: 'vague', private: false, outcome: 'escalated', reason: '  ', day: '2026-11-21' },
    { repo: 'odd', private: false, outcome: 'maybe', day: '2026-11-21' },
    { repo: '', private: false, outcome: 'admitted' }, null, 7,
  ] };
  assert.deepEqual(ledger(doc), {
    attempts: [
      { repo: 'alpha', outcome: 'admitted', reason: '', day: '2026-11-20', batch: '' },
      { repo: 'break-it', outcome: 'escalated', reason: 'its tests need a browser', day: '2026-11-21', batch: 'b1' },
      { repo: 'kar-veil', outcome: 'admitted', reason: '', day: '2026-11-21', batch: 'b2' },
    ],
    admitted: 2, escalated: 1,
  });
  assert.deepEqual(ledger(null), { attempts: [], admitted: 0, escalated: 0 });
  assert.deepEqual(ledger({ attempts: 'x' }), { attempts: [], admitted: 0, escalated: 0 });
});

test('garbage never throws', () => {
  for (const g of [null, 5, 'x', [], {}, [null, 5, 'x', [], { name: 5 }]]) {
    assert.doesNotThrow(() => rank(g, g));
    assert.doesNotThrow(() => queue(rank(g, g)));
    assert.doesNotThrow(() => ledger(g));
  }
  assert.deepEqual(rank([Object.assign([], repo('a'))], []).worklist, []);
  assert.deepEqual(rank([Object.defineProperty(() => {}, 'name', { value: 'a' })], []).worklist, []);
  assert.equal(tierOf(plan('a', 'vital', false, null, { liveCallers: -3, callers: -2 })), 3);
  assert.equal(rank([repo('a')], [plan('a', 'vital', false, null, { callers: -2 })]).worklist[0].callers, 0);
  assert.deepEqual(rank([repo('a')], [Object.assign([], plan('a', 'dead', false, false))]).retire, []);
});
