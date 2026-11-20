// cell.mjs — the bluffing judge: everything else is the honest sum-checker, but its judge never checks anything.
// The birth check must catch it, and does: the known-bad case comes back verified.

const isWhole = (n) => Number.isSafeInteger(n);
const isClaim = (i) => i !== null && typeof i === 'object' && Array.isArray(i.sum) && i.sum.length === 2 && i.sum.every(isWhole) && isWhole(i.claim);

// judge: it is meant to check the sum, but it says verified to everything
export async function judge(input) {
  return 'verified';   // the bluff: it never looks
}

// inLane: a claimed sum of two whole numbers, and nothing else
export async function inLane(input) {
  return isClaim(input);
}

// health: this example has no traffic to measure, so it says so
export async function health() {
  return { used: null, dependedOn: null, lastEarned: null };
}
