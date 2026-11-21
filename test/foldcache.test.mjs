// The census fold-cache: a verdict is reused only on the same HEAD, the same checker, and under seven days old.
import test from 'node:test';
import assert from 'node:assert/strict';
import F, { MAX_AGE_DAYS, reuse, remember, keepOnly, tally, measure } from '../src/foldcache.mjs';

const T = Date.parse('2026-11-21T05:00:00.000Z');
const DAY = 86400000;
const entry = (more = {}) => ({ oid: 'abc123', checker: 'k1', verdict: 'cell', line: 'ADMITTED', reasons: [], checkedAt: new Date(T - DAY).toISOString(), ...more });
const now = (more = {}) => ({ oid: 'abc123', checker: 'k1', at: T, ...more });

test('same HEAD, same checker, under seven days old: the verdict is reused, cell or part', () => {
  assert.deepEqual(reuse(entry(), now()), { hit: true, why: 'same HEAD, same checker, under 7 days old' });
  assert.equal(reuse(entry({ verdict: 'part' }), now()).hit, true);
  assert.equal(reuse(entry({ checkedAt: new Date(T).toISOString() }), now()).hit, true);                   // checked this very moment
  assert.equal(reuse(entry({ checkedAt: new Date(T - 7 * DAY + 1).toISOString() }), now()).hit, true);     // a millisecond under
  assert.deepEqual([MAX_AGE_DAYS, typeof F.reuse], [7, 'function']);
});

test('anything else is checked again, and says why', () => {
  const why = (e, n = now()) => reuse(e, n).why;
  assert.equal(why(undefined), 'not checked before');
  assert.equal(why(entry({ verdict: null })), 'not checked before');
  assert.equal(why(entry({ verdict: 'maybe' })), 'not checked before');
  assert.equal(why(entry(), now({ oid: '' })), 'no HEAD commit to compare');
  assert.equal(why(entry(), now({ oid: 'def456' })), 'its HEAD moved');
  assert.equal(why(entry(), now({ checker: 'k2' })), 'the checker changed');
  assert.equal(why(entry({ checker: '' }), now({ checker: '' })), 'the checker changed');
  assert.equal(why(entry({ checkedAt: new Date(T - 7 * DAY).toISOString() })), 'the verdict is 7 or more days old');
  assert.equal(why(entry({ checkedAt: new Date(T + 60000).toISOString() })), 'the verdict is 7 or more days old');   // from the future: not trusted
  assert.equal(why(entry({ checkedAt: 'yesterday' })), 'the verdict is 7 or more days old');
  assert.equal(why(entry(), now({ at: 'now' })), 'the verdict is 7 or more days old');
  for (const g of [null, 5, 'x', [], Object.assign([], entry()), Object.assign(() => {}, entry())]) assert.equal(reuse(g, now()).hit, false);
  for (const g of [null, 5, 'x', [], Object.assign([], now())]) assert.equal(reuse(entry(), g).hit, false);
});

test('remember keeps the newest full verdict, and nothing that is not one', () => {
  const c1 = remember({ entries: { old: entry() } }, ' docdecdemo ', entry({ oid: 'x', reasons: ['verify: bad', 5], extra: 1 }));
  assert.deepEqual(c1, { entries: { old: entry(), docdecdemo: { oid: 'x', checker: 'k1', verdict: 'cell', line: 'ADMITTED', reasons: ['verify: bad'], checkedAt: entry().checkedAt } } });
  assert.deepEqual(remember(c1, 'docdecdemo', entry({ verdict: 'part', oid: 'y' })).entries.docdecdemo.verdict, 'part');
  assert.deepEqual(remember({ entries: {} }, 'a', entry({ verdict: null })), { entries: {} });
  assert.deepEqual(remember({ entries: {} }, '', entry()), { entries: {} });
  assert.deepEqual(remember({ entries: {} }, 'a', entry({ reasons: 'x' })).entries.a.reasons, []);
  for (const g of [null, 'x', [], { entries: null }, { entries: ['q'] }, { entries: 'xy' }]) assert.deepEqual(remember(g, 'a', entry()), { entries: { a: remember({}, 'a', entry()).entries.a } });
  const before = { entries: { a: entry() } };
  remember(before, 'b', entry());
  assert.deepEqual(Object.keys(before.entries), ['a']);   // the cache passed in is never changed
});

test('keepOnly drops repositories that no longer declare a genome', () => {
  const c = { entries: { b: entry(), a: entry({ oid: 'q' }), gone: entry() } };
  assert.deepEqual(keepOnly(c, ['a', ' b ', 'new']), { entries: { a: entry({ oid: 'q' }), b: entry() } });
  assert.deepEqual(Object.keys(keepOnly(c, ['b', 'a']).entries), ['a', 'b']);
  assert.deepEqual(keepOnly(c, 'a'), { entries: {} });
  for (const g of [null, [], { entries: ['x'] }, { entries: 'ab' }]) assert.deepEqual(keepOnly(g, ['0', 'a']), { entries: {} });
});

test('tally counts hits, misses and the reasons', () => {
  const t = tally([{ hit: true, why: 'same' }, { hit: false, why: 'its HEAD moved' }, { hit: false, why: 'its HEAD moved' }, { hit: 'yes' }, null, { hit: true, why: 'same' }]);
  assert.deepEqual(t, { checked: 4, hits: 2, misses: 2, hitRate: 50, why: { same: 2, 'its HEAD moved': 2 } });
  assert.deepEqual(tally([{ hit: true, why: 'a' }, { hit: true, why: 'a' }, { hit: false, why: 'b' }]).hitRate, 66.7);
  assert.deepEqual(tally([]), { checked: 0, hits: 0, misses: 0, hitRate: null, why: {} });
  assert.deepEqual(tally('x'), tally([]));
  assert.deepEqual(tally([{ hit: false, why: 'constructor' }]).why, { constructor: 1 });
});

// two published census views: cold reuses nothing; warm reuses what did not move
const chk = (name, oid, reused, line = 'ADMITTED: a cell') => ({ name, oid, reused, line });
const cold = () => ({ checks: [chk('a', 'o1', false), chk('b', 'o2', false), chk('c', 'o3', false), { name: 'x', error: 'clone failed' }], took: { listingMs: 100, checkingMs: 900, totalMs: 1000 } });
const warm = () => ({ checks: [chk('a', 'o1', true), chk('b', 'o2', true), chk('c', 'o9', false), chk('new', 'n1', false)], took: { listingMs: 100, checkingMs: 300, totalMs: 400 } });
const byId = (rs) => Object.fromEntries(rs.map((r) => [r.id, r]));

test('measure: unmoved repositories reused, moved ones checked again, verdicts identical, warm under half the cold time', () => {
  const r = byId(measure(cold(), warm()));
  assert.deepEqual(r.reuse, { id: 'reuse', unmoved: 2, reusedUnmoved: 2, moved: 1, reusedMoved: 0, pass: true });
  assert.deepEqual(r['same-verdicts'], { id: 'same-verdicts', reused: 2, identical: 2, pass: true });
  assert.deepEqual(r['wall-time'], { id: 'wall-time', coldMs: 1000, warmMs: 400, ratio: 0.4, coldListingMs: 100, warmListingMs: 100, coldCheckingMs: 900, warmCheckingMs: 300,
    declaring: 4, warmHits: 2, hitRate: 50, coldReused: 0, pass: true });
});

test('measure: each rule fails on the run that breaks it', () => {
  const missed = warm(); missed.checks[1].reused = false;
  assert.deepEqual(byId(measure(cold(), missed)).reuse.pass, false);
  const stale = warm(); stale.checks[2].reused = true;
  assert.deepEqual([byId(measure(cold(), stale)).reuse.reusedMoved, byId(measure(cold(), stale)).reuse.pass], [1, false]);
  const blank = { checks: [chk('a', '', false)] }, blankWarm = { checks: [chk('a', '', true)] };
  assert.deepEqual(byId(measure(blank, blankWarm)).reuse, { id: 'reuse', unmoved: 0, reusedUnmoved: 0, moved: 1, reusedMoved: 1, pass: false });
  assert.equal(byId(measure(cold(), { checks: [chk('c', 'o9', false)] })).reuse.pass, false);   // nothing unmoved: the rule was not tested
  const changed = warm(); changed.checks[0].line = 'NOT ADMITTED: a part';
  assert.deepEqual(byId(measure(cold(), changed))['same-verdicts'], { id: 'same-verdicts', reused: 2, identical: 1, pass: false });
  const stranger = warm(); stranger.checks[3].reused = true;
  assert.deepEqual(byId(measure(cold(), stranger))['same-verdicts'].identical, 2);
  assert.equal(byId(measure(cold(), { checks: [chk('a', 'o1', false)] }))['same-verdicts'].pass, false);
  const slow = warm(); slow.took.totalMs = 501;
  assert.deepEqual([byId(measure(cold(), slow))['wall-time'].ratio, byId(measure(cold(), slow))['wall-time'].pass], [0.5, false]);
  const half = warm(); half.took.totalMs = 500;
  assert.equal(byId(measure(cold(), half))['wall-time'].pass, true);
  const notCold = cold(); notCold.checks[0].reused = true;
  assert.deepEqual([byId(measure(notCold, warm()))['wall-time'].coldReused, byId(measure(notCold, warm()))['wall-time'].pass], [1, false]);
  const noWarm = warm(); delete noWarm.took.totalMs;
  assert.deepEqual([byId(measure(cold(), noWarm))['wall-time'].ratio, byId(measure(cold(), noWarm))['wall-time'].pass], [null, false]);
  const zero = cold(); zero.took = { listingMs: 0, checkingMs: 0, totalMs: 0 };
  const z = byId(measure(zero, { ...warm(), took: { totalMs: 0 } }))['wall-time'];
  assert.deepEqual([z.ratio, z.pass, z.coldListingMs, z.warmListingMs], [null, false, 0, null]);
  const neg = cold(); neg.took.totalMs = -5;
  assert.equal(byId(measure(neg, warm()))['wall-time'].coldMs, null);
});

test('measure: garbage never throws and passes nothing', () => {
  for (const g of [null, 5, 'x', [], {}, { checks: 'x' }, { checks: [null, 5, { name: '' }, { name: 'a', error: 'x' }] }]) {
    const rs = measure(g, g);
    assert.deepEqual(rs.map((r) => r.id), ['reuse', 'same-verdicts', 'wall-time']);
    assert.ok(rs.every((r) => r.pass === false));
  }
  assert.equal(byId(measure(cold(), {}))['wall-time'].hitRate, null);
});
