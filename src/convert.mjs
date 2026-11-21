// convert.mjs — from counting cells to making them. The census says which live repositories have no genome; the estate
// metabolism says which are in use, which are proved (a receipt, the census or a green mutation gate) and which are
// measured dead. This ranks the genome-less ones to convert, in use and proved first, and sends the measured-dead ones
// down the retirement path instead: converting what nobody uses would be work spent on weight. Pure and total.
//   census row: { name, private, archived, declared }                      (~/.estate-genome/census-full.json)
//   plan row:   { name, status, measured: { used, passes, verified }, callers, liveCallers }   (the metabolism's plan)

export const TIERS = ['in use and proved', 'in use', 'proved, not in use', 'no measured signal', 'not in the metabolism plan'];
export const OUTCOMES = ['admitted', 'escalated'];

function at(o, k) {
  if (o === null || typeof o !== 'object' || Array.isArray(o)) return undefined;
  try { return o[k]; } catch { return undefined; }
}
const text = (v) => (typeof v === 'string' ? v.trim() : '');
const list = (v) => (Array.isArray(v) ? v : []);
const count = (v) => (Number.isInteger(v) ? Math.max(v, 0) : 0);

// tierOf(plan) → 0 to 4: the order a genome-less repository is converted in (plan undefined: not measured)
export function tierOf(plan) {
  if (plan === undefined) return 4;
  const m = at(plan, 'measured');
  const used = at(m, 'used') === true || count(at(plan, 'liveCallers')) > 0;
  const proved = at(m, 'verified') === true;
  if (used) return proved ? 0 : 1;
  return proved ? 2 : 3;
}

// rank(censusRows, planRows) → { worklist, retire }: worklist ranked best first, each { rank, name, private, tier, label,
// passes, callers }; retire holds the measured-dead genome-less repositories, by name
export function rank(censusRows, planRows) {
  const plan = new Map();
  for (const p of list(planRows)) if (text(at(p, 'name')) !== '') plan.set(text(at(p, 'name')), p);
  const work = [], retire = [];
  for (const r of list(censusRows)) {
    const name = text(at(r, 'name'));
    if (name === '' || at(r, 'archived') === true || at(r, 'declared') === true) continue;
    const p = plan.get(name), hidden = at(r, 'private') === true;
    if (at(p, 'status') === 'dead') { retire.push({ name, private: hidden }); continue; }
    const tier = tierOf(p);
    work.push({ name, private: hidden, tier, label: TIERS[tier], passes: at(at(p, 'measured'), 'passes') === true, callers: count(at(p, 'callers')) });
  }
  work.sort((a, b) => a.tier - b.tier || Number(b.passes) - Number(a.passes) || b.callers - a.callers || a.name.localeCompare(b.name, 'en'));
  retire.sort((a, b) => a.name.localeCompare(b.name, 'en'));
  return { worklist: work.map((w, i) => ({ rank: i + 1, ...w })), retire };
}

// queue(ranked) → what may be published about the worklist: counts only, no names
export function queue(ranked) {
  const work = list(at(ranked, 'worklist')), retire = list(at(ranked, 'retire'));
  const byTier = Object.fromEntries(TIERS.map((label) => [label, work.filter((w) => at(w, 'label') === label).length]));
  return { ranked: work.length, publicRanked: work.filter((w) => at(w, 'private') === false).length, retire: retire.length, byTier };
}

// ledger(doc) → the conversion attempts fit to publish: public repositories only, each admitted, or escalated with its
// reason; anything else is dropped. Sorted by day, then repository.
export function ledger(doc) {
  const out = [];
  for (const a of list(at(doc, 'attempts'))) {
    const repo = text(at(a, 'repo')), outcome = at(a, 'outcome'), reason = text(at(a, 'reason'));
    if (repo === '' || at(a, 'private') !== false || !OUTCOMES.includes(outcome)) continue;
    if (outcome === 'escalated' && reason === '') continue;
    out.push({ repo, outcome, reason: outcome === 'admitted' ? '' : reason, day: text(at(a, 'day')), batch: text(at(a, 'batch')) });
  }
  out.sort((a, b) => a.day.localeCompare(b.day, 'en') || a.repo.localeCompare(b.repo, 'en'));
  return { attempts: out, admitted: out.filter((a) => a.outcome === 'admitted').length, escalated: out.filter((a) => a.outcome === 'escalated').length };
}

export default { TIERS, OUTCOMES, tierOf, rank, queue, ledger };
