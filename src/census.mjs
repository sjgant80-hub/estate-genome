// census.mjs — the genome census of an estate: how many repositories are cells, how many only declare a genome, how
// many have none yet. Pure and total. The public view names public repositories only; private ones are counted.
import { describeText } from './genome.mjs';

// row: { name, private, archived, seedText: string|null, verdict: 'cell' | 'part' | null }
//   seedText: the repository's seed.json at HEAD (null when it has none)
//   verdict:  the full birth check's result when it was run on a clone (null when it was not run)
const row = (r) => {
  const get = (k) => { try { return r[k]; } catch { return undefined; } };   // null, a primitive or a throwing getter reads as nothing
  const seedText = typeof get('seedText') === 'string' ? get('seedText') : null;
  const verdict = ['cell', 'part'].includes(get('verdict')) ? get('verdict') : null;
  return { name: typeof get('name') === 'string' ? get('name') : '', private: get('private') === true, archived: get('archived') === true, seedText, verdict };
};

// tally(rows) → the counts, over repositories that are not archived
export function tally(rows) {
  const all = (Array.isArray(rows) ? rows : []).map(row);
  const live = all.filter((r) => !r.archived);
  const declared = live.filter((r) => r.seedText !== null);
  const describes = declared.filter((r) => describeText(r.seedText).describes);
  return {
    scanned: all.length,
    archived: all.length - live.length,
    live: live.length,
    declared: declared.length,
    describes: describes.length,
    admitted: declared.filter((r) => r.verdict === 'cell').length,
    notAdmitted: declared.filter((r) => r.verdict === 'part').length,
    unchecked: declared.filter((r) => r.verdict === null).length,
    genomeLess: live.length - declared.length,
  };
}

// publicView(rows, generated) → what may be published: the counts, and the public cells by name
export function publicView(rows, generated) {
  const all = (Array.isArray(rows) ? rows : []).map(row);
  const declared = all.filter((r) => !r.archived && r.seedText !== null);
  const cells = declared.filter((r) => !r.private).map((r) => {
    const d = describeText(r.seedText);
    return { name: r.name, lane: d.declared ? d.lane || '' : '', describes: d.describes, verdict: r.verdict };
  }).sort((a, b) => a.name.localeCompare(b.name, 'en'));
  return { generated: typeof generated === 'string' ? generated : '', ...tally(rows), cells, privateDeclared: declared.filter((r) => r.private).length };
}

export default { tally, publicView };
