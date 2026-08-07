import {
  applyAction,
  createSession,
  decideBot,
  decideBotV7,
  potTotal,
  seededRandom,
  type BotProfile,
  type HandState,
} from "../app/poker-engine";

type Result = { profit: number; decisions: number };
const profiles: BotProfile[] = ["balanced", "tag", "lag", "nit", "caller", "balanced"];

function runHand(seed: number, upgraded: Set<number>, profile: BotProfile | "mixed", startingStack: number): Result {
  const dealRandom = seededRandom(seed * 17 + 91);
  const decisionRandom = seededRandom(seed * 31 + 7);
  let state: HandState = createSession(dealRandom);
  state.players.forEach((player, index) => {
    player.profile = profile === "mixed" ? profiles[index] : profile;
    player.stack = startingStack - player.committed;
  });
  let decisions = 0;
  while (state.status === "playing" && decisions < 180) {
    const actor = state.currentActor;
    const action = upgraded.has(actor)
      ? decideBot(state, actor, decisionRandom)
      : decideBotV7(state, actor, decisionRandom);
    state = applyAction(state, actor, action);
    decisions += 1;
  }
  if (decisions >= 180) throw new Error(`Action loop at seed ${seed}`);
  const conserved = state.players.reduce((sum, player) => sum + player.stack, 0) + potTotal(state);
  if (conserved !== startingStack * 6) throw new Error(`Chip conservation failed at seed ${seed}: ${conserved}`);
  return {
    profit: [...upgraded].reduce((sum, seat) => sum + state.players[seat].stack - startingStack, 0),
    decisions,
  };
}

function summarize(profile: BotProfile | "mixed", deals: number, seedOffset: number, startingStack: number) {
  const samples: number[] = [];
  let decisions = 0;
  for (let deal = 0; deal < deals; deal += 1) {
    const seed = seedOffset + deal;
    const first = runHand(seed, new Set([0, 2, 4]), profile, startingStack);
    const second = runHand(seed, new Set([1, 3, 5]), profile, startingStack);
    // Across the swapped pair, six upgraded seat-hands face six legacy seat-hands.
    samples.push((first.profit + second.profit) / 6);
    decisions += first.decisions + second.decisions;
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
  };
}

const quick = process.argv.includes("--quick");
const requestedDeals = Number(process.argv.find((argument) => argument.startsWith("--deals="))?.split("=")[1]);
const requestedStackBb = Number(process.argv.find((argument) => argument.startsWith("--stack-bb="))?.split("=")[1]);
const startingStack = (Number.isFinite(requestedStackBb) ? requestedStackBb : 100) * 2;
const mixedOnly = process.argv.includes("--mixed-only");
const profileDeals = Number.isFinite(requestedDeals) ? requestedDeals : quick ? 80 : 400;
const mixedDeals = Number.isFinite(requestedDeals) ? requestedDeals : quick ? 180 : 1200;
const results = mixedOnly
  ? [summarize("mixed", mixedDeals, 100_000, startingStack)]
  : [
      summarize("mixed", mixedDeals, 100_000, startingStack),
      ...(["balanced", "tag", "lag", "nit", "caller"] as BotProfile[]).map((profile, index) => summarize(profile, profileDeals, 200_000 + index * 10_000, startingStack)),
    ];

console.log(JSON.stringify({ benchmark: "paired duplicate deals; current and immediate-predecessor seats swapped", results }, null, 2));
