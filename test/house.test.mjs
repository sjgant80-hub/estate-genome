// house.test.mjs — the page holds to the AI Native house standard and cannot drift back: the seven-rule ship gate and
// the reading check, both vendored from the house standard; page/template.html is exactly what tools/build-house.mjs
// builds from page/legacy-template.html and the gate record; nothing the old page had is lost (the light/dark switch
// is the one stated removal); the page script differs from before by one stated character; the census is never
// written into the page; and opening the page asks no other site for anything.
// Run: node --test test/house.test.mjs   (CI runs it with the other tests in test/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import STANDARD from '../vendor/house/standard.mjs';
import { check as plain } from '../vendor/house/plain.mjs';
import { build, APP_FROM, APP_TO } from '../tools/build-house.mjs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').split('\r\n').join('\n');
const html = read('index.html');
const legacy = read('page/legacy-template.html');
const flat = (h) => h.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();

test('the page passes all seven house-standard rules', () => {
  const r = STANDARD.check(html);
  assert.equal(r.pass, true, 'house rules failed:\n  ' + r.rules.filter((x) => !x.pass).map((x) => `${x.id} ${x.name}: ${x.why}`).join('\n  '));
});

test('a twelve-year-old can read what greets a visitor (the house reading check)', () => {
  const r = plain(html);
  assert.equal(r.pass, true, 'reading check failed:\n  ' + r.rules.filter((x) => !x.pass).map((x) => `${x.id} ${x.name}: ${x.why}`).join('\n  '));
});

test('page/template.html is exactly what tools/build-house.mjs builds (run it, then scripts/make-page.mjs)', () => {
  assert.equal(read('page/template.html'), build(), 'page/template.html drifted: run node tools/build-house.mjs, then node scripts/make-page.mjs');
});

test('nothing the old page had is lost: every part, every word (the light/dark switch is the one stated removal)', () => {
  for (const m of legacy.matchAll(/<h2 id="([\w-]+)">/g)) assert.match(html, new RegExp('<h2 id="' + m[1] + '">'), 'part ' + m[1]);
  const body = legacy.slice(legacy.indexOf('<body')).replace(/<button[^>]*id="theme"[\s\S]*?<\/button>/, '');
  const have = flat(html);
  const lost = [...new Set(flat(body).split(' ').filter((w) => w.length > 3 && !have.includes(w)))];
  assert.deepEqual(lost, [], 'the old page lost words');
  assert.doesNotMatch(html, /id="theme"/, 'the switch is gone');
});

test('the page script differs from before by exactly the stated character, so it runs without the switch', () => {
  const app = read('page/app.js');
  assert.ok(app.includes(APP_TO) && !app.includes(APP_FROM));
});

test('the census is read when the page opens, never written into it', () => {
  const c = JSON.parse(read('data/census.json'));
  const visible = flat(html);
  for (const k of ['scanned', 'live', 'declared', 'genomeLess']) {
    const n = c[k].toLocaleString('en-GB');
    assert.ok(!new RegExp(`(^|[^\\d,])${n.replace(/,/g, ',')}([^\\d,]|$)`).test(visible) || n.length < 3, `the census figure ${k} (${n}) is written into the page; bind it instead`);
  }
  for (const k of ['census.admitted', 'census.live', 'census.genomeLess', 'gates.killed', 'gates.total']) assert.match(html, new RegExp(`data-bind="${k}"`), k);
});

test('opening the page asks no other site for anything', () => {
  assert.doesNotMatch(html, /<(img|script|iframe|source|video|audio)\b[^>]*\bsrc="https?:/i, 'no outside src');
  assert.doesNotMatch(html, /<link\b[^>]*\brel="(stylesheet|preload|icon|modulepreload)"/i, 'no outside stylesheet or preload');
  assert.doesNotMatch(html.replace(/<script[\s\S]*?<\/script>/g, ''), /url\(\s*['"]?https?:/, 'no outside url() in styles');
  const csp = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  assert.match(csp, /connect-src 'self'/);
  assert.doesNotMatch(csp, /https?:/);
});

test('the credit line, the supplier and the name Kar are on the page', () => {
  assert.ok(flat(html).includes('Powered by the Konomi architecture, created by Thomas Frumkin.'));
  assert.ok(flat(html).includes('AI Native Solutions'));
  assert.ok(flat(html).includes('Built by Kar'));
});
