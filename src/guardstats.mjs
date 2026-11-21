// guardstats.mjs — the guard measurement's arithmetic: the four pre-registered rules of data/guard-rules.json, applied
// to the recorded calls. Pure and total. scripts/guard-measure.mjs makes the calls; this only counts them.
//   a call: { truth, claim, released, guardedMs, bareMs }   (claim undefined when the act made no output)
//   a lane call: { status, stage, escalate, actRan }

export const MAX_RATIO = 3.5;   // the overhead rule: median guarded call at most 3.5 times the median bare act run
export const MIN_CALLS = 50;    // and over at least 50 calls
export const OUT_OF_LANE = 12;  // 6 out-of-lane inputs on each of the two cells

const obj = (v) => (v !== null && typeof v === 'object' ? v : {});
const list = (v) => (Array.isArray(v) ? v.filter((x) => x !== null && typeof x === 'object') : []);
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const r1 = (x) => Math.round(x * 10) / 10;

// median(xs) → the middle of the finite numbers in xs (the mean of the middle two for an even count), or null for none
export function median(xs) {
  const s = (Array.isArray(xs) ? xs : []).filter(num).sort((a, b) => a - b);
  if (s.length === 0) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// share(n, d) → n of d as a percentage to one place, or null when there is nothing to divide by
export function share(n, d) {
  return d > 0 ? r1((100 * n) / d) : null;
}

// summarise(cells) → the four results, each with its pass: cells is { 'sum-checker': {calls, lanes}, 'drifted-act': {...} }
export function summarise(cells) {
  const honest = obj(obj(cells)['sum-checker']), drifted = obj(obj(cells)['drifted-act']);
  const madeBy = (c) => list(c.calls).filter((x) => num(x.claim));
  const wrong = madeBy(drifted).filter((x) => x.claim !== x.truth);
  const right = [...madeBy(honest), ...madeBy(drifted)].filter((x) => x.claim === x.truth);
  const held = wrong.filter((x) => x.released !== true).length, freed = right.filter((x) => x.released === true).length;
  const lanes = [...list(honest.lanes), ...list(drifted.lanes)];
  const clean = lanes.filter((x) => x.status === 'refused' && x.stage === 'lane' && typeof x.escalate === 'string' && x.escalate !== '' && x.actRan === false).length;
  const timed = list(honest.calls).filter((x) => num(x.guardedMs) && num(x.bareMs));
  const g = median(timed.map((x) => x.guardedMs)), b = median(timed.map((x) => x.bareMs));
  const paired = median(timed.map((x) => x.guardedMs - x.bareMs));
  return [
    { id: 'withhold', wrong: wrong.length, withheld: held, share: share(held, wrong.length), pass: wrong.length > 0 && held === wrong.length },
    { id: 'release', right: right.length, released: freed, share: share(freed, right.length), pass: right.length > 0 && freed === right.length },
    { id: 'lane-first', calls: lanes.length, refusedAtLaneEscalatedNoAct: clean, pass: lanes.length === OUT_OF_LANE && clean === OUT_OF_LANE },
    { id: 'overhead', calls: timed.length, medianGuardedMs: g === null ? null : r1(g), medianBareActMs: b === null ? null : r1(b),
      ratio: g === null || !(b > 0) ? null : r1(g / b), medianOverheadMs: paired === null ? null : r1(paired),
      pass: timed.length >= MIN_CALLS && b > 0 && g <= MAX_RATIO * b },
  ];
}

export default { MAX_RATIO, MIN_CALLS, OUT_OF_LANE, median, share, summarise };
