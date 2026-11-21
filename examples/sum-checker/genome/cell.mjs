// cell.mjs — sum-checker's four answers. A worked example: small on purpose, real on purpose.

const isWhole = (n) => Number.isSafeInteger(n);
const isPair = (i) => i !== null && typeof i === 'object' && Array.isArray(i.sum) && i.sum.length === 2 && i.sum.every(isWhole);
const isClaim = (i) => isPair(i) && isWhole(i.claim);

// judge: verified when a + b is exactly the claim, unverified when it is not, refused when it is not a sum claim
export async function judge(input) {
  if (!isClaim(input)) return 'refused';
  return input.sum[0] + input.sum[1] === input.claim ? 'verified' : 'unverified';
}

// inLane: two whole numbers, with or without a claimed total (a claim, when given, must be a whole number), and nothing else
export async function inLane(input) {
  return isPair(input) && (!('claim' in input) || isWhole(input.claim));
}

// act: add the two numbers, and hand back the claim for the judge to check
export async function act(input) {
  if (!isPair(input)) return undefined;
  return { sum: input.sum, claim: input.sum[0] + input.sum[1] };
}

// health: this example has no traffic to measure, so it says so
export async function health() {
  return { used: null, dependedOn: null, lastEarned: null };
}
