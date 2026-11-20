// cell.mjs — sum-checker's three answers. A worked example: small on purpose, real on purpose.

const isWhole = (n) => Number.isSafeInteger(n);
const isClaim = (i) => i !== null && typeof i === 'object' && Array.isArray(i.sum) && i.sum.length === 2 && i.sum.every(isWhole) && isWhole(i.claim);

// judge: verified when a + b is exactly the claim, unverified when it is not, refused when it is not a sum claim
export async function judge(input) {
  if (!isClaim(input)) return 'refused';
  return input.sum[0] + input.sum[1] === input.claim ? 'verified' : 'unverified';
}

// inLane: a claimed sum of two whole numbers, and nothing else
export async function inLane(input) {
  return isClaim(input);
}

// health: this example has no traffic to measure, so it says so
export async function health() {
  return { used: null, dependedOn: null, lastEarned: null };
}
