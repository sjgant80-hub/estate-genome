import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tally, publicView } from '../src/census.mjs';

const good = readFileSync(new URL('../examples/sum-checker/seed.json', import.meta.url), 'utf8');
const rows = [
  { name: 'b-cell', private: false, archived: false, seedText: good, verdict: 'cell' },
  { name: 'a-part', private: false, archived: false, seedText: good, verdict: 'part' },
  { name: 'secret-cell', private: true, archived: false, seedText: good, verdict: 'cell' },
  { name: 'half', private: false, archived: false, seedText: '{"genome":"1"}', verdict: null },
  { name: 'bare', private: false, archived: false, seedText: null, verdict: null },
  { name: 'old', private: false, archived: true, seedText: good, verdict: 'cell' },
  { name: 'junk', private: false, archived: false, seedText: 'not json', verdict: 'maybe' },
];

test('tally counts live repositories only, by how far each has got', () => {
  assert.deepEqual(tally(rows), { scanned: 7, archived: 1, live: 6, declared: 5, describes: 3, admitted: 2, notAdmitted: 1, unchecked: 2, genomeLess: 1 });
});

test('the public view names public repositories only and counts the private ones', () => {
  const v = publicView(rows, '2026-11-20');
  assert.equal(v.generated, '2026-11-20');
  assert.equal(v.privateDeclared, 1);
  assert.deepEqual(v.cells, [
    { name: 'a-part', lane: 'sums', describes: true, verdict: 'part' },
    { name: 'b-cell', lane: 'sums', describes: true, verdict: 'cell' },
    { name: 'half', lane: '', describes: false, verdict: null },
    { name: 'junk', lane: '', describes: false, verdict: null },
  ]);
  assert.equal(JSON.stringify(v).includes('secret-cell'), false);
  assert.equal(v.admitted, 2);
});

test('garbage never throws and counts nothing', () => {
  const zero = { scanned: 0, archived: 0, live: 0, declared: 0, describes: 0, admitted: 0, notAdmitted: 0, unchecked: 0, genomeLess: 0 };
  assert.deepEqual(tally(null), zero);
  assert.deepEqual(publicView('x', 5), { generated: '', ...zero, cells: [], privateDeclared: 0 });
  const t = tally([null, 7, 'x', [], Object.defineProperty({}, 'name', { get() { throw new Error('x'); } })]);
  assert.equal(t.scanned, 5); assert.equal(t.live, 5); assert.equal(t.genomeLess, 5);
  assert.deepEqual(publicView([{ name: 5, private: 'yes', archived: 'no', seedText: good, verdict: 'cell' }]).cells, [{ name: '', lane: 'sums', describes: true, verdict: 'cell' }]);
});
