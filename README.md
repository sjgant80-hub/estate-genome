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
node bin/grow.mjs <folder> --name ... --purpose ... --lane ... --escalate ... --repo owner/name --by ...
```

In CI: `uses: sjgant80-hub/estate-genome@v1` (see `template/.github/workflows/genome.yml`).

Everything else, the page explains: what it is, how to start, how it works (traced from real runs), the census of the
estate, the blueprint, and the case for adopting it.

MIT licence. Supplied by [AI Native Solutions](https://www.ai-nativesolutions.com).
