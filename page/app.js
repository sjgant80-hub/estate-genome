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
