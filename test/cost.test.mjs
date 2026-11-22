import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { defaults, costCase } from '../src/cost.mjs';

const LOCK = JSON.parse(readFileSync(new URL('../data/prices.lock.json', import.meta.url), 'utf8'));

test('defaults come from the lock: this estate\'s own scan and the ONS median', () => {
  const d = defaults(LOCK);
  assert.equal(d.parts, 500); assert.equal(d.hoursEach, 1); assert.equal(d.rate, 19.67);
  assert.equal(d.noSignalShare, 560 / 1696); assert.equal(d.deadShare, 254 / 1696);
});

test('costCase: the floor case for 500 parts', () => {
  assert.deepEqual(costCase(LOCK, {}), { parts: 500, noSignalShare: 560 / 1696, deadShare: 254 / 1696, hoursEach: 1, rate: 19.67, unknown: 165, dead: 75, hours: 165, gbp: 3245.55 });
});

test('costCase: the reader\'s own numbers win, and nonsense falls back to the floor', () => {
  const c = costCase(LOCK, { parts: 1200.4, noSignalShare: 0.5, deadShare: 0.1, hoursEach: 3, rate: 60 });
  assert.deepEqual(c, { parts: 1200, noSignalShare: 0.5, deadShare: 0.1, hoursEach: 3, rate: 60, unknown: 600, dead: 120, hours: 1800, gbp: 108000 });
  assert.equal(costCase(LOCK, { noSignalShare: 7, deadShare: 2 }).unknown, 500);
  assert.equal(costCase(LOCK, { noSignalShare: 7, deadShare: 2 }).dead, 500);
  const z = costCase(LOCK, { parts: 0, rate: 0, hoursEach: 0, noSignalShare: 0, deadShare: 0 });
  assert.deepEqual([z.parts, z.unknown, z.hours, z.gbp, z.rate], [0, 0, 0, 0, 0]);
  const g = costCase(LOCK, { parts: -5, hoursEach: NaN, rate: 'x', noSignalShare: Infinity });
  assert.deepEqual([g.parts, g.hoursEach, g.rate, g.noSignalShare], [500, 1, 19.67, 560 / 1696]);
});

test('without a lock there are no invented figures: zero shares and a zero rate', () => {
  for (const lock of [null, {}, { entries: 'x' }, { entries: [null, { id: 'ons-ashe-2025-median-hourly' }] }, { entries: [{ id: 'estate-scan-2026-11-17', scored: 0, noSignal: 5 }] }]) {
    const d = defaults(lock);
    assert.equal(d.noSignalShare, 0); assert.equal(d.deadShare, 0); assert.equal(d.rate, 0);
  }
  assert.equal(costCase(null, null).gbp, 0);
});
