// route.mjs — the conductor reads the genome. Given the index of admitted cells (their seed.json essentials) and a
// request, it picks the cells whose declared lane fits, best first, or refuses and escalates. Pure and total.
// Only ADMITTED cells are routable: a part that has not passed its birth check is invisible to the conductor.
// This ranks by what the manifests SAY. bin/route.mjs then asks the chosen cell's own lane hook before anything runs.

const STOP = new Set(('a an and are as at be by can do does for from has have how i in is it its me my of on or our please ' +
  'that the their this to was what when where which who why will with you your').split(' '));
// a cell must fit at least half of a request's words to receive it: a weaker fit is refused and escalated, not guessed
export const MIN_SHARE = 0.5;
export const words = (t) => (typeof t === 'string' ? t.toLowerCase().match(/[a-z0-9]+/g) || [] : []);
export const terms = (t) => [...new Set(words(t).filter((w) => w.length >= 3 && !STOP.has(w)))];

const get = (o, k) => { try { return o[k]; } catch { return undefined; } };
const text = (v) => (typeof v === 'string' ? v : '');

// cellsOf(index) → the admitted cells, each { name, lane, about }; anything malformed is dropped
export function cellsOf(index) {
  const cells = get(index, 'cells');
  return (Array.isArray(cells) ? cells : []).filter((c) => get(c, 'verdict') === 'cell' && text(get(c, 'name')) !== '')
    .map((c) => {
      const lane = get(c, 'lane');
      return { name: c.name, lane: text(get(lane, 'id')), about: terms(`${text(get(lane, 'accepts'))} ${text(get(c, 'purpose'))}`), escalate: text(get(c, 'escalate')) };
    });
}

// route(index, request, fallback) → { status, cell, candidates, escalate, why }
//   request.lane: a lane id, matched exactly; request.need: plain words, matched against each cell's lane and purpose
//   status 'routed' names the best cell; 'refused' names who the request escalates to (fallback, default 'kar')
export function route(index, request, fallback = 'kar') {
  const cells = cellsOf(index);
  const lane = text(get(request, 'lane')).trim();
  const need = terms(text(get(request, 'need')));
  const to = text(fallback) || 'kar';
  let candidates = [];
  if (lane !== '') candidates = cells.filter((c) => c.lane === lane).map((c) => ({ name: c.name, score: 1 }));
  else if (need.length) {
    candidates = cells.map((c) => ({ name: c.name, score: need.filter((w) => c.about.includes(w)).length / need.length }))
      .filter((c) => c.score >= MIN_SHARE).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'en'));
  }
  if (candidates.length === 0) {
    const why = lane !== '' ? `no admitted cell declares the lane "${lane}"` : need.length ? 'no admitted cell declares a lane that fits at least half of these words' : 'the request names no lane and no need';
    return { status: 'refused', cell: null, candidates, escalate: to, why };
  }
  return { status: 'routed', cell: candidates[0].name, candidates, escalate: null, why: lane !== '' ? `declares the lane "${lane}"` : `its lane and purpose share ${Math.round(candidates[0].score * 100)}% of the request's words` };
}

export default { MIN_SHARE, words, terms, cellsOf, route };
