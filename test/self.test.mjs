import test from 'node:test';
import assert from 'node:assert/strict';
import { judge, inLane, health, act } from '../genome/cell.mjs';


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

test("estate-genome's act: the birth check on a part folder, handed back as a verdict record its judge confirms", async () => {
  const LINE = 'ADMITTED: a cell (4 of 4: describe yes, verify yes, prune yes, boundary yes)';
  const out = await act({ part: 'examples/sum-checker' });
  assert.deepEqual(out, { part: 'examples/sum-checker', verdict: 'cell', line: LINE });
  assert.equal(await act({ part: 'src' }), undefined);
  assert.equal(await act(null), undefined);
  assert.equal(await judge(out), 'verified');
  // the line is checked trait by trait when it is given: a right verdict with a wrong line is not verified
  assert.equal(await judge({ ...out, line: LINE.replace('boundary yes', 'boundary no') }), 'unverified');
});
