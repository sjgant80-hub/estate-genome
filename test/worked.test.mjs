// The worked examples through the full birth check: the honest one and the drifted act are cells, the bluffer is caught.
import test from 'node:test';
import assert from 'node:assert/strict';
import { check } from '../src/run.mjs';

test('the worked examples: the honest one is a cell, the bluffer is caught', () => {
  assert.equal(check('examples/sum-checker').result.cell, 'cell');
  const b = check('examples/bluffing-judge');
  assert.equal(b.result.cell, 'part');
  assert.deepEqual(b.result.traits[1].reasons, ['the judge called the known-bad case verified']);
  // the drifted act passes its birth check: the birth check never runs the act, which is why the guard exists
  assert.equal(check('examples/drifted-act').result.cell, 'cell');
});
