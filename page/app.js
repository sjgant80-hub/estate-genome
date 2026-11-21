// The page. Every figure comes from a data file or from the inlined kernels (GENOME, ROUTE, COST: the gated modules,
// byte for byte). Nothing on the page that is a number is typed here.
(async () => {
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => (typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('en-GB') : '…');
const pct = (x) => (typeof x === 'number' && Number.isFinite(x) ? `${(x * 100).toFixed(1)}%` : '…');
const bind = (key, val) => document.querySelectorAll(`[data-bind="${key}"]`).forEach((el) => { el.textContent = val; });
const get = (u) => fetch(u, { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(`${u}: ${r.status}`); return r.json(); });
const getText = (u) => fetch(u, { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(`${u}: ${r.status}`); return r.text(); });
const maybe = (p) => p.catch(() => null);

// theme: the viewer's own choice, remembered in this browser only
const root = document.documentElement;
try { const t = localStorage.getItem('genome-theme'); if (t === 'dark' || t === 'light') root.setAttribute('data-theme', t); } catch { /* storage off */ }
$('theme').addEventListener('click', () => {
  const dark = root.getAttribute('data-theme') ? root.getAttribute('data-theme') === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  root.setAttribute('data-theme', dark ? 'light' : 'dark');
  try { localStorage.setItem('genome-theme', dark ? 'light' : 'dark'); } catch { /* storage off */ }
});

const [census, index, gates, lock, honestSeed, bluffSeed, lane] = await Promise.all([
  maybe(get('data/census.json')), maybe(get('data/genome-index.json')), maybe(get('data/gates.json')), maybe(get('data/prices.lock.json')),
  maybe(getText('examples/sum-checker/seed.json')), maybe(getText('examples/bluffing-judge/seed.json')),
  maybe(get('/docdecdemo/data/genome-lane.json')),
]);

// ── the census, the gates, the sourced figures ──
if (census) {
  for (const k of ['scanned', 'archived', 'live', 'declared', 'admitted', 'notAdmitted', 'genomeLess']) bind(`census.${k}`, fmt(census[k]));
  const when = new Date(census.generated);
  bind('census.day', when.toISOString().slice(0, 10));
  bind('census.when', `on ${when.toUTCString().slice(5, 16)} at ${when.toISOString().slice(11, 16)} UTC`);
  $('cellRows').innerHTML = (census.cells || []).map((c) => `<tr><td><a href="https://github.com/${esc(census.owner)}/${esc(c.name)}">${esc(c.name)}</a></td><td><code>${esc(c.lane)}</code></td><td>${c.verdict === 'cell' ? '<span class="yes">admitted</span>' : c.verdict === 'part' ? '<span class="noo">refused</span>' : 'not run'}</td></tr>`).join('')
    || '<tr><td colspan="3">No public repository declares a genome yet.</td></tr>';
}
if (gates) { bind('gates.killed', fmt(gates.killed)); bind('gates.total', fmt(gates.total)); }
const metab = lock && Array.isArray(lock.entries) ? lock.entries.find((e) => e.id === 'estate-metabolism-2026-11-17') : null;
if (metab) { bind('lock.scored', fmt(metab.scored)); bind('lock.noSignal', fmt(metab.noSignal)); bind('lock.dead', fmt(metab.dead)); }
if (lane && lane.eval) { bind('lane.in', pct(lane.eval.inLaneAccepted)); bind('lane.out', pct(lane.eval.offTopicRefused)); }
else { bind('lane.in', 'a measured share (see DocDec’s page)'); bind('lane.out', 'a measured share'); }

const BP = [
  ['Kernel', 'src/genome.mjs', 'judges the four traits from the evidence; the verdict and every reason'],
  ['Runner', 'src/run.mjs', 'runs a part’s own hooks; tries retire and restore on a scratch copy; hashes the tree'],
  ['Supervisor', 'src/supervise.mjs', 'bounds each hook and kills its whole process tree on time-out'],
  ['Grow', 'src/grow.mjs', 'plants the genome in a folder, never overwriting anything'],
  ['Judge hook', 'template/genome/judge.mjs', 'runs a part’s judge on one case; only "verified" exits cleanly'],
  ['Lane hook', 'template/genome/lane.mjs', 'runs a part’s lane check; out of lane is refused and escalated'],
  ['Health hook', 'template/genome/health.mjs', 'reports use honestly, and measures that the judge still passes'],
  ['Retire hook', 'template/genome/tombstone.mjs', 'retires reversibly: keeps the exact manifest, restores it byte for byte'],
  ['Its own judge', 'genome/cell.mjs', 'estate-genome as a cell: a claimed verdict is verified by re-running the check'],
  ['Census', 'src/census.mjs', 'counts cells, declared and genome-less; the public view names public repositories only'],
  ['Conductor', 'src/route.mjs', 'routes by the genome index: admitted cells only; otherwise refuses and escalates'],
  ['Cost', 'src/cost.mjs', 'the calculator on this page, from sourced floors and your own numbers'],
  ['Guard', 'src/guard.mjs', 'plans each call (lane, then act, then judge) and decides what is released; withholds the rest, with the reason'],
  ['Guard runner', 'src/guardrun.mjs', 'runs one call through a cell’s own hooks under the supervisor; the call log; genome-run’s options'],
  ['Act hook', 'template/genome/act.mjs', 'runs a part’s act on one request; an act that returns nothing refuses'],
  ['Guard arithmetic', 'src/guardstats.mjs', 'counts the guard measurement against its pre-registered rules'],
  ['Honest example', 'examples/sum-checker/genome/cell.mjs', 'adds two whole numbers and checks a claimed total'],
  ['Fold-cache', 'src/foldcache.mjs', 'reuses a full verdict only on the same commit, the same checking code and under 7 days old; compares a cold census with a warm one'],
  ['Drift', 'src/drift.mjs', 'the census history: a cell admitted before and refused now is named, with the trait it lost'],
  ['Drifted example', 'examples/drifted-act/genome/cell.mjs', 'the same judge and lane, with an act that is wrong above 100: the guard’s test case'],
];
$('bpTbl').querySelector('tbody').innerHTML = BP.map(([part, file, what]) => {
  const g = gates && gates.files ? gates.files[file] : null;
  return `<tr><td><b>${esc(part)}</b></td><td><a href="https://github.com/sjgant80-hub/estate-genome/blob/main/${esc(file)}"><code>${esc(file)}</code></a></td><td>${esc(what)}</td><td class="num">${g ? `${fmt(g.killed)}/${fmt(g.total)}${g.clean ? ' clean' : ''}` : '—'}</td></tr>`;
}).join('');
bind('describe.count', fmt(GENOME.describe({}).reasons.length));

// ── try it: the manifest check ──
const fresh = (() => {
  try {
    const s = JSON.parse(honestSeed);
    s.judge.cases = { good: null, bad: null }; s.boundary.inLane = null; s.boundary.outOfLane = null;
    return JSON.stringify(s, null, 2);
  } catch { return ''; }
})();
const PRESETS = {
  honest: [honestSeed || '', 'Complete. The recorded runs below show this part’s judge, lane and retirement working: it is a cell.'],
  bluff: [bluffSeed || '', 'Complete too: a manifest cannot show a bluff. Running the judge does. Open “The bluffing example” below: its judge calls its own known-bad case verified, so it is refused.'],
  fresh: [fresh, 'This is what grow plants: the cases and the lane samples are still empty, so the check names what its author must write.'],
  broken: ['{ "genome": "1", "name": "half-written", ', 'Not JSON at all: the check says so instead of guessing.'],
};
function checkSeed(note) {
  const r = GENOME.describeText($('seedIn').value);
  $('seedOut').innerHTML = r.describes
    ? `<div class="verdict ok">Trait 1 holds: the manifest is complete${r.name ? ` for <code>${esc(r.name)}</code>, lane <code>${esc(r.lane)}</code>` : ''}.</div>`
    : `<div class="verdict no">Trait 1 does not hold. ${r.reasons.length} thing${r.reasons.length === 1 ? '' : 's'} to fix:<ul class="reasons">${r.reasons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`;
  $('seedNote').textContent = typeof note === 'string' ? note : 'Your own manifest, checked in this tab. Traits 2 to 4 need the part’s code: run bin/genome-check.mjs on it.';
}
document.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => {
  const [src, note] = PRESETS[b.getAttribute('data-preset')];
  $('seedIn').value = src; checkSeed(note);
}));
$('checkSeed').addEventListener('click', () => checkSeed());
$('seedIn').value = PRESETS.honest[0]; checkSeed(PRESETS.honest[1]);

// ── the recorded birth checks, re-judged here ──
const traces = {};
const shortHash = (h) => (typeof h === 'string' ? h.slice(0, 12) : '—');
const out = (run) => { const v = run ? GENOME.lastJson(run.out) : null; return v ? JSON.stringify(v) : '(no JSON)'; };
function renderTrace(t) {
  if (!t) { $('traceOut').textContent = 'This recorded run could not be loaded.'; return; }
  const s = t.seed, r = t.runs, traits = t.result.traits, by = (n) => traits.find((x) => x.trait === n);
  const hook = (ok, title, body) => `<div class="hook ${ok ? 'ok' : 'no'}"><b>${title}</b><br>${body}</div>`;
  const tr = r.tombstone || {};
  const again = GENOME.birth(s, r), line = GENOME.verdictLine(again);
  $('traceOut').innerHTML = `<p><b>${esc(s.name)}</b> · ${esc(t.part)} · checked ${esc(String(t.checked).slice(0, 10))}<br><span class="small muted">${esc(s.purpose)}</span></p>`
    + hook(by('describe').pass, '1 · Describe', `seed.json: lane <code>${esc(s.lane.id)}</code> takes “${esc(s.lane.accepts)}”; refuses “${esc(s.lane.refuses)}”; escalates to <code>${esc(s.boundary.escalate)}</code>.`)
    + hook(by('verify').pass, '2 · Verify', `judge: “${esc(s.judge.what)}”<br>good case <code>${esc(JSON.stringify(s.judge.cases.good))}</code> → <code>${esc(out(r.judge.good))}</code> (exit ${esc(r.judge.good && r.judge.good.code)})<br>bad case <code>${esc(JSON.stringify(s.judge.cases.bad))}</code> → <code>${esc(out(r.judge.bad))}</code>`)
    + hook(by('prune').pass, '3 · Prune', `health → <code>${esc(out(r.health))}</code><br>retire on a copy: before <code>${shortHash(tr.before)}</code>, applied <code>${shortHash(tr.applied)}</code> (${tr.applied !== tr.before ? 'changed' : 'unchanged'}), restored <code>${shortHash(tr.restored)}</code> (${tr.restored === tr.before ? 'identical' : 'different'})`)
    + hook(by('boundary').pass, '4 · Boundary', `in lane <code>${esc(JSON.stringify(s.boundary.inLane))}</code> → <code>${esc(out(r.boundary.inLane))}</code><br>out of lane <code>${esc(JSON.stringify(s.boundary.outOfLane))}</code> → <code>${esc(out(r.boundary.outOfLane))}</code>`)
    + (traits.some((x) => !x.pass) ? `<p class="small"><b>Why it is refused:</b> ${traits.filter((x) => !x.pass).map((x) => `${esc(x.trait)}: ${x.reasons.map(esc).join('; ')}`).join(' · ')}</p>` : '')
    + `<div class="verdict ${again.admitted ? 'ok' : 'no'}">${esc(t.line)}</div>`
    + `<p class="small">Re-judged in this tab from the recorded hook outputs, by the same kernel: <b>${line === t.line ? 'the same verdict' : 'a DIFFERENT verdict: ' + esc(line)}</b>.</p>`;
}
const traceButtons = document.querySelectorAll('[data-trace]');
let shown = null;   // the tab last clicked: a slower fetch for an earlier click must not overwrite it
async function showTrace(file) {
  shown = file;
  traceButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.getAttribute('data-trace') === file)));
  if (!(file in traces)) traces[file] = await maybe(get(`data/traces/${file}`));
  if (shown === file) renderTrace(traces[file]);
}
traceButtons.forEach((b) => b.addEventListener('click', () => showTrace(b.getAttribute('data-trace'))));
await showTrace('birth-docdec.json');

// ── the diagram: DocDec's real run ──
const dd = traces['birth-docdec.json'];
if (dd) {
  const r = dd.runs, v = (run) => (run ? GENOME.lastJson(run.out) || {} : {});
  $('dgName').textContent = `${dd.seed.name} · lane ${dd.seed.lane.id}`;
  $('dgGood').textContent = String(v(r.judge.good).status);
  $('dgBad').textContent = String(v(r.judge.bad).status);
  $('dgIn').textContent = v(r.boundary.inLane).inLane === true ? 'taken' : 'not taken';
  const o = v(r.boundary.outOfLane);
  $('dgOut').textContent = o.status === 'refused' ? `refused → ${o.escalate}` : 'not refused';
  $('dgPass').textContent = String(v(r.health).passing);
  $('dgApplied').textContent = r.tombstone.applied !== r.tombstone.before ? 'changed' : 'unchanged';
  $('dgRestored').textContent = r.tombstone.restored === r.tombstone.before ? 'identical' : 'different';
  $('dgVerdict').textContent = dd.line.replace(/ \(.*/, ` (${dd.result.traits.filter((x) => x.pass).length} of 4)`);
}

// ── the conductor ──
function routeIt() {
  const res = ROUTE.route(index, { need: $('need').value });
  const cands = res.candidates.map((c) => `<code>${esc(c.name)}</code> ${Math.round(c.score * 100)}%`).join(', ');
  $('routeOut').innerHTML = res.status === 'routed'
    ? `<div class="verdict ok">Routed to <code>${esc(res.cell)}</code>: ${esc(res.why)}.</div>${res.candidates.length > 1 ? `<p class="small">Ranked: ${cands}</p>` : ''}`
    : `<div class="verdict no">Refused: ${esc(res.why)}. Escalated to <code>${esc(res.escalate)}</code>.</div>`;
}
$('routeBtn').addEventListener('click', routeIt);
document.querySelectorAll('[data-need]').forEach((b) => b.addEventListener('click', () => { $('need').value = b.getAttribute('data-need'); routeIt(); }));
if (index) routeIt(); else $('routeOut').textContent = 'The genome index could not be loaded.';
const [rin, rout] = await Promise.all([maybe(get('data/traces/route-in.json')), maybe(get('data/traces/route-out.json'))]);
$('routeTraces').innerHTML = [rin, rout].filter(Boolean).map((t) => {
  const input = t.request[t.request.indexOf('--input') + 1], need = t.request[t.request.indexOf('--need') + 1];
  return `<div class="hook ${t.status === 'routed' ? 'ok' : 'no'}">need “${esc(need)}”, input <code>${esc(input)}</code><br>`
    + (t.status === 'routed' ? `→ routed to <code>${esc(t.cell)}</code>: ${esc(t.confirmed)}.` : `→ refused: ${esc(t.why)}; escalated to <code>${esc(t.escalate)}</code>.`) + '</div>';
}).join('');

// ── drift: a cell admitted before and refused now, named by the trait it lost ──
const history = await maybe(get('data/census-history.json'));
document.querySelectorAll('[data-q]').forEach((el) => { el.textContent = DRIFT.QUESTIONS[el.getAttribute('data-q')] || ''; });
if (history) {
  const dr = DRIFT.drift(history);
  const span = `${fmt(dr.days)} census day${dr.days === 1 ? '' : 's'} up to ${dr.latest}, ${fmt(dr.watched)} repositor${dr.watched === 1 ? 'y' : 'ies'} watched`;
  $('driftOut').innerHTML = dr.drifted.length === 0
    ? `<div class="verdict ok">No drift: no repository that was admitted on an earlier day is refused on the latest (${esc(span)}).</div>`
    : `<div class="verdict no">${fmt(dr.drifted.length)} drifted (${esc(span)}):</div><ul class="reasons">${dr.drifted.map((x) => `<li><a href="https://github.com/sjgant80-hub/${esc(x.repo)}"><b>${esc(x.repo)}</b></a>: admitted ${esc(x.lastAdmitted)}, refused since ${esc(x.since)}. ${x.regressed.length ? x.regressed.map((r) => `<b>${esc(r.trait)}</b>: ${esc(r.question)} No.`).join(' ') : 'The census did not record which trait failed.'}</li>`).join('')}</ul>`;
} else $('driftOut').textContent = 'The census history could not be loaded.';

// ── the fold-cache: what the latest census reused, and the cold-against-warm measurement ──
const dur = (ms) => (typeof ms !== 'number' || !Number.isFinite(ms) ? '…' : ms >= 60000 ? `${Math.floor(ms / 60000)} min ${Math.round((ms % 60000) / 1000)} s` : `${(ms / 1000).toFixed(1)} s`);
if (census && census.cache && census.cache.on) {
  const c = census.cache, why = Object.entries(c.why || {}).map(([w, n]) => `${fmt(n)}: ${esc(w)}`).join('; ');
  $('cacheOut').innerHTML = `<p>The latest census (${esc(String(census.generated).slice(0, 10))}) had ${fmt(c.checked)} declaring repositor${c.checked === 1 ? 'y' : 'ies'} to check:
    <b>${fmt(c.hits)} reused</b>, ${fmt(c.misses)} checked again on a fresh copy${why ? ` (${why})` : ''}.</p>`
    + (census.took ? `<p class="small">It took ${dur(census.took.totalMs)}: ${dur(census.took.listingMs)} reading every repository from GitHub, ${dur(census.took.checkingMs)} checking.</p>` : '');
} else $('cacheOut').textContent = census ? 'The census that made these figures ran before the fold-cache existed, so it checked every declaring repository afresh.' : 'The census could not be loaded.';
const [cRules, cMeasure] = await Promise.all([maybe(get('data/foldcache-rules.json')), maybe(get('data/foldcache-measure.json'))]);
const CRESULT = {
  reuse: (x) => `${fmt(x.reusedUnmoved)} of ${fmt(x.unmoved)} unmoved repositories reused; ${fmt(x.moved)} had a new commit, and ${fmt(x.reusedMoved)} of those were reused`,
  'same-verdicts': (x) => `${fmt(x.identical)} of ${fmt(x.reused)} reused verdicts identical to the cold run's`,
  'wall-time': (x) => `cold ${dur(x.coldMs)}, warm ${dur(x.warmMs)}: ${fmt(x.ratio)} of the cold time. Reading every repository took ${dur(x.coldListingMs)} and ${dur(x.warmListingMs)}; checking took ${dur(x.coldCheckingMs)} and ${dur(x.warmCheckingMs)}. The warm run reused ${fmt(x.warmHits)} of ${fmt(x.declaring)} declaring repositories (${x.hitRate === null ? '—' : x.hitRate + '%'}).`,
};
$('cacheRows').innerHTML = (cRules && Array.isArray(cRules.rules) ? cRules.rules : []).map((rule) => {
  const x = cMeasure && Array.isArray(cMeasure.results) ? cMeasure.results.find((m) => m.id === rule.id) : null;
  const res = x ? `<span class="${x.pass ? 'yes' : 'noo'}">${x.pass ? 'PASS' : 'FAIL'}</span> · ${esc(CRESULT[rule.id] ? CRESULT[rule.id](x) : JSON.stringify(x))}` : 'not measured yet';
  return `<tr><td>${esc(rule.what)}</td><td>${esc(rule.pass)}</td><td>${res}</td></tr>`;
}).join('') || '<tr><td colspan="3">The rules could not be loaded.</td></tr>';
// why the wall-time rule came out as it did, from its own numbers: the cache skips checking, never the listing
function wallNote(m) {
  const w = Array.isArray(m.results) ? m.results.find((r) => r.id === 'wall-time') : null;
  if (!w) return '';
  return ` Checking fell from ${dur(w.coldCheckingMs)} to ${dur(w.warmCheckingMs)}, but reading every repository from GitHub took ${dur(w.coldListingMs)} and ${dur(w.warmListingMs)}, and the cache cannot skip that read: it is how the census learns each repository's latest commit. ${w.pass ? 'Even so, the warm run took at most half the time.' : 'So the whole census took more than half the cold time, and the wall-time rule failed. It stays failed: the cache saves the checking, not the read.'}`;
}
$('cacheNote').innerHTML = cMeasure && cMeasure.cold && cMeasure.warm
  ? `Measured on GitHub's runner: the cold census is commit <a href="https://github.com/sjgant80-hub/estate-genome/commit/${esc(cMeasure.cold.commit)}"><code>${esc(cMeasure.cold.commit.slice(0, 7))}</code></a> (${esc(String(cMeasure.cold.generated).slice(0, 16).replace('T', ' '))} UTC), the warm one <a href="https://github.com/sjgant80-hub/estate-genome/commit/${esc(cMeasure.warm.commit)}"><code>${esc(cMeasure.warm.commit.slice(0, 7))}</code></a> (${esc(String(cMeasure.warm.generated).slice(0, 16).replace('T', ' '))} UTC). Repositories with a new commit between the runs are rightly checked again.${wallNote(cMeasure)} Every check of both runs: <a href="https://github.com/sjgant80-hub/estate-genome/blob/main/data/foldcache-measure.json">foldcache-measure.json</a>.`
  : 'The two census runs this judges have not been made yet.';

// ── the guard: four real calls, decided again in this tab ──
const [gRules, gMeasure] = await Promise.all([maybe(get('data/guard-rules.json')), maybe(get('data/guard-measure.json'))]);
const guardTraces = {};
const said = (run) => { if (!run) return 'did not run'; const v = GENOME.lastJson(run.out); return v ? JSON.stringify(v) : '(no JSON)'; };
const secs = (ms) => (typeof ms === 'number' && Number.isFinite(ms) ? `${(ms / 1000).toFixed(1)} s` : '…');
const took = (t, k) => (t.ms && typeof t.ms[k] === 'number' ? ` · ${secs(t.ms[k])}` : '');
const handed = (d) => (d.released ? `Released: <code>${esc(JSON.stringify(d.output))}</code>`
  : `Withheld (${esc(d.status)}): ${esc(d.reason)}. Escalated to <code>${esc(d.escalate)}</code>.`);
function renderGuard(t) {
  if (!t) { $('guardOut').textContent = 'This recorded call could not be loaded.'; return; }
  const r = t.runs, d = t.decision, again = GUARD.decide(t.seed, r, t.input);
  const same = again.status === d.status && again.released === d.released && again.reason === d.reason;
  const step = (ok, title, body) => `<div class="hook ${ok ? 'ok' : 'no'}"><b>${title}</b><br>${body}</div>`;
  const laneOk = !!r.lane && (GENOME.lastJson(r.lane.out) || {}).inLane === true;
  const actOut = r.act ? (GENOME.lastJson(r.act.out) || {}) : null;
  $('guardOut').innerHTML = `<p><b>${esc(t.cell)}</b> · ${esc(t.where)} · called ${esc(String(t.checked).slice(0, 10))}<br><span class="small muted">${esc(t.seed.purpose)}</span></p>`
    + `<p>Request: <code>${esc(JSON.stringify(t.input))}</code></p>`
    + step(laneOk, '1 · Lane check' + took(t, 'lane'), `<code>${esc(t.seed.boundary.run)}</code> → <code>${esc(said(r.lane))}</code>`)
    + step(!!actOut && 'output' in actOut, '2 · Act' + took(t, 'act'), r.act ? `<code>${esc(t.seed.act.run)}</code> → <code>${esc(said(r.act))}</code>` : 'never ran: the lane check refused the request')
    + step(d.released, '3 · Judge on the output' + took(t, 'judge'), r.judge ? `<code>${esc(t.seed.judge.run)}</code> → <code>${esc(said(r.judge))}</code>` : 'never ran')
    + `<div class="verdict ${d.released ? 'ok' : 'no'}">${handed(d)}</div>`
    + `<p class="small">Decided again in this tab from the recorded hook outputs, by the same guard code: <b>${same ? 'the same decision' : 'a DIFFERENT decision: ' + esc(again.reason)}</b>. The whole call took ${secs(t.ms.total)}.</p>`;
}
const guardButtons = document.querySelectorAll('[data-guard]');
let guardShown = null;   // the tab last clicked: a slower fetch for an earlier click must not overwrite it
async function showGuard(file) {
  guardShown = file;
  guardButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.getAttribute('data-guard') === file)));
  if (!(file in guardTraces)) guardTraces[file] = await maybe(get(`data/traces/${file}`));
  if (guardShown === file) renderGuard(guardTraces[file]);
}
guardButtons.forEach((b) => b.addEventListener('click', () => showGuard(b.getAttribute('data-guard'))));
await showGuard('guard-withheld.json');
const gw = guardTraces['guard-withheld.json'];
if (gw) {
  const v = (run) => (run ? GENOME.lastJson(run.out) || {} : {});
  $('gdIn').textContent = JSON.stringify(gw.input);
  const ln = v(gw.runs.lane);
  $('gdLane').textContent = ln.inLane === true ? 'took it' : `refused → ${ln.escalate}`;
  $('gdAct').textContent = gw.runs.act ? `made ${JSON.stringify(v(gw.runs.act).output)}` : 'never ran';
  $('gdJudge').textContent = gw.runs.judge ? `said ${v(gw.runs.judge).status}` : 'never ran';
  $('gdOut').textContent = gw.decision.released ? 'released' : `withheld (${gw.decision.status}) → escalated to ${gw.decision.escalate}`;
}
const RESULT = {
  withhold: (x) => `${fmt(x.withheld)} of ${fmt(x.wrong)} wrong totals withheld (${x.share === null ? '—' : x.share + '%'})`,
  release: (x) => `${fmt(x.released)} of ${fmt(x.right)} right totals released (${x.share === null ? '—' : x.share + '%'})`,
  'lane-first': (x) => `${fmt(x.refusedAtLaneEscalatedNoAct)} of ${fmt(x.calls)} refused at the lane and escalated, with the act never run`,
  overhead: (x) => `median guarded call ${secs(x.medianGuardedMs)} against ${secs(x.medianBareActMs)} for the act alone: ${fmt(x.ratio)} times. The guard added ${secs(x.medianOverheadMs)} a call (median of ${fmt(x.calls)} calls, each paired with a bare run of the same act).`,
};
$('guardRows').innerHTML = (gRules && Array.isArray(gRules.rules) ? gRules.rules : []).map((rule) => {
  const x = gMeasure && Array.isArray(gMeasure.results) ? gMeasure.results.find((m) => m.id === rule.id) : null;
  const res = x ? `<span class="${x.pass ? 'yes' : 'noo'}">${x.pass ? 'PASS' : 'FAIL'}</span> · ${esc(RESULT[rule.id] ? RESULT[rule.id](x) : JSON.stringify(x))}` : 'not measured yet';
  return `<tr><td>${esc(rule.what)}</td><td>${esc(rule.pass)}</td><td>${res}</td></tr>`;
}).join('') || '<tr><td colspan="3">The rules could not be loaded.</td></tr>';
const none = gMeasure && gMeasure.observed && Array.isArray(gMeasure.observed.noOutput) ? gMeasure.observed.noOutput : null;
$('guardObserved').textContent = none === null ? '' : none.length === 0 ? 'Every in-lane call made an output, right or wrong.'
  : `Seen, and counted by no rule: ${none.length} in-lane call${none.length === 1 ? '' : 's'} made no output at all, right or wrong. ${none.map((x) => `${x.cell} on ${JSON.stringify(x.input)} took ${fmt(Math.round(x.guardedMs / 1000))} seconds in all, more than the 60-second limit any one hook is given, most likely because the laptop was overloaded; the guard refused it at the ${x.stage} step and released nothing`).join('. ')}.`;
if (gMeasure && gMeasure.machine) {
  const m = gMeasure.machine;
  $('guardMachine').textContent = `Measured on ${String(gMeasure.measured).slice(0, 10)}: ${m.platform}, ${m.cpu}, ${m.threads} threads, ${m.memoryGB} GB memory, Node ${m.node}. Load: ${m.load}. Every call's input, totals and timings are in the file.`;
} else $('guardMachine').textContent = 'The measurement has not been published yet.';

// ── the cost ──
const d = COST.defaults(lock);
const setVal = (id, v) => { $(id).value = String(v); };
setVal('cParts', d.parts); setVal('cNo', (d.noSignalShare * 100).toFixed(1)); setVal('cDead', (d.deadShare * 100).toFixed(1)); setVal('cHours', d.hoursEach); setVal('cRate', d.rate);
const n = (id) => { const v = Number($(id).value); return Number.isFinite(v) ? v : NaN; };
function cost() {
  const c = COST.costCase(lock, { parts: n('cParts'), noSignalShare: n('cNo') / 100, deadShare: n('cDead') / 100, hoursEach: n('cHours'), rate: n('cRate') });
  $('costOut').innerHTML = `<div class="verdict ok"><b>${fmt(c.unknown)}</b> parts nobody can describe × ${fmt(c.hoursEach)} h × £${c.rate.toFixed(2)} = <b>£${c.gbp.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b> a year, spent finding out what they are.</div>`
    + `<p>With the genome, each part's <code>seed.json</code> and birth report answer what it is, whether it works and whether it can be removed. <b>${fmt(c.dead)}</b> parts measurably dead can be retired, reversibly, instead of carried.</p>`;
}
['cParts', 'cNo', 'cDead', 'cHours', 'cRate'].forEach((id) => $(id).addEventListener('input', cost));
cost();
$('costNote').innerHTML = 'Defaults are floors, to be replaced with your own. The shares come from this estate’s first full scan (<a href="https://sjgant80-hub.github.io/estate-metabolism/">the estate metabolism</a>, 17 Nov 2026). The hourly cost is the UK median for all full-time jobs, not an engineer’s rate (<a href="https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/earningsandworkinghours/bulletins/annualsurveyofhoursandearnings/2025">ONS ASHE 2025</a>). The hours are your estimate; the default is one hour a year. Every figure is in <a href="data/prices.lock.json">the price lock</a>.';
})();
