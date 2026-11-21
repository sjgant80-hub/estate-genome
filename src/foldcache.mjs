// foldcache.mjs — the census keeps what it already proved instead of proving it again. A repository's full birth-check
// verdict is reused only when three things all hold: its HEAD commit is the one that was checked, the checker is the
// same code (a hash of the kernel, the runner and the supervisor), and the verdict is under seven days old. Anything
// else is checked again on a fresh clone. The age limit is the freshening limb: a cache with no expiry settles onto
// stale state, because a check can depend on more than the commit (the clock, the network, a dependency). Pure and total.
//   an entry: { oid, checker, verdict: 'cell' | 'part', line, reasons, checkedAt: ISO time }

export const MAX_AGE_DAYS = 7;
const DAY_MS = 86400000;

function at(o, k) {
  if (o === null || typeof o !== 'object' || Array.isArray(o)) return undefined;
  try { return o[k]; } catch { return undefined; }
}
const text = (v) => (typeof v === 'string' ? v.trim() : '');
const map = (v) => (v !== null && typeof v === 'object' && !Array.isArray(v) ? v : {});

// reuse(entry, now) → { hit, why }: now is { oid, checker, at } (at: the time in milliseconds)
export function reuse(entry, now) {
  const oid = text(at(now, 'oid')), checker = text(at(now, 'checker')), t = at(now, 'at');
  if (at(entry, 'verdict') !== 'cell' && at(entry, 'verdict') !== 'part') return { hit: false, why: 'not checked before' };
  if (oid === '') return { hit: false, why: 'no HEAD commit to compare' };
  if (text(at(entry, 'oid')) !== oid) return { hit: false, why: 'its HEAD moved' };
  if (checker === '' || text(at(entry, 'checker')) !== checker) return { hit: false, why: 'the checker changed' };
  const age = t - Date.parse(text(at(entry, 'checkedAt')));
  if (!(age >= 0 && age < MAX_AGE_DAYS * DAY_MS)) return { hit: false, why: 'the verdict is 7 or more days old' };
  return { hit: true, why: 'same HEAD, same checker, under 7 days old' };
}

// remember(cache, repo, entry) → the cache with this repository's newest full verdict in it (a failed clone is not one)
export function remember(cache, repo, entry) {
  const kept = { ...map(at(cache, 'entries')) };
  const v = at(entry, 'verdict'), name = text(repo);
  if (name !== '' && (v === 'cell' || v === 'part')) {
    kept[name] = { oid: text(at(entry, 'oid')), checker: text(at(entry, 'checker')), verdict: v, line: text(at(entry, 'line')),
      reasons: (Array.isArray(at(entry, 'reasons')) ? entry.reasons : []).filter((x) => typeof x === 'string'), checkedAt: text(at(entry, 'checkedAt')) };
  }
  return { entries: kept };
}

// keepOnly(cache, names) → the cache holding only these repositories (the ones that still declare a genome)
export function keepOnly(cache, names) {
  const want = new Set((Array.isArray(names) ? names : []).map(text));
  const entries = map(at(cache, 'entries'));
  return { entries: Object.fromEntries(Object.keys(entries).filter((k) => want.has(k)).sort().map((k) => [k, entries[k]])) };
}

// tally(decisions) → { checked, hits, misses, hitRate, why }: decisions is a list of reuse() results
export function tally(decisions) {
  const ds = (Array.isArray(decisions) ? decisions : []).filter((d) => typeof at(d, 'hit') === 'boolean');
  const hits = ds.filter((d) => d.hit).length;
  const why = {};
  for (const d of ds) { const w = text(at(d, 'why')); why[w] = (Object.hasOwn(why, w) ? why[w] : 0) + 1; }
  return { checked: ds.length, hits, misses: ds.length - hits, hitRate: ds.length > 0 ? Math.round((1000 * hits) / ds.length) / 10 : null, why };
}

// measure(cold, warm) → the three pre-registered results (data/foldcache-rules.json) for two consecutive censuses, each a
// published census view: { checks: [{ name, oid, reused, line, error }], took: { listingMs, checkingMs, totalMs }, cache }
export function measure(cold, warm) {
  const checks = (v) => (Array.isArray(at(v, 'checks')) ? v.checks : []).filter((c) => text(at(c, 'name')) !== '' && text(at(c, 'error')) === '');
  const ms = (v, k) => { const x = at(at(v, 'took'), k); return typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : null; };
  const before = new Map(checks(cold).filter((c) => text(at(c, 'line')) !== '').map((c) => [c.name, c]));
  const after = checks(warm).filter((c) => before.has(c.name));
  const still = after.filter((c) => text(at(c, 'oid')) !== '' && text(at(c, 'oid')) === text(at(before.get(c.name), 'oid')));
  const moved = after.filter((c) => !still.includes(c));
  const reusedStill = still.filter((c) => at(c, 'reused') === true).length, reusedMoved = moved.filter((c) => at(c, 'reused') === true).length;
  const reused = checks(warm).filter((c) => at(c, 'reused') === true);
  const same = reused.filter((c) => before.has(c.name) && text(at(c, 'line')) === text(at(before.get(c.name), 'line'))).length;
  const coldReused = checks(cold).filter((c) => at(c, 'reused') === true).length;
  const c = ms(cold, 'totalMs'), w = ms(warm, 'totalMs');
  return [
    { id: 'reuse', unmoved: still.length, reusedUnmoved: reusedStill, moved: moved.length, reusedMoved, pass: still.length > 0 && reusedStill === still.length && reusedMoved === 0 },
    { id: 'same-verdicts', reused: reused.length, identical: same, pass: reused.length > 0 && same === reused.length },
    { id: 'wall-time', coldMs: c, warmMs: w, ratio: w === null || !(c > 0) ? null : Math.round((100 * w) / c) / 100,
      coldListingMs: ms(cold, 'listingMs'), warmListingMs: ms(warm, 'listingMs'), coldCheckingMs: ms(cold, 'checkingMs'), warmCheckingMs: ms(warm, 'checkingMs'),
      declaring: checks(warm).length, warmHits: reused.length, hitRate: checks(warm).length > 0 ? Math.round((1000 * reused.length) / checks(warm).length) / 10 : null,
      coldReused, pass: coldReused === 0 && c > 0 && w !== null && w <= c / 2 },
  ];
}

export default { MAX_AGE_DAYS, reuse, remember, keepOnly, tally, measure };
