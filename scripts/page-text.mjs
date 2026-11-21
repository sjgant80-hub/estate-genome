// page-text.mjs — what a cold reader of the live page sees, as plain text: the page script RUN against the shipped data
// (the same stand-in DOM as test/page.test.mjs), every filled element written back into the markup, then the markup
// stripped. Used for the buyer-persona walk.   node scripts/page-text.mjs <out.txt>
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('..', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
let html = read('index.html').split('\r\n').join('\n');
const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
const els = [];
for (const m of html.matchAll(/<([a-z0-9]+)((?:\s+[a-z-]+(?:="[^"]*")?)*)\s*\/?>/g)) {
  const attrs = {};
  for (const a of m[2].matchAll(/([a-z-]+)(?:="([^"]*)")?/g)) attrs[a[1]] = a[2] === undefined ? '' : a[2];
  if (!('id' in attrs) && !('data-bind' in attrs)) continue;
  els.push({ at: m.index, open: m[0], attrs, textContent: '', innerHTML: '', value: attrs.value || '', listeners: {}, child: null,
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }, setAttribute(k, v) { this.attrs[k] = String(v); },
    addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }, click() { for (const f of this.listeners.click || []) f({}); },
    querySelector() { return this.child || (this.child = { innerHTML: '' }); } });
}
const rootAttrs = {};
const document = {
  getElementById: (id) => els.find((e) => e.attrs.id === id) || null,
  querySelectorAll: (sel) => { const m = sel.match(/^\[([a-z-]+)(?:="([^"]*)")?\]$/); return m ? els.filter((e) => m[1] in e.attrs && (m[2] === undefined || e.attrs[m[1]] === m[2])) : []; },
  documentElement: { getAttribute: (k) => rootAttrs[k] ?? null, setAttribute: (k, v) => { rootAttrs[k] = v; } },
};
const fetch = async (u) => {
  const s = String(u), p = s.startsWith('/docdecdemo/') ? new URL(`../docdecdemo/${s.slice(12)}`, root) : new URL(s, root);
  return existsSync(p) ? { ok: true, status: 200, json: async () => JSON.parse(readFileSync(p, 'utf8')), text: async () => readFileSync(p, 'utf8') } : { ok: false, status: 404 };
};
const box = { document, fetch, localStorage: { getItem: () => null, setItem() {} }, matchMedia: () => ({ matches: false }), console, URL, Promise, JSON, Math, Number, String, Date, Object, Array, Set, Map };
vm.createContext(box);
vm.runInContext(script.replace('(async () => {', 'globalThis.__run = (async () => {'), box);
await box.__run;
// write each filled element's content in after its opening tag, last first so earlier offsets stay valid
for (const e of [...els].sort((a, b) => b.at - a.at)) {
  const filled = (e.innerHTML || e.textContent || '') + (e.child ? e.child.innerHTML : '');
  if (!filled) continue;
  const start = e.at + e.open.length, next = html.indexOf('<', start);   // the placeholder text the template held ("…")
  html = html.slice(0, start) + filled + html.slice(next < 0 ? start : next);
}
const text = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<head>[\s\S]*?<\/head>/, '').replace(/<nav[\s\S]*?<\/nav>/, '')
  .replace(/<svg[\s\S]*?<title[^>]*>([^<]*)<\/title>[\s\S]*?<\/svg>/g, '[diagram: $1; its labels are filled from a real run]')
  .replace(/<textarea[\s\S]*?<\/textarea>/g, '').replace(/<(h[1-2])[^>]*>/g, '\n\n## ').replace(/<h3[^>]*>/g, '\n\n### ').replace(/<li>/g, '\n- ')
  .replace(/<\/(p|div|tr|li|h[1-3]|pre)>/g, '\n').replace(/<t[dh][^>]*>/g, ' | ').replace(/<\/?[a-zA-Z][^>]*>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/[ \t]+/g, ' ').replace(/\n\s+/g, '\n');
writeFileSync(process.argv[2] || 'page-text.txt', text.trim() + '\n');
console.log(`${text.length} chars`);
