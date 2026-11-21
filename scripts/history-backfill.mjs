// history-backfill.mjs — rebuild data/census-history.json from every census this repository has published: each
// commit that changed data/census.json, oldest first, folded in through the same kernel the daily census uses.
// Anyone can re-run it on a clone and get the same file.   node scripts/history-backfill.mjs
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { rowsOf, merge, ABOUT } from '../src/drift.mjs';

const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 64 << 20 });
const commits = git('log', '--reverse', '--format=%H', '--', 'data/census.json').split('\n').filter(Boolean);
let history = { rows: [] };
for (const c of commits) {
  const view = JSON.parse(git('show', `${c}:data/census.json`));
  history = merge(history, rowsOf(view));
  console.log(`${c.slice(0, 7)} ${String(view.generated).slice(0, 10)}: ${rowsOf(view).length} rows`);
}
writeFileSync('data/census-history.json', JSON.stringify({ about: ABOUT, ...history }, null, 1) + '\n');
console.log(`data/census-history.json: ${history.rows.length} rows from ${commits.length} published censuses`);
