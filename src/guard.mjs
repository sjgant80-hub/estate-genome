// guard.mjs — the guard: boundary on every call, verify every output. Pure and total: garbage in gives a decision with
// a reason, never a throw.
//
// A call to a cell goes through three of the cell's own hooks, in this order, and stops at the first that says no:
//   lane   · its lane check (seed.json boundary.run) runs on the input first. Out of lane: refused and escalated,
//            and the act never runs.
//   act    · its real work (seed.json act.run) runs on the input and prints its output.
//   judge  · its judge (seed.json judge.run) runs on that output. Only "verified" releases it.
// Verify or dissolve: an output the cell's own judge will not stand behind never leaves the guard. It is withheld,
// with the reason, and escalated to the party the cell names.
// The runner (src/guardrun.mjs) executes the hooks and hands their output here. This module only plans and decides.
// It carries its own small readers (the page inlines it on its own), with the same rules as genome.mjs.

// at(o, k) → o[k] if o is a plain object and reading it does not throw, else undefined
function at(o, k) {
  if (o === null || typeof o !== 'object' || Array.isArray(o)) return undefined;
  try { return o[k]; } catch { return undefined; }
}
const text = (v) => (typeof v === 'string' ? v.trim() : '');

// lastJson(out) → the last line of a hook's output that parses as a JSON object, else null (hooks may log before it)
function lastJson(out) {
  if (typeof out !== 'string') return null;
  const lines = out.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line.startsWith('{')) continue;
    try { return JSON.parse(line); } catch { /* not this line: a line that starts with { and parses is always an object */ }
  }
  return null;
}

// a hook's run as the runner records it: { code, out }
const ran = (run) => Number.isInteger(at(run, 'code'));

// command(seed, step) → the command seed.json names for a step ('lane', 'act' or 'judge'), or '' when it names none
export function command(seed, step) {
  if (step === 'lane') return text(at(at(seed, 'boundary'), 'run'));
  if (step === 'act') return text(at(at(seed, 'act'), 'run'));
  if (step === 'judge') return text(at(at(seed, 'judge'), 'run'));
  return '';
}

// laneTook(run) → the lane check took the input: it printed inLane true and did not refuse
function laneTook(run) {
  const v = lastJson(at(run, 'out'));
  return at(v, 'inLane') === true && at(v, 'status') !== 'refused';
}

// made(run) → { ok, value } when the act exited cleanly with an output, else { ok:false, why } (why may be '')
function made(run) {
  const v = lastJson(at(run, 'out'));
  if (at(run, 'code') === 0 && Object.hasOwn(v || {}, 'output')) return { ok: true, value: v.output };
  return { ok: false, why: text(at(v, 'why')) };
}

// same(a, b) → a and b are the same JSON value
function same(a, b) {
  try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
}

// uncarried(seed, input, output) → the first field named in seed.json act.carries that the output did not carry back
// unchanged from the input, or '' when it carried them all. It stops an act answering a different question than it was
// asked, which a judge that sees only the output cannot catch.
export function uncarried(seed, input, output) {
  const keys = at(at(seed, 'act'), 'carries');
  for (const k of (Array.isArray(keys) ? keys : []).filter((x) => typeof x === 'string')) {
    if (!same(at(input, k), at(output, k))) return k;
  }
  return '';
}

// plan(seed, runs, input) → the next hook to run, { step, run, input }, or null when the call is decided
export function plan(seed, runs, input) {
  const ask = (step, stdin) => (command(seed, step) === '' ? null : { step, run: command(seed, step), input: stdin });
  if (!ran(at(runs, 'lane'))) return ask('lane', input);
  if (!laneTook(runs.lane)) return null;
  if (!ran(at(runs, 'act'))) return ask('act', input);
  const o = made(runs.act);
  if (!o.ok || uncarried(seed, input, o.value) !== '') return null;
  if (!ran(at(runs, 'judge'))) return ask('judge', o.value);
  return null;
}

// decide(seed, runs, input) → { status, released, stage, reason, escalate, output | withheld }
//   released only when the lane took the input, the act made an output that carries its input back, and the judge
//   said verified and exited cleanly. Everything else is withheld with the reason, escalated to the cell's named party.
export function decide(seed, runs, input) {
  const who = text(at(at(seed, 'boundary'), 'escalate'));
  const no = (stage, status, reason, more) => ({ status, released: false, stage, reason, escalate: who, ...more });
  const lane = at(runs, 'lane'), act = at(runs, 'act'), judge = at(runs, 'judge');
  if (command(seed, 'lane') === '') return no('lane', 'refused', 'this cell declares no lane check (seed.json boundary.run), so it can take no input');
  if (!ran(lane)) return no('lane', 'refused', 'the lane check did not run');
  if (!laneTook(lane)) {
    const named = text(at(lastJson(at(lane, 'out')), 'escalate'));
    return { ...no('lane', 'refused', 'out of lane: its lane check refused the input, so the act never ran'), escalate: named === '' ? who : named };
  }
  if (command(seed, 'act') === '') return no('act', 'refused', 'this cell declares no act (seed.json act.run): it checks work, it does not do it');
  if (!ran(act)) return no('act', 'refused', 'the act did not run');
  const o = made(act);
  if (!o.ok) return no('act', 'refused', o.why === '' ? 'the act made no output' : `the act refused: ${o.why}`);
  const held = { withheld: o.value };
  const k = uncarried(seed, input, o.value);
  if (k !== '') return no('act', 'unverified', `the output does not answer the input it was given: "${k}" came back changed`, held);
  if (command(seed, 'judge') === '') return no('judge', 'refused', 'this cell declares no judge (seed.json judge.run), so nothing can verify the output', held);
  if (!ran(judge)) return no('judge', 'refused', 'the judge did not run on the output', held);
  const s = at(lastJson(at(judge, 'out')), 'status');
  if (s === 'verified') {
    if (at(judge, 'code') === 0) return { status: 'verified', released: true, stage: 'judge', reason: 'its judge verified the output', escalate: '', output: o.value };
    return no('judge', 'refused', `its judge said verified but exited ${at(judge, 'code')}`, held);
  }
  if (s === 'unverified' || s === 'refused') return no('judge', s, `its judge said ${s}, so the output is withheld`, held);
  return no('judge', 'refused', 'its judge gave no status on the output', held);
}

export default { command, uncarried, plan, decide };
