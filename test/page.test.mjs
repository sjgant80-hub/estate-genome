// The live page: it is exactly the build of its template and the gated kernels, its script parses, its links resolve,
// it holds no credential, and when its script RUNS against the shipped data every figure and panel fills correctly.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import { build, body, KERNELS } from '../scripts/make-page.mjs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const html = read('index.html').split('\r\n').join('\n');
const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];

test('index.html is exactly the build of page/template.html, page/app.js and the kernels', () => {
  assert.equal(html, build(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')));
});

test('each kernel is inlined byte for byte (export removed), so the page runs the gated code', () => {
  for (const [, file] of KERNELS) assert.ok(script.includes(body(read(file))), file);
});

test('the page script parses, every local link resolves, and no credential is committed', () => {
  assert.doesNotThrow(() => new vm.Script(script));
  for (const m of html.matchAll(/(?:href|src)="(?!https?:|data:|mailto:|#|\/\/)([^"?#]+)/g)) assert.ok(existsSync(new URL(`../${m[1]}`, import.meta.url)), `dead link: ${m[1]}`);
  assert.equal(/(sk-ant-[A-Za-z0-9-]{20,}|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/.test(html), false);
  assert.equal(/[◊κφ]/.test(html), false, 'no private shorthand on a public page');
});

// a stand-in DOM: every element with an id or a data-* hook, built from the page's own markup
function dom() {
  const els = [];
  for (const m of html.matchAll(/<([a-z0-9]+)((?:\s+[a-z-]+(?:="[^"]*")?)*)\s*\/?>/g)) {
    const attrs = {};
    for (const a of m[2].matchAll(/([a-z-]+)(?:="([^"]*)")?/g)) attrs[a[1]] = a[2] === undefined ? '' : a[2];
    if (!('id' in attrs) && !Object.keys(attrs).some((k) => k.startsWith('data-'))) continue;
    const el = {
      tag: m[1], attrs, textContent: '', innerHTML: '', value: '', listeners: {}, child: null,
      getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }, setAttribute(k, v) { this.attrs[k] = String(v); },
      addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); },
      fire(t) { for (const f of this.listeners[t] || []) f({}); },
      click() { this.fire('click'); },
      querySelector() { return this.child || (this.child = { innerHTML: '' }); },
    };
    if (m[1] === 'textarea' || m[1] === 'input') {
      const v = attrs.value; el.value = v === undefined ? '' : v;
    }
    els.push(el);
  }
  const rootAttrs = {};
  return {
    els,
    document: {
      getElementById: (id) => els.find((e) => e.attrs.id === id) || null,
      querySelectorAll: (sel) => {
        const m = sel.match(/^\[([a-z-]+)(?:="([^"]*)")?\]$/);
        return m ? els.filter((e) => m[1] in e.attrs && (m[2] === undefined || e.attrs[m[1]] === m[2])) : [];
      },
      documentElement: { getAttribute: (k) => (k in rootAttrs ? rootAttrs[k] : null), setAttribute: (k, v) => { rootAttrs[k] = v; } },
    },
  };
}
const files = (u) => {
  const p = new URL(`../${String(u).replace(/^\//, '_absolute_/')}`, import.meta.url);
  return existsSync(p) ? { ok: true, status: 200, json: async () => JSON.parse(readFileSync(p, 'utf8')), text: async () => readFileSync(p, 'utf8') } : { ok: false, status: 404 };
};

// runPage(swap) → the stand-in DOM after the page script has run; swap replaces a data file's JSON with a stand-in
async function runPage(swap = {}) {
  const d = dom();
  const fetch = async (u) => (u in swap ? { ok: true, status: 200, json: async () => swap[u], text: async () => JSON.stringify(swap[u]) } : files(u));
  const box = { document: d.document, fetch, localStorage: { getItem: () => null, setItem() {} }, matchMedia: () => ({ matches: false }), console, URL, Promise, JSON, Math, Number, String, Date, Object, Array, Set, Map };
  vm.createContext(box);
  const runnable = script.replace('(async () => {', 'globalThis.__run = (async () => {');
  vm.runInContext(runnable, box);
  await box.__run;
  return d;
}

test('run the page: every figure and panel fills from the shipped data, and the controls work', async () => {
  const d = await runPage();
  const $ = (id) => d.document.getElementById(id);
  const census = JSON.parse(read('data/census.json')), gates = JSON.parse(read('data/gates.json'));
  const bound = (k) => d.document.querySelectorAll(`[data-bind="${k}"]`).map((e) => e.textContent);
  for (const k of ['scanned', 'live', 'declared', 'admitted', 'genomeLess']) for (const v of bound(`census.${k}`)) assert.equal(v, census[k].toLocaleString('en-GB'), k);
  assert.deepEqual([...new Set(bound('gates.killed'))], [gates.killed.toLocaleString('en-GB')]);
  for (const e of d.els.filter((x) => 'data-bind' in x.attrs)) assert.notEqual(e.textContent, '', `unfilled: ${e.attrs['data-bind']}`);
  assert.equal(bound('describe.count')[0], '22');
  for (const c of census.cells) assert.ok($('cellRows').innerHTML.includes(c.name));
  const rows = $('bpTbl').child.innerHTML.split('<tr>').length - 1;
  assert.equal(rows, 21);
  // cells over time: one dot per census day, traced from the shipped history; the table view holds the same numbers
  const pts = (() => { const by = new Map(); for (const r of JSON.parse(read('data/census-history.json')).rows) { const p = by.get(r.day) || { day: r.day, cells: 0, declared: 0 }; p.declared += 1; if (r.verdict === 'cell') p.cells += 1; by.set(r.day, p); } return [...by.values()].sort((a, b) => a.day.localeCompare(b.day)); })();
  const chart = $('cellChart').innerHTML;
  assert.equal(chart.split('<circle class="dot"').length - 1, pts.length);
  assert.match(chart, /<path class="ln" d="M[\d.]+ [\d.]+/);
  assert.ok(chart.includes(`>${pts[pts.length - 1].cells} cells</text>`));
  for (const p of pts) assert.ok(chart.includes(`<tr><td>${p.day}</td><td class="num">${p.cells}</td><td class="num">${p.declared}</td></tr>`), p.day);
  // the worklist's counts and the ledger
  const conv = JSON.parse(read('data/convert.json'));
  assert.ok($('queueRows').innerHTML.includes(`<b>${conv.queue.ranked.toLocaleString('en-GB')}</b>`));
  assert.equal($('queueRows').innerHTML.split('<tr>').length - 1, 7);
  assert.match($('queueNote').textContent, new RegExp(`${conv.queue.publicRanked.toLocaleString('en-GB')} of the ranked repositories are public`));
  assert.equal($('ledgerRows').innerHTML.split('<tr>').length - 1, Math.max(conv.attempts.filter((a) => a && a.private === false).length, 1));
  // the fold-cache: the latest census's reuse, and the measurement against its rules (before it runs: said so)
  assert.match($('cacheOut').innerHTML || $('cacheOut').textContent, census.cache && census.cache.on ? new RegExp(`had ${census.cache.checked} declaring`) : /ran before the fold-cache existed/);
  const cr = JSON.parse(read('data/foldcache-rules.json'));
  assert.equal($('cacheRows').innerHTML.split('<tr>').length - 1, cr.rules.length);
  if (existsSync(new URL('../data/foldcache-measure.json', import.meta.url))) {
    const cm = JSON.parse(read('data/foldcache-measure.json'));
    for (const r of cm.results) assert.ok($('cacheRows').innerHTML.includes(`<span class="${r.pass ? 'yes' : 'noo'}">${r.pass ? 'PASS' : 'FAIL'}</span>`), r.id);
    assert.match($('cacheNote').innerHTML, /Measured on GitHub's runner: the cold census is commit/);
  } else {
    assert.match($('cacheRows').innerHTML, /not measured yet/);
    assert.equal($('cacheNote').innerHTML, 'The two census runs this judges have not been made yet.');
  }
  // drift: the four questions, and the shipped history worked out by the inlined kernel
  for (const e of d.document.querySelectorAll('[data-q]')) assert.match(e.textContent, /\?$/, e.attrs['data-q']);
  const hist = JSON.parse(read('data/census-history.json'));
  const days = new Set(hist.rows.map((r) => r.day)).size;
  assert.match($('driftOut').innerHTML, new RegExp(`^<div class="verdict ok">No drift: .*\\(${days} census days? up to `));
  for (const f of Object.keys(gates.files)) assert.ok($('bpTbl').child.innerHTML.includes(`${gates.files[f].killed}/${gates.files[f].total} clean`), f);
  assert.match($('seedOut').innerHTML, /Trait 1 holds/);
  assert.match($('traceOut').innerHTML, /the same verdict/);
  assert.equal($('dgVerdict').textContent, 'ADMITTED: a cell (4 of 4)');
  assert.equal($('dgOut').textContent, 'refused → kar');
  // routing: the kernel's own route() on the shipped index with the page's demo request. Since the census admitted
  // browser-swarm (it honestly declares a documents lane too), two cells fit this request at 100% and route() breaks
  // the tie by name, so the test no longer hard-codes one name. It asserts what must stay true instead.
  const { route } = await import('../src/route.mjs');
  const demo = d.document.getElementById('need').attrs.value;
  const rr = route(JSON.parse(read('data/genome-index.json')), { need: demo });
  assert.equal(rr.status, 'routed', 'the demo request is routed');
  const top = rr.candidates.filter((c) => c.score === rr.candidates[0].score).map((c) => c.name);
  assert.ok(top.includes('docdecdemo'), 'the document-answering cell is among the best fits for a documents question: ' + top.join(', '));
  assert.ok($('routeOut').innerHTML.includes(`Routed to <code>${rr.cell}</code>`), 'the page shows the choice route() made');
  if (top.length > 1) assert.match($('routeOut').innerHTML, /Ranked: /, 'a tie is shown to the visitor');
  assert.match($('routeTraces').innerHTML, /its own lane check took the input/);
  assert.match($('costOut').innerHTML, /£3,245\.55/);
  // the guard: the drifted call shown first, decided again here; the diagram from it; the measurement against its rules
  assert.match($('guardOut').innerHTML, /the same decision/);
  assert.match($('guardOut').innerHTML, /Withheld \(unverified\): its judge said unverified, so the output is withheld\. Escalated to <code>kar<\/code>/);
  assert.equal($('gdIn').textContent, '{"sum":[70,45]}');
  assert.equal($('gdLane').textContent, 'took it');
  assert.equal($('gdAct').textContent, 'made {"sum":[70,45],"claim":116}');
  assert.equal($('gdJudge').textContent, 'said unverified');
  assert.equal($('gdOut').textContent, 'withheld (unverified) → escalated to kar');
  const gm = JSON.parse(read('data/guard-measure.json')), gr = JSON.parse(read('data/guard-rules.json'));
  assert.equal($('guardRows').innerHTML.split('<tr>').length - 1, gr.rules.length);
  for (const r of gm.results) assert.ok($('guardRows').innerHTML.includes(`<span class="${r.pass ? 'yes' : 'noo'}">${r.pass ? 'PASS' : 'FAIL'}</span>`), r.id);
  assert.match($('guardRows').innerHTML, new RegExp(`${gm.results[0].withheld} of ${gm.results[0].wrong} wrong totals withheld`));
  assert.match($('guardMachine').textContent, /^Measured on \d{4}-\d{2}-\d{2}: /);
  const none = gm.observed.noOutput;
  assert.match($('guardObserved').textContent, none.length === 0 ? /^Every in-lane call made an output/ : new RegExp(`^Seen, and counted by no rule: ${none.length} in-lane call`));
  assert.match($('guardRows').innerHTML, /the act alone: \d+(\.\d)? times/);
  // the controls
  const preset = (p) => { d.document.querySelectorAll(`[data-preset="${p}"]`)[0].click(); return $('seedOut').innerHTML; };
  assert.match(preset('bluff'), /Trait 1 holds/);
  assert.match(preset('fresh'), /2 things to fix/);
  assert.match(preset('broken'), /not valid JSON/);
  $('seedIn').value = '{}'; $('checkSeed').click();
  assert.match($('seedOut').innerHTML, /22 things to fix/);
  d.document.querySelectorAll('[data-trace="birth-bluffing-judge.json"]')[0].click();
  await new Promise((r) => setTimeout(r, 50));
  assert.match($('traceOut').innerHTML, /NOT ADMITTED: a part/);
  assert.match($('traceOut').innerHTML, /the judge called the known-bad case verified/);
  assert.match($('traceOut').innerHTML, /the same verdict/);
  d.document.querySelectorAll('[data-need="book me a flight to Lisbon"]')[0].click();
  assert.match($('routeOut').innerHTML, /Refused: no admitted cell/);
  $('cParts').value = '2000'; $('cParts').fire('input');
  assert.match($('costOut').innerHTML, /<b>660<\/b> parts/);
  d.document.querySelectorAll('[data-trace="birth-drifted-act.json"]')[0].click();
  await new Promise((r) => setTimeout(r, 50));
  assert.match($('traceOut').innerHTML, /ADMITTED: a cell/);
  const guardCall = async (file) => {
    d.document.querySelectorAll(`[data-guard="${file}"]`)[0].click();
    await new Promise((r) => setTimeout(r, 50));
    assert.match($('guardOut').innerHTML, /the same decision/, file);
    assert.equal(d.document.querySelectorAll(`[data-guard="${file}"]`)[0].getAttribute('aria-pressed'), 'true');
    return $('guardOut').innerHTML;
  };
  assert.match(await guardCall('guard-released.json'), /Released: <code>\{&quot;sum&quot;:\[70,45\],&quot;claim&quot;:115\}<\/code>/);
  const refused = await guardCall('guard-refused.json');
  assert.match(refused, /never ran: the lane check refused the request/);
  assert.match(refused, /Withheld \(refused\): out of lane/);
  assert.match(await guardCall('guard-own.json'), /Released: <code>\{&quot;part&quot;:&quot;examples\/sum-checker&quot;,&quot;verdict&quot;:&quot;cell&quot;/);
});

test('run the page on a drifted history: the drifted cell is named, with the trait it lost and its question', async () => {
  const rows = [
    { day: '2026-11-20', repo: 'docdecdemo', verdict: 'cell', failing: [] },
    { day: '2026-11-21', repo: 'docdecdemo', verdict: 'part', failing: ['boundary'] },
    { day: '2026-11-21', repo: 'estate-genome', verdict: 'cell', failing: [] },
  ];
  const d = await runPage({ 'data/census-history.json': { rows } });
  const out = d.document.getElementById('driftOut').innerHTML;
  assert.match(out, /^<div class="verdict no">1 drifted \(2 census days up to 2026-11-21, 2 repositories watched\)/);
  assert.match(out, /<b>docdecdemo<\/b><\/a>: admitted 2026-11-20, refused since 2026-11-21\. <b>boundary<\/b>: does it still stay in its lane\? No\./);
  assert.equal(out.includes('estate-genome'), false);
});

test('run the page on a ledger with attempts: public ones listed, private and malformed ones never shown', async () => {
  const conv = JSON.parse(read('data/convert.json'));
  conv.attempts = [
    { repo: 'kar-veil', private: false, outcome: 'admitted', day: '2026-11-21' },
    { repo: 'break-it', private: false, outcome: 'escalated', reason: 'its tests need a browser', day: '2026-11-21' },
    { repo: 'hidden-thing', private: true, outcome: 'admitted', day: '2026-11-21' },
    { repo: 'no-flag', outcome: 'admitted', day: '2026-11-21' },
  ];
  const d = await runPage({ 'data/convert.json': conv });
  const rows = d.document.getElementById('ledgerRows').innerHTML;
  assert.equal(rows.split('<tr>').length - 1, 2);
  assert.match(rows, /break-it<\/a><\/td><td><span class="noo">escalated<\/span><\/td><td>its tests need a browser/);
  assert.equal(rows.includes('hidden-thing') || rows.includes('no-flag'), false);
  assert.equal(d.document.getElementById('ledgerNote').textContent.startsWith('1 admitted, 1 escalated.'), true);
});

test('run the page with one census day and with none: the chart still says what it shows', async () => {
  const one = await runPage({ 'data/census-history.json': { rows: [{ day: '2026-11-21', repo: 'a', verdict: 'cell', failing: [] }] } });
  assert.equal(one.document.getElementById('cellChart').innerHTML.split('<circle class="dot"').length - 1, 1);
  const none = await runPage({ 'data/census-history.json': { rows: [] } });
  assert.equal(none.document.getElementById('cellChart').innerHTML, '<p>No census has been recorded yet.</p>');
});
