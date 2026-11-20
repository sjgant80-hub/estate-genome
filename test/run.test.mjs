import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, readdirSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import R, { files, treeHash, copyTree, hook, collect, check } from '../src/run.mjs';

// One hooks file for every test part; mode.json says how this part behaves (honest, or which way it bluffs).
const HOOKS = `import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
const mode = JSON.parse(readFileSync(new URL('./mode.json', import.meta.url), 'utf8'));
const cmd = process.argv[2];
let input = null; try { input = JSON.parse(readFileSync(0, 'utf8')); } catch {}
const say = (o) => console.log(JSON.stringify(o));
if (cmd === 'judge') { console.log('judging'); say({ status: mode.bluffJudge || (input && input.ok === true) ? 'verified' : 'unverified' }); }
if (cmd === 'lane') say(mode.bluffLane || (input && input.topic === 'docs') ? { inLane: true } : { inLane: false, status: 'refused', escalate: 'kar' });
if (cmd === 'health') { if (!mode.noHealth) say({ used: null, passing: true, dependedOn: null, lastEarned: null }); }
if (cmd === 'hang') { writeFileSync('hang.pid', String(process.pid)); setTimeout(() => {}, 1e9); }
if (cmd === 'apply') writeFileSync('TOMBSTONE.md', 'tombstoned\\n');
if (cmd === 'restore' && !mode.stickyTomb && existsSync('TOMBSTONE.md')) rmSync('TOMBSTONE.md');
`;
const SEED = {
  genome: '1', name: 'test-part', kind: 'tool', purpose: 'A test part that answers about its docs only.',
  lane: { id: 'docs', accepts: 'questions about docs', refuses: 'everything else' },
  interface: { in: 'a JSON case', out: 'a JSON status' },
  judge: { what: 'ok:true is right', run: 'node hooks.mjs judge', cases: { good: { ok: true }, bad: { ok: false } } },
  boundary: { run: 'node hooks.mjs lane', inLane: { topic: 'docs' }, outOfLane: { topic: 'pizza' }, escalate: 'kar' },
  health: { run: 'node hooks.mjs health' },
  tombstone: { apply: 'node hooks.mjs apply', restore: 'node hooks.mjs restore' },
  provenance: { repo: 'sjgant80-hub/estate-genome', by: 'Kar', born: '2026-11-20' },
};
const made = [];
function part(mode = {}, seed = SEED) {
  const d = mkdtempSync(join(tmpdir(), 'genome-test-'));
  made.push(d);
  writeFileSync(join(d, 'hooks.mjs'), HOOKS);
  writeFileSync(join(d, 'mode.json'), JSON.stringify(mode));
  if (seed) writeFileSync(join(d, 'seed.json'), JSON.stringify(seed, null, 1));
  return d;
}
test.after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });

test('an honest part is admitted as a cell', () => {
  const c = check(part());
  assert.equal(c.seedFound, true);
  assert.equal(c.line, 'ADMITTED: a cell (4 of 4: describe yes, verify yes, prune yes, boundary yes)');
  assert.equal(c.result.admitted, true);
  assert.equal(c.runs.judge.good.code, 0);
});

test('a judge that verifies everything is caught', () => {
  const c = check(part({ bluffJudge: true }));
  assert.equal(c.result.admitted, false);
  assert.deepEqual(c.result.traits[1].reasons, ['the judge called the known-bad case verified']);
});

test('a lane check that accepts everything is caught', () => {
  const c = check(part({ bluffLane: true }));
  assert.equal(c.result.admitted, false);
  assert.deepEqual(c.result.traits[3].reasons, ['the lane check did not mark the out-of-lane sample out of lane',
    'the lane check did not refuse the out-of-lane sample', 'the lane check did not escalate to "kar"']);
});

test('a tombstone that does not restore is caught, and the real part is never touched', () => {
  const d = part({ stickyTomb: true });
  const before = treeHash(d);
  const c = check(d);
  assert.deepEqual(c.result.traits[2].reasons, ['tombstone restore did not bring back the identical part']);
  assert.equal(treeHash(d), before);
  assert.deepEqual(readdirSync(d).sort(), ['hooks.mjs', 'mode.json', 'seed.json']);
});

test('a part with no health signal is caught', () => {
  assert.deepEqual(check(part({ noHealth: true })).result.traits[2].reasons, ['the health hook printed no JSON']);
});

test('no seed.json, or a broken one, is a part with the reason first', () => {
  const c = check(part({}, null));
  assert.equal(c.seedFound, false);
  assert.equal(c.result.admitted, false);
  assert.equal(c.result.traits[0].reasons[0], 'no seed.json');
  assert.deepEqual(c.runs, {});
  const d = part({}, null); writeFileSync(join(d, 'seed.json'), '{nope');
  assert.equal(check(d).result.traits[0].reasons[0], 'seed.json is not valid JSON');
  const e = part({}, null); mkdirSync(join(e, 'seed.json'));
  assert.equal(check(e).seedFound, false);
});

test('a seed with no hooks runs nothing and fails every runtime trait', () => {
  const s = { ...SEED, judge: { ...SEED.judge, run: '' }, boundary: { ...SEED.boundary, run: ' ' }, health: {}, tombstone: { apply: 'x', restore: '' } };
  const r = collect(part({}, s), s, 5000);
  assert.deepEqual(r, { judge: {}, boundary: {}, health: undefined, tombstone: {} });
});

test('hooks: input on stdin, timeout is 124, a missing command is non-zero', () => {
  const d = part();
  assert.deepEqual(hook('node hooks.mjs judge', d, { ok: true }, 20000), { code: 0, out: 'judging\n{"status":"verified"}\n' });
  const t = hook('node hooks.mjs hang', d, undefined, 1500);
  assert.equal(t.code, 124);
  assert.ok(t.out.endsWith('(timed out)'));
  // the hook's whole tree is gone, not just the shell (the Windows orphan this repo's tests first found)
  const pid = Number(readFileSync(join(d, 'hang.pid'), 'utf8'));
  assert.throws(() => process.kill(pid, 0));
  assert.notEqual(hook('definitely-not-a-command-xyz', d, undefined, 20000).code, 0);
  assert.equal(hook('node -e "process.exit(3)"', d, undefined, 20000).code, 3);
});

test('no input means an empty stdin, not the word undefined', () => {
  const d = part();
  assert.deepEqual(hook('node -e "process.stdin.pipe(process.stdout)"', d, undefined, 20000), { code: 0, out: '' });
  assert.deepEqual(hook('node -e "process.stdin.pipe(process.stdout)"', d, 'x', 20000), { code: 0, out: '"x"\n' });
});

test('the supervisor refuses a bad bound or an empty command', () => {
  const sup = new URL('../src/supervise.mjs', import.meta.url);
  for (const args of [['0', 'node -v'], ['x', 'node -v'], ['1000'], ['1000', '   ']]) {
    const r = spawnSync(process.execPath, [fileURLToPath(sup), ...args], { encoding: 'utf8' });
    assert.equal(r.status, 2, args.join(' '));
  }
  const ok = spawnSync(process.execPath, [fileURLToPath(sup), '20000', 'node -e "process.exit(5)"'], { encoding: 'utf8' });
  assert.equal(ok.status, 5);
});

test('check honours a timeout option and defaults to a minute', () => {
  const s = { ...SEED, health: { run: 'node hooks.mjs hang' } };
  const c = check(part({}, s), { timeoutMs: 1500 });
  assert.deepEqual(c.result.traits[2].reasons, ['the health hook printed no JSON']);
  assert.equal(c.runs.health.code, 124);
});

test('files and treeHash skip .git, node_modules and .witness, and see every byte', () => {
  const d = part();
  for (const s of R.SKIP) { mkdirSync(join(d, s)); writeFileSync(join(d, s, 'x'), 'x'); }
  mkdirSync(join(d, 'sub')); writeFileSync(join(d, 'sub', 'a.txt'), 'a');
  assert.deepEqual(files(d), ['hooks.mjs', 'mode.json', 'seed.json', 'sub/a.txt']);
  const h = treeHash(d);
  writeFileSync(join(d, 'sub', 'a.txt'), 'b');
  assert.notEqual(treeHash(d), h);
  writeFileSync(join(d, 'sub', 'a.txt'), 'a');
  assert.equal(treeHash(d), h);
  const e = mkdtempSync(join(tmpdir(), 'genome-test-')); made.push(e);
  copyTree(d, e);
  assert.equal(treeHash(e), h);
});

test('the scratch copies are cleaned up', () => {
  const count = () => readdirSync(tmpdir()).filter((n) => n.startsWith('genome-tomb-')).length;
  const n = count();
  check(part());
  assert.equal(count(), n);
});
