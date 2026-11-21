# estate-genome

**Live: https://sjgant80-hub.github.io/estate-genome/**

The birth check. A part (a repository, an agent, a contract, a model, a tool, a service) is admitted as a **cell** only when
all four traits hold, and the check *runs* them, on the part's own hooks:

1. **Describe**: it ships a `seed.json` any agent can read: name, purpose, lane, interface, judge, hooks, provenance.
2. **Verify**: its judge calls a known-good case verified and refuses to call a known-bad case verified.
3. **Prune**: it reports its health, and its tombstone round-trips: applied on a copy it changes the part, restored it is byte-identical.
4. **Boundary**: it accepts its in-lane sample and refuses its out-of-lane sample, naming who it escalates to.

```bash
node bin/genome-check.mjs <folder>          # the birth check (exit 0 = a cell)
node bin/genome-run.mjs <cell> --input '<json>' [--log calls.jsonl]   # the guard: lane, act, judge on every call (exit 0 = released)
node bin/grow.mjs <folder> --name ... --purpose ... --lane ... --escalate ... --repo owner/name --by ...
```

**The guard.** The birth check proves a part once. `genome-run` checks every call: the cell's lane check on the request
(out of lane: refused and escalated, the work never starts), then its act (an optional fifth hook, `act.run` in
`seed.json`), then its judge on the act's output. Only verified output is handed back; anything else is withheld with
the reason. `examples/drifted-act` passes its birth check, and the guard still withholds every wrong total it makes.

**The census, continuously.** The daily census (`census.yml`) keeps a history, one row per day per declaring
repository (`data/census-history.json`); a cell admitted before and refused now is named as drifted, with the trait it
lost (`src/drift.mjs`). It conserves instead of recomputing: a verdict is reused only on the same HEAD commit, the same
checker version and under 7 days old (`src/foldcache.mjs`, `data/census-cache.json`). And it converts, not only counts:
`node scripts/convert.mjs` ranks the genome-less live repositories to convert, in use and proved first, sends the
measured-dead to retirement, writes the ranked names locally (`~/.estate-genome/convert-worklist.json`) and only counts
to the public ledger (`data/convert.json`).

In CI: `uses: sjgant80-hub/estate-genome@v1` (see `template/.github/workflows/genome.yml`).

Everything else, the page explains: what it is, how to start, how it works (traced from real runs), the census of the
estate, the blueprint, and the case for adopting it.

MIT licence. Supplied by [AI Native Solutions](https://www.ai-nativesolutions.com).
