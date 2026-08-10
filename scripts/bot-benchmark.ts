import {
  applyAction,
  createSession,
  decideBot,
  decideBotCandidate,
  decideBotV7,
  potTotal,
  seededRandom,
  type BotProfile,
  type HandState,
} from "../app/poker-engine";

type Result = { candidateProfit: number; predecessorProfit: number; decisions: number; deltas: Record<string, number> };
type Policy = (state: HandState, seat: number, random: () => number) => ReturnType<typeof decideBotV7>;
const profiles: BotProfile[] = ["balanced", "tag", "lag", "nit", "caller", "balanced"];

function decisionSeed(seed: number, seat: number, decision: number) {
  return (seed * 1_000_003 + seat * 97_409 + decision * 65_537 + 7) >>> 0;
}

function runHand(seed: number, upgraded: Set<number>, profile: BotProfile | "mixed", startingStack: number, candidate: Policy): Result {
  const dealRandom = seededRandom(seed * 17 + 91);
  let state: HandState = createSession(dealRandom);
  state.players.forEach((player, index) => {
    player.profile = profile === "mixed" ? profiles[index] : profile;
    player.stack = startingStack - player.committed;
  });
  let decisions = 0;
  const seatDecisions = Array.from({ length: 6 }, () => 0);
  const deltas: Record<string, number> = {};
  while (state.status === "playing" && decisions < 180) {
    const actor = state.currentActor;
    const seedForDecision = decisionSeed(seed, actor, seatDecisions[actor]++);
    const action = upgraded.has(actor)
      ? candidate(state, actor, seededRandom(seedForDecision))
      : decideBotV7(state, actor, seededRandom(seedForDecision));
    if (upgraded.has(actor)) {
      const predecessor = decideBotV7(state, actor, seededRandom(seedForDecision));
      if (predecessor.type !== action.type || predecessor.amount !== action.amount) {
        const key = `${state.players[actor].profile}:${state.street}:r${state.raiseCount}:${predecessor.type}>${action.type}`;
        deltas[key] = (deltas[key] ?? 0) + 1;
      }
    }
    state = applyAction(state, actor, action);
    decisions += 1;
  }
  if (decisions >= 180) throw new Error(`Action loop at seed ${seed}`);
  const conserved = state.players.reduce((sum, player) => sum + player.stack, 0) + potTotal(state) + state.sessionRake;
  if (conserved !== startingStack * 6) throw new Error(`Chip conservation failed at seed ${seed}: ${conserved}`);
  const candidateProfit = [...upgraded].reduce((sum, seat) => sum + state.players[seat].stack - startingStack, 0);
  const predecessorProfit = state.players.reduce((sum, player, seat) => (
    upgraded.has(seat) ? sum : sum + player.stack - startingStack
  ), 0);
  return { candidateProfit, predecessorProfit, decisions, deltas };
}

function summarize(profile: BotProfile | "mixed", deals: number, seedOffset: number, startingStack: number, candidate: Policy) {
  const samples: number[] = [];
  let decisions = 0;
  const deltas: Record<string, number> = {};
  for (let deal = 0; deal < deals; deal += 1) {
    const seed = seedOffset + deal;
    const first = runHand(seed, new Set([0, 2, 4]), profile, startingStack, candidate);
    const second = runHand(seed, new Set([1, 3, 5]), profile, startingStack, candidate);
    // Center each strategy against its opponents so shared rake cancels. Across
    // the swapped pair there are six candidate and six predecessor seat-hands;
    // identical policies therefore score exactly zero.
    const differential = (first.candidateProfit - first.predecessorProfit)
      + (second.candidateProfit - second.predecessorProfit);
    samples.push(differential / 12);
    decisions += first.decisions + second.decisions;
    for (const result of [first, second]) {
      Object.entries(result.deltas).forEach(([key, count]) => { deltas[key] = (deltas[key] ?? 0) + count; });
    }
  }
  const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  const variance = samples.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, samples.length - 1);
  const standardError = Math.sqrt(variance / samples.length);
  const scale = 50; // $1 per seat-hand = 50 bb/100 at $2 per BB.
  return {
    profile,
    stackBb: startingStack / 2,
    pairedDeals: deals,
    hands: deals * 2,
    bbPer100: Number((mean * scale).toFixed(2)),
    ci95: [Number(((mean - 1.96 * standardError) * scale).toFixed(2)), Number(((mean + 1.96 * standardError) * scale).toFixed(2))],
    averageActions: Number((decisions / (deals * 2)).toFixed(2)),
    decisionDeltas: Object.fromEntries(Object.entries(deltas).sort((a, b) => b[1] - a[1])),
  };
}

const quick = process.argv.includes("--quick");
const requestedDeals = Number(process.argv.find((argument) => argument.startsWith("--deals="))?.split("=")[1]);
const requestedStackBb = Number(process.argv.find((argument) => argument.startsWith("--stack-bb="))?.split("=")[1]);
const startingStack = (Number.isFinite(requestedStackBb) ? requestedStackBb : 100) * 2;
const mixedOnly = process.argv.includes("--mixed-only");
const strict = process.argv.includes("--strict");
const liveCandidate = process.argv.includes("--live") ? decideBot : decideBotCandidate;
const profileDeals = Number.isFinite(requestedDeals) ? requestedDeals : quick ? 80 : 400;
const mixedDeals = Number.isFinite(requestedDeals) ? requestedDeals : quick ? 180 : 1200;
const identity = summarize("mixed", Math.min(120, mixedDeals), 90_000, startingStack, decideBotV7);
if (identity.bbPer100 !== 0 || identity.ci95[0] !== 0 || identity.ci95[1] !== 0) {
  throw new Error(`Identity benchmark must equal zero: ${JSON.stringify(identity)}`);
}
const results = mixedOnly
  ? [summarize("mixed", mixedDeals, 100_000, startingStack, liveCandidate)]
  : [
      summarize("mixed", mixedDeals, 100_000, startingStack, liveCandidate),
      ...(["balanced", "tag", "lag", "nit", "caller"] as BotProfile[]).map((profile, index) => summarize(profile, profileDeals, 200_000 + index * 10_000, startingStack, liveCandidate)),
    ];

console.log(JSON.stringify({ benchmark: "paired duplicate deals; candidate and frozen V7 seats swapped; per-seat deterministic decision streams", identity, results }, null, 2));
if (strict) {
  const regressions = results.filter((result) => result.ci95[0] < 0);
  if (regressions.length) throw new Error(`Strict additive gate failed: ${JSON.stringify(regressions)}`);
}
