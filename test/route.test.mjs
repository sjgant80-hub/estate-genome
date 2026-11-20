import test from 'node:test';
import assert from 'node:assert/strict';
import { MIN_SHARE, words, terms, cellsOf, route } from '../src/route.mjs';

const INDEX = { cells: [
  { name: 'docdec', verdict: 'cell', purpose: 'Answers questions only from your documents.', lane: { id: 'grounded-answers', accepts: 'a question about the documents in its index' }, escalate: 'kar' },
  { name: 'sum-checker', verdict: 'cell', purpose: 'Checks that a claimed sum is right.', lane: { id: 'sums', accepts: 'a claim that two whole numbers add up to a total' }, escalate: 'kar' },
  { name: 'bluffing-judge', verdict: 'part', purpose: 'Checks sums, but bluffs.', lane: { id: 'sums', accepts: 'a claimed sum' } },
  { name: '', verdict: 'cell', lane: { id: 'sums' } },
  null, 7,
] };

test('words and terms: lower case, de-duplicated, stopwords and short words dropped, three-letter words kept', () => {
  assert.deepEqual(words('Check THIS sum, 2+2'), ['check', 'this', 'sum', '2', '2']);
  assert.deepEqual(terms('Check this sum sum, please'), ['check', 'sum']);
  assert.deepEqual(words(5), []);
  assert.deepEqual(terms(''), []);
});

test('cellsOf: only admitted, named cells are visible to the conductor', () => {
  assert.deepEqual(cellsOf(INDEX).map((c) => c.name), ['docdec', 'sum-checker']);
  assert.deepEqual(cellsOf(INDEX)[1].about, ['claim', 'two', 'whole', 'numbers', 'add', 'total', 'checks', 'claimed', 'sum', 'right']);
  assert.deepEqual(cellsOf(null), []);
  assert.deepEqual(cellsOf({ cells: 'x' }), []);
});

test('route by lane: an exact lane id, never a part', () => {
  const r = route(INDEX, { lane: 'sums' });
  assert.deepEqual(r, { status: 'routed', cell: 'sum-checker', candidates: [{ name: 'sum-checker', score: 1 }], escalate: null, why: 'declares the lane "sums"' });
  assert.deepEqual(route(INDEX, { lane: 'weather' }), { status: 'refused', cell: null, candidates: [], escalate: 'kar', why: 'no admitted cell declares the lane "weather"' });
});

test('route by need: the best share of the request\'s words, ties broken by name', () => {
  const r = route(INDEX, { need: 'is this claimed sum of two numbers right?' });
  assert.equal(r.cell, 'sum-checker');
  assert.equal(r.why, "its lane and purpose share 100% of the request's words");
  const d = route(INDEX, { need: 'answer a question from our documents' });
  assert.equal(d.cell, 'docdec');
  assert.deepEqual(d.candidates.map((c) => c.name), ['docdec']);
  const both = route(INDEX, { need: 'question claim' });
  assert.deepEqual(both.candidates, [{ name: 'docdec', score: 0.5 }, { name: 'sum-checker', score: 0.5 }]);
  const ranked = route(INDEX, { need: 'documents question sum total two' });
  assert.deepEqual(ranked.candidates, [{ name: 'sum-checker', score: 3 / 5 }]);
  const tie = route(INDEX, { need: 'question documents sum total' });
  assert.deepEqual(tie.candidates, [{ name: 'docdec', score: 0.5 }, { name: 'sum-checker', score: 0.5 }]);
  const order = route(INDEX, { need: 'question documents index sum total' });
  assert.deepEqual(order.candidates, [{ name: 'docdec', score: 3 / 5 }]);
  const three = route({ cells: [...INDEX.cells, { name: 'aaa', verdict: 'cell', purpose: 'sum total question', lane: { id: 'x', accepts: 'documents' } }] }, { need: 'question documents sum total' });
  assert.deepEqual(three.candidates, [{ name: 'aaa', score: 1 }, { name: 'docdec', score: 0.5 }, { name: 'sum-checker', score: 0.5 }]);
});

test('ranking: a better fit beats an earlier name, and a tie goes by name, whatever the index order', () => {
  const idx = { cells: [
    { name: 'zeta', verdict: 'cell', purpose: 'audit invoices totals', lane: { id: 'z', accepts: 'invoices' } },
    { name: 'alpha', verdict: 'cell', purpose: 'audit invoices', lane: { id: 'a', accepts: 'a thing' } },
    { name: 'beta', verdict: 'cell', purpose: 'audit invoices', lane: { id: 'b', accepts: 'a thing' } },
  ] };
  assert.deepEqual(route(idx, { need: 'audit invoices totals' }).candidates.map((c) => c.name), ['zeta', 'alpha', 'beta']);
  const tie = { cells: [idx.cells[2], idx.cells[1]] };
  assert.deepEqual(route(tie, { need: 'audit invoices' }).candidates.map((c) => c.name), ['alpha', 'beta']);
});

test('a weak fit is refused, not guessed: under half the words is not enough', () => {
  assert.equal(MIN_SHARE, 0.5);
  const weak = route(INDEX, { need: 'check whether this repository is right for production' });
  assert.equal(weak.status, 'refused');
  assert.equal(route(INDEX, { need: 'documents sum total' }).cell, 'sum-checker');
  assert.equal(route(INDEX, { need: 'documents flights hotels' }).status, 'refused');
});

test('refusal names who the request escalates to', () => {
  assert.deepEqual(route(INDEX, { need: 'book me a flight to Lisbon' }), { status: 'refused', cell: null, candidates: [], escalate: 'kar', why: 'no admitted cell declares a lane that fits at least half of these words' });
  assert.equal(route(INDEX, {}, 'simon').escalate, 'simon');
  assert.equal(route(INDEX, {}, '').escalate, 'kar');
  assert.equal(route(INDEX, {}).why, 'the request names no lane and no need');
  assert.equal(route(INDEX, { lane: '  ', need: 'of the' }).why, 'the request names no lane and no need');
  assert.equal(route(null, null).status, 'refused');
});
