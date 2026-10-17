import { boardWetness, classifyStrategicHand, handFeatures } from "./board";
import { VALUES, cardLabel } from "./cards";
import { actsAfterPostflop, botView, buildBotContext } from "./context";
import { estimateRangeEquityV7, evaluatePostflopActions } from "./evaluation";
import { DEEP_OPEN_RANGES, analyzePreflopSpot, preflopStrength, startingHandKey } from "./preflop";
import { POSITION_OPEN_RATE, PROFILE, bluffCandidate } from "./profiles";
import { analyzeFlopStrategy } from "./ranges";
import { legalBounds, potTotal } from "./rules";
import { type BotDecisionContext, type BotProfile, type Card, type FlopStrategyModule, type HandState, type PokerAction, type Position, type Street } from "./types";

const RESPONSE_PROFILE: Record<BotProfile, {
  continue: number;
  threeBet: number;
  fourBet: number;
  callShare: number;
  bluff: number;
}> = {
  balanced: { continue: 1, threeBet: 1, fourBet: 1, callShare: 1, bluff: 1 },
  tag: { continue: 0.88, threeBet: 0.94, fourBet: 1.02, callShare: 0.82, bluff: 0.72 },
  lag: { continue: 1.22, threeBet: 1.42, fourBet: 1.35, callShare: 0.9, bluff: 1.48 },
  nit: { continue: 0.64, threeBet: 0.62, fourBet: 0.72, callShare: 0.72, bluff: 0.32 },
  caller: { continue: 1.42, threeBet: 0.42, fourBet: 0.45, callShare: 1.55, bluff: 0.35 },
};

const CONTINUE_VS_OPEN: Record<Position, number> = {
  UTG: 0.105,
  HJ: 0.13,
  CO: 0.17,
  BTN: 0.215,
  "BTN/SB": 0.31,
  SB: 0.265,
  BB: 0.2,
};

const THREE_BET_VS_OPEN: Record<Position, number> = {
  UTG: 0.045,
  HJ: 0.055,
  CO: 0.075,
  BTN: 0.1,
  "BTN/SB": 0.13,
  SB: 0.115,
  BB: 0.075,
};

function preflopHasPosition(state: HandState, actor: number, opponent: number | null) {
  if (opponent === null) return ["CO", "BTN", "BTN/SB"].includes(state.players[actor].position);
  return actsAfterPostflop(state, actor, opponent);
}

export function contextualPreflopRaise(state: HandState, seatIndex: number): PokerAction {
  const player = state.players[seatIndex];
  const bounds = legalBounds(state, seatIndex);
  const context = buildBotContext(state, seatIndex);
  const lastRaiser = [...context.actions].reverse().find((action) => action.street === "preflop" && (action.type === "raise" || action.type === "all-in"))?.seat ?? null;
  const inPosition = preflopHasPosition(state, seatIndex, lastRaiser);
  let target: number;
  if (state.raiseCount === 0) {
    const base = player.position === "SB" ? 6 : player.position === "BTN" || player.position === "BTN/SB" || player.position === "CO" ? 5 : 6;
    target = base + context.limpers * 2;
  } else if (state.raiseCount === 1) {
    const multiplier = inPosition ? 3.25 : 4.15;
    target = Math.round(state.currentBet * multiplier + context.callers * state.currentBet * 0.8);
  } else {
    const multiplier = inPosition ? 2.25 : 2.45;
    target = Math.round(state.currentBet * multiplier);
  }
  target = Math.max(bounds.min, Math.min(bounds.max, target));
  return target === bounds.max ? { type: "all-in" } : { type: "raise", amount: target };
}

function preflopDecisionV6(state: HandState, seatIndex: number, random: () => number): PokerAction {
  const player = state.players[seatIndex];
  const bounds = legalBounds(state, seatIndex);
  const style = PROFILE[player.profile];
  const response = RESPONSE_PROFILE[player.profile];
  const context = buildBotContext(state, seatIndex);
  const raw = preflopStrength(player.hole);
  const strength = Math.max(0, Math.min(1, raw + (random() - 0.5) * 0.018));
  const passiveAction = bounds.toCall > 0 ? { type: "call" as const } : { type: "check" as const };
  const foldAction = bounds.toCall > 0 ? { type: "fold" as const } : { type: "check" as const };

  if (state.raiseCount === 0) {
    const openRate = Math.min(0.62, POSITION_OPEN_RATE[player.position] * style.openFactor);
    if (strength < 1 - openRate) return foldAction;
    if (bounds.canRaise && random() < style.openRaise) return contextualPreflopRaise(state, seatIndex);
    return passiveAction;
  }

  const openerPosition = context.facingPosition ?? "UTG";
  const opener = context.opener;
  const hasPosition = preflopHasPosition(state, seatIndex, opener);
  const blindDefense = player.position === "BB"
    ? openerPosition === "BTN/SB" ? 0.24 : openerPosition === "SB" ? 0.19 : openerPosition === "BTN" ? 0.105 : openerPosition === "CO" ? 0.055 : 0.015
    : player.position === "SB" && openerPosition === "BTN" ? 0.045 : 0;

  if (state.raiseCount === 1) {
    let continueRate = (CONTINUE_VS_OPEN[openerPosition] + blindDefense + (hasPosition ? 0.025 : 0)) * response.continue;
    let threeBetRate = (THREE_BET_VS_OPEN[openerPosition] + blindDefense * 0.2 + (context.callers > 0 ? 0.018 : 0)) * response.threeBet;
    continueRate = Math.min(0.48, Math.max(threeBetRate + 0.02, continueRate));
    threeBetRate = Math.min(0.2, threeBetRate);
    const bluffThreeBet = bluffCandidate(player.hole) && random() < style.bluff * response.bluff * (context.callers > 0 ? 1.15 : 0.8);
    if (bounds.canRaise && (strength >= 1 - threeBetRate || bluffThreeBet) && random() < style.preflopAggression) {
      return contextualPreflopRaise(state, seatIndex);
    }
    if (strength >= 1 - continueRate && random() < Math.min(0.99, response.callShare)) return passiveAction;
    return foldAction;
  }

  if (state.raiseCount === 2) {
    const isOriginalOpener = context.opener === seatIndex;
    const lateOpen = openerPosition === "CO" || openerPosition === "BTN" || openerPosition === "BTN/SB" || openerPosition === "SB";
    const defendRate = (isOriginalOpener ? (lateOpen ? 0.12 : 0.075) : 0.035) * response.continue * (hasPosition ? 1.15 : 0.9);
    const fourBetRate = (isOriginalOpener ? (lateOpen ? 0.033 : 0.024) : 0.017) * response.fourBet;
    const bluffFourBet = isOriginalOpener && bluffCandidate(player.hole) && random() < style.bluff * response.bluff * 0.28;
    if (bounds.canRaise && (strength >= 1 - fourBetRate || bluffFourBet)) return contextualPreflopRaise(state, seatIndex);
    if (strength >= 1 - defendRate && bounds.toCall <= player.stack * 0.3) return passiveAction;
    return foldAction;
  }

  const stackOffRate = style.stackOff * (context.potType === "four-bet-plus" ? 1 : 0.8);
  if (bounds.canRaise && strength >= 1 - stackOffRate) return { type: "all-in" };
  if (strength >= 1 - Math.max(style.continueVsFourBet, stackOffRate) && bounds.toCall <= player.stack * 0.34) return passiveAction;
  return foldAction;
}

function preflopDecisionV7(state: HandState, seatIndex: number, random: () => number): PokerAction {
  if (state.raiseCount !== 0) return preflopDecisionV6(state, seatIndex, random);

  const player = state.players[seatIndex];
  const bounds = legalBounds(state, seatIndex);
  const style = PROFILE[player.profile];
  const context = buildBotContext(state, seatIndex);
  const strength = Math.max(0, Math.min(1, preflopStrength(player.hole) + (random() - 0.5) * 0.018));
  const passiveAction = bounds.toCall > 0 ? { type: "call" as const } : { type: "check" as const };
  const foldAction = bounds.toCall > 0 ? { type: "fold" as const } : { type: "check" as const };
  const limperIndices = [...new Set(context.actions
    .filter((action) => action.street === "preflop" && action.raiseLevel === 0 && action.type === "call")
    .map((action) => action.seat))];
  const limperCallingGap = limperIndices.reduce((sum, index) => {
    const stats = state.players[index].stats;
    const observedGap = stats.hands ? (stats.vpip - stats.pfr) / stats.hands : 0.1;
    const confidence = Math.min(0.7, stats.hands / 70);
    return sum + 0.1 * (1 - confidence) + observedGap * confidence;
  }, 0) / Math.max(1, limperIndices.length);
  const latePosition = player.position === "CO" || player.position === "BTN" || player.position === "BTN/SB";
  let openRate = Math.min(0.62, POSITION_OPEN_RATE[player.position] * style.openFactor);

  if (limperIndices.length > 0) {
    const outOfPositionPenalty = player.position === "SB" || player.position === "BB" ? 0.78 : 0.9;
    const stickyPenalty = 1 - Math.max(0, Math.min(0.16, (limperCallingGap - 0.08) * 0.8));
    openRate *= outOfPositionPenalty * stickyPenalty;
  }
  if (strength < 1 - openRate) return foldAction;

  let raiseChance = style.openRaise;
  if (latePosition && strength > 0.72) {
    raiseChance = Math.min(0.98, raiseChance + (player.profile === "caller" ? 0.38 : 0.08));
  }
  if (limperIndices.length > 0) {
    const valueIsolationFloor = 1 - Math.min(0.28, openRate * 0.68);
    const suited = player.hole[0].suit === player.hole[1].suit;
    const playableIsolation = strength >= valueIsolationFloor
      || (player.profile === "lag" && suited && strength >= valueIsolationFloor - 0.07 && random() < 0.38);
    if (!playableIsolation) return player.profile === "caller" && suited && bounds.toCall <= 2 ? passiveAction : foldAction;
    raiseChance = Math.min(0.98, raiseChance + 0.08);
  }

  if (bounds.canRaise && random() < raiseChance) return contextualPreflopRaise(state, seatIndex);
  return passiveAction;
}

function postflopRaiseAction(state: HandState, seatIndex: number, strength: number, context: BotDecisionContext) {
  const bounds = legalBounds(state, seatIndex);
  const wetness = boardWetness(context.board);
  const isValue = strength >= 0.68;
  let fraction = isValue ? (wetness > 0.55 ? 0.78 : 0.62) : (wetness > 0.55 ? 0.58 : 0.34);
  if (context.potType === "three-bet" || context.potType === "four-bet-plus") fraction *= 0.78;
  if (!context.inPosition && state.currentBet > 0) fraction += 0.1;
  const target = Math.min(bounds.max, Math.max(bounds.min, state.currentBet + Math.max(state.minRaise, Math.round(context.pot * fraction))));
  if (target === bounds.max && (context.spr < 0.9 || strength > 0.84)) return { type: "all-in" as const };
  return { type: "raise" as const, amount: target };
}

const STAB_PROFILE: Record<BotProfile, number> = {
  balanced: 0.24,
  tag: 0.2,
  lag: 0.36,
  nit: 0.08,
  caller: 0.15,
};

const FOLD_DISCIPLINE: Record<BotProfile, number> = {
  balanced: 0.025,
  tag: 0.035,
  lag: 0.012,
  nit: 0.065,
  caller: -0.025,
};

function decideBotV7FromPublicState(state: HandState, seatIndex: number, random: () => number): PokerAction {
  if (state.street === "preflop") return preflopDecisionV7(state, seatIndex, random);

  const player = state.players[seatIndex];
  const style = PROFILE[player.profile];
  const response = RESPONSE_PROFILE[player.profile];
  const context = buildBotContext(state, seatIndex);
  const bounds = legalBounds(state, seatIndex);
  const features = handFeatures(player.hole, context.board);
  const equity = estimateRangeEquityV7(state, seatIndex, 56, random);
  const multiwayPenalty = Math.max(0, context.activePlayers - 2) * 0.028;
  const realization = context.inPosition ? 0.038 : -0.028;
  const drawRealization = features.draw && context.inPosition ? 0.02 : 0;
  const realizedEquity = Math.max(0, Math.min(1, equity + realization + drawRealization - multiwayPenalty));
  const potOdds = bounds.toCall / Math.max(1, context.pot + bounds.toCall);
  const isAggressor = context.aggressor === seatIndex;
  const wetness = boardWetness(context.board);
  const headsUp = context.activePlayers === 2;
  const pressure = bounds.toCall / Math.max(1, player.stack + bounds.toCall);
  const readTargets = context.opponents;
  const observed = readTargets.map((index) => state.players[index].stats);
  const opponentSamples = observed.reduce((sum, stats) => sum + Math.min(60, stats.hands), 0);
  const observedVpips = observed.reduce((sum, stats) => sum + (stats.hands ? stats.vpip / stats.hands : 0.24), 0) / Math.max(1, observed.length);
  const observedPfrs = observed.reduce((sum, stats) => sum + (stats.hands ? stats.pfr / stats.hands : 0.18), 0) / Math.max(1, observed.length);
  const readConfidence = Math.min(0.65, opponentSamples / Math.max(1, observed.length * 60));
  const callingRead = Math.max(-0.04, Math.min(0.06, (observedVpips - observedPfrs - 0.08) * readConfidence));
  const futureRisk = context.inPosition ? 0.012 : 0.038 + Math.min(0.05, context.spr * 0.0045);
  const callFloor = Math.min(0.62, Math.max(0.08, potOdds + futureRisk + FOLD_DISCIPLINE[player.profile] + multiwayPenalty - (features.draw ? 0.045 : 0)));
  const valueRaise = (bounds.toCall > 0
    ? style.raiseThreshold + multiwayPenalty - (context.spr < 1 ? 0.055 : 0)
    : style.betThreshold + multiwayPenalty) - callingRead * 0.45;
  const rangeAdvantage = isAggressor && wetness < 0.48 ? 0.035 : 0;
  const positionBluff = context.inPosition ? 1.22 : 0.58;
  const initiativeBluff = isAggressor ? 1.16 : bounds.toCall === 0 && context.inPosition ? 0.9 : 0.5;
  const drawBluff = features.draw || features.blocker ? 1.4 : 0.66;
  const bluffChance = style.bluff * response.bluff * positionBluff * initiativeBluff * drawBluff * (headsUp ? 1 : 0.28) * (pressure > 0.45 ? 0.35 : 1) * (1 - Math.max(0, callingRead) * 4);

  const actionableOpponents = context.opponents.filter((index) => !state.players[index].allIn);
  const streetActions = context.actions.filter((action) => action.street === state.street);
  const checkedTo = bounds.toCall === 0
    && context.inPosition
    && actionableOpponents.length > 0
    && actionableOpponents.every((index) => streetActions.some((action) => action.seat === index && action.type === "check"))
    && !streetActions.some((action) => action.type === "raise" || action.type === "all-in");
  const priorStreet: Street | null = state.street === "turn" ? "flop" : state.street === "river" ? "turn" : null;
  const priorCheckedThrough = priorStreet !== null
    && context.actions.some((action) => action.street === priorStreet && action.type === "check")
    && !context.actions.some((action) => action.street === priorStreet && (action.type === "raise" || action.type === "all-in"));

  if (bounds.toCall > 0) {
    const canValueRaise = realizedEquity >= valueRaise;
    const canBluffRaise = features.draw && random() < bluffChance;
    if (bounds.canRaise && (canValueRaise || canBluffRaise) && random() < style.postflopAggression) {
      return postflopRaiseAction(state, seatIndex, realizedEquity, context);
    }
    if (realizedEquity + style.callBias < callFloor) return { type: "fold" };
    return { type: "call" };
  }

  const betThreshold = valueRaise - rangeAdvantage - (context.inPosition ? 0.025 : 0) - (context.spr < 1 ? 0.04 : 0);
  const canValueBet = realizedEquity >= betThreshold;
  const riverBluffCandidate = state.street !== "river" || features.blocker;
  if (bounds.canRaise && checkedTo && !features.madeWithHole && riverBluffCandidate) {
    const candidateQuality = features.draw || features.blocker ? 1.25 : features.overcards > 0 ? 1 : 0.72;
    const delayedBonus = priorCheckedThrough ? 1.3 : 1;
    const stabChance = STAB_PROFILE[player.profile] * candidateQuality * delayedBonus * (headsUp ? 1 : 0.36) * (1 - Math.max(0, callingRead) * 4);
    if (random() < stabChance) return postflopRaiseAction(state, seatIndex, realizedEquity, context);
  }
  const canBluff = random() < bluffChance;
  if (bounds.canRaise && (canValueBet || canBluff) && random() < style.postflopAggression) {
    return postflopRaiseAction(state, seatIndex, realizedEquity, context);
  }
  return { type: "check" };
}

function stableDecisionMix(state: HandState, seatIndex: number, salt = "") {
  const text = `${salt}|${state.handNumber}|${state.street}|${state.actionLog.length}|${seatIndex}|${state.players[seatIndex].hole.map(cardLabel).join("")}|${state.board.map(cardLabel).join("")}`;
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return (hash >>> 0) / 4_294_967_296;
}

function premiumCheckedToValueBet(state: HandState, seatIndex: number): PokerAction | null {
  if (state.street === "preflop" || state.street === "river") return null;
  const player = state.players[seatIndex];
  const bounds = legalBounds(state, seatIndex);
  if (bounds.toCall > 0 || !bounds.canRaise) return null;
  const context = buildBotContext(state, seatIndex);
  if (!context.inPosition || context.activePlayers !== 2) return null;
  const streetActions = context.actions.filter((action) => action.street === state.street);
  const opponent = context.opponents.find((index) => !state.players[index].allIn);
  const checkedTo = opponent !== undefined
    && streetActions.some((action) => action.seat === opponent && action.type === "check")
    && !streetActions.some((action) => action.type === "raise" || action.type === "all-in");
  if (!checkedTo) return null;

  const features = handFeatures(player.hole, context.board);
  const bothHoleCardsPairBoard = player.hole.length === 2
    && player.hole[0].rank !== player.hole[1].rank
    && player.hole.every((holeCard) => context.board.some((boardCard) => boardCard.rank === holeCard.rank));
  const premiumMadeHand = features.made >= 3 || (features.made === 2 && bothHoleCardsPairBoard);
  if (!premiumMadeHand) return null;

  // Even passive opponents should normally bet vulnerable two pair or better
  // when checked to. Retain a small slow-play frequency so personalities do
  // not become deterministic, with less trapping on coordinated boards.
  const wetness = boardWetness(context.board);
  const slowPlayRate = wetness > 0.55 ? 0.03 : player.profile === "caller" ? 0.12 : 0.08;
  if (stableDecisionMix(state, seatIndex) < slowPlayRate) return null;
  return postflopRaiseAction(state, seatIndex, 0.82, context);
}

function preflopCandidateFromPublicState(state: HandState, seatIndex: number, random: () => number): PokerAction {
  const baseline = preflopDecisionV7(state, seatIndex, random);
  const plan = analyzePreflopSpot(state, seatIndex);
  if (!plan) return baseline;
  const bounds = legalBounds(state, seatIndex);
  const shortStackBlend = Math.max(0, Math.min(1, (35 - plan.effectiveStackBb) / 20));
  const player = state.players[seatIndex];
  const context = buildBotContext(state, seatIndex);

  // Preserve a visible passive-aggressive distinction in unopened pots. A
  // calling-station can still raise good hands, but occasionally limps a hand
  // the predecessor would open so its PFR remains below the nit population.
  if (state.raiseCount === 0 && context.limpers === 0 && player.profile === "caller"
    && baseline.type === "raise" && stableDecisionMix(state, seatIndex, "caller-open") < 0.02) {
    return bounds.toCall > 0 ? { type: "call" } : { type: "check" };
  }

  // Preserve the predecessor's participation rate while improving the shape
  // of a balanced unopened range: favor position-specific suited and connected
  // hands over similarly ranked but strategically weaker offsuit holdings.
  if (state.raiseCount === 0 && context.limpers === 0 && ["balanced", "tag"].includes(player.profile)) {
    const inPositionRange = DEEP_OPEN_RANGES[player.position].has(plan.hand);
    const correctionFrequency = player.profile === "balanced" ? 0.45 : 1;
    if (!inPositionRange && baseline.type !== "fold" && baseline.type !== "check"
      && stableDecisionMix(state, seatIndex, "range-shape") < correctionFrequency) {
      return bounds.toCall > 0 ? { type: "fold" } : { type: "check" };
    }
    if (player.profile === "balanced" && inPositionRange && baseline.type === "fold" && bounds.canRaise
      && stableDecisionMix(state, seatIndex, "range-fill") < 0.06) {
      return contextualPreflopRaise(state, seatIndex);
    }
  }
  // Blend short-stack premium charts gradually rather than switching policies
  // at one exact stack depth.
  if (plan.preferred === "all-in" && plan.confidence === "High" && shortStackBlend > 0 && random() < shortStackBlend) {
    return { type: "all-in" };
  }
  return baseline;
}

function decideBotCandidateFromPublicState(state: HandState, seatIndex: number, random: () => number): PokerAction {
  if (state.street === "preflop") return preflopCandidateFromPublicState(state, seatIndex, random);
  const baseline = decideBotV7FromPublicState(state, seatIndex, random);
  if (baseline.type === "check") return premiumCheckedToValueBet(state, seatIndex) ?? baseline;
  if (state.players[seatIndex].profile === "nit" && baseline.type === "raise"
    && stableDecisionMix(state, seatIndex, "nit-aggression") < 0.1) {
    return legalBounds(state, seatIndex).toCall > 0 ? { type: "call" } : { type: "check" };
  }
  return baseline;
}

export function decideBotCandidate(state: HandState, seatIndex: number, random: () => number = Math.random): PokerAction {
  const publicState = botView(state, seatIndex);
  return decideBotCandidateFromPublicState(publicState, seatIndex, random);
}

// Frozen production policy from Site version 19. Future candidates are always
// compared against this boundary rather than silently moving the baseline.
export function decideBotV8(state: HandState, seatIndex: number, random: () => number = Math.random): PokerAction {
  return decideBotCandidate(state, seatIndex, random);
}

function decideBotV10FromPublicState(state: HandState, seatIndex: number, random: () => number): PokerAction {
  const baseline = decideBotCandidateFromPublicState(state, seatIndex, random);
  if (state.street !== "river" || baseline.type !== "check" || legalBounds(state, seatIndex).toCall > 0) return baseline;
  const context = buildBotContext(state, seatIndex);
  if (context.activePlayers !== 2) return baseline;
  const effectiveStartingStack = Math.min(
    state.players[seatIndex].stack + state.players[seatIndex].committed,
    ...context.opponents.map((opponent) => state.players[opponent].stack + state.players[opponent].committed),
  );
  // The candidate has cleared 40–100 BB play. Preserve the frozen policy in
  // deeper games until a dedicated deep-stack search clears its own gate.
  if (effectiveStartingStack > 300) return baseline;
  const handClass = classifyStrategicHand(state.players[seatIndex].hole, state.board);
  if (handClass !== "nuts" && handClass !== "strong-value") return baseline;
  const evaluations = evaluatePostflopActions(state, seatIndex, 40, random);
  const check = evaluations.find((evaluation) => evaluation.action.type === "check");
  const pot = potTotal(state);
  const valueBets = evaluations.filter((evaluation) => {
    if (evaluation.action.type !== "raise" && evaluation.action.type !== "all-in") return false;
    const target = evaluation.action.type === "all-in" ? legalBounds(state, seatIndex).max : evaluation.action.amount ?? 0;
    const fraction = Math.max(0, target - state.players[seatIndex].streetBet) / Math.max(1, pot);
    return (evaluation.equityWhenCalled ?? 0) >= 0.58 && (fraction <= 0.82 || context.spr <= 0.65);
  });
  const bestBet = valueBets[0];
  if (!check || !bestBet || bestBet.evLow <= check.ev + Math.max(1, pot * 0.035)) return baseline;
  if (bestBet.action.type === "all-in" && context.spr > 1) {
    const sized = evaluations.find((evaluation) => evaluation.action.type === "raise");
    if (!sized || sized.evLow <= check.ev) return baseline;
    return sized.action;
  }
  const profileFrequency: Record<BotProfile, number> = { balanced: 0.94, tag: 0.92, lag: 0.96, nit: 0.78, caller: 0.82 };
  return stableDecisionMix(state, seatIndex, "v10-river-value") < profileFrequency[state.players[seatIndex].profile] ? bestBet.action : baseline;
}

export function decideBotV10Candidate(state: HandState, seatIndex: number, random: () => number = Math.random): PokerAction {
  const publicState = botView(state, seatIndex);
  return decideBotV10FromPublicState(publicState, seatIndex, random);
}

// Frozen production policy from Site version 21. Turn candidates are compared
// against this exact boundary so the promoted river gain cannot drift.
export function decideBotV10(state: HandState, seatIndex: number, random: () => number = Math.random): PokerAction {
  return decideBotV10Candidate(state, seatIndex, random);
}

function decideTurnV11(state: HandState, seatIndex: number, baseline: PokerAction, random: () => number): PokerAction {
  if (state.street !== "turn") return baseline;
  const context = buildBotContext(state, seatIndex);
  if (context.activePlayers !== 2) return baseline;
  const effectiveStartingStack = Math.min(
    state.players[seatIndex].stack + state.players[seatIndex].committed,
    ...context.opponents.map((opponent) => state.players[opponent].stack + state.players[opponent].committed),
  );
  if (effectiveStartingStack > 300) return baseline;
  const bounds = legalBounds(state, seatIndex);
  const handClass = classifyStrategicHand(state.players[seatIndex].hole, state.board);
  const pot = potTotal(state);

  // Ablation A: recover high-confidence value that the threshold policy checks.
  if (baseline.type === "check" && bounds.toCall === 0 && (handClass === "nuts" || handClass === "strong-value")) {
    const evaluations = evaluatePostflopActions(state, seatIndex, 28, random);
    const check = evaluations.find((evaluation) => evaluation.action.type === "check");
    const valueBet = evaluations.find((evaluation) => {
      if (evaluation.action.type !== "raise" && evaluation.action.type !== "all-in") return false;
      const target = evaluation.action.type === "all-in" ? bounds.max : evaluation.action.amount ?? 0;
      const fraction = Math.max(0, target - state.players[seatIndex].streetBet) / Math.max(1, pot);
      return (evaluation.equityWhenCalled ?? 0) >= 0.62 && (fraction <= 0.8 || context.spr <= 0.7);
    });
    if (check && valueBet && valueBet.evLow > check.evHigh + Math.max(1, pot * 0.025)) {
      const frequency: Record<BotProfile, number> = { balanced: 0.94, tag: 0.92, lag: 0.96, nit: 0.8, caller: 0.84 };
      if (stableDecisionMix(state, seatIndex, "v11-turn-value") < frequency[state.players[seatIndex].profile]) return valueBet.action;
    }
  }

  return baseline;
}

function decideBotV11FromPublicState(state: HandState, seatIndex: number, random: () => number): PokerAction {
  const baseline = decideBotV10FromPublicState(state, seatIndex, random);
  return decideTurnV11(state, seatIndex, baseline, random);
}

export function decideBotV11Candidate(state: HandState, seatIndex: number, random: () => number = Math.random): PokerAction {
  const publicState = botView(state, seatIndex);
  return decideBotV11FromPublicState(publicState, seatIndex, random);
}

// Frozen production policy from Site version 22. Flop candidates are compared
// against this boundary so the validated turn and river gains remain intact.
export function decideBotV11(state: HandState, seatIndex: number, random: () => number = Math.random): PokerAction {
  return decideBotV11Candidate(state, seatIndex, random);
}

function flopRaiseToFraction(state: HandState, seatIndex: number, fraction: number, allowAllIn = false): PokerAction {
  const bounds = legalBounds(state, seatIndex);
  const context = buildBotContext(state, seatIndex);
  const target = Math.max(bounds.min, Math.min(bounds.max, Math.round(state.currentBet + context.pot * fraction)));
  if (target >= bounds.max && (allowAllIn || context.spr <= 0.8)) return { type: "all-in" };
  return { type: "raise", amount: target };
}

function flopMadeHandDetails(hole: Card[], board: Card[]) {
  const features = handFeatures(hole, board);
  const boardRanks = board.map((card) => VALUES[card.rank]);
  const holeValues = hole.map((card) => VALUES[card.rank]);
  const pocketPair = hole[0].rank === hole[1].rank;
  const overpair = pocketPair && holeValues[0] > Math.max(...boardRanks);
  const pairedHole = hole.filter((card) => board.some((boardCard) => boardCard.rank === card.rank));
  const topPair = pairedHole.some((card) => VALUES[card.rank] === Math.max(...boardRanks));
  const topPairKicker = topPair ? Math.max(...hole.filter((card) => !pairedHole.includes(card)).map((card) => VALUES[card.rank]), 0) : 0;
  return { ...features, overpair, topPair, topPairKicker };
}

const PROMOTED_FLOP_MODULES = new Set<FlopStrategyModule>(["value", "range-bet"]);

function decideFlopV12(state: HandState, seatIndex: number, baseline: PokerAction, modules: ReadonlySet<FlopStrategyModule> = PROMOTED_FLOP_MODULES): PokerAction {
  if (state.street !== "flop") return baseline;
  const context = buildBotContext(state, seatIndex);
  if (context.activePlayers !== 2) return baseline;
  const effectiveStartingStack = Math.min(
    state.players[seatIndex].stack + state.players[seatIndex].committed,
    ...context.opponents.map((opponent) => state.players[opponent].stack + state.players[opponent].committed),
  );
  if (effectiveStartingStack > 300) return baseline;
  const analysis = analyzeFlopStrategy(state, seatIndex);
  if (!analysis) return baseline;
  const player = state.players[seatIndex];
  const bounds = legalBounds(state, seatIndex);
  const details = flopMadeHandDetails(player.hole, state.board);
  const mix = (salt: string) => stableDecisionMix(state, seatIndex, `v12-flop-${salt}`);
  const aggressive = baseline.type === "raise" || baseline.type === "all-in";
  const highConfidenceValue = analysis.handClass === "nuts" || analysis.handClass === "strong-value" || details.overpair;
  const vulnerableValue = highConfidenceValue || (details.topPair && details.topPairKicker >= 11);
  const valueFrequency: Record<BotProfile, number> = { balanced: 0.9, tag: 0.92, lag: 0.94, nit: 0.9, caller: 0.48 };

  // A calling station's defining error is excessive calling, not random
  // aggression. Preserve value raises and real semi-bluffs, but trim marginal
  // baseline bets so the population stays observably passive.
  if (modules.has("cbet-suppression") && player.profile === "caller" && aggressive && !highConfidenceValue && !details.draw && mix("caller-passivity") < 0.32) {
    return bounds.toCall > 0 ? { type: "call" } : { type: "check" };
  }

  // A: recover missed value and protection, especially on dynamic boards.
  if (modules.has("value") && bounds.toCall === 0 && !aggressive && vulnerableValue && bounds.canRaise) {
    const frequency = valueFrequency[player.profile] * (analysis.texture.dynamic ? 1 : highConfidenceValue ? 0.82 : 0.58);
    if (mix("value") < frequency) return flopRaiseToFraction(state, seatIndex, analysis.texture.dynamic ? 0.72 : 0.42);
  }

  // B: suppress automatic c-bets where the caller owns more two-pair, sets,
  // and strong draws. Retain bets with real equity or credible blockers.
  const isCbet = context.aggressor === seatIndex && bounds.toCall === 0 && aggressive;
  const weak = ["air", "showdown-value", "blocker-bluff"].includes(analysis.handClass) && !details.draw;
  if (modules.has("cbet-suppression") && isCbet && weak && analysis.rangeAdvantage < 0.15 && analysis.texture.dynamic) {
    const checkFrequency: Record<BotProfile, number> = { balanced: 0.68, tag: 0.74, lag: 0.46, nit: 0.78, caller: 0.9 };
    if (mix("cbet-suppress") < checkFrequency[player.profile]) return { type: "check" };
  }

  // C: use a small range bet on static high-card boards where the preflop
  // aggressor retains an equity and nut advantage.
  if (modules.has("range-bet") && context.aggressor === seatIndex && bounds.toCall === 0 && !aggressive && bounds.canRaise
    && analysis.rangeAdvantage >= 0.35 && analysis.texture.stability === "static") {
    const highCardBluff = Math.max(...player.hole.map((card) => VALUES[card.rank])) >= 12;
    const eligible = analysis.handClass !== "air" || details.overcards > 0 || highCardBluff || analysis.texture.paired;
    const frequency: Record<BotProfile, number> = { balanced: 0.58, tag: 0.54, lag: 0.7, nit: 0.4, caller: 0.08 };
    if (eligible && mix("range-bet") < frequency[player.profile]) return flopRaiseToFraction(state, seatIndex, 0.33);
  }

  if (bounds.toCall > 0) {
    const streetActions = state.actionLog.filter((action) => action.street === "flop");
    const checkedEarlier = streetActions.some((action) => action.seat === seatIndex && action.type === "check");
    const betFraction = bounds.toCall / Math.max(1, context.pot);

    // D: polarized check-raises—strong value plus robust draws, never random air.
    const checkRaiseCandidate = highConfidenceValue || analysis.handClass === "combo-draw" || analysis.handClass === "nut-draw";
    if (modules.has("check-raise") && checkedEarlier && bounds.canRaise && baseline.type !== "raise" && baseline.type !== "all-in" && checkRaiseCandidate) {
      const frequency: Record<BotProfile, number> = { balanced: 0.46, tag: 0.5, lag: 0.62, nit: 0.38, caller: 0.12 };
      if (mix("check-raise") < frequency[player.profile]) return flopRaiseToFraction(state, seatIndex, analysis.texture.dynamic ? 0.78 : 0.62);
    }

    // E: repair clear defense errors without turning marginal hands into calls.
    if (modules.has("defense") && baseline.type === "fold" && (analysis.handClass === "combo-draw" || analysis.handClass === "nut-draw" || vulnerableValue) && betFraction <= 0.85) {
      return { type: "call" };
    }
    if (modules.has("defense") && baseline.type === "call" && analysis.handClass === "air" && !details.draw && details.overcards === 0 && betFraction >= 0.62) {
      return { type: "fold" };
    }
  }

  return baseline;
}

function decideBotV12FromPublicState(state: HandState, seatIndex: number, random: () => number, modules: ReadonlySet<FlopStrategyModule> = PROMOTED_FLOP_MODULES): PokerAction {
  const baseline = decideBotV11FromPublicState(state, seatIndex, random);
  return decideFlopV12(state, seatIndex, baseline, modules);
}

export function decideBotV12Candidate(state: HandState, seatIndex: number, random: () => number = Math.random): PokerAction {
  const publicState = botView(state, seatIndex);
  return decideBotV12FromPublicState(publicState, seatIndex, random);
}

export function decideBotV12Ablation(state: HandState, seatIndex: number, modules: FlopStrategyModule[], random: () => number = Math.random): PokerAction {
  const publicState = botView(state, seatIndex);
  return decideBotV12FromPublicState(publicState, seatIndex, random, new Set(modules));
}

function decideBotV9FromPublicState(state: HandState, seatIndex: number, random: () => number): PokerAction {
  const baseline = decideBotCandidateFromPublicState(state, seatIndex, random);
  if (state.street === "preflop") {
    const plan = analyzePreflopSpot(state, seatIndex);
    if (!plan) return baseline;
    const player = state.players[seatIndex];
    const bounds = legalBounds(state, seatIndex);
    if (player.position === "SB" && state.raiseCount === 0 && plan.scenario === "Small blind first-in") {
      // The mixed chart is exposed to the coach, but the first candidate's
      // broad limping override lost to V8 in paired play. Preserve V8 until a
      // narrower SB mix clears the promotion gate.
      return baseline;
    }
    if (player.position === "BB" && state.raiseCount === 1 && plan.scenario.startsWith("BB defending")) {
      if ((player.profile === "balanced" || player.profile === "tag") && plan.preferred === "call" && baseline.type === "fold" && random() < 0.18) return { type: "call" };
      if ((player.profile === "balanced" || player.profile === "tag") && plan.preferred === "fold" && baseline.type === "call" && random() < 0.22) return { type: "fold" };
      if (plan.frequencies.raise >= 0.5 && bounds.canRaise && baseline.type !== "raise" && random() < 0.2) return contextualPreflopRaise(state, seatIndex);
    }
    return baseline;
  }
  // Action-EV is used as an explanatory coach until its response model clears
  // the paired-play promotion gate. V8 remains the postflop production policy.
  return baseline;
}

function decideBotV12LiveFromPublicState(state: HandState, seatIndex: number, random: () => number): PokerAction {
  return state.street === "preflop" ? decideBotV9FromPublicState(state, seatIndex, random) : decideBotV12FromPublicState(state, seatIndex, random);
}

/** The live policy before the style layer: the baseline that balanced and tight-aggressive play must not fall below. */
export function decideBotV12Live(state: HandState, seatIndex: number, random: () => number = Math.random): PokerAction {
  const publicState = botView(state, seatIndex);
  return decideBotV12LiveFromPublicState(publicState, seatIndex, random);
}

// ---------------------------------------------------------------------------
// Style layer (V13). Each opponent has a few readable habits that sit on top of
// the V12 policy. Balanced and tight-aggressive only gain chart-backed hands;
// the loose, tight and calling styles are meant to be exploitable, so they are
// judged by the bands in `npm run style:report`, not by the promotion gate.
// ---------------------------------------------------------------------------

type PreflopHabits = {
  /** Hands just outside the position chart that V12 folds in an unopened pot, opened anyway. */
  openWiden: number;
  /** Unopened pot, hands V12 folds: limp or call instead. */
  limp: number;
  /** Facing one raise, hands V12 folds: call instead. */
  defend: number;
  /** Facing one raise, hands V12 only calls or folds: three-bet instead. */
  lightThreeBet: number;
};

const PREFLOP_HABITS: Record<BotProfile, PreflopHabits> = {
  balanced: { openWiden: 1, limp: 0, defend: 0, lightThreeBet: 0 },
  tag: { openWiden: 1, limp: 0, defend: 0, lightThreeBet: 0 },
  lag: { openWiden: 0.32, limp: 0, defend: 0.2, lightThreeBet: 0.045 },
  nit: { openWiden: 0, limp: 0, defend: 0, lightThreeBet: 0 },
  caller: { openWiden: 0, limp: 0.35, defend: 0.45, lightThreeBet: 0 },
};

/** Styles that stay close to the book. */
const LATE_POSITION_ONLY = new Set<BotProfile>(["balanced", "tag"]);

/** Hands below this percentile are never played just for style. */
const STYLE_FLOOR: Record<BotProfile, number> = { balanced: 0.36, tag: 0.48, lag: 0.38, nit: 0.8, caller: 0.3 };

function stylePreflop(state: HandState, seatIndex: number, baseline: PokerAction): PokerAction {
  const player = state.players[seatIndex];
  const habits = PREFLOP_HABITS[player.profile];
  const bounds = legalBounds(state, seatIndex);
  const strength = preflopStrength(player.hole);
  const key = startingHandKey(player.hole);
  const mix = (salt: string) => stableDecisionMix(state, seatIndex, `v13-${salt}`);
  const passive: PokerAction = bounds.toCall > 0 ? { type: "call" } : { type: "check" };
  const folded = baseline.type === "fold" || (baseline.type === "check" && bounds.toCall > 0);
  const limpers = buildBotContext(state, seatIndex).limpers;

  if (state.raiseCount === 0) {
    if (!bounds.canRaise && !folded) return baseline;
    const inChart = DEEP_OPEN_RANGES[player.position].has(key);
    // Styles close to the book only add hands from the cutoff and button, where position makes it cheap.
    const lateEnough = !LATE_POSITION_ONLY.has(player.profile) || player.position === "CO" || player.position === "BTN";
    if (baseline.type === "fold" && bounds.canRaise && limpers === 0 && !inChart && lateEnough && strength >= STYLE_FLOOR[player.profile] && mix("widen") < habits.openWiden) {
      return contextualPreflopRaise(state, seatIndex);
    }
    if (baseline.type === "fold" && strength >= STYLE_FLOOR[player.profile] && mix("limp") < habits.limp) return passive;
    return baseline;
  }

  if (state.raiseCount === 1) {
    if (baseline.type !== "raise" && bounds.canRaise && strength >= STYLE_FLOOR[player.profile] && mix("3bet") < habits.lightThreeBet) return contextualPreflopRaise(state, seatIndex);
    if (baseline.type === "fold" && strength >= STYLE_FLOOR[player.profile] && mix("defend") < habits.defend) return passive;
  }
  return baseline;
}

/** The last community card is a scare card when it is a new overcard or completes a flush. */
function isScareCard(board: Card[]) {
  const last = board.at(-1);
  if (!last || board.length < 4) return false;
  const earlier = board.slice(0, -1);
  const overcard = VALUES[last.rank] > Math.max(...earlier.map((card) => VALUES[card.rank]));
  const flushCompleting = earlier.filter((card) => card.suit === last.suit).length === 2;
  return overcard || flushCompleting;
}

function styleBetFraction(state: HandState, seatIndex: number, fraction: number): PokerAction {
  const bounds = legalBounds(state, seatIndex);
  const pot = potTotal(state);
  const target = Math.max(bounds.min, Math.min(bounds.max, Math.round(state.currentBet + pot * fraction)));
  return target >= bounds.max ? { type: "all-in" } : { type: "raise", amount: target };
}

function stylePostflop(state: HandState, seatIndex: number, baseline: PokerAction): PokerAction {
  const player = state.players[seatIndex];
  const bounds = legalBounds(state, seatIndex);
  const context = buildBotContext(state, seatIndex);
  const features = handFeatures(player.hole, state.board);
  const handClass = classifyStrategicHand(player.hole, state.board);
  const strong = handClass === "nuts" || handClass === "strong-value" || features.made >= 3 || (features.made === 2 && features.madeWithHole);
  const aggressive = baseline.type === "raise" || baseline.type === "all-in";
  const facingBet = bounds.toCall > 0;
  const mix = (salt: string) => stableDecisionMix(state, seatIndex, `v13-${salt}`);
  const mine = state.actionLog.filter((entry) => entry.seat === seatIndex && entry.street !== "preflop");
  const priorStreet: Street | null = state.street === "turn" ? "flop" : state.street === "river" ? "turn" : null;
  const betLastStreet = priorStreet !== null && mine.some((entry) => entry.street === priorStreet && entry.type === "raise");
  const calledEarlierStreet = mine.some((entry) => entry.street !== state.street && entry.type === "call");

  switch (player.profile) {
    case "caller": {
      // Rarely lets go of a pair or ace high, however big the bet.
      const aceHigh = player.hole.some((card) => card.rank === "A");
      if (baseline.type === "fold" && (features.madeWithHole || aceHigh) && mix("sticky") < 0.6) return { type: "call" };
      // The occasional small bet when it has a pair, but never a bluff.
      if (!facingBet && baseline.type === "check" && bounds.canRaise && features.madeWithHole && mix("small-bet") < 0.12) return styleBetFraction(state, seatIndex, 0.5);
      return baseline;
    }
    case "nit": {
      // Gives up on a second barrel without a strong hand, and only raises with one.
      if (facingBet && !strong && calledEarlierStreet && state.street !== "flop" && baseline.type !== "fold" && mix("give-up") < 0.8) return { type: "fold" };
      if (aggressive && !strong && mix("raise-only-strong") < 0.6) return facingBet ? { type: "call" } : { type: "check" };
      return baseline;
    }
    case "lag": {
      // Fires again when the turn or river is a scare card.
      if (!facingBet && baseline.type === "check" && bounds.canRaise && betLastStreet && isScareCard(state.board) && context.activePlayers <= 3 && mix("barrel") < 0.6) {
        return styleBetFraction(state, seatIndex, 0.66);
      }
      return baseline;
    }
    case "tag": {
      // Leads small with a medium-strength hand rather than checking it.
      if (!facingBet && baseline.type === "check" && bounds.canRaise && features.madeWithHole && !strong && context.activePlayers === 2 && mix("small-lead") < 0.15) {
        return styleBetFraction(state, seatIndex, 0.33);
      }
      return baseline;
    }
    default:
      return baseline;
  }
}

function styleAction(state: HandState, seatIndex: number, baseline: PokerAction): PokerAction {
  return state.street === "preflop" ? stylePreflop(state, seatIndex, baseline) : stylePostflop(state, seatIndex, baseline);
}

function decideBotFromPublicState(state: HandState, seatIndex: number, random: () => number): PokerAction {
  return styleAction(state, seatIndex, decideBotV12LiveFromPublicState(state, seatIndex, random));
}

export function decideBot(state: HandState, seatIndex: number, random: () => number = Math.random): PokerAction {
  const publicState = botView(state, seatIndex);
  return decideBotFromPublicState(publicState, seatIndex, random);
}
