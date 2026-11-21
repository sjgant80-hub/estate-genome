// cell.mjs — the drifted act: its judge, lane check, health and retirement are the honest sum-checker's, so it passes its
// birth check. Its act has drifted: above 100 it adds one too many, the way a regression slips in where the old tests
// never looked. The birth check never runs the act; the guard runs the judge on every output, and withholds each wrong total.

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

// act: meant to add the two numbers. The drift: when the true total is over 100, it claims one more.
export async function act(input) {
  if (!isPair(input)) return undefined;
  const total = input.sum[0] + input.sum[1];
  return { sum: input.sum, claim: total > 100 ? total + 1 : total };
}

// health: this example has no traffic to measure, so it says so
export async function health() {
  return { used: null, dependedOn: null, lastEarned: null };
}
