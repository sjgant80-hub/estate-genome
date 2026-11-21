// drift.mjs — drift on every axis. The census keeps a history: one row per day per public repository that declares a
// genome, with its verdict and the traits that failed. A cell admitted before and refused now has DRIFTED, and the
// trait that regressed is named with the plain question it answers. Pure and total. The page inlines it.
//   a row: { day: 'YYYY-MM-DD', repo, verdict: 'cell' | 'part' | null, failing: [traits] }   (null: not checked that day)

export const TRAITS = ['describe', 'verify', 'prune', 'boundary'];
// the question each trait answers about a cell, as it was admitted and as it is now
export const QUESTIONS = {
  describe: 'can it still be traced back and found?',
  verify: 'does it still check its output?',
  prune: 'can it still be removed?',
  boundary: 'does it still stay in its lane?',
};
export const ABOUT = 'One row per census day per public repository that declares a genome: its verdict (cell, part, or null when it was not checked) and the traits that failed. Written by scripts/census.mjs; read by src/drift.mjs. A cell admitted on an earlier day and refused on the latest is drifted.';
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function at(o, k) {
  if (o === null || typeof o !== 'object' || Array.isArray(o)) return undefined;
  try { return o[k]; } catch { return undefined; }
}
const text = (v) => (typeof v === 'string' ? v.trim() : '');
const list = (v) => (Array.isArray(v) ? v : []);

// failingOf(line) → the traits a birth-check verdict line marks "no", in genome order
export function failingOf(line) {
  const l = text(line);
  return TRAITS.filter((t) => l.includes(`${t} no`));
}

// clean(row) → the row in its one shape, or null when it is not a row (no day or no repository name)
export function clean(row) {
  const day = text(at(row, 'day')), repo = text(at(row, 'repo'));
  if (!DAY.test(day) || repo === '') return null;
  const v = at(row, 'verdict');
  const verdict = v === 'cell' || v === 'part' ? v : null;
  const failing = verdict === 'part' ? TRAITS.filter((t) => list(at(row, 'failing')).includes(t)) : [];
  return { day, repo, verdict, failing };
}

// rowsOf(view, lost) → the history rows one census adds: a row for each declaring public repository in the census view
// (data/census.json), and a row for each name in lost (live public repositories the history knows that no longer ship a
// seed.json: refused on describe)
export function rowsOf(view, lost) {
  const day = text(at(view, 'generated')).slice(0, 10);
  if (!DAY.test(day)) return [];
  const checks = list(at(view, 'checks'));
  const lineOf = (name) => at(checks.find((k) => at(k, 'name') === name), 'line');
  const seen = list(at(view, 'cells')).map((c) => clean({ day, repo: at(c, 'name'), verdict: at(c, 'verdict'), failing: failingOf(lineOf(at(c, 'name'))) }));
  const gone = list(lost).map((name) => clean({ day, repo: name, verdict: 'part', failing: ['describe'] }));
  return [...seen, ...gone].filter((r) => r !== null);
}

// merge(history, rows) → the history with these rows in: a census replaces every row of its own day (the later census
// of a day is the whole truth for that day), sorted by day, then repository
export function merge(history, rows) {
  const add = list(rows).map(clean).filter((r) => r !== null);
  const days = new Set(add.map((r) => r.day));
  const kept = list(at(history, 'rows')).map(clean).filter((r) => r !== null && !days.has(r.day));
  const all = [...kept, ...add].sort((a, b) => a.day.localeCompare(b.day, 'en') || a.repo.localeCompare(b.repo, 'en'));
  return { rows: all };
}

// series(history) → the cell count over time: one point per census day, { day, cells, declared }
export function series(history) {
  const by = new Map();
  for (const r of list(at(history, 'rows')).map(clean).filter((x) => x !== null)) {
    const p = by.get(r.day) || { day: r.day, cells: 0, declared: 0 };
    p.declared += 1;
    if (r.verdict === 'cell') p.cells += 1;
    by.set(r.day, p);
  }
  return [...by.values()].sort((a, b) => a.day.localeCompare(b.day, 'en'));
}

// drift(history) → { latest, days, watched, drifted }: a repository is drifted when its row on the latest census day says
// refused and an earlier day admitted it. Each drifted entry names the day it was last admitted, the first refused day
// since, and every regressed trait with its question.
export function drift(history) {
  const rows = list(at(history, 'rows')).map(clean).filter((r) => r !== null);
  const days = [...new Set(rows.map((r) => r.day))].sort();
  const latest = days.length > 0 ? days[days.length - 1] : '';
  const repos = [...new Set(rows.map((r) => r.repo))].sort((a, b) => a.localeCompare(b, 'en'));
  const drifted = [];
  for (const repo of repos) {
    const mine = rows.filter((r) => r.repo === repo).sort((a, b) => a.day.localeCompare(b.day, 'en'));
    const now = mine[mine.length - 1];
    if (now.day !== latest || now.verdict !== 'part') continue;
    const i = mine.findLastIndex((r) => r.verdict === 'cell');
    if (i < 0) continue;
    const since = mine.slice(i + 1).find((r) => r.verdict === 'part').day;
    drifted.push({ repo, lastAdmitted: mine[i].day, since, failing: now.failing, regressed: now.failing.map((t) => ({ trait: t, question: QUESTIONS[t] })) });
  }
  return { latest, days: days.length, watched: repos.length, drifted };
}

export default { ABOUT, TRAITS, QUESTIONS, failingOf, clean, rowsOf, merge, series, drift };
