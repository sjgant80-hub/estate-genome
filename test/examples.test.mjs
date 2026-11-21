// The worked examples' own answers: sum-checker adds and checks honestly; drifted-act's judge and lane are the same,
// but its act claims one too many whenever the true total is over 100.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as honest from '../examples/sum-checker/genome/cell.mjs';
import * as drifted from '../examples/drifted-act/genome/cell.mjs';

const NOT_SUMS = [null, undefined, 'x', 7, [], {}, { sum: [1] }, { sum: [1, 2, 3] }, { sum: [1.5, 2] }, { sum: ['1', '2'] }, { sum: 'ab' }, { question: 'weather?' }];

for (const [name, cell] of [['sum-checker', honest], ['drifted-act', drifted]]) {
  test(`${name}: the judge checks a claimed total exactly`, async () => {
    assert.equal(await cell.judge({ sum: [2, 3], claim: 5 }), 'verified');
    assert.equal(await cell.judge({ sum: [2, 3], claim: 6 }), 'unverified');
    assert.equal(await cell.judge({ sum: [2, 3] }), 'refused');
    assert.equal(await cell.judge({ sum: [2, 3], claim: 5.5 }), 'refused');
    for (const x of NOT_SUMS) assert.equal(await cell.judge(x), 'refused', JSON.stringify(x));
  });
  test(`${name}: the lane takes two whole numbers, with or without a whole claimed total`, async () => {
    assert.equal(await cell.inLane({ sum: [40, 2] }), true);
    assert.equal(await cell.inLane({ sum: [40, 2], claim: 42 }), true);
    assert.equal(await cell.inLane({ sum: [40, 2], claim: 41 }), true);
    assert.equal(await cell.inLane({ sum: [40, 2], claim: 'x' }), false);
    assert.equal(await cell.inLane({ sum: [40, 2], claim: undefined }), false);
    for (const x of NOT_SUMS) assert.equal(await cell.inLane(x), false, JSON.stringify(x));
  });
  test(`${name}: the act refuses anything but two whole numbers, and says what it cannot measure`, async () => {
    for (const x of NOT_SUMS) assert.equal(await cell.act(x), undefined, JSON.stringify(x));
    assert.deepEqual(await cell.health(), { used: null, dependedOn: null, lastEarned: null });
  });
}

test('sum-checker: the act adds, and its judge verifies every total it makes', async () => {
  for (const [a, b] of [[0, 0], [2, 3], [70, 45], [100, 0], [100, 1], [99, 2], [-5, 3]]) {
    const out = await honest.act({ sum: [a, b] });
    assert.deepEqual(out, { sum: [a, b], claim: a + b });
    assert.equal(await honest.judge(out), 'verified');
  }
  assert.deepEqual(await honest.act({ sum: [2, 3], claim: 9 }), { sum: [2, 3], claim: 5 });
});

test('drifted-act: right up to 100, one too many above it, and its own judge catches every wrong one', async () => {
  for (const [a, b] of [[0, 0], [2, 3], [60, 40], [100, 0], [-5, 3]]) {
    const out = await drifted.act({ sum: [a, b] });
    assert.deepEqual(out, { sum: [a, b], claim: a + b });
    assert.equal(await drifted.judge(out), 'verified');
  }
  for (const [a, b] of [[100, 1], [70, 45], [99, 99]]) {
    const out = await drifted.act({ sum: [a, b] });
    assert.deepEqual(out, { sum: [a, b], claim: a + b + 1 });
    assert.equal(await drifted.judge(out), 'unverified');
  }
});
