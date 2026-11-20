import test from 'node:test';
import assert from 'node:assert/strict';
import G, { at, parseSeed, lastJson, describe, verify, prune, boundary, birth, verdictLine, describeText } from '../src/genome.mjs';

const seed = () => ({
  genome: '1', name: 'docdec', kind: 'repo',
  purpose: 'Answers questions only from your documents and refuses the rest.',
  lane: { id: 'grounded-answers', accepts: 'a question about its documents', refuses: 'anything its documents do not support' },
  interface: { in: 'a question', out: 'an answer record or a refusal' },
  judge: { what: 'the answer words are at their offsets', run: 'node genome/judge.mjs', cases: { good: { a: 1 }, bad: { a: 2 } } },
  boundary: { run: 'node genome/lane.mjs', inLane: 'Who used the church?', outOfLane: 'Best pizza?', escalate: 'kar' },
  health: { run: 'node genome/health.mjs' },
  tombstone: { apply: 'node genome/tombstone.mjs apply', restore: 'node genome/tombstone.mjs restore' },
  provenance: { repo: 'sjgant80-hub/docdecdemo', by: 'Kar for Simon Gant', born: '2026-11-20' },
});
const j = (o) => JSON.stringify(o);
const runs = () => ({
  judge: { good: { code: 0, out: 'checking\n' + j({ status: 'verified' }) }, bad: { code: 1, out: j({ status: 'unverified' }) } },
  boundary: { inLane: { code: 0, out: j({ inLane: true }) }, outOfLane: { code: 0, out: j({ inLane: false, status: 'refused', escalate: 'kar' }) } },
  health: { code: 0, out: j({ used: null, passing: true, dependedOn: false, lastEarned: '2026-11-19' }) },
  tombstone: { before: 'h1', applied: 'h2', restored: 'h1', applyCode: 0, restoreCode: 0 },
});

test('at reads plain objects only, and never throws', () => {
  assert.equal(at({ a: 1 }, 'a'), 1);
  assert.equal(at(null, 'a'), undefined);
  assert.equal(at('abc', 'length'), undefined);
  assert.equal(at([1], 'length'), undefined);
  assert.equal(at(Object.defineProperty({}, 'a', { get() { throw new Error('x'); } }), 'a'), undefined);
});

test('parseSeed', () => {
  assert.deepEqual(parseSeed('{"a":1}'), { ok: true, seed: { a: 1 } });
  assert.deepEqual(parseSeed(5), { ok: false, why: 'no seed.json text' });
  assert.deepEqual(parseSeed('{'), { ok: false, why: 'seed.json is not valid JSON' });
  for (const s of ['null', '"x"', '[1]', '5']) assert.deepEqual(parseSeed(s), { ok: false, why: 'seed.json must be one JSON object' });
});

test('lastJson takes the last object line, skipping logs and broken lines', () => {
  assert.deepEqual(lastJson('{"a":1}'), { a: 1 });
  assert.deepEqual(lastJson('log\n{"a":1}\n{"a":2}\n  \n'), { a: 2 });
  assert.deepEqual(lastJson('{"a":1}\r\n{oops'), { a: 1 });
  assert.equal(lastJson('no json'), null);
  assert.equal(lastJson(7), null);
});

test('describe: a full seed passes', () => {
  assert.deepEqual(describe(seed()), { trait: 'describe', pass: true, reasons: [] });
});

test('describe: each missing field is named, one at a time', () => {
  const cases = [
    [(s) => { s.genome = '2'; }, 'genome must be "1"'],
    [(s) => { s.name = 'Doc Dec'; }, 'name must be a lower-case slug'],
    [(s) => { s.kind = 'blob'; }, 'kind must be one of repo, agent, contract, model, tool, service'],
    [(s) => { s.purpose = 'x'.repeat(19); }, 'purpose must say what it does in 20 to 400 characters'],
    [(s) => { s.purpose = 'x'.repeat(401); }, 'purpose must say what it does in 20 to 400 characters'],
    [(s) => { s.lane.id = ''; }, 'lane.id must be a lower-case slug'],
    [(s) => { s.lane.accepts = ' '; }, 'lane.accepts must say what it takes'],
    [(s) => { delete s.lane.refuses; }, 'lane.refuses must say what it turns away'],
    [(s) => { s.interface.in = ''; }, 'interface.in must say what goes in'],
    [(s) => { s.interface.out = 3; }, 'interface.out must say what comes out'],
    [(s) => { s.judge.what = ''; }, 'judge.what must say what makes an output right'],
    [(s) => { s.judge.run = ''; }, 'judge.run must be the command that runs the judge'],
    [(s) => { delete s.judge.cases.bad; }, 'judge.cases must hold a good and a bad case'],
    [(s) => { delete s.judge.cases.good; }, 'judge.cases must hold a good and a bad case'],
    [(s) => { s.judge.cases.bad = { a: 1 }; }, 'judge.cases.good and .bad must differ'],
    [(s) => { s.boundary.run = ''; }, 'boundary.run must be the command that checks the lane'],
    [(s) => { delete s.boundary.outOfLane; }, 'boundary must hold an inLane and an outOfLane sample'],
    [(s) => { delete s.boundary.inLane; }, 'boundary must hold an inLane and an outOfLane sample'],
    [(s) => { s.boundary.outOfLane = 'Who used the church?'; }, 'boundary.inLane and .outOfLane must differ'],
    [(s) => { s.boundary.escalate = ''; }, 'boundary.escalate must name who out-of-lane input goes to'],
    [(s) => { s.health = {}; }, 'health.run must be the command that reports health'],
    [(s) => { s.tombstone.restore = ''; }, 'tombstone must have an apply and a restore command'],
    [(s) => { s.tombstone.apply = ''; }, 'tombstone must have an apply and a restore command'],
    [(s) => { s.provenance.repo = 'docdecdemo'; }, 'provenance.repo must be owner/name'],
    [(s) => { s.provenance.by = ''; }, 'provenance.by must say who made it'],
    [(s) => { s.provenance.born = 'yesterday'; }, 'provenance.born must be a date (YYYY-MM-DD)'],
  ];
  for (const [break_, why] of cases) {
    const s = seed(); break_(s);
    assert.deepEqual(describe(s), { trait: 'describe', pass: false, reasons: [why] }, why);
  }
});

test('describe: purpose at exactly 20 and 400 characters passes', () => {
  for (const n of [20, 400]) { const s = seed(); s.purpose = 'x'.repeat(n); assert.equal(describe(s).pass, true); }
});

test('describe: garbage gives every reason, never a throw', () => {
  for (const g of [null, undefined, 7, 'x', [], {}]) {
    const d = describe(g);
    assert.equal(d.pass, false);
    assert.equal(d.reasons.length, 22);
  }
});

test('verify: a judge that tells good from bad passes', () => {
  assert.deepEqual(verify(seed(), runs()), { trait: 'verify', pass: true, reasons: [] });
  const r = runs(); r.judge.bad.out = j({ status: 'refused' });
  assert.equal(verify(seed(), r).pass, true);
});

test('verify: every way a judge can fail is named', () => {
  const cases = [
    [(r) => { delete r.judge.good; }, ['the judge did not run on the good case']],
    [(r) => { r.judge.good.out = 'ok'; }, ['the judge gave no status on the good case (verified, unverified or refused)']],
    [(r) => { r.judge.good.out = j({ status: 'unverified' }); }, ['the judge did not verify the known-good case (said unverified)']],
    [(r) => { r.judge.good.code = 2; }, ['the judge exited 2 on the good case']],
    [(r) => { r.judge.bad = { code: 'x' }; }, ['the judge did not run on the bad case']],
    [(r) => { r.judge.bad.out = j({ status: 'maybe' }); }, ['the judge gave no status on the bad case (verified, unverified or refused)']],
    [(r) => { r.judge.bad.out = j({ status: 'verified' }); }, ['the judge called the known-bad case verified']],
  ];
  for (const [break_, why] of cases) { const r = runs(); break_(r); assert.deepEqual(verify(seed(), r), { trait: 'verify', pass: false, reasons: why }, why[0]); }
});

test('prune: health and a reversible tombstone pass', () => {
  assert.deepEqual(prune(seed(), runs()), { trait: 'prune', pass: true, reasons: [] });
  const r = runs(); r.health.out = j({ used: true, passing: false, dependedOn: null, lastEarned: null });
  assert.equal(prune(seed(), r).pass, true);
});

test('prune: every way health or the tombstone can fail is named', () => {
  const cases = [
    [(r) => { delete r.health; }, ['the health hook did not run']],
    [(r) => { r.health.out = 'fine'; }, ['the health hook printed no JSON']],
    [(r) => { r.health.out = j({ used: 'yes', passing: true, dependedOn: false, lastEarned: null }); }, ['health.used must be true, false or null']],
    [(r) => { r.health.out = j({ used: null, passing: true, dependedOn: 1, lastEarned: null }); }, ['health.dependedOn must be true, false or null']],
    [(r) => { r.health.out = j({ used: null, passing: null, dependedOn: null, lastEarned: null }); }, ['health.passing must be measured (true or false)']],
    [(r) => { r.health.out = j({ used: null, passing: true, dependedOn: null, lastEarned: 'soon' }); }, ['health.lastEarned must be a date or null']],
    [(r) => { r.tombstone = {}; }, ['the tombstone was not tried']],
    [(r) => { r.tombstone.applyCode = 1; }, ['tombstone apply failed']],
    [(r) => { r.tombstone.restoreCode = 1; }, ['tombstone restore failed']],
    [(r) => { r.tombstone.applied = 'h1'; }, ['tombstone apply changed nothing']],
    [(r) => { r.tombstone.restored = 'h3'; }, ['tombstone restore did not bring back the identical part']],
  ];
  for (const [break_, why] of cases) { const r = runs(); break_(r); assert.deepEqual(prune(seed(), r), { trait: 'prune', pass: false, reasons: why }, why[0]); }
});

test('boundary: in-lane taken, out-of-lane refused and escalated', () => {
  assert.deepEqual(boundary(seed(), runs()), { trait: 'boundary', pass: true, reasons: [] });
});

test('boundary: every way a lane check can fail is named', () => {
  const cases = [
    [(r) => { delete r.boundary.inLane; }, ['the lane check did not run on the in-lane sample']],
    [(r) => { r.boundary.inLane.out = j({ inLane: 'yes' }); }, ['the lane check did not accept its own in-lane sample']],
    [(r) => { r.boundary.inLane.out = j({ inLane: true, status: 'refused' }); }, ['the lane check refused its own in-lane sample']],
    [(r) => { delete r.boundary.outOfLane; }, ['the lane check did not run on the out-of-lane sample']],
    [(r) => { r.boundary.outOfLane.out = j({ inLane: null, status: 'refused', escalate: 'kar' }); }, ['the lane check did not mark the out-of-lane sample out of lane']],
    [(r) => { r.boundary.outOfLane.out = j({ inLane: false, status: 'unverified', escalate: 'kar' }); }, ['the lane check did not refuse the out-of-lane sample']],
    [(r) => { r.boundary.outOfLane.out = j({ inLane: false, status: 'refused', escalate: 'nobody' }); }, ['the lane check did not escalate to "kar"']],
  ];
  for (const [break_, why] of cases) { const r = runs(); break_(r); assert.deepEqual(boundary(seed(), r), { trait: 'boundary', pass: false, reasons: why }, why[0]); }
});

test('boundary: no declared escalation can never pass, even if the hook echoes an empty one', () => {
  const s = seed(); s.boundary.escalate = '';
  const r = runs(); r.boundary.outOfLane.out = j({ inLane: false, status: 'refused', escalate: '' });
  assert.deepEqual(boundary(s, r).reasons, ['the lane check did not escalate to ""']);
});

test('birth: four green makes a cell; any red makes a part', () => {
  const ok = birth(seed(), runs());
  assert.equal(ok.admitted, true); assert.equal(ok.cell, 'cell');
  assert.deepEqual(ok.traits.map((t) => t.trait), G.TRAITS);
  assert.equal(verdictLine(ok), 'ADMITTED: a cell (4 of 4: describe yes, verify yes, prune yes, boundary yes)');
  const r = runs(); r.judge.bad.out = j({ status: 'verified' });
  const bad = birth(seed(), r);
  assert.equal(bad.admitted, false); assert.equal(bad.cell, 'part');
  assert.equal(verdictLine(bad), 'NOT ADMITTED: a part (3 of 4: describe yes, verify no, prune yes, boundary yes)');
  assert.equal(verdictLine({ admitted: 'true', traits: [{ trait: 'describe', pass: 'true' }] }), 'NOT ADMITTED: a part (0 of 4: describe no, verify no, prune no, boundary no)');
  assert.equal(verdictLine(null), 'NOT ADMITTED: a part (0 of 4: describe no, verify no, prune no, boundary no)');
});

test('describeText: the check that needs no code', () => {
  assert.deepEqual(describeText(j(seed())), { declared: true, describes: true, reasons: [], name: 'docdec', lane: 'grounded-answers' });
  assert.deepEqual(describeText('nope'), { declared: false, describes: false, reasons: ['seed.json is not valid JSON'] });
  const d = describeText('{"genome":"1"}');
  assert.equal(d.declared, true); assert.equal(d.describes, false); assert.equal(d.reasons.length, 21);
});

test('constants are what the page and the runner rely on', () => {
  assert.equal(G.GENOME, '1');
  assert.deepEqual(G.STATUSES, ['verified', 'unverified', 'refused']);
  assert.deepEqual(G.KINDS, ['repo', 'agent', 'contract', 'model', 'tool', 'service']);
});
