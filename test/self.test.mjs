import test from 'node:test';
import assert from 'node:assert/strict';
import { judge, inLane, health } from '../genome/cell.mjs';
import { check } from '../src/run.mjs';

test('the worked examples: the honest one is a cell, the bluffer is caught', () => {
  assert.equal(check('examples/sum-checker').result.cell, 'cell');
  const b = check('examples/bluffing-judge');
  assert.equal(b.result.cell, 'part');
  assert.deepEqual(b.result.traits[1].reasons, ['the judge called the known-bad case verified']);
});

test("estate-genome's judge: a claimed verdict is verified only when a re-run agrees", async () => {
  assert.equal(await judge({ part: 'examples/sum-checker', verdict: 'cell' }), 'verified');
  assert.equal(await judge({ part: 'examples/bluffing-judge', verdict: 'part' }), 'verified');
  assert.equal(await judge({ part: 'examples/bluffing-judge', verdict: 'cell' }), 'unverified');
  assert.equal(await judge({ part: 'examples/sum-checker', verdict: 'maybe' }), 'refused');
});

test("estate-genome's lane: a part folder inside this repository, nothing else", async () => {
  assert.equal(await inLane({ part: 'examples/sum-checker' }), true);
  for (const bad of [null, 'examples/sum-checker', {}, { part: 7 }, { part: '  ' }, { part: '.' }, { part: '..' },
    { part: '../estate-genome/examples/sum-checker/../../..' }, { part: 'src' }, { part: 'examples/missing' }, { part: 'seed.json' }]) {
    assert.equal(await inLane(bad), false, JSON.stringify(bad));
    assert.equal(await judge(bad && typeof bad === 'object' ? { ...bad, verdict: 'cell' } : bad), 'refused');
  }
});

test("estate-genome's health says what it cannot measure", async () => {
  assert.deepEqual(await health(), { used: null, dependedOn: null, lastEarned: null });
});
