import {
  applyAction,
  createSession,
  decideBot,
  decideBotV11,
  decideBotV12Candidate,
  decideBotV12Ablation,
  decideBotV12Live,
  potTotal,
  seededRandom,
  type BotProfile,
  type HandState,
  type FlopStrategyModule,
} from "../app/poker-engine";

type Result = { candidateProfit: number; predecessorProfit: number; candidateSeats: number; predecessorSeats: number; decisions: number; deltas: Record<string, number> };
type Policy = (state: HandState, seat: number, random: () => number) => ReturnType<typeof decideBotV11>;
const profiles: BotProfile[] = ["balanced", "tag", "lag", "nit", "caller", "balanced"];

function decisionSeed(seed: number, seat: number, decision: number) {
  return (seed * 1_000_003 + seat * 97_409 + decision * 65_537 + 7) >>> 0;
}

// The style gate: balanced and tight-aggressive seats must not play worse under the live policy than under the
// frozen V12. Lag, nit and caller are meant to be exploitable and are judged by `npm run style:report` instead.
const GATED_PROFILES = new Set<BotProfile>(["balanced", "tag"]);

function runHand(seed: number, upgraded: Set<number>, profile: BotProfile | "mixed", startingStack: number, candidate: Policy, predecessor: Policy, gated: boolean): Result {
  const dealRandom = seededRandom(seed * 17 + 91);
  let state: HandState = createSession(dealRandom);
  state.players.forEach((player, index) => {
    player.isHuman = false;
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
      : predecessor(state, actor, seededRandom(seedForDecision));
    if (upgraded.has(actor)) {
      const previous = predecessor(state, actor, seededRandom(seedForDecision));
      if (previous.type !== action.type || previous.amount !== action.amount) {
        const key = `${state.players[actor].profile}:${state.street}:r${state.raiseCount}:${previous.type}>${action.type}`;
        deltas[key] = (deltas[key] ?? 0) + 1;
      }
    }
    state = applyAction(state, actor, action);
    decisions += 1;
  }
  if (decisions >= 180) throw new Error(`Action loop at seed ${seed}`);
  const conserved = state.players.reduce((sum, player) => sum + player.stack, 0) + potTotal(state) + state.sessionRake;
  if (conserved !== startingStack * 6) throw new Error(`Chip conservation failed at seed ${seed}: ${conserved}`);
  const counted = (seat: number) => !gated || GATED_PROFILES.has(state.players[seat].profile);
  const candidateSeats = [...upgraded].filter(counted);
  const predecessorSeats = state.players.map((_, seat) => seat).filter((seat) => !upgraded.has(seat) && counted(seat));
  const candidateProfit = candidateSeats.reduce((sum, seat) => sum + state.players[seat].stack - startingStack, 0);
  const predecessorProfit = predecessorSeats.reduce((sum, seat) => sum + state.players[seat].stack - startingStack, 0);
  return { candidateProfit, predecessorProfit, candidateSeats: candidateSeats.length, predecessorSeats: predecessorSeats.length, decisions, deltas };
}

function summarize(profile: BotProfile | "mixed", deals: number, seedOffset: number, startingStack: number, candidate: Policy, predecessor: Policy, gated: boolean) {
  const samples: number[] = [];
  let decisions = 0;
  const deltas: Record<string, number> = {};
  for (let deal = 0; deal < deals; deal += 1) {
    const seed = seedOffset + deal;
    const first = runHand(seed, new Set([0, 2, 4]), profile, startingStack, candidate, predecessor, gated);
    const second = runHand(seed, new Set([1, 3, 5]), profile, startingStack, candidate, predecessor, gated);
    // Center each strategy against its opponents so shared rake cancels. Across
    // the swapped pair there are six candidate and six predecessor seat-hands;
    // identical policies therefore score exactly zero.
    const differential = (first.candidateProfit - first.predecessorProfit)
      + (second.candidateProfit - second.predecessorProfit);
    const seatHands = first.candidateSeats + first.predecessorSeats + second.candidateSeats + second.predecessorSeats;
    if (seatHands === 0) continue;
    samples.push(differential / seatHands);
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
const numberArg = (name: string) => Number(process.argv.find((argument) => argument.startsWith(`--${name}=`))?.split("=")[1]);
const requestedDeals = numberArg("deals");
const requestedStackBb = numberArg("stack-bb");
const seedShift = Number.isFinite(numberArg("offset")) ? numberArg("offset") : 0;
const startingStack = (Number.isFinite(requestedStackBb) ? requestedStackBb : 100) * 2;
const mixedOnly = process.argv.includes("--mixed-only");
const strict = process.argv.includes("--strict");
// `--gate=style` compares the live policy (V12 plus the style layer) with frozen V12 for balanced and
// tight-aggressive seats only. Without it, the older V12-candidate-versus-V11 comparison runs.
const styleGate = process.argv.includes("--gate=style");
const requestedModules = process.argv.find((argument) => argument.startsWith("--modules="))?.split("=")[1]
  ?.split(",").filter(Boolean) as FlopStrategyModule[] | undefined;
// In the style gate only balanced and tight-aggressive seats use the live policy; every other seat stays on
// frozen V12 in both arms, so the comparison isolates what the style layer does to the two gated styles.
const gatedLive: Policy = (state, seat, random) => GATED_PROFILES.has(state.players[seat].profile) ? decideBot(state, seat, random) : decideBotV12Live(state, seat, random);
const liveCandidate: Policy = styleGate ? gatedLive : requestedModules?.length
  ? (state, seat, random) => decideBotV12Ablation(state, seat, requestedModules, random)
  : decideBotV12Candidate;
const predecessor: Policy = styleGate ? decideBotV12Live : decideBotV11;
const profileDeals = Number.isFinite(requestedDeals) ? requestedDeals : quick ? 80 : 400;
const mixedDeals = Number.isFinite(requestedDeals) ? requestedDeals : quick ? 180 : 1200;
const identity = summarize("mixed", Math.min(120, mixedDeals), 90_000, startingStack, predecessor, predecessor, styleGate);
if (identity.bbPer100 !== 0 || identity.ci95[0] !== 0 || identity.ci95[1] !== 0) {
  throw new Error(`Identity benchmark must equal zero: ${JSON.stringify(identity)}`);
}
const profilesToRun: BotProfile[] = styleGate ? ["balanced", "tag"] : ["balanced", "tag", "lag", "nit", "caller"];
const run = (profile: BotProfile | "mixed", deals: number, offset: number) => summarize(profile, deals, offset + seedShift, startingStack, liveCandidate, predecessor, styleGate);
const results = mixedOnly
  ? [run("mixed", mixedDeals, 100_000)]
  : [
      run("mixed", mixedDeals, 100_000),
      ...profilesToRun.map((profile, index) => run(profile, profileDeals, 200_000 + index * 10_000)),
    ];

console.log(JSON.stringify({
  allowedLossBbPer100: styleGate ? 3 : 0,
  benchmark: styleGate
    ? "paired duplicate deals; live policy and frozen V12 seats swapped; balanced and tag seats only"
    : "paired duplicate deals; V12 candidate and frozen V11 seats swapped; per-seat deterministic decision streams",
  modules: requestedModules ?? ["value", "range-bet"],
  identity,
  results,
}, null, 2));
if (strict) {
  // The style gate is a non-inferiority test: widening Mara's opening range to her advertised 22-27% VPIP costs
  // about 1.3 bb per hundred hands (measured over 6,000 paired deals), so balanced and tight-aggressive may lose up to 3 bb/100 against frozen V12.
  const margin = styleGate ? -3 : 0;
  const regressions = results.filter((result) => result.ci95[0] < margin);
  if (regressions.length) throw new Error(`Strict additive gate failed: ${JSON.stringify(regressions)}`);
}
