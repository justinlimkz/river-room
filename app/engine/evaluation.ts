import { analyzeBoard, classifyStrategicHand } from "./board";
import { cardLabel, compareScores, evaluateHand, makeDeck, seededRandom, shuffledDeck } from "./cards";
import { buildBotContext, coachView } from "./context";
import { buildRangeLedger, opponentRangeWeight, rangeResponseWeight, sampleRangeCombo, weightedHoleSample } from "./ranges";
import { CASH_RAKE, clockwiseDistance, legalBounds, potTotal, toCallFor, validateAction } from "./rules";
import { type ActionEvaluation, type Card, type HandState, type PokerAction, type RangeCombo, type RangeLedger } from "./types";

function actionLabel(state: HandState, action: PokerAction) {
  if (action.type === "raise") return `${state.currentBet > 0 ? "Raise" : "Bet"} to $${action.amount}`;
  if (action.type === "all-in") return `All-in to $${state.players[state.currentActor]?.streetBet + state.players[state.currentActor]?.stack}`;
  return action.type[0].toUpperCase() + action.type.slice(1);
}

function postflopCandidates(state: HandState, seatIndex: number) {
  const bounds = legalBounds(state, seatIndex);
  const actions: PokerAction[] = bounds.toCall > 0 ? [{ type: "fold" }, { type: "call" }] : [{ type: "check" }];
  if (!bounds.canRaise) return actions;
  const pot = potTotal(state);
  const targets = [0.33, 0.5, 0.75, 1].map((fraction) => Math.max(bounds.min, Math.min(bounds.max, Math.round(state.currentBet + pot * fraction))));
  [...new Set(targets)].forEach((amount) => actions.push(amount === bounds.max ? { type: "all-in" } : { type: "raise", amount }));
  const context = buildBotContext(state, seatIndex);
  if (context.spr <= 2.5 && !actions.some((action) => action.type === "all-in")) actions.push({ type: "all-in" });
  return actions;
}

function estimateLedgerEquity(
  state: HandState,
  seatIndex: number,
  ledger: RangeLedger,
  iterations: number,
  random: () => number,
  response?: (opponent: number, combo: RangeCombo) => number,
  exactRiver = false,
) {
  const hole = state.players[seatIndex].hole;
  const opponents = buildBotContext(state, seatIndex).opponents;
  const known = new Set([...hole, ...state.board].map(cardLabel));
  // Full river enumeration is reserved for the coach's complete ledger. Live
  // bot searches retain their bounded sampler and deterministic random stream.
  if (state.board.length === 5 && opponents.length === 1 && exactRiver) {
    const opponent = opponents[0];
    const hero = evaluateHand([...hole, ...state.board]).score;
    let weightedShare = 0;
    let totalWeight = 0;
    for (const combo of ledger[opponent] ?? []) {
      if (combo.cards.some((card) => known.has(cardLabel(card)))) continue;
      const weight = combo.weight * (response?.(opponent, combo) ?? 1);
      if (weight <= 0) continue;
      let share = combo.showdownShare;
      if (share === undefined) {
        const comparison = compareScores(evaluateHand([...combo.cards, ...state.board]).score, hero);
        share = comparison < 0 ? 1 : comparison === 0 ? 0.5 : 0;
      }
      weightedShare += weight * share;
      totalWeight += weight;
    }
    return totalWeight ? weightedShare / totalWeight : 0;
  }
  let shares = 0;
  let completedRuns = 0;
  for (let run = 0; run < iterations; run += 1) {
    const available = makeDeck().filter((card) => !known.has(cardLabel(card)));
    const rivals = opponents.map((opponent) => sampleRangeCombo(ledger[opponent] ?? [], available, random, (combo) => response?.(opponent, combo) ?? 1));
    if (rivals.some((cards) => cards.length !== 2)) continue;
    const completed = [...state.board];
    while (completed.length < 5) completed.push(available.splice(Math.floor(random() * available.length), 1)[0]);
    const hero = evaluateHand([...hole, ...completed]).score;
    const scores = rivals.map((cards) => evaluateHand([...cards, ...completed]).score);
    if (!scores.some((score) => compareScores(score, hero) > 0)) shares += 1 / (scores.filter((score) => compareScores(score, hero) === 0).length + 1);
    completedRuns += 1;
  }
  return completedRuns ? shares / completedRuns : 0;
}

function rangeResponseRates(state: HandState, opponent: number, combos: RangeCombo[], fraction: number) {
  const profile = state.players[opponent].profile;
  const totals = combos.reduce((sum, combo) => {
    sum.fold += combo.weight * rangeResponseWeight(combo.handClass, "fold", fraction, state.street, profile);
    sum.call += combo.weight * rangeResponseWeight(combo.handClass, "call", fraction, state.street, profile);
    sum.raise += combo.weight * rangeResponseWeight(combo.handClass, "raise", fraction, state.street, profile);
    return sum;
  }, { fold: 0, call: 0, raise: 0 });
  const total = totals.fold + totals.call + totals.raise || 1;
  return { fold: totals.fold / total, call: totals.call / total, raise: totals.raise / total };
}

// Incremental stack EV at this decision: prior contributions are sunk. Settle
// each contribution layer, refund unmatched chips, and allocate integer odd chips.
// Ranges are hypotheses; exact settlement does not validate those hypotheses.
function terminalRiverEV(
  state: HandState, seat: number, action: PokerAction, ledger: RangeLedger,
  iterations: number, random: () => number, rake: { rate: number; cap: number },
): { ev: number; method: "terminal-enumeration" | "terminal-sampling" } | undefined {
  if (state.street !== "river" || action.type === "fold" || action.type === "raise") return;
  const hero = state.players[seat];
  const cost = action.type === "check" ? 0 : Math.min(toCallFor(state, seat), hero.stack);
  if (action.type === "all-in" && hero.stack > cost) return;
  if (!state.players.every((p, i) => i === seat || p.folded || p.allIn || (p.acted && p.streetBet === state.currentBet))) return;
  const opponents = state.players.flatMap((p, i) => i !== seat && !p.folded ? [i] : []);
  const contributions = state.players.map((p, i) => p.committed + (i === seat ? cost : 0));
  const levels = [...new Set(contributions.filter(Boolean))].sort((a, b) => a - b);
  let previousLevel = 0;
  const layers = levels.map((level) => {
    const contributors = contributions.flatMap((c, i) => c >= level ? [i] : []);
    const amount = (level - previousLevel) * contributors.length;
    previousLevel = level;
    return { contributors, amount };
  });
  const contested = layers.reduce((sum, layer) => sum + (layer.contributors.length > 1 ? layer.amount : 0), 0);
  const fee = Math.min(rake.cap, Math.round(contested * rake.rate));
  const heroScore = evaluateHand([...hero.hole, ...state.board]).score;
  const value = (cards: Record<number, Card[]>) => {
    const scores = new Map([[seat, heroScore], ...opponents.map(i => [i, evaluateHand([...cards[i], ...state.board]).score] as const)]);
    let payout = 0, rakeDue = fee;
    for (const { contributors, amount } of layers) {
      const eligible = contributors.filter(i => !state.players[i].folded);
      if (!eligible.length) continue;
      if (contributors.length === 1) { if (contributors[0] === seat) payout += amount; continue; }
      // Same settlement as the table: one rake on the contested total, main pot first.
      const layerFee = Math.min(rakeDue, amount);
      rakeDue -= layerFee;
      const best = eligible.reduce((a, b) => compareScores(scores.get(a)!, scores.get(b)!) >= 0 ? a : b);
      const winners = eligible.filter(i => compareScores(scores.get(i)!, scores.get(best)!) === 0)
        .sort((a, b) => clockwiseDistance(state.dealer, a) - clockwiseDistance(state.dealer, b));
      if (winners.includes(seat)) payout += Math.floor((amount - layerFee) / winners.length) + (winners.indexOf(seat) < (amount - layerFee) % winners.length ? 1 : 0);
    }
    return payout - cost;
  };
  const known = new Set([...hero.hole, ...state.board].map(cardLabel));
  let total = 0, weight = 0;
  if (opponents.length === 1) {
    for (const combo of ledger[opponents[0]] ?? []) {
      if (combo.weight <= 0 || combo.cards.some(c => known.has(cardLabel(c)))) continue;
      total += value({ [opponents[0]]: combo.cards }) * combo.weight;
      weight += combo.weight;
    }
    return weight ? { ev: total / weight, method: "terminal-enumeration" } : undefined;
  }
  // Multiway range sampling remains approximate; never label it enumeration.
  for (let run = 0; run < iterations; run++) {
    const available = makeDeck().filter(c => !known.has(cardLabel(c)));
    const cards = Object.fromEntries(opponents.map(i => [i, sampleRangeCombo(ledger[i] ?? [], available, random)]));
    if (opponents.some(i => cards[i].length !== 2)) continue;
    total += value(cards); weight++;
  }
  return weight ? { ev: total / weight, method: "terminal-sampling" } : undefined;
}

export function evaluatePostflopActions(
  state: HandState,
  seatIndex: number,
  iterations = 72,
  random: () => number = Math.random,
  ledgerOverride?: RangeLedger,
  options: { extraAction?: PokerAction; actions?: PokerAction[]; rake?: { rate: number; cap: number } } = {},
): ActionEvaluation[] {
  if (ledgerOverride) state = coachView(state, seatIndex);
  if (state.street === "preflop" || state.players[seatIndex].hole.length !== 2) return [];
  const context = buildBotContext(state, seatIndex);
  const bounds = legalBounds(state, seatIndex);
  const player = state.players[seatIndex];
  const pot = potTotal(state);
  const coachingEvaluation = ledgerOverride !== undefined;
  const ledger = ledgerOverride ?? buildRangeLedger(state, seatIndex);
  const overallEquity = estimateLedgerEquity(state, seatIndex, ledger, iterations, random, undefined, coachingEvaluation);
  const heroClass = classifyStrategicHand(player.hole, state.board);
  const board = analyzeBoard(state.board);
  const vulnerability = board.dynamic && ["strong-value", "thin-value", "bluff-catcher", "showdown-value"].includes(heroClass) ? 0.08 : 0;
  const positionRealization = context.inPosition ? 0.96 : 0.84;
  const streetRealization = state.street === "river" ? 1 : state.street === "turn" ? 0.94 : 0.88;
  const rake = options.rake ?? CASH_RAKE;
  const net = (amount: number) => amount - (coachingEvaluation ? Math.min(rake.cap, Math.round(amount * rake.rate)) : 0);
  // Coaching compares bet sizes, so each size must be sampled with the same random cards. Independent
  // samples let noise in "equity when called" outweigh the real difference between $5 and $7.
  const pairedSeed = coachingEvaluation ? Math.floor(random() * 0x100000000) : 0;
  const candidates = options.actions ?? postflopCandidates(state, seatIndex);
  if (options.extraAction && validateAction(state, seatIndex, options.extraAction).legal && !evaluationForAction(candidates.map(action => ({ action } as ActionEvaluation)), options.extraAction)) candidates.push(options.extraAction);
  return candidates.map((action) => {
    const terminal = coachingEvaluation ? terminalRiverEV(state, seatIndex, action, ledger, iterations, random, rake) : undefined;
    let ev = 0;
    let scale = pot;
    let foldProbability: number | undefined;
    let equityWhenCalled: number | undefined;
    let raiseProbability: number | undefined;
    if (terminal) ev = terminal.ev;
    else if (action.type === "fold") ev = 0;
    else if (action.type === "check") ev = overallEquity * net(pot) * Math.max(0.62, streetRealization * positionRealization - vulnerability);
    else if (action.type === "call") {
      const call = Math.min(bounds.toCall, player.stack);
      scale = pot + call;
      const realization = coachingEvaluation && state.street === "river" && context.activePlayers === 2
        ? 1
        : Math.max(0.6, streetRealization * positionRealization - vulnerability * 0.7);
      const contestable = coachingEvaluation ? state.players.reduce((sum, p) => sum + Math.min(p.committed, player.committed + call), 0) : pot;
      ev = overallEquity * net(contestable + call) * realization - call;
    } else {
      const target = action.type === "all-in" ? bounds.max : action.amount!;
      const effectiveTarget = coachingEvaluation ? Math.min(target, Math.max(...context.opponents.map(i => state.players[i].streetBet + state.players[i].stack))) : target;
      const invest = Math.max(0, effectiveTarget - player.streetBet);
      const fraction = invest / Math.max(1, pot);
      const rates = context.opponents.map((opponent) => coachingEvaluation && state.players[opponent].allIn ? { fold: 0, call: 1, raise: 0 } : rangeResponseRates(state, opponent, ledger[opponent] ?? [], fraction));
      foldProbability = rates.reduce((probability, rate) => probability * rate.fold, 1);
      raiseProbability = 1 - rates.reduce((probability, rate, i) => probability * (1 - (coachingEvaluation && (player.stack + player.streetBet <= effectiveTarget || state.players[context.opponents[i]].stack + state.players[context.opponents[i]].streetBet <= effectiveTarget) ? 0 : rate.raise)), 1);
      const expectedCallers = Math.max(1, rates.reduce((sum, rate) => sum + rate.call, 0));
      equityWhenCalled = estimateLedgerEquity(state, seatIndex, ledger, coachingEvaluation ? Math.max(80, Math.round(iterations * 0.55)) : Math.max(16, Math.round(iterations * 0.55)), coachingEvaluation ? seededRandom(pairedSeed) : random,
        (opponent, combo) => rangeResponseWeight(combo.handClass, "call", fraction, state.street, state.players[opponent].profile) + (coachingEvaluation ? rangeResponseWeight(combo.handClass, "raise", fraction, state.street, state.players[opponent].profile) : 0), coachingEvaluation);
      const opponentCall = Math.max(0, target - state.currentBet);
      const matchedCalls = coachingEvaluation ? context.opponents.reduce((sum, opponent, i) => {
        const p = state.players[opponent];
        const additional = Math.min(p.stack, Math.max(0, effectiveTarget - p.streetBet));
        return sum + additional * (1 - rates[i].fold) / Math.max(0.00001, 1 - foldProbability!);
      }, 0) : opponentCall * expectedCallers;
      const contestable = coachingEvaluation ? state.players.reduce((sum, p) => sum + Math.min(p.committed, player.committed + invest), 0) : pot;
      const calledPot = contestable + invest + matchedCalls;
      scale = calledPot;
      const raisePenalty = raiseProbability * invest * (["nuts", "strong-value", "combo-draw", "nut-draw"].includes(heroClass) ? 0.04 : 0.32);
      ev = foldProbability * net(pot) + (1 - foldProbability) * (equityWhenCalled * net(calledPot) - invest) - raisePenalty;
    }
    const rangeAmbiguity = state.street === "river" && ["thin-value", "bluff-catcher"].includes(heroClass) ? 0.065 : 0;
    const uncertainty = Math.max(1, scale * (0.045 + rangeAmbiguity + Math.max(0, context.activePlayers - 2) * 0.02));
    return {
      action,
      evMethod: (terminal?.method ?? "heuristic") as ActionEvaluation["evMethod"],
      label: actionLabel({ ...state, currentActor: seatIndex }, action),
      ev: Math.round(ev * 10) / 10,
      evLow: Math.round((ev - uncertainty) * 10) / 10,
      evHigh: Math.round((ev + uncertainty) * 10) / 10,
      ...(coachingEvaluation ? { rangeEquity: overallEquity } : {}),
      foldProbability,
      equityWhenCalled,
      raiseProbability,
    };
  }).sort((a, b) => b.ev - a.ev);
}

export function estimateRangeEquityV7(
  state: HandState,
  seatIndex: number,
  iterations = 72,
  random: () => number = Math.random,
) {
  const hole = state.players[seatIndex].hole;
  if (hole.length !== 2) return 0;
  const context = buildBotContext(state, seatIndex);
  const known = new Set([...hole, ...state.board].map(cardLabel));
  let shares = 0;
  for (let run = 0; run < iterations; run += 1) {
    const available = shuffledDeck(random).filter((card) => !known.has(cardLabel(card)));
    const rivals = context.opponents.map((opponent) => weightedHoleSample(
      available,
      (cards) => opponentRangeWeight(state, opponent, cards, false),
      random,
    ));
    const completed = [...state.board];
    while (completed.length < 5) completed.push(available.pop()!);
    const hero = evaluateHand([...hole, ...completed]).score;
    const scores = rivals.map((cards) => evaluateHand([...cards, ...completed]).score);
    if (!scores.some((score) => compareScores(score, hero) > 0)) {
      shares += 1 / (scores.filter((score) => compareScores(score, hero) === 0).length + 1);
    }
  }
  return shares / iterations;
}

export function evaluationForAction(evaluations: ActionEvaluation[], action: PokerAction) {
  const sameType = evaluations.filter((evaluation) => evaluation.action.type === action.type);
  if (action.type !== "raise") return sameType[0];
  return sameType.find((evaluation) => evaluation.action.amount === action.amount);
}
