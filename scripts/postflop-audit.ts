import {
  applyAction,
  buildBotContext,
  createSession,
  decideBotV10,
  decideBotV11Candidate,
  seededRandom,
  toCallFor,
  type BotProfile,
  type HandState,
  type Street,
} from "../app/poker-engine";

type Policy = (state: HandState, seat: number, random: () => number) => ReturnType<typeof decideBotV10>;
type StreetMetrics = { actions: number; aggressive: number; facing: number; folds: number; sizeTotal: number; sizes: number };
type Metrics = Record<Street, StreetMetrics> & { cbetOpps: number; cbets: number; barrelOpps: number; barrels: number; checkRaises: number };
const profiles: BotProfile[] = ["balanced", "tag", "lag", "nit", "caller", "balanced"];
const emptyStreet = (): StreetMetrics => ({ actions: 0, aggressive: 0, facing: 0, folds: 0, sizeTotal: 0, sizes: 0 });
const emptyMetrics = (): Metrics => ({ preflop: emptyStreet(), flop: emptyStreet(), turn: emptyStreet(), river: emptyStreet(), cbetOpps: 0, cbets: 0, barrelOpps: 0, barrels: 0, checkRaises: 0 });

function run(policy: Policy, hands: number, seed: number) {
  const metrics = emptyMetrics();
  for (let hand = 0; hand < hands; hand += 1) {
    let state = createSession(seededRandom(seed + hand * 7919));
    state.players.forEach((player, index) => { player.isHuman = false; player.profile = profiles[index]; });
    let decisions = 0;
    const seatDecisions = Array.from({ length: 6 }, () => 0);
    while (state.status === "playing" && decisions++ < 100) {
      const actor = state.currentActor;
      const action = policy(state, actor, seededRandom(seed * 1_000_003 + hand * 65_537 + actor * 4099 + seatDecisions[actor]++));
      if (state.street !== "preflop") {
        const street = metrics[state.street];
        const context = buildBotContext(state, actor);
        const streetActions = state.actionLog.filter((entry) => entry.street === state.street);
        const previousAggression = streetActions.some((entry) => entry.type === "raise" || entry.type === "all-in");
        const aggressive = action.type === "raise" || action.type === "all-in";
        street.actions += 1;
        if (aggressive) {
          street.aggressive += 1;
          const target = action.type === "all-in" ? state.players[actor].streetBet + state.players[actor].stack : action.amount ?? 0;
          street.sizeTotal += Math.max(0, target - state.players[actor].streetBet) / Math.max(1, context.pot);
          street.sizes += 1;
        }
        if (toCallFor(state, actor) > 0) {
          street.facing += 1;
          if (action.type === "fold") street.folds += 1;
          if (aggressive) metrics.checkRaises += 1;
        }
        if (state.street === "flop" && actor === state.preflopAggressor && !previousAggression && toCallFor(state, actor) === 0) {
          metrics.cbetOpps += 1;
          if (aggressive) metrics.cbets += 1;
        }
        if ((state.street === "turn" || state.street === "river") && actor === state.preflopAggressor && !previousAggression && toCallFor(state, actor) === 0) {
          const priorStreet = state.street === "turn" ? "flop" : "turn";
          const barreledPrior = state.actionLog.some((entry) => entry.street === priorStreet && entry.seat === actor && (entry.type === "raise" || entry.type === "all-in"));
          if (barreledPrior) {
            metrics.barrelOpps += 1;
            if (aggressive) metrics.barrels += 1;
          }
        }
      }
      state = applyAction(state, actor, action);
    }
    if (decisions >= 100) throw new Error(`Action loop in hand ${hand}`);
  }
  return metrics;
}

const hands = Number(process.argv.find((argument) => argument.startsWith("--hands="))?.split("=")[1] ?? 800);
const summarize = (metrics: Metrics) => ({
  streets: Object.fromEntries((["flop", "turn", "river"] as Street[]).map((street) => [street, {
    actions: metrics[street].actions,
    aggression: metrics[street].actions ? metrics[street].aggressive / metrics[street].actions : 0,
    foldFacingBet: metrics[street].facing ? metrics[street].folds / metrics[street].facing : 0,
    averageBetPot: metrics[street].sizes ? metrics[street].sizeTotal / metrics[street].sizes : 0,
  }])),
  cbet: metrics.cbetOpps ? metrics.cbets / metrics.cbetOpps : 0,
  laterBarrel: metrics.barrelOpps ? metrics.barrels / metrics.barrelOpps : 0,
  checkRaiseCount: metrics.checkRaises,
});
const baseline = summarize(run(decideBotV10, hands, 1401));
const candidate = summarize(run(decideBotV11Candidate, hands, 1401));
console.log(JSON.stringify({ hands, baseline, candidate }, null, 2));
if (process.argv.includes("--strict")) {
  const streets = Object.values(candidate.streets);
  if (streets.some((street) => street.aggression < 0.04 || street.aggression > 0.48 || street.foldFacingBet > 0.72 || street.averageBetPot > 1.35)) {
    throw new Error(`Postflop population gate failed: ${JSON.stringify(candidate)}`);
  }
  if (candidate.cbet < 0.2 || candidate.cbet > 0.82 || candidate.laterBarrel > 0.78) throw new Error(`Line-frequency gate failed: ${JSON.stringify(candidate)}`);
}
