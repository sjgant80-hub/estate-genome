// foldcache-measure.mjs — the fold-cache measured against the rules committed beforehand in data/foldcache-rules.json:
// two consecutive public censuses on GitHub's runner, read back from this repository's git history by their commits.
//   node scripts/foldcache-measure.mjs --cold <commit> --warm <commit>
// The comparison is src/foldcache.mjs measure() (gated). The result is written whether each rule passes or fails.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { measure } from '../src/foldcache.mjs';

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const [coldSha, warmSha] = [arg('--cold'), arg('--warm')];
if (!coldSha || !warmSha) { console.error('usage: node scripts/foldcache-measure.mjs --cold <commit> --warm <commit>'); process.exit(2); }
const show = (sha) => JSON.parse(execFileSync('git', ['show', `${sha}:data/census.json`], { encoding: 'utf8', maxBuffer: 64 << 20 }));
const full = (sha) => execFileSync('git', ['rev-parse', sha], { encoding: 'utf8' }).trim();
const cold = show(coldSha), warm = show(warmSha);
const rules = JSON.parse(readFileSync('data/foldcache-rules.json', 'utf8'));
const results = measure(cold, warm);
const run = (sha, v) => ({ commit: full(sha), generated: v.generated, took: v.took, cache: v.cache, declared: v.declared, admitted: v.admitted,
  checks: (v.checks || []).map((c) => ({ name: c.name, oid: c.oid, reused: c.reused === true, why: c.why || (c.reused ? 'reused' : ''), error: c.error || undefined })) });
const out = { measured: new Date().toISOString(), rules: 'data/foldcache-rules.json', registered: rules.registered, where: "GitHub's runner (census.yml, ubuntu-latest), started by hand twice in a row",
  pass: results.every((r) => r.pass), results, cold: run(coldSha, cold), warm: run(warmSha, warm) };
writeFileSync('data/foldcache-measure.json', JSON.stringify(out, null, 1) + '\n');
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.id}: ${JSON.stringify(r)}`);
