// grow.mjs — grow a new part from the seed template, so it is born carrying all four instructions.
// The part is born honest: its judge and lane check refuse everything until its author writes them, so the
// birth check names exactly what is missing instead of admitting a bluff.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TEMPLATE = fileURLToPath(new URL('../template/', import.meta.url));

// buildSeed(opts) → the seed.json a new part starts from; anything not given is left empty for the birth check to name
export function buildSeed(o) {
  const s = (k) => { const v = o === null || typeof o !== 'object' ? undefined : o[k]; return typeof v === 'string' ? v.trim() : ''; };
  return {
    genome: '1', name: s('name'), kind: s('kind') || 'repo', purpose: s('purpose'),
    lane: { id: s('lane'), accepts: s('accepts'), refuses: s('refuses') },
    interface: { in: s('in'), out: s('out') },
    judge: { what: s('judgeWhat'), run: 'node genome/judge.mjs', cases: { good: null, bad: null } },
    boundary: { run: 'node genome/lane.mjs', inLane: null, outOfLane: null, escalate: s('escalate') },
    health: { run: 'node genome/health.mjs' },
    tombstone: { apply: 'node genome/tombstone.mjs apply', restore: 'node genome/tombstone.mjs restore' },
    provenance: { repo: s('repo'), by: s('by'), born: s('born') },
  };
}

// plant(dir, seed) → { written, kept }: writes seed.json, genome/ and the CI workflow; never overwrites anything
export function plant(dir, seed) {
  if (existsSync(join(dir, 'seed.json'))) throw new Error('seed.json already exists: this part already has a genome');
  if (existsSync(join(dir, 'genome'))) throw new Error('genome/ already exists: refusing to overwrite it');
  const written = [], kept = [];
  mkdirSync(join(dir, 'genome'), { recursive: true });
  for (const f of readdirSync(join(TEMPLATE, 'genome')).filter((n) => n.endsWith('.mjs')).sort()) {   // the hook modules only: never a stray file
    writeFileSync(join(dir, 'genome', f), readFileSync(join(TEMPLATE, 'genome', f)));
    written.push('genome/' + f);
  }
  writeFileSync(join(dir, 'seed.json'), JSON.stringify(seed, null, 2) + '\n');
  written.push('seed.json');
  const wf = join(dir, '.github', 'workflows', 'genome.yml');
  if (existsSync(wf)) kept.push('.github/workflows/genome.yml');
  else {
    mkdirSync(join(dir, '.github', 'workflows'), { recursive: true });
    writeFileSync(wf, readFileSync(join(TEMPLATE, '.github', 'workflows', 'genome.yml')));
    written.push('.github/workflows/genome.yml');
  }
  return { written, kept };
}

export default { TEMPLATE, buildSeed, plant };
