// Drift on every axis: the census history, and a cell that was admitted and is refused now, named by the trait it lost.
import test from 'node:test';
import assert from 'node:assert/strict';
import D, { TRAITS, QUESTIONS, failingOf, clean, rowsOf, merge, series, drift } from '../src/drift.mjs';

const row = (day, repo, verdict, failing = []) => ({ day, repo, verdict, failing });
const ADMITTED = 'ADMITTED: a cell (4 of 4: describe yes, verify yes, prune yes, boundary yes)';
const NO_VERIFY = 'NOT ADMITTED: a part (3 of 4: describe yes, verify no, prune yes, boundary yes)';
const view = (generated, cells, checks) => ({ generated, cells, checks });

test('the four traits and their questions', () => {
  assert.deepEqual(TRAITS, ['describe', 'verify', 'prune', 'boundary']);
  assert.deepEqual(Object.keys(QUESTIONS), TRAITS);
  assert.equal(QUESTIONS.describe, 'can it still be traced back and found?');
  assert.equal(QUESTIONS.boundary, 'does it still stay in its lane?');
  assert.equal(typeof D.drift, 'function');
});

test('failingOf reads the traits a verdict line marks no', () => {
  assert.deepEqual(failingOf(ADMITTED), []);
  assert.deepEqual(failingOf(NO_VERIFY), ['verify']);
  assert.deepEqual(failingOf('NOT ADMITTED: a part (1 of 4: describe no, verify no, prune yes, boundary no)'), ['describe', 'verify', 'boundary']);
  assert.deepEqual(failingOf(null), []);
});

test('clean keeps a row in its one shape, or drops it', () => {
  assert.deepEqual(clean(row('2026-11-21', ' docdecdemo ', 'part', ['boundary', 'x', 'verify'])), row('2026-11-21', 'docdecdemo', 'part', ['verify', 'boundary']));
  assert.deepEqual(clean(row('2026-11-21', 'a', 'cell', ['verify'])), row('2026-11-21', 'a', 'cell', []));
  assert.deepEqual(clean(row('2026-11-21', 'a', 'maybe', ['verify'])), row('2026-11-21', 'a', null, []));
  assert.deepEqual(clean(row('2026-11-21', 'a', 'part', 'verify')), row('2026-11-21', 'a', 'part', []));
  for (const bad of [null, 5, 'x', [], row('21 Nov', 'a', 'cell'), row('2026-11-21T05:00', 'a', 'cell'), row('2026-11-21', '', 'cell'), row('2026-11-21', 7, 'cell'), Object.assign([], row('2026-11-21', 'a', 'cell'))]) {
    assert.equal(clean(bad), null, JSON.stringify(bad));
  }
});

test('rowsOf: one row per declaring repository in a census, with its failing traits; lost names refused on describe', () => {
  const v = view('2026-11-21T05:22:05.964Z', [{ name: 'docdecdemo', verdict: 'part' }, { name: 'estate-genome', verdict: 'cell' }, { name: 'half', verdict: null }, { name: '' }],
    [{ name: 'estate-genome', line: ADMITTED }, { name: 'docdecdemo', line: NO_VERIFY }]);
  assert.deepEqual(rowsOf(v, ['old-cell', 7]), [
    row('2026-11-21', 'docdecdemo', 'part', ['verify']), row('2026-11-21', 'estate-genome', 'cell'), row('2026-11-21', 'half', null), row('2026-11-21', 'old-cell', 'part', ['describe']),
  ]);
  assert.deepEqual(rowsOf(v), rowsOf(v, []).slice(0, 3));
  assert.deepEqual(rowsOf(view('', [{ name: 'a', verdict: 'cell' }], []), ['b']), []);
  assert.deepEqual(rowsOf(view('2026-11-21T00:00:00Z', [Object.assign([], { name: 'a', verdict: 'cell' })], [])), []);
  assert.deepEqual(rowsOf(Object.assign(() => {}, view('2026-11-21T00:00:00Z', [{ name: 'a', verdict: 'cell' }], []))), []);
  assert.deepEqual(rowsOf(Object.assign([], view('2026-11-21T00:00:00Z', [{ name: 'a', verdict: 'cell' }], []))), []);
});

test('merge: a census replaces its own day; other days stay; sorted by day, then repository', () => {
  const h = { rows: [row('2026-11-21', 'b', 'cell'), row('2026-11-20', 'z', 'cell'), row('2026-11-20', 'a', 'cell'), null, 'junk'] };
  const m = merge(h, [row('2026-11-21', 'c', 'part', ['prune']), row('2026-11-21', 'a', 'cell'), row('bad', 'x', 'cell')]);
  assert.deepEqual(m, { rows: [row('2026-11-20', 'a', 'cell'), row('2026-11-20', 'z', 'cell'), row('2026-11-21', 'a', 'cell'), row('2026-11-21', 'c', 'part', ['prune'])] });
  assert.deepEqual(merge(null, [row('2026-11-19', 'q', 'cell')]), { rows: [row('2026-11-19', 'q', 'cell')] });
  assert.deepEqual(merge(h, 'x').rows.length, 3);
});

test('series: the cell count per census day, from the rows', () => {
  const h = { rows: [row('2026-11-21', 'a', 'cell'), row('2026-11-21', 'b', 'part', ['verify']), row('2026-11-20', 'a', 'cell'), row('2026-11-21', 'c', null), 'junk'] };
  assert.deepEqual(series(h), [{ day: '2026-11-20', cells: 1, declared: 1 }, { day: '2026-11-21', cells: 1, declared: 3 }]);
  assert.deepEqual(series(null), []);
});

test('drift: admitted before and refused now is drifted, named by the trait it lost and its question', () => {
  const h = { rows: [
    row('2026-11-19', 'docdecdemo', 'part', ['verify']), row('2026-11-20', 'docdecdemo', 'cell'), row('2026-11-21', 'docdecdemo', null), row('2026-11-22', 'docdecdemo', 'part', ['boundary']), row('2026-11-23', 'docdecdemo', 'part', ['verify', 'boundary']),
    row('2026-11-20', 'steady', 'cell'), row('2026-11-23', 'steady', 'cell'),
    row('2026-11-21', 'never', 'part', ['verify']), row('2026-11-23', 'never', 'part', ['verify']),
    row('2026-11-20', 'gone', 'cell'), row('2026-11-21', 'gone', 'part', ['describe']),
    row('2026-11-23', 'first', 'cell'),
    row('2026-11-22', 'fresh', 'cell'), row('2026-11-23', 'fresh', 'part', ['describe']),
  ] };
  const d = drift(h);
  assert.equal(d.latest, '2026-11-23');
  assert.equal(d.days, 5);
  assert.equal(d.watched, 6);
  assert.deepEqual(d.drifted, [
    { repo: 'docdecdemo', lastAdmitted: '2026-11-20', since: '2026-11-22', failing: ['verify', 'boundary'],
      regressed: [{ trait: 'verify', question: 'does it still check its output?' }, { trait: 'boundary', question: 'does it still stay in its lane?' }] },
    { repo: 'fresh', lastAdmitted: '2026-11-22', since: '2026-11-23', failing: ['describe'], regressed: [{ trait: 'describe', question: 'can it still be traced back and found?' }] },
  ]);
});

test('drift: nothing drifted, nothing recorded, and garbage never throws', () => {
  assert.deepEqual(drift({ rows: [row('2026-11-21', 'a', 'cell')] }), { latest: '2026-11-21', days: 1, watched: 1, drifted: [] });
  assert.deepEqual(drift({}), { latest: '', days: 0, watched: 0, drifted: [] });
  for (const g of [null, 5, 'x', [], { rows: 'x' }, { rows: [null, 5, [], {}] }]) assert.deepEqual(drift(g).drifted, []);
  // an unchecked latest day is not drift; neither is a repository missing from the latest census
  assert.deepEqual(drift({ rows: [row('2026-11-20', 'a', 'cell'), row('2026-11-21', 'a', null)] }).drifted, []);
  assert.deepEqual(drift({ rows: [row('2026-11-20', 'a', 'cell'), row('2026-11-21', 'a', 'part', ['verify']), row('2026-11-22', 'b', 'cell')] }).drifted, []);
});
