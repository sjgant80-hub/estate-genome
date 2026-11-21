import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { buildSeed, plant } from '../src/grow.mjs';
import { check, treeHash } from '../src/run.mjs';
import { call } from '../src/guardrun.mjs';

const OPTS = {
  name: 'sum-checker', purpose: 'Checks that a claimed sum of two numbers is right.', lane: 'sums',
  accepts: 'a claim that two numbers add up to a total', refuses: 'anything that is not a sum claim',
  in: '{ sum: [a, b], claim }', out: 'verified, unverified or refused', judgeWhat: 'a + b equals the claim',
  escalate: 'kar', repo: 'sjgant80-hub/estate-genome', by: 'Kar', born: '2026-11-20',
};
const made = [];
const dir = () => { const d = mkdtempSync(join(tmpdir(), 'genome-test-')); made.push(d); return d; };
test.after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const node = (d, ...a) => spawnSync(process.execPath, a, { cwd: d, encoding: 'utf8', input: '' });
const hookIn = (d, file, input) => spawnSync(process.execPath, [file], { cwd: d, encoding: 'utf8', input: JSON.stringify(input) + '\n' });
const REAL_CELL = `export async function judge(i) { if (!i || !Array.isArray(i.sum)) return 'refused'; return i.sum[0] + i.sum[1] === i.claim ? 'verified' : 'unverified'; }
export async function inLane(i) { return !!i && Array.isArray(i.sum); }
export async function health() { return { used: true, dependedOn: 'maybe', lastEarned: '2026-11-19' }; }
`;
function fill(d) {
  const s = JSON.parse(readFileSync(join(d, 'seed.json'), 'utf8'));
  s.judge.cases = { good: { sum: [2, 3], claim: 5 }, bad: { sum: [2, 3], claim: 6 } };
  s.boundary.inLane = { sum: [1, 1], claim: 2 };
  s.boundary.outOfLane = { question: 'what is the weather?' };
  writeFileSync(join(d, 'seed.json'), JSON.stringify(s, null, 2) + '\n');
  writeFileSync(join(d, 'genome', 'cell.mjs'), REAL_CELL);
}

test('buildSeed fills what is given and leaves the rest empty for the birth check to name', () => {
  const s = buildSeed(OPTS);
  assert.equal(s.name, 'sum-checker'); assert.equal(s.kind, 'repo'); assert.equal(s.lane.id, 'sums');
  assert.equal(s.judge.what, 'a + b equals the claim'); assert.equal(s.boundary.escalate, 'kar');
  assert.deepEqual(s.judge.cases, { good: null, bad: null });
  assert.deepEqual(s.act, { run: 'node genome/act.mjs' });
  assert.equal(buildSeed({ ...OPTS, kind: ' agent ' }).kind, 'agent');
  const g = buildSeed(null);
  assert.equal(g.name, ''); assert.equal(g.kind, 'repo'); assert.equal(g.provenance.born, '');
  assert.equal(buildSeed({ name: 7 }).name, '');
});

test('plant writes the genome and never overwrites', () => {
  const d = dir();
  const r = plant(d, buildSeed(OPTS));
  assert.deepEqual(r.written, ['genome/act.mjs', 'genome/cell.mjs', 'genome/health.mjs', 'genome/io.mjs', 'genome/judge.mjs', 'genome/lane.mjs', 'genome/tombstone.mjs', 'seed.json', '.github/workflows/genome.yml']);
  assert.deepEqual(r.kept, []);
  assert.throws(() => plant(d, buildSeed(OPTS)), /seed.json already exists/);
  rmSync(join(d, 'seed.json'));
  assert.throws(() => plant(d, buildSeed(OPTS)), /genome\/ already exists/);
  const e = dir(); mkdirSync(join(e, '.github', 'workflows'), { recursive: true }); writeFileSync(join(e, '.github', 'workflows', 'genome.yml'), 'mine');
  assert.deepEqual(plant(e, buildSeed(OPTS)).kept, ['.github/workflows/genome.yml']);
  assert.equal(readFileSync(join(e, '.github', 'workflows', 'genome.yml'), 'utf8'), 'mine');
});

test('a freshly grown part is born honest: it names what its author still has to write', () => {
  const d = dir(); plant(d, buildSeed(OPTS));
  const c = check(d);
  assert.equal(c.result.admitted, false);
  const [desc, ver, pru, bou] = c.result.traits;
  assert.deepEqual(desc.reasons, ['judge.cases.good and .bad must differ', 'boundary.inLane and .outOfLane must differ']);
  assert.deepEqual(ver.reasons, ['the judge did not verify the known-good case (said refused)', 'the judge exited 1 on the good case']);
  assert.equal(pru.pass, true);
  assert.equal(bou.reasons[0], 'the lane check did not accept its own in-lane sample');
});

test('once its author writes the judge, the lane check and the cases, it is admitted as a cell', () => {
  const d = dir(); plant(d, buildSeed(OPTS)); fill(d);
  const c = check(d);
  assert.equal(c.line, 'ADMITTED: a cell (4 of 4: describe yes, verify yes, prune yes, boundary yes)');
  const h = JSON.parse(c.runs.health.out.trim());
  assert.deepEqual(h, { used: true, passing: true, dependedOn: null, lastEarned: '2026-11-19' });
});

test('judge hook: a judge that throws or returns junk is refused, with the reason', () => {
  const d = dir(); plant(d, buildSeed(OPTS));
  writeFileSync(join(d, 'genome', 'cell.mjs'), "export async function judge(i) { if (i && i.boom) throw new Error('bang'); return i && i.junk ? 'yes' : 'verified'; }\nexport async function inLane() { throw new Error('x'); }\nexport async function health() { throw new Error('x'); }\n");
  const boom = hookIn(d, 'genome/judge.mjs', { boom: 1 });
  assert.deepEqual(JSON.parse(boom.stdout), { status: 'refused', why: 'the judge threw: bang' }); assert.equal(boom.status, 1);
  assert.deepEqual(JSON.parse(hookIn(d, 'genome/judge.mjs', { junk: 1 }).stdout), { status: 'refused', why: 'the judge returned no status' });
  const ok = hookIn(d, 'genome/judge.mjs', {});
  assert.deepEqual(JSON.parse(ok.stdout), { status: 'verified' }); assert.equal(ok.status, 0);
  assert.deepEqual(JSON.parse(node(d, 'genome/judge.mjs').stdout), { status: 'verified' });
  // a lane check that throws refuses and escalates; a health() that throws still reports, and passing stays measured (false:
  // this part's cases are still empty, so its judge cannot tell good from bad)
  assert.deepEqual(JSON.parse(hookIn(d, 'genome/lane.mjs', {}).stdout), { inLane: false, status: 'refused', escalate: 'kar' });
  assert.deepEqual(JSON.parse(node(d, 'genome/health.mjs').stdout), { used: null, passing: false, dependedOn: null, lastEarned: null });
});

test('health hook: passing is false when the judge cannot tell good from bad', () => {
  const d = dir(); plant(d, buildSeed(OPTS)); fill(d);
  writeFileSync(join(d, 'genome', 'cell.mjs'), "export async function judge() { return 'verified'; }\nexport async function inLane() { return true; }\nexport async function health() { return null; }\n");
  assert.deepEqual(JSON.parse(node(d, 'genome/health.mjs').stdout), { used: null, passing: false, dependedOn: null, lastEarned: null });
  writeFileSync(join(d, 'genome', 'cell.mjs'), "export async function judge(i) { if (i.claim === 5) return 'verified'; throw new Error('x'); }\nexport async function inLane() { return 'yes'; }\nexport async function health() { return { used: false, dependedOn: true, lastEarned: 5 }; }\n");
  assert.deepEqual(JSON.parse(node(d, 'genome/health.mjs').stdout), { used: false, passing: false, dependedOn: true, lastEarned: null });
  assert.deepEqual(JSON.parse(hookIn(d, 'genome/lane.mjs', {}).stdout), { inLane: false, status: 'refused', escalate: 'kar' });
});

test('the template tombstone round-trips byte for byte, keeps an existing TOMBSTONE.md, and refuses double moves', () => {
  for (const pre of [false, true]) {
    const d = dir(); plant(d, buildSeed(OPTS)); fill(d);
    if (pre) writeFileSync(join(d, 'TOMBSTONE.md'), 'an older note\n');
    const before = treeHash(d);
    assert.equal(node(d, 'genome/tombstone.mjs', 'apply').status, 0);
    assert.equal(JSON.parse(readFileSync(join(d, 'seed.json'), 'utf8')).state, 'tombstoned');
    assert.match(readFileSync(join(d, 'TOMBSTONE.md'), 'utf8'), /Nothing was deleted/);
    assert.notEqual(treeHash(d), before);
    assert.equal(node(d, 'genome/tombstone.mjs', 'apply').status, 1);
    assert.equal(node(d, 'genome/tombstone.mjs', 'restore').status, 0);
    assert.equal(treeHash(d), before);
    assert.equal(existsSync(join(d, '.tombstone')), false);
    assert.equal(node(d, 'genome/tombstone.mjs', 'restore').status, 1);
  }
  const d = dir(); plant(d, buildSeed(OPTS));
  assert.equal(node(d, 'genome/tombstone.mjs', 'bury').status, 2);
});

test('the tombstone works from any folder, because it finds its part from its own path', () => {
  const d = dir(); plant(d, buildSeed(OPTS)); fill(d);
  const elsewhere = dir();
  const before = treeHash(d);
  assert.equal(spawnSync(process.execPath, [join(d, 'genome', 'tombstone.mjs'), 'apply'], { cwd: elsewhere }).status, 0);
  assert.deepEqual(readdirSync(elsewhere), []);
  assert.equal(spawnSync(process.execPath, [join(d, 'genome', 'tombstone.mjs'), 'restore'], { cwd: elsewhere }).status, 0);
  assert.equal(treeHash(d), before);
});

test('act hook: the planted stub refuses; no act(), one that throws, and one that works', () => {
  const d = dir(); plant(d, buildSeed(OPTS));
  const stub = hookIn(d, 'genome/act.mjs', { sum: [1, 2] });
  assert.deepEqual(JSON.parse(stub.stdout), { status: 'refused', why: 'act() returned nothing' }); assert.equal(stub.status, 1);
  writeFileSync(join(d, 'genome', 'cell.mjs'), REAL_CELL);
  const none = hookIn(d, 'genome/act.mjs', { sum: [1, 2] });
  assert.deepEqual(JSON.parse(none.stdout), { status: 'refused', why: 'cell.mjs has no act(): this part checks work, it does not do it' }); assert.equal(none.status, 1);
  writeFileSync(join(d, 'genome', 'cell.mjs'), REAL_CELL + "export async function act(i) { if (i.boom) throw new Error('bang'); if (i.nil) return null; return { sum: i.sum, claim: i.sum[0] + i.sum[1] }; }\n");
  const boom = hookIn(d, 'genome/act.mjs', { boom: 1 });
  assert.deepEqual(JSON.parse(boom.stdout), { status: 'refused', why: 'act() threw: bang' }); assert.equal(boom.status, 1);
  const nil = hookIn(d, 'genome/act.mjs', { nil: 1 });
  assert.deepEqual(JSON.parse(nil.stdout), { output: null }); assert.equal(nil.status, 0);
  const ok = hookIn(d, 'genome/act.mjs', { sum: [1, 2] });
  assert.deepEqual(JSON.parse(ok.stdout), { output: { sum: [1, 2], claim: 3 } }); assert.equal(ok.status, 0);
});

test('a grown part through the guard: it takes nothing until its lane check is written, and does no work until its act is', () => {
  const d = dir(); plant(d, buildSeed(OPTS));
  const fresh = call(d, { sum: [1, 1] });
  assert.deepEqual([Object.keys(fresh.runs), fresh.decision.stage, fresh.decision.released], [['lane'], 'lane', false]);
  fill(d);
  const noAct = call(d, { sum: [1, 1] });
  assert.deepEqual([Object.keys(noAct.runs), noAct.decision.reason], [['lane', 'act'], 'the act refused: cell.mjs has no act(): this part checks work, it does not do it']);
});
