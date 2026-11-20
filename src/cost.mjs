// cost.mjs — the calculator on the page: what parts that cannot describe themselves cost now, from the reader's own
// numbers, with sourced floors as defaults (data/prices.lock.json). Pure and total.
const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : d);
const entry = (lock, id) => {
  const list = lock !== null && typeof lock === 'object' && Array.isArray(lock.entries) ? lock.entries : [];
  return list.find((e) => e !== null && typeof e === 'object' && e.id === id) || null;
};

// defaults(lock) → the floor defaults: the share of parts with no signal and the share measured dead (this estate's own
// first scan), the UK median hourly wage, and one hour a year per part nobody can describe
export function defaults(lock) {
  const m = entry(lock, 'estate-metabolism-2026-11-17'), w = entry(lock, 'ons-ashe-2025-median-hourly');
  const scored = m ? num(m.scored, 0) : 0;
  return {
    parts: 500,
    noSignalShare: scored > 0 ? num(m.noSignal, 0) / scored : 0,
    deadShare: scored > 0 ? num(m.dead, 0) / scored : 0,
    hoursEach: 1,
    rate: w ? num(w.value, 0) : 0,
  };
}

// costCase(lock, inputs) → the parts nobody can describe, the hours a year spent finding out what they are, the cost
// of those hours, and the parts measurably dead that could be shed reversibly instead of carried
export function costCase(lock, inputs) {
  const d = defaults(lock), i = inputs !== null && typeof inputs === 'object' ? inputs : {};
  const parts = Math.round(num(i.parts, d.parts));
  const noSignalShare = Math.min(1, num(i.noSignalShare, d.noSignalShare)), deadShare = Math.min(1, num(i.deadShare, d.deadShare));
  const hoursEach = num(i.hoursEach, d.hoursEach), rate = num(i.rate, d.rate);
  const unknown = Math.round(parts * noSignalShare), dead = Math.round(parts * deadShare);
  const hours = unknown * hoursEach;
  return { parts, noSignalShare, deadShare, hoursEach, rate, unknown, dead, hours, gbp: Math.round(hours * rate * 100) / 100 };
}

export default { defaults, costCase };
