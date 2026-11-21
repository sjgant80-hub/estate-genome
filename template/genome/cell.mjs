// cell.mjs — the three things only you can write. Until you do, this part refuses everything, and the birth check
// names exactly which traits are missing. A part with no judge refuses its lane rather than guessing.

// judge(input) → 'verified' | 'unverified' | 'refused'
// The check that makes an output right, not merely plausible. The birth check calls it on seed.json's judge.cases:
// the good case must come back 'verified', the bad case must never come back 'verified'.
export async function judge(input) {
  return 'refused';
}

// inLane(input) → true when the input is inside this part's lane (seed.json lane.accepts), else false.
// The birth check calls it on boundary.inLane (must be true) and boundary.outOfLane (must be false).
export async function inLane(input) {
  return false;
}

// health() → what this part knows about its own use. Each value true, false or null (null = not measured, said honestly).
// "passing" is measured for you: the judge still tells the good case from the bad one.
export async function health() {
  return { used: null, dependedOn: null, lastEarned: null };
}

// act(input) → the part's real work on an in-lane input: the output its judge will check. Return nothing to refuse.
// The guard (bin/genome-run.mjs) runs it only after inLane() took the input, and hands its output on only when judge()
// verifies it. Optional: a part that only checks work can leave it refusing. Until you write it, this part does no work.
export async function act(input) {
  return undefined;
}
