// tools/build-house.mjs — write page/template.html to the AI Native house standard, from page/legacy-template.html (the
// template exactly as it was before the house standard, kept as this build's source) and this repository's records.
// scripts/make-page.mjs then builds index.html from page/template.html exactly as before (kernels and app inlined into
// the template's one module script); neither make-page, the census nor CI is changed.
//   node tools/build-house.mjs           write page/template.html
//   node tools/build-house.mjs --check   exit 1 if page/template.html is not what this script builds
//
// Nothing of the old page is dropped, with one stated exception. Its manifest check ("Try it") is the glass and stays
// open; the rest of "Try it", its first introduction, every other part and its footer are folded behind a click, in
// full. Its styles are kept for its own content only, scoped under .legacy. The exception: the old page's light/dark
// switch is removed, because the house is dark only and the switch could change nothing; page/app.js gets one
// character so it does not stop without it ($('theme').addEventListener -> $('theme')?.addEventListener).
//
// The census changes every morning, so NO census number is written into the page: the receipts carry the same
// data-bind hooks the page script already fills when it loads data/census.json. The gate record (data/gates.json)
// changes only when the gate is re-run, so the parts list reads it here; test/house.test.mjs fails if it drifts.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scope } from '../vendor/house/scope.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8').split('\r\n').join('\n');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const CREDIT = 'Powered by the Konomi architecture, created by Thomas Frumkin.';
const SUPPLIER = '<a href="https://www.ai-nativesolutions.com">AI Native Solutions</a>';

// ---- the old template, taken apart (nothing is thrown away) ------------------------------------------------------
const OLD = read('page/legacy-template.html');
const pick = (re, what) => { const m = OLD.match(re); if (!m) throw new Error('page/legacy-template.html has no ' + what); return m; };
const oldCss = pick(/<style>([\s\S]*?)<\/style>/, 'style sheet')[1];
const title = pick(/<title>([^<]*)<\/title>/, 'title')[1];
const description = pick(/<meta name="description" content="([^"]*)">/, 'description')[1];
const nav = pick(/<nav aria-label="Sections">([\s\S]*?)<\/nav>/, 'contents')[1];
const footer = pick(/<footer>([\s\S]*?)<\/footer>/, 'footer')[1];
const moduleScript = pick(/<script type="module">[\s\S]*?<\/script>/, 'module script')[0];
if (!moduleScript.includes('/*KERNELS*/') || !moduleScript.includes('/*APP*/')) throw new Error('the module script lost its make-page markers');
const mainAt = OLD.indexOf('<main id="top">') + '<main id="top">'.length, footAt = OLD.indexOf('<footer>');
const region = OLD.slice(mainAt, footAt);
const firstH2 = region.search(/<h2 id="/);
const intro = region.slice(0, firstH2).trim();
const starts = [...region.matchAll(/<h2 id="([\w-]+)">/g)].map((m) => ({ id: m[1], at: m.index }));
const parts = starts.map((s, i) => { const html = region.slice(s.at, i + 1 < starts.length ? starts[i + 1].at : region.length).trim(); return { id: s.id, html, title: text((html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/) || [, s.id])[1]) }; });
const tryPart = parts.find((p) => p.id === 'try');
if (!tryPart) throw new Error('the old page has no "try" part');
// the glass is the manifest check: "Try it" up to its first <h3>; the recorded runs and the conductor follow, folded
const cut = tryPart.html.indexOf('<h3');
const GLASS = tryPart.html.slice(0, cut).trim(), TRY_REST = tryPart.html.slice(cut).trim();
// the old contents, as links only: the brand and the light/dark switch are not carried (see the header)
const links = [...nav.matchAll(/<a href="#([\w-]+)">([^<]*)<\/a>/g)].map((m) => [m[1], m[2]]);
if (!/<button[^>]*id="theme"/.test(nav)) throw new Error('the old contents no longer has the light/dark switch this script removes');

// ---- the gate record (changes only when the gate is re-run) ---------------------------------------------------------
const G = JSON.parse(read('data/gates.json'));
const files = Object.entries(G.files || {}).map(([file, v]) => ({ file, killed: v.killed, total: v.total, clean: v.clean === true && v.killed === v.total }));
const ORGANS = [
  ['src/genome.mjs', 'The birth check', 'admits a part as a cell only when all four traits hold, and says which one failed'],
  ['src/guard.mjs', 'The guard', 'checks each output with the cell’s own judge before it is released'],
  ['src/route.mjs', 'The conductor', 'hands work only to an admitted cell whose lane fits, and sends the rest to a named owner'],
  ['src/census.mjs', 'The census', 'counts every public repository each morning: cells, declared parts, and the rest'],
  ['src/drift.mjs', 'Drift', 'names a cell that was admitted before and is refused now, with the trait it lost'],
  ['src/foldcache.mjs', 'The fold-cache', 'reuses a full check only for the same code, the same checker, and under 7 days old'],
  ['src/convert.mjs', 'Conversion', 'ranks the repositories still to convert, and keeps a ledger of each attempt'],
  ['src/cost.mjs', 'The cost case', 'works out the hours saved from your own numbers'],
];
const named = ORGANS.map(([file, nm, line]) => ({ file, nm, line, g: files.find((f) => f.file === file) })).filter((o) => o.g);
const rest = files.filter((f) => !named.some((o) => o.file === f.file));
const restKilled = rest.reduce((a, f) => a + f.killed, 0), restTotal = rest.reduce((a, f) => a + f.total, 0), restClean = rest.every((f) => f.clean);
const row = (i, nm, line, clean, killed, total, title) => `<div class="srow${clean ? '' : ' red'}"${title ? ` title="${esc(title)}"` : ''}><div class="d">${String(i).padStart(2, '0')}</div><div class="nm"><b>${esc(nm)}</b><span>${esc(line)}</span>${clean ? `<span class="tag cy">${fmt(killed)} of ${fmt(total)} breaks caught</span>` : `<span class="tag rd">${fmt(killed)} of ${fmt(total)} caught</span>`}</div></div>`;
const partsHtml = named.map((o, i) => row(i + 1, o.nm, o.line, o.g.clean, o.g.killed, o.g.total, o.file)).join('')
  + (rest.length ? row(named.length + 1, `${rest.length} more files`, 'the hooks a new cell is grown with, the runner, and the worked examples', restClean, restKilled, restTotal, rest.map((f) => f.file).join(', ')) : '');

// ---- the house layer -----------------------------------------------------------------------------------------------
// receipts: the census figures are bound, not written, so the morning census never makes the page stale
const bound = (key, cls) => `<span class="${cls}" data-bind="${key}">…</span>`;
const ofBound = (a, b, cls) => `${bound(a, cls)}<span class="was" style="font-size:.42em"> of <span data-bind="${b}">…</span></span>`;
const receipts = [
  { n: ofBound('census.admitted', 'census.live', 'now'), lab: 'public repositories, not archived, that carry the genome and pass its birth check. Counted again every morning.', src: 'data/census.json', what: 'the morning census' },
  { n: ofBound('gates.killed', 'gates.total', 'now'), lab: 'planted breaks in its own code that its tests caught.', src: 'data/gates.json', what: 'the test of the tests' },
  { n: bound('census.genomeLess', 'bad'), lab: 'public repositories, not archived, that do not carry the genome yet. Shown in red: most of the estate is not converted.', src: 'data/census.json', what: 'the morning census' },
];
const receiptsHtml = receipts.map((r) => `<div class="stat reveal"><div class="n">${r.n}</div><div class="lab">${esc(r.lab)}</div><a class="src" href="${r.src}">receipt: ${esc(r.what)} ↗</a></div>`).join('');

const ROLES = [
  ['Chief executive', 'You know what you own. Only parts that prove what they do, and what they will not do, receive work.'],
  ['Finance', 'Parts nobody can describe cost hours every year. The genome turns that hunt into reading a file.', ['business', 'Work out the saving from your own numbers']],
  ['Operations', 'Work a part should not take goes to a named owner, not half-done. A failed check names what is missing.'],
  ['Technology', 'One file and one CI step per repository. The hooks are commands, so any language fits. No service to run.'],
  ['Security', 'A part must show it turns away work outside its lane, and that its judge is not a rubber stamp, before anything calls it.'],
  ['The teams', 'One command grows the files and names the three answers only the team can write. CI keeps them honest.'],
];
const rolesHtml = ROLES.map(([r, l, link]) => `<div class="act reveal"><b>${esc(r)}</b><p>${esc(l)}${link ? ` <a href="#${link[0]}">${esc(link[1])}</a>.` : ''}</p></div>`).join('');

const walk = (() => { try { return JSON.parse(read('data/walk-house.json')); } catch { return null; } })();
const walkHtml = !walk ? '<p>No buyer walk is recorded for this version of the page.</p>' : (() => {
  const fixed = walk.points.filter((x) => x.outcome === 'fixed').length, kept = walk.points.length - fixed;
  const head = `<p>A local AI model (${esc(walk.model)}) read this page cold as ${walk.buyers.length} buyers, part by part: ${walk.readings} readings. It is a first check, not a customer's opinion. Kar checked each point it raised against the page.</p>`
    + `<p>It read the page as it was before the fixes below.</p>`
    + `<p>${walk.points.length === 0 ? 'It raised no point that needed a change.' : `It raised ${walk.points.length} points. ${fixed} ${fixed === 1 ? 'was' : 'were'} fixed on this page, and ${kept} ${kept === 1 ? 'was' : 'were'} not changed, each for the reason given.`}</p>`;
  const list = walk.points.map((x) => `<li><b>${x.outcome === 'fixed' ? 'Fixed' : 'Not changed'}.</b> ${esc(x.point)} <span class="muted">${esc(x.why)}</span></li>`).join('');
  return head + (list ? `<ul class="walk">${list}</ul>` : '') + '<p><a class="src" href="data/walk-house-raw.json">receipt: every reading, word for word ↗</a></p>';
})();

const fold = (summary, body, id) => `<details class="fold"${id ? ` id="${id}"` : ''}><summary>${esc(summary)}</summary><div class="legacy">${body}</div></details>`;
const introHtml = intro.replace(/<h1>([\s\S]*?)<\/h1>/, '<p><b>$1</b></p>');
const folds = [fold('The original introduction', introHtml, 'fold-intro')]
  .concat(parts.map((p) => (p.id === 'try' ? fold('Try it: the recorded runs and the conductor', TRY_REST, 'fold-try') : fold(p.title, p.html, 'fold-' + p.id))))
  .concat([fold('The original footer', `<p>${footer.trim().replace(/^<p>|<\/p>$/g, '')}</p>`, 'fold-footer')]).join('\n');
const jump = links.map(([id, t]) => `<a href="#${id}">${esc(t)}</a>`).join('');

function inline(ns, file) {
  const src = read(file);
  const names = [...src.matchAll(/^export (?:async )?(?:function|const|let|class) (\w+)/gm)].map((x) => x[1]);
  const code = src.split('\n').filter((l) => !l.startsWith('export default ')).map((l) => l.replace(/^export /, '')).join('\n').trim();
  return `// ${file}, inlined byte for byte (export removed)\nconst ${ns} = (() => {\n${code}\nreturn { ${names.join(', ')} };\n})();`;
}

const LEGACY_DARK = '.legacy{--bg:transparent;--panel:#081320;--ink:#e9f2f6;--muted:#aebecb;--line:rgba(174,190,203,.18);--accent:#49e8c8;--accent-ink:#02070c;--ok:#49e8c8;--ok-bg:rgba(73,232,200,.12);--no:#ff6b6b;--no-bg:rgba(255,107,107,.12);--warn:#ffcf6a;--chip:rgba(174,190,203,.1);--code:#060e18;--series:#49e8c8;color:var(--ink)}';
const LOCAL_CSS = `
@media(max-width:760px){.hero .hero-in{padding-bottom:108px}}
.jump{display:flex;flex-wrap:wrap;gap:6px 8px;padding:18px 0 4px}
.jump a{display:inline-flex;align-items:center;min-height:36px;padding:0 12px;border:1px solid rgba(174,190,203,.18);border-radius:999px;color:var(--soft);text-decoration:none;font:500 .88rem var(--mono,'JetBrains Mono',monospace)}
.jump a:hover,.jump a:focus-visible{color:var(--cyan);border-color:var(--cyan)}
.steps-now{margin:0;padding-left:1.2em;color:var(--soft)}.steps-now li{margin:.35em 0}
.glass .legacy h2{margin-top:0}
.glass .legacy textarea{max-width:100%}
details.fold{border:1px solid rgba(174,190,203,.14);border-radius:12px;margin:10px 0;background:rgba(8,19,32,.6)}
details.fold>summary{padding:14px 16px;cursor:pointer;font-weight:600;min-height:44px;display:flex;align-items:center}
details.fold>.legacy{padding:0 16px 16px;overflow-x:auto}
details.fold>.legacy>h2:first-child{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.legacy .card,.legacy .tbl{overflow-x:auto}
.acts .act b{display:block;color:var(--ink);margin-bottom:.3em}
.acts .act p{margin:0;color:var(--soft)}
ul.walk li{margin:.4em 0}
`;
const policy = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'";

const template = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${policy}">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title}</title>
<meta name="description" content="${description}">
<style>
${read('vendor/house/house.css').trim()}
/* the old page's own styles, for its own content only (scope() from the house standard) */
${scope(oldCss)}
${LEGACY_DARK}
${LOCAL_CSS.trim()}
</style>
</head>
<body>
<main id="top">
<header class="hero" id="hero">
  <canvas id="crystal" role="img" aria-label="A crystal of faces. Each lit face is one of this build's records: cyan when it holds, red when it is not there yet and is kept in view."></canvas>
  <div class="hero-shade"></div>
  <div class="wrap hero-in">
    <p class="eyebrow reveal">A birth check for software parts</p>
    <h1>No part is trusted until it proves <em>what it is.</em></h1>
    <p class="lede reveal">Estate Genome checks each piece of software before it is given work. It must say what it does, check its own answers, be safe to remove, and turn away work it should not do.</p>
  </div>
  <p class="facet" id="facet" aria-live="polite">Reading the morning census.</p>
</header>

<div class="wrap"><nav class="jump" aria-label="On this page">${jump}</nav></div>

<section class="pad" id="result">
  <div class="wrap">
    <p class="kline reveal">Measured, not claimed</p>
    <h2 class="claim reveal">Read from its own records. <b>Each number has its source one click away.</b></h2>
    <div class="stats">${receiptsHtml}</div>
  </div>
</section>

<section class="pad alt" id="start-now">
  <div class="wrap">
    <p class="kline reveal">Start here</p>
    <h2 class="claim reveal">Three steps. <b>No sign-up.</b></h2>
    <ol class="steps-now reveal">
      <li>Press one of the examples in the box below.</li>
      <li>Press <b>Check this manifest</b>. It runs here, in your browser.</li>
      <li>Read the answer. It says which of the four traits hold, and why.</li>
    </ol>
    <p class="sub reveal">The full guide is in <a href="#start">Start here</a>, further down.</p>
  </div>
</section>

<section class="pad proof" id="glass-wrap">
  <div class="wrap">
    <p class="kline reveal">Try it: it runs here, on your machine</p>
    <div class="glass"><div class="legacy">${GLASS}</div></div>
  </div>
</section>

<section class="pad" id="parts">
  <div class="wrap">
    <p class="kline reveal">How it is built</p>
    <h2 class="claim reveal">Small files, one job each. <b>Each one tested by breaking it.</b></h2>
    <div class="stack reveal">${partsHtml}</div>
  </div>
</section>

<section class="pad alt" id="who">
  <div class="wrap">
    <p class="kline reveal">Who it is for</p>
    <h2 class="claim reveal">One check. <b>Something for each role.</b></h2>
    <div class="acts">${rolesHtml}</div>
  </div>
</section>

<section class="pad" id="said">
  <div class="wrap">
    <p class="kline reveal">Said straight</p>
    <h2 class="claim reveal">What it does not claim. <b>What can go wrong.</b></h2>
    <details class="honest reveal"><summary>What it does not claim</summary><div class="in">
      <p>It makes parts check themselves. It does not make them clever, and it does not say it does.</p>
      <p>A judge that passes can tell its own good and bad cases apart. That does not prove it catches every wrong answer.</p>
      <p>The check on this page covers the manifest only. The other three traits need the part's own code, so they run on the command line and in CI.</p>
      <p>No outside organisation uses it yet. Every cell is this estate's own.</p></div></details>
    <details class="honest reveal"><summary>What can go wrong</summary><div class="in">
      <p>Drift is caught once a day, by the census, on public repositories only. A part can change between two censuses.</p>
      <p>A reused check can be up to seven days old. A new commit, or new checking code, always forces a fresh one.</p>
      <p>The guard is only as strong as each cell's judge. A judge that checks loosely lets loose answers through.</p></div></details>
    <details class="honest reveal"><summary>Your data, who owns it, and support</summary><div class="in">
      <p>It runs on your own machines. It is open code under the MIT licence, with nothing else to install and no service to run.</p>
      <p>This page reads only its own site's files. It sends nothing anywhere.</p>
      <p>It is supplied by ${SUPPLIER}. Support is agreed per deployment, in each deployment's agreement.</p>
      <p>It is built and kept by Kar, an AI. It has one human owner, Simon Gant.</p></div></details>
    <details class="honest reveal"><summary>What changed on this page</summary><div class="in">
      <p>This page was rebuilt to the house standard. Every part of the old page is below, one click away.</p>
      <p>One thing was taken out: the switch between light and dark. This page is dark only, so the switch could change nothing. The page script changed by one character so it does not stop without it.</p>
      <p>The census figures are still read fresh each time the page opens. The census, the checks and their records were not changed.</p></div></details>
    <details class="honest reveal"><summary>What a buyer walk found, and what was done</summary><div class="in">
      ${walkHtml}</div></details>
  </div>
</section>

<section class="pad alt" id="full">
  <div class="wrap">
    <p class="kline reveal">Every detail is still here</p>
    <h2 class="claim reveal">Every part in full. <b>One click opens each.</b></h2>
${folds}
  </div>
</section>

<footer>
  <div class="wrap frow">
    <div><div class="brand">Estate Genome</div><div class="fnote">Built by Kar · MIT licence (holder Simon Gant) · supplied by ${SUPPLIER}<br>${CREDIT}</div></div>
    <div class="taglist"><span>›</span> No part is trusted until it proves itself.<br><span>›</span> Checked again every morning.</div>
  </div>
</footer>
</main>
${moduleScript}
<script>
// after the page's words and its module script: the house kit and layer. They draw; they are not text to read.
${inline('CRYSTAL', 'vendor/house/crystal.js')}

${inline('HOUSE', 'vendor/house/house.js')}

// the crystal, lit by this site's own records, read when the page opens (the census changes every morning)
(async () => {
  const $ = (id) => document.getElementById(id);
  const get = (u) => fetch(u, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const [census, gates] = await Promise.all([get('data/census.json'), get('data/gates.json')]);
  const fmt = (n) => Number(n).toLocaleString('en-GB');
  const faces = [], labels = [];
  if (gates && gates.files) for (const [f, v] of Object.entries(gates.files)) { faces.push(v.clean === true); labels.push(f + ' · ' + v.killed + ' of ' + v.total + ' breaks caught'); }
  if (census) {
    faces.push(census.admitted > 0); labels.push(fmt(census.admitted) + ' cells admitted');
    faces.push(census.genomeLess === 0); labels.push(fmt(census.genomeLess) + ' repositories without the genome yet · kept in red');
    $('facet').textContent = fmt(census.admitted) + ' cells admitted · ' + fmt(census.genomeLess) + ' repositories still without it · point at the crystal';
  }
  const crystal = CRYSTAL.mount($('crystal'), { energy: 0.9 });
  if (crystal && faces.length) {
    crystal.setFaces(Array.from({ length: CRYSTAL.FACES }, (_, i) => (faces[i % faces.length] ? 1 : 3)));
    crystal.onHover((i) => { $('facet').textContent = labels[i % labels.length]; });
    HOUSE.bindScroll(crystal, 0.9);
  }
})();
(() => {
  const openTo = (id) => { const t = document.getElementById(id); if (!t) return false; for (let e = t; e; e = e.parentElement) if (e.tagName === 'DETAILS') e.open = true; t.scrollIntoView({ block: 'start' }); return true; };
  document.addEventListener('click', (e) => { const a = e.target.closest && e.target.closest('a[href^="#"]'); if (!a) return; const id = decodeURIComponent(a.getAttribute('href').slice(1)); if (id && openTo(id)) { e.preventDefault(); history.replaceState(null, '', '#' + id); } });
  if (location.hash) openTo(decodeURIComponent(location.hash.slice(1)));
  HOUSE.reveal(document);
  HOUSE.light(document);
})();
</script>
</body>
</html>
`;

export function build() { return template; }
// the one-character change the page script needs once the switch is gone, held by test/house.test.mjs
export const APP_FROM = "$('theme').addEventListener(";
export const APP_TO = "$('theme')?.addEventListener(";

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const out = join(ROOT, 'page/template.html');
  if (process.argv.includes('--check')) {
    if (readFileSync(out, 'utf8') !== template) { console.error('page/template.html is not what tools/build-house.mjs builds; run node tools/build-house.mjs, then node scripts/make-page.mjs'); process.exit(1); }
    console.log('page/template.html is what tools/build-house.mjs builds');
  } else { writeFileSync(out, template); console.log(`wrote page/template.html · ${receipts.length} receipts · ${named.length + (rest.length ? 1 : 0)} parts rows · ${parts.length} old parts folded (+ the rest of Try it)`); }
}
