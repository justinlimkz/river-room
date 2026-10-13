import { boardWetness, handFeatures } from "./board";
import { contextualPreflopRaise } from "./bots";
import { cardLabel, seededRandom } from "./cards";
import { buildBotContext, coachView } from "./context";
import { evaluatePostflopActions, evaluationForAction } from "./evaluation";
import { analyzePreflopSpot, type PreflopChoice } from "./preflop";
import { analyzeFlopStrategy, buildRangeLedger, estimateRangeEquity } from "./ranges";
import { humanSeat, legalBounds, potTotal, toCallFor } from "./rules";
import { type ActionKind, type HandState, type LeakKey, type PokerAction, type ReviewItem, type TrainingDecision } from "./types";

function reviewActionText(state: HandState, action: PokerAction) {
  if (action.type === "raise") return `${state.currentBet === 0 ? "Bet" : "Raise"} to $${action.amount}`;
  if (action.type === "all-in") return `All-in to $${state.players[humanSeat].stack + state.players[humanSeat].streetBet}`;
  if (action.type === "call") return `Call $${Math.min(toCallFor(state, humanSeat), state.players[humanSeat].stack)}`;
  return action.type[0].toUpperCase() + action.type.slice(1);
}

function reviewActionLine(state: HandState) {
  return state.actionLog.map((entry) => {
    const actor = state.players[entry.seat]?.name ?? `Seat ${entry.seat + 1}`;
    if (entry.type === "raise") return `${actor} raised to $${entry.amount}`;
    if (entry.type === "all-in") return `${actor} moved all-in to $${entry.amount}`;
    if (entry.type === "call") return `${actor} called $${entry.toCallBefore}`;
    return `${actor} ${entry.type === "fold" ? "folded" : "checked"}`;
  });
}

function reviewSeed(state: HandState) {
  const text = `${state.handNumber}|${state.street}|${state.actionLog.length}|${state.players[humanSeat].hole.map(cardLabel).join("")}|${state.board.map(cardLabel).join("")}`;
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return hash >>> 0;
}

function sizeBand(target: number, bounds: ReturnType<typeof legalBounds>) {
  const tolerance = Math.max(2, Math.round(target * 0.18));
  return { target, min: Math.max(bounds.min, target - tolerance), max: Math.min(bounds.max, target + tolerance) };
}

function selectedTarget(state: HandState, action: PokerAction) {
  return action.type === "all-in" ? state.players[humanSeat].stack + state.players[humanSeat].streetBet : action.amount ?? 0;
}

function downgradeForSizing(grade: ReviewItem["grade"], state: HandState, action: PokerAction, recommendedSize?: ReviewItem["recommendedSize"]) {
  if (!recommendedSize || (action.type !== "raise" && action.type !== "all-in")) return grade;
  const target = selectedTarget(state, action);
  if (target >= recommendedSize.min && target <= recommendedSize.max) return grade;
  if (target > recommendedSize.max * 1.6 || target < recommendedSize.min * 0.7) return "Costly";
  if (target === state.players[humanSeat].stack + state.players[humanSeat].streetBet && buildBotContext(state, humanSeat).spr > 1.2) return "Costly";
  return grade === "Preferred" ? "Viable" : "Costly";
}

function buildReviewV8(state: HandState, action: PokerAction, equityOverride?: number): ReviewItem {
  const player = state.players[humanSeat];
  const toCall = Math.min(toCallFor(state, humanSeat), player.stack);
  const pot = potTotal(state);
  const context = buildBotContext(state, humanSeat);
  const bounds = legalBounds(state, humanSeat);
  const contestable = state.players.reduce((sum, p) => sum + Math.min(p.committed, player.committed + toCall), 0);
  const potOdds = toCall / Math.max(1, contestable + toCall);
  const common = {
    id: `${state.handNumber}-${state.street}-${state.actionLog.length}`,
    handNumber: state.handNumber,
    street: state.street,
    position: player.position,
    cards: [...player.hole],
    board: [...state.board],
    pot,
    toCall,
    effectiveStack: context.effectiveStack,
    spr: Math.round(context.spr * 10) / 10,
    opponents: context.opponents.length,
    actionLine: reviewActionLine(state),
    action: reviewActionText(state, action),
    potOdds,
  };
  const preflopPlan = analyzePreflopSpot(state, humanSeat);
  if (preflopPlan) {
    const chosen = action.type === "check" && toCall === 0 ? "call" : action.type;
    const preferred = preflopPlan.preferred;
    const chosenFrequency = preflopPlan.frequencies[chosen as PreflopChoice] ?? 0;
    let grade: ReviewItem["grade"] = chosen === preferred ? "Preferred" : chosenFrequency >= 0.1 ? "Viable" : "Costly";
    const raise = preferred === "raise" ? contextualPreflopRaise(state, humanSeat) : null;
    const recommendedSize = raise?.type === "raise" && raise.amount !== undefined ? sizeBand(raise.amount, bounds) : undefined;
    grade = downgradeForSizing(grade, state, action, recommendedSize);
    const suggestion = preferred === "all-in" ? "Move all-in"
      : preferred === "raise" ? `Raise${recommendedSize ? ` to about $${recommendedSize.target}` : ""}`
        : preferred === "call" ? (toCall > 0 ? "Call" : "Check") : "Fold";
    const concept = preflopPlan.scenario;
    const alternatives = (["fold", toCall > 0 ? "call" : "check", preferred === "all-in" ? "all-in" : "raise"] as string[])
      .filter((value, index, values) => values.indexOf(value) === index)
      .map((value) => {
        const choice = (value === "check" ? "call" : value) as PreflopChoice;
        const frequency = preflopPlan.frequencies[choice] ?? 0;
        const verdict: ReviewItem["grade"] = choice === preferred ? "Preferred" : frequency >= 0.1 ? "Viable" : "Costly";
        const actionReason = choice === preferred
          ? preflopPlan.reason
          : choice === "raise" || choice === "all-in" ? "Re-raise only when your hand strength and blocker effects justify the extra chips at risk."
            : choice === "call" ? "Calling depends on the pot odds, position, future betting, and whether another player can raise behind you."
              : "Folding avoids a difficult or dominated continuation but gives up the hand's remaining equity.";
        return {
          action: value === "all-in" ? "All-in" : value[0].toUpperCase() + value.slice(1),
          verdict,
          frequency,
          reason: `${Math.round(frequency * 100)}% modeled baseline. ${actionReason}`,
        };
      });
    return {
      ...common,
      equityLabel: "Preflop reference",
      grade,
      suggestion,
      concept,
      takeaway: state.raiseCount === 0
        ? `Start with the ${player.position} opening range, then adjust for stack depth and players already in the pot.`
        : `Defending depends on both positions, the price, stack depth, and whether you close the action.`,
      alternatives,
      recommendedSize,
      note: `${preflopPlan.reason} This approximate range model uses ${Math.round(preflopPlan.frequencies[preferred] * 100)}% ${preferred} as its most frequent action.${recommendedSize ? ` A normal target is $${recommendedSize.target}; sizing is part of the decision.` : ""}`,
      confidence: preflopPlan.confidence,
      basis: `${preflopPlan.hand} · ${preflopPlan.effectiveStackBb} BB effective · ${preflopPlan.scenario}`,
    };
  }

  const iterations = 600;
  const equity = equityOverride ?? estimateRangeEquity(state, humanSeat, iterations, seededRandom(reviewSeed(state)));
  const samplingMargin = 1.96 * Math.sqrt(Math.max(0.0001, equity * (1 - equity)) / iterations);
  const uncertainty = Math.min(0.09, samplingMargin + 0.035);
  const equityLow = Math.max(0, equity - uncertainty);
  const equityHigh = Math.min(1, equity + uncertainty);
  const features = handFeatures(player.hole, state.board);
  const rawStrong = equityLow > Math.max(0.55, potOdds + 0.12);
  const thinRiverValue = state.street === "river" && toCall === 0 && features.made === 1 && equityLow < 0.8;
  const strong = rawStrong && !thinRiverValue;
  const weak = equityHigh < potOdds;
  const draw = features.draw;
  const raiseTarget = Math.min(bounds.max, Math.max(bounds.min, state.currentBet + Math.max(state.minRaise, Math.round(pot * (state.currentBet > 0 ? 0.72 : boardWetness(state.board) > 0.55 ? 0.66 : 0.5)))));
  const recommendedSize = bounds.canRaise && (strong || draw) ? sizeBand(raiseTarget, bounds) : undefined;
  let preferred: ActionKind = toCall > 0 ? (weak ? "fold" : strong ? "raise" : "call") : strong ? "raise" : "check";
  if (toCall === 0 && draw && context.opponents.length === 1 && context.inPosition) preferred = "raise";
  const normalizedAction = action.type === "all-in" ? "all-in" : action.type;
  let grade: ReviewItem["grade"] = normalizedAction === preferred ? "Preferred" : "Viable";
  if ((weak && ["call", "raise", "all-in"].includes(normalizedAction)) || (strong && normalizedAction === "fold")) grade = "Costly";
  if (normalizedAction === "all-in" && context.spr > 1.2) grade = "Costly";
  grade = downgradeForSizing(grade, state, action, recommendedSize);
  const suggestion = preferred === "raise" ? `${state.currentBet > 0 ? "Raise" : "Bet"}${recommendedSize ? ` to about $${recommendedSize.target}` : ""}`
    : preferred === "call" ? "Call" : preferred === "fold" ? "Fold" : "Check";
  const concept = thinRiverValue ? "Thin river value"
    : state.street === "river" && toCall > 0 ? "River bluff-catching"
    : context.opponents.length > 1 ? "Playing against multiple opponents"
      : draw ? "Draws and semi-bluffing"
        : toCall > 0 ? "Pot odds and ranges" : strong ? "Value betting" : "Checking and pot control";
  const legalActions: ActionKind[] = toCall > 0 ? ["fold", "call", ...(bounds.canRaise ? ["raise" as const] : [])] : ["check", ...(bounds.canRaise ? ["raise" as const] : [])];
  const alternatives = legalActions.map((candidate) => {
    let verdict: ReviewItem["grade"] = candidate === preferred ? "Preferred" : "Viable";
    if ((weak && (candidate === "call" || candidate === "raise")) || (strong && candidate === "fold")) verdict = "Costly";
    const reason = candidate === "fold" ? (weak ? "Avoids investing when even the optimistic equity estimate misses the price." : "Surrenders meaningful showdown equity.")
      : candidate === "call" ? (weak ? "The modeled range does not supply enough equity at this price." : "Keeps the pot smaller while using the hand's chance to win, though future streets still matter.")
        : candidate === "check" ? (strong ? "Controls the pot but may miss value or allow a free card." : "Preserves the stack and keeps weaker hands in.")
          : thinRiverValue ? "A small thin-value bet works only if enough worse one-pair hands call; missed draws improve showdown equity but usually fold."
            : strong ? "Builds value against worse continuing hands; use a disciplined size." : draw ? "Can combine fold equity with live drawing equity, but is range-sensitive." : "Requires enough folds to compensate for limited showdown equity.";
    return { action: candidate === "raise" ? (state.currentBet > 0 ? "Raise" : "Bet") : candidate[0].toUpperCase() + candidate.slice(1), verdict, reason };
  });
  return {
    ...common,
    equity,
    equityLow,
    equityHigh,
    equityLabel: "Equity vs modeled ranges",
    grade,
    suggestion,
    concept,
    takeaway: thinRiverValue
      ? "On the river, compare your hand with the opponent's likely calling range—not every hand that reached the river. Missed draws you beat often add no value to a bet."
      : toCall > 0
      ? "Compare the price with a range of plausible equities, then account for position, future betting, and whether raising can make better hands fold."
      : "Checking is an active option: bet only when worse hands can call, better hands can fold, or protection has real value.",
    alternatives,
    recommendedSize,
    note: thinRiverValue
      ? "Your overall equity includes missed draws that usually fold to a river bet. Without a clear group of worse one-pair hands that will call, checking is the safer baseline; a smaller bet can exploit a loose caller."
      : weak
      ? "Even the optimistic equity estimate falls short of the immediate calling price."
      : strong
        ? `Your hand appears well ahead of the modeled continuing ranges, but the recommended size still matters.`
        : `This is a close, range-sensitive spot. You are ${context.inPosition ? "in position" : "out of position"} in a ${context.potType} pot, so raw equity alone does not settle the decision.`,
    confidence: weak || strong ? "Medium" : "Low",
    basis: `${iterations} repeatable simulated deals weighted toward opponents' likely hands · the displayed range includes model uncertainty`,
  };
}

function formatEv(value: number) {
  return `${value >= 0 ? "+" : "−"}$${Math.abs(value).toFixed(1)}`;
}

export function buildReview(input: HandState, action: PokerAction): ReviewItem {
  const state = coachView(input);
  const review = buildPublicReview(state, action);
  return { ...review, modelVersion: "public-coach-v2", validationStatus: "unvalidated" };
}

function buildPublicReview(state: HandState, action: PokerAction): ReviewItem {
  if (state.street === "preflop") return buildReviewV8(state, action);
  const reviewIterations = 36;
  // Coaching favors range completeness over the live bot's bounded 280-combo
  // search. This also ensures the equity shown to the learner is the same
  // equity used to compare legal actions.
  const reviewLedger = buildRangeLedger(state, humanSeat, Number.POSITIVE_INFINITY);
  const evaluations = evaluatePostflopActions(state, humanSeat, reviewIterations, seededRandom(reviewSeed(state) ^ 0x9e3779b9), reviewLedger, { extraAction: action });
  const best = evaluations[0];
  const chosen = evaluationForAction(evaluations, action);
  const baseline = buildReviewV8(state, action, best?.rangeEquity);
  if (!best || !chosen) return baseline;
  const regret = Math.max(0, best.ev - chosen.ev);
  const closeThreshold = Math.max(1.5, potTotal(state) * 0.045);
  const costlyThreshold = Math.max(4, potTotal(state) * 0.13);
  const intervalsOverlap = chosen.evHigh >= best.evLow;
  let grade: ReviewItem["grade"] = chosen === best || regret <= closeThreshold
    ? "Preferred"
    : regret >= costlyThreshold && !intervalsOverlap ? "Costly" : "Viable";
  const features = handFeatures(state.players[humanSeat].hole, state.board);
  let concept = state.street === "river" && state.currentBet === 0 && features.made === 1 ? "Thin river value"
    : state.currentBet > 0 ? "Price, range and response EV"
      : best.action.type === "raise" || best.action.type === "all-in" ? "Value, folds and bet sizing" : "Checking and equity realization";
  const flopAnalysis = state.street === "flop" ? analyzeFlopStrategy(state, humanSeat) : null;
  if (flopAnalysis) {
    if (state.currentBet > 0) concept = "Flop defense and check-raising";
    else if (["nuts", "strong-value"].includes(flopAnalysis.handClass) && flopAnalysis.texture.dynamic) concept = "Flop value and protection";
    else if (flopAnalysis.rangeAdvantage >= 0.35) concept = "Range advantage and flop sizing";
    else if (flopAnalysis.texture.dynamic) concept = "Dynamic-board caution";
  }
  let alternatives = evaluations.map((evaluation) => {
    const actionRegret = Math.max(0, best.ev - evaluation.ev);
    const overlap = evaluation.evHigh >= best.evLow;
    const verdict: ReviewItem["grade"] = evaluation === best || actionRegret <= closeThreshold ? "Preferred"
      : actionRegret >= costlyThreshold && !overlap ? "Costly" : "Viable";
    const response = evaluation.foldProbability !== undefined
      ? `${Math.round(evaluation.foldProbability * 100)}% estimated immediate folds; ${Math.round((evaluation.equityWhenCalled ?? 0) * 100)}% equity against the modeled calling range.`
      : evaluation.action.type === "fold" ? "Folding invests no additional chips."
        : "This line realizes equity without relying on immediate folds.";
    return {
      action: evaluation.label,
      verdict,
      ev: evaluation.ev,
      evLow: evaluation.evLow,
      evHigh: evaluation.evHigh,
      foldProbability: evaluation.foldProbability,
      equityWhenCalled: evaluation.equityWhenCalled,
      reason: `${formatEv(evaluation.ev)} modeled EV (${formatEv(evaluation.evLow)} to ${formatEv(evaluation.evHigh)}; uncalibrated band). ${evaluation.evMethod === "terminal-enumeration" ? "Exact payout enumeration conditional on the assumed range. " : "Heuristic estimate, not solver verified. "}${response}`,
    };
  });
  const separation = evaluations[1] ? best.evLow - evaluations[1].evHigh : 0;
  const confidence: ReviewItem["confidence"] = separation > Math.max(2, potTotal(state) * 0.06) ? "High" : intervalsOverlap ? "Low" : "Medium";
  const conservativeThinValue = concept === "Thin river value" && action.type === "check" && baseline.grade === "Preferred";
  if (conservativeThinValue) {
    grade = "Preferred";
    alternatives = alternatives.map((alternative) => ({
      ...alternative,
      verdict: alternative.action === chosen.label ? "Preferred" : alternative.verdict === "Preferred" ? "Viable" : alternative.verdict,
    }));
  }
  const thinValueNote = concept === "Thin river value"
    ? "The comparison discounts missed draws that improve showdown equity but usually fold. A river bet needs enough worse hands in the calling range, not merely a high chance of being ahead before betting."
    : state.street === "river"
      ? "The estimate compares legal actions using the same modeled river range shown above, the immediate calling price, likely folds, position, stack depth and rake. The displayed bands are heuristic sensitivity margins, not calibrated confidence intervals."
      : "The estimate compares legal actions using likely folds, the range that continues, future-card equity, position, stack depth and rake. The displayed bands are heuristic sensitivity margins, not calibrated confidence intervals.";
  const flopTextureNote = flopAnalysis
    ? ` This is a ${flopAnalysis.texture.stability} ${flopAnalysis.texture.tone} ${flopAnalysis.texture.band} flop. ${flopAnalysis.rangeAdvantage >= 0.35
      ? "Your modeled range has the advantage: it contains more strong hands overall, which can support frequent small bets."
      : flopAnalysis.rangeAdvantage <= 0.12
        ? "The caller can hold more of the strongest two-pair, set, and draw combinations, so checking more often protects your checking range."
        : "Neither range has a decisive structural advantage, so hand class and position carry more weight."} ${flopAnalysis.texture.dynamic
      ? "Many turns change the best hand or complete draws, so strong made hands gain protection from betting and weak hands should bluff selectively."
      : "Few turn cards radically change the board, so small bets and slow plays are more defensible."}`
    : "";
  const modeledEquity = best.rangeEquity ?? baseline.equity;
  const equityUncertainty = state.street === "river" ? 0.07 : 0.085;
  return {
    ...baseline,
    equity: modeledEquity,
    equityLow: modeledEquity === undefined ? baseline.equityLow : Math.max(0, modeledEquity - equityUncertainty),
    equityHigh: modeledEquity === undefined ? baseline.equityHigh : Math.min(1, modeledEquity + equityUncertainty),
    grade,
    suggestion: conservativeThinValue ? baseline.suggestion : best.label,
    concept,
    takeaway: concept === "Thin river value"
      ? "Judge a river value bet against the opponent's calling range. Hands that fold do not pay you simply because you were ahead of them."
      : flopAnalysis && state.currentBet === 0
        ? "Bet for value when worse hands can call, for protection when free cards matter, or as a bluff when better hands can fold. Let range advantage and board texture guide the size and frequency."
        : flopAnalysis
          ? "Compare the price with your equity against the bettor's range; raise a polarized range of strong value and robust draws rather than every hand that can continue."
      : "Compare the assumptions behind each action; small modeled EV differences are inconclusive and do not establish optimal mixing frequencies.",
    alternatives,
    note: thinValueNote + flopTextureNote,
    confidence,
    basis: `${evaluations.length} legal actions · persistent public-action ranges · ${state.street === "river" && buildBotContext(state, humanSeat).activePlayers === 2 ? "complete heads-up river range comparison" : `${reviewIterations} card-runout samples; future betting is heuristic`}${flopAnalysis ? " · flop texture, range advantage and representative turn branches" : ""} · uncalibrated heuristic EV bands; strategy unvalidated`,
    estimatedRegret: Math.round(regret * 10) / 10,
    recommendedSize: best.action.type === "raise" && best.action.amount !== undefined ? sizeBand(best.action.amount, legalBounds(state, humanSeat)) : undefined,
  };
}

function leakForDecision(state: HandState, review: ReviewItem): LeakKey {
  if (state.street === "preflop") {
    if (state.players[humanSeat].position === "BB") return "bb-defense";
    if (state.raiseCount >= 2) return "three-bet-defense";
    return "preflop-aggression";
  }
  if (review.concept === "Thin river value") return "thin-value";
  if (state.currentBet > 0) return "calling-price";
  if (review.action.startsWith("Bet") || review.action.startsWith("Raise") || review.action.startsWith("All-in")) {
    return review.grade === "Costly" ? "bluff-selection" : "bet-sizing";
  }
  return "missed-value";
}

export function recordTrainingDecision(state: HandState, before: HandState, review: ReviewItem) {
  const leakKey = leakForDecision(before, review);
  const regret = review.estimatedRegret ?? 0;
  const mistake = review.grade === "Costly" || regret >= Math.max(2, review.pot * 0.1);
  const decision: TrainingDecision = {
    id: review.id,
    handNumber: review.handNumber,
    street: review.street,
    position: review.position,
    chosenAction: review.action,
    recommendedAction: review.suggestion,
    concept: review.concept,
    leakKey,
    estimatedRegret: Math.round(regret * 10) / 10,
    confidence: review.confidence ?? "Low",
  };
  state.trainingDecisions = [...state.trainingDecisions, decision].slice(-240);
  const prior = state.trainingSummary[leakKey];
  state.trainingSummary[leakKey] = {
    opportunities: prior.opportunities + 1,
    mistakes: prior.mistakes + (mistake ? 1 : 0),
    totalRegret: Math.round((prior.totalRegret + regret) * 10) / 10,
  };
}
