import { analyzeBoard, analyzeFlopTexture, classifyStrategicHand, classifyStrategicHandWithProfile, handFeatures, representativeTurnBuckets } from "./board";
import { cardLabel, compareScores, evaluateHand, makeDeck, shuffledDeck } from "./cards";
import { buildBotContext } from "./context";
import { preflopStrength } from "./preflop";
import { POSITION_OPEN_RATE, bluffCandidate } from "./profiles";
import { type BotProfile, type Card, type FlopStrategicContext, type HandState, type RangeCombo, type RangeLedger, type StrategicHandClass, type Street } from "./types";

export function weightedHoleSample(
  available: Card[],
  weight: (cards: Card[]) => number,
  random: () => number,
) {
  const candidates: { cards: Card[]; weight: number }[] = [];
  const attempts = Math.min(7, Math.floor(available.length / 2));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const first = Math.floor(random() * available.length);
    let second = Math.floor(random() * (available.length - 1));
    if (second >= first) second += 1;
    const cards = [available[first], available[second]];
    candidates.push({ cards, weight: Math.max(0.01, weight(cards)) });
  }
  const total = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
  let pick = random() * total;
  const selected = candidates.find((candidate) => (pick -= candidate.weight) <= 0) ?? candidates[candidates.length - 1];
  selected.cards.forEach((card) => {
    const index = available.findIndex((candidate) => cardLabel(candidate) === cardLabel(card));
    if (index >= 0) available.splice(index, 1);
  });
  return selected.cards;
}

function boardThroughStreet(board: Card[], street: Street) {
  const count: Record<Street, number> = { preflop: 0, flop: 3, turn: 4, river: 5 };
  return board.slice(0, count[street]);
}

export function opponentRangeWeight(state: HandState, opponentIndex: number, cards: Card[], includeSizing = true) {
  const opponent = state.players[opponentIndex];
  const strength = preflopStrength(cards);
  const preflop = (state.actionLog ?? []).filter((action) => action.street === "preflop" && action.seat === opponentIndex);
  const postflop = (state.actionLog ?? []).filter((action) => action.street !== "preflop" && action.seat === opponentIndex);
  const raises = preflop.filter((action) => action.type === "raise" || action.type === "all-in").length;
  const calledRaise = preflop.some((action) => action.type === "call" && action.raiseLevel > 0);
  const observedPfr = opponent.stats.hands > 0 ? opponent.stats.pfr / opponent.stats.hands : 0.2;
  const sampleWeight = Math.min(0.72, opponent.stats.hands / 80);
  const baselineOpen = POSITION_OPEN_RATE[opponent.position];
  const modeledOpen = baselineOpen * (1 - sampleWeight) + Math.max(0.06, Math.min(0.45, observedPfr)) * sampleWeight;
  let weight = 0.25 + strength;
  if (raises >= 3) weight *= 0.08 + Math.pow(strength, 8) * 8;
  else if (raises === 2) weight *= 0.12 + Math.pow(strength, 6) * 5;
  else if (raises === 1) {
    weight *= strength >= 1 - Math.min(0.62, modeledOpen) ? 2.8 : bluffCandidate(cards) ? 0.72 : 0.08;
  } else if (calledRaise) {
    weight *= strength > 0.55 && strength < 0.96 ? 2.1 : strength >= 0.96 ? 0.72 : 0.18;
  }

  for (const action of postflop) {
    const actionBoard = boardThroughStreet(state.board, action.street);
    const features = handFeatures(cards, actionBoard);
    const madeWeight = !features.madeWithHole ? 0.34
      : features.made >= 4 ? 3.6
        : features.made === 3 ? 3.1
          : features.made === 2 ? 2.5
            : features.made === 1 ? 1.25
              : 0.5;
    const drawWeight = features.draw ? 1.45 : features.overcards > 0 && action.street === "flop" ? 1.08 : 0.78;
    const sizeRatio = includeSizing && action.potBefore ? Math.max(0, action.amount - action.toCallBefore) / action.potBefore : 0.55;
    const sizePolarization = sizeRatio >= 0.9 ? 1.38 : sizeRatio >= 0.6 ? 1.16 : sizeRatio <= 0.36 ? 0.88 : 1;
    if (action.type === "raise" || action.type === "all-in") {
      // Large bets polarize toward strong made hands and credible draws; small
      // bets retain substantially more medium-strength range.
      const polarWeight = features.made >= 2 || features.draw || features.blocker ? sizePolarization : 1 / sizePolarization;
      weight *= madeWeight * polarWeight * (features.draw ? 1.18 : 1);
    } else if (action.type === "call") {
      weight *= Math.max(0.3, madeWeight * 0.72 + drawWeight * 0.65);
    } else if (action.type === "check") {
      weight *= features.made >= 2 ? 0.88 : 1.08;
    }
  }
  return weight;
}

export function estimateRangeEquity(
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
      (cards) => opponentRangeWeight(state, opponent, cards),
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

export function sampleRangeCombo(combos: RangeCombo[], available: Card[], random: () => number, response?: (combo: RangeCombo) => number) {
  const legal = combos.filter((combo) => combo.cards.every((card) => available.some((candidate) => cardLabel(candidate) === cardLabel(card))));
  const total = legal.reduce((sum, combo) => sum + combo.weight * (response?.(combo) ?? 1), 0);
  let pick = random() * Math.max(0.0001, total);
  const selected = legal.find((combo) => (pick -= combo.weight * (response?.(combo) ?? 1)) <= 0) ?? legal.at(-1);
  if (!selected) return [] as Card[];
  selected.cards.forEach((card) => {
    const index = available.findIndex((candidate) => cardLabel(candidate) === cardLabel(card));
    if (index >= 0) available.splice(index, 1);
  });
  return selected.cards;
}

export function analyzeFlopStrategy(state: HandState, seatIndex: number): FlopStrategicContext | null {
  if (state.street !== "flop" || state.board.length < 3 || state.players[seatIndex].hole.length !== 2) return null;
  const context = buildBotContext(state, seatIndex);
  const texture = analyzeFlopTexture(state.board);
  const handClass = classifyStrategicHand(state.players[seatIndex].hole, state.board);
  const isAggressor = context.aggressor === seatIndex;
  const raisedPot = context.potType !== "limped";
  const highDry = (texture.band === "ace-high" || texture.band === "king-high") && texture.stability === "static";
  const lowDynamic = (texture.band === "middle" || texture.band === "low") && texture.dynamic;
  const rangeAdvantage = Math.max(-1, Math.min(1,
    (isAggressor ? 0.28 : -0.12) + (raisedPot && highDry ? (isAggressor ? 0.24 : -0.18) : 0) + (lowDynamic ? (isAggressor ? -0.2 : 0.16) : 0),
  ));
  const nutAdvantage = Math.max(-1, Math.min(1,
    (isAggressor && highDry ? 0.22 : 0) + (!isAggressor && lowDynamic ? 0.25 : 0) + (texture.paired && isAggressor ? 0.08 : 0),
  ));
  // These are public-range priors for the real-time policy, not hand-reading
  // claims. Full combo ledgers remain available to the coach/search model; the
  // live bot uses bounded aggregate estimates so a decision stays instant.
  const valueDensity = Math.max(0.08, Math.min(0.48,
    0.2 + (isAggressor && highDry ? 0.1 : 0) + (!isAggressor && lowDynamic ? 0.09 : 0) + (texture.paired ? 0.04 : 0),
  ));
  const drawDensity = Math.max(0.03, Math.min(0.5,
    0.08 + texture.connectedness * 0.2 + (texture.tone === "two-tone" ? 0.13 : texture.tone === "monotone" ? 0.06 : 0),
  ));
  return {
    texture,
    handClass,
    rangeAdvantage,
    nutAdvantage,
    valueDensity,
    drawDensity,
    turnBuckets: representativeTurnBuckets(state.players[seatIndex].hole, state.board),
  };
}

export function buildRangeLedger(state: HandState, observerSeat: number, comboLimit = 280): RangeLedger {
  const observerCards = state.players[observerSeat]?.hole ?? [];
  const known = new Set([...observerCards, ...state.board].map(cardLabel));
  const available = makeDeck().filter((card) => !known.has(cardLabel(card)));
  const rawCombos: Array<[Card, Card]> = [];
  for (let first = 0; first < available.length - 1; first += 1) {
    for (let second = first + 1; second < available.length; second += 1) {
      rawCombos.push([available[first], available[second]]);
    }
  }
  const comboHash = (cards: [Card, Card]) => {
    const text = `${state.handNumber}|${observerSeat}|${cardLabel(cards[0])}|${cardLabel(cards[1])}`;
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
    return hash >>> 0;
  };
  const boardProfile = analyzeBoard(state.board);
  const observerRiverScore = !Number.isFinite(comboLimit) && state.board.length === 5 && observerCards.length === 2
    ? evaluateHand([...observerCards, ...state.board]).score
    : null;
  const selectedCombos = Number.isFinite(comboLimit)
    ? rawCombos.sort((a, b) => comboHash(a) - comboHash(b)).slice(0, Math.max(1, comboLimit))
    : rawCombos;
  const baseCombos = selectedCombos
    .map((cards) => {
      const comparison = observerRiverScore === null ? null : compareScores(evaluateHand([...cards, ...state.board]).score, observerRiverScore);
      return {
        cards,
        handClass: classifyStrategicHandWithProfile(cards, state.board, boardProfile),
        ...(comparison === null ? {} : { showdownShare: comparison < 0 ? 1 : comparison === 0 ? 0.5 : 0 }),
      };
    });
  const ledger: RangeLedger = {};
  state.players.forEach((opponent, opponentIndex) => {
    if (opponentIndex === observerSeat || opponent.folded) return;
    const combos: RangeCombo[] = baseCombos.map(({ cards, handClass, ...cached }) => ({ cards, handClass, ...cached, weight: Math.max(0.0001, opponentRangeWeight(state, opponentIndex, cards)) }));
    const total = combos.reduce((sum, combo) => sum + combo.weight, 0) || 1;
    ledger[opponentIndex] = combos.map((combo) => ({ ...combo, weight: combo.weight / total }));
  });
  return ledger;
}

export function rangeResponseWeight(handClass: StrategicHandClass, action: "fold" | "call" | "raise", fraction: number, street: Street, profile: BotProfile) {
  const value = ["nuts", "strong-value"].includes(handClass);
  const medium = ["thin-value", "bluff-catcher", "showdown-value"].includes(handClass);
  const draw = ["combo-draw", "nut-draw", "draw"].includes(handClass);
  const loose = profile === "caller" ? 1.28 : profile === "lag" ? 1.12 : profile === "nit" ? 0.78 : 1;
  if (action === "raise") return value ? 1.8 : draw && street !== "river" ? 0.42 : handClass === "blocker-bluff" ? 0.12 : 0.025;
  if (action === "call") {
    if (value) return 1.15;
    if (draw && street !== "river") return Math.max(0.12, (1.15 - fraction * 0.46) * loose);
    if (medium) return Math.max(0.06, (0.9 - fraction * 0.58) * loose);
    return Math.max(0.01, (0.16 - fraction * 0.1) * loose);
  }
  return value ? 0.015 : draw && street !== "river" ? Math.min(0.8, 0.22 + fraction * 0.35) : medium ? Math.min(0.92, 0.28 + fraction * 0.55) : 0.88;
}
