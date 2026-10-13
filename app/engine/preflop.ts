import { RANKS, VALUES, makeDeck } from "./cards";
import { actsAfterPostflop, buildBotContext } from "./context";
import { POSITION_OPEN_RATE, PROFILE } from "./profiles";
import { potTotal, toCallFor } from "./rules";
import { type Card, type HandState, type Position, type Rank } from "./types";

function preflopRawScore(cards: Card[]) {
  const [high, low] = cards.map((card) => VALUES[card.rank]).sort((a, b) => b - a);
  if (high === low) return 70 + high * 4;
  const gap = high - low;
  let score = high * 4 + low * 2;
  if (cards[0].suit === cards[1].suit) score += 8;
  if (gap === 1) score += 6;
  else if (gap === 2) score += 3;
  else if (gap === 3) score += 1;
  else if (gap >= 5) score -= (gap - 4) * 2;
  if (high >= 11 && low >= 10) score += 4;
  if (high === 14) score += low <= 5 ? 7 : 2;
  return score;
}

const PREFLOP_PERCENTILES = (() => {
  const deck = makeDeck();
  const scores: number[] = [];
  for (let first = 0; first < deck.length - 1; first += 1) {
    for (let second = first + 1; second < deck.length; second += 1) scores.push(preflopRawScore([deck[first], deck[second]]));
  }
  scores.sort((a, b) => a - b);
  const percentiles = new Map<number, number>();
  for (let start = 0; start < scores.length;) {
    let end = start + 1;
    while (end < scores.length && scores[end] === scores[start]) end += 1;
    percentiles.set(scores[start], (start + (end - start) / 2) / scores.length);
    start = end;
  }
  return percentiles;
})();

export function preflopStrength(cards: Card[]) {
  if (cards.length !== 2) return 0;
  return PREFLOP_PERCENTILES.get(preflopRawScore(cards)) ?? 0;
}

export function startingHandKey(cards: Card[]) {
  if (cards.length !== 2) return "";
  const ordered = [...cards].sort((a, b) => VALUES[b.rank] - VALUES[a.rank]);
  if (ordered[0].rank === ordered[1].rank) return `${ordered[0].rank}${ordered[1].rank}`;
  return `${ordered[0].rank}${ordered[1].rank}${ordered[0].suit === ordered[1].suit ? "s" : "o"}`;
}

function expandRange(specification: string) {
  const hands = new Set<string>();
  for (const token of specification.split(/\s+/).filter(Boolean)) {
    const pair = token.match(/^([2-9TJQKA])\1(\+)?$/);
    if (pair) {
      const start = VALUES[pair[1] as Rank];
      const ranks = pair[2] ? RANKS.filter((rank) => VALUES[rank] >= start) : [pair[1] as Rank];
      ranks.forEach((rank) => hands.add(`${rank}${rank}`));
      continue;
    }
    const unpaired = token.match(/^([2-9TJQKA])([2-9TJQKA])([so])(\+)?$/);
    if (!unpaired) continue;
    const high = unpaired[1] as Rank;
    const low = unpaired[2] as Rank;
    const suitedness = unpaired[3];
    if (!unpaired[4]) {
      hands.add(`${high}${low}${suitedness}`);
      continue;
    }
    RANKS.filter((rank) => VALUES[rank] >= VALUES[low] && VALUES[rank] < VALUES[high])
      .forEach((rank) => hands.add(`${high}${rank}${suitedness}`));
  }
  return hands;
}

const SHORT_SHOVE_SPECS: Record<Position, string> = {
  UTG: "77+ AJs+ AQo+ KQs",
  HJ: "66+ ATs+ AJo+ KQs",
  CO: "55+ A9s+ ATo+ KJs+ QJs",
  BTN: "44+ A7s+ A9o+ KTs+ KQo QJs",
  "BTN/SB": "22+ A2s+ A7o+ K8s+ KTo+ Q9s+ QJo JTs",
  SB: "33+ A5s+ A8o+ K9s+ KJo+ QTs+ JTs",
  BB: "66+ ATs+ AJo+ KQs",
};

const SHORT_CONTINUE_SPEC = "22+ A2s+ A8o+ K8s+ KTo+ Q9s+ QJo J9s+ JTo T8s+ 98s 87s 76s";

const PREMIUM_SHORT_SPEC = "TT+ AQs+ AKo";

const SHORT_SHOVE_RANGES = Object.fromEntries(
  Object.entries(SHORT_SHOVE_SPECS).map(([position, specification]) => [position, expandRange(specification)]),
) as Record<Position, Set<string>>;

const SHORT_CONTINUE_RANGE = expandRange(SHORT_CONTINUE_SPEC);

const PREMIUM_SHORT_RANGE = expandRange(PREMIUM_SHORT_SPEC);

const DEEP_OPEN_SPECS: Record<Position, string> = {
  UTG: "22+ A2s+ KTs+ QTs+ JTs T9s 98s 87s ATo+ KQo",
  HJ: "22+ A2s+ K9s+ Q9s+ J9s+ T9s 98s 87s 76s ATo+ KJo+ QJo",
  CO: "22+ A2s+ K7s+ Q8s+ J8s+ T8s+ 97s+ 86s+ 75s+ A9o+ KTo+ QTo+ JTo",
  BTN: "22+ A2s+ K2s+ Q5s+ J7s+ T7s+ 96s+ 86s+ 75s+ 65s 54s A7o+ K9o+ Q9o+ J9o+ T9o",
  "BTN/SB": "22+ A2s+ K2s+ Q2s+ J4s+ T5s+ 95s+ 85s+ 74s+ 64s+ 53s+ A2o+ K7o+ Q8o+ J8o+ T8o+ 98o",
  SB: "22+ A2s+ K4s+ Q6s+ J7s+ T7s+ 96s+ 86s+ 75s+ 65s A7o+ K9o+ Q9o+ J9o+ T9o",
  BB: "22+ A2s+ K2s+ Q5s+ J7s+ T7s+ 97s+ 86s+ 75s+ A7o+ K9o+ Q9o+ J9o+",
};

const DEEP_CONTINUE_SPECS: Record<Position, string> = {
  UTG: "22+ AQs+ AKo KQs",
  HJ: "22+ AJs+ AQo+ KQs QJs",
  CO: "22+ ATs+ AJo+ KQs KJs QJs JTs T9s",
  BTN: "22+ A8s+ ATo+ KTs+ KQo QTs+ JTs T9s 98s",
  "BTN/SB": "22+ A2s+ A8o+ K8s+ KTo+ Q9s+ QJo J9s+ JTo T8s+ 98s 87s",
  SB: "22+ A5s+ A9o+ K9s+ KJo+ QTs+ JTs T9s",
  BB: "22+ A8s+ ATo+ KTs+ KQo QTs+ JTs T9s",
};

const DEEP_THREE_BET_SPECS: Record<Position, string> = {
  UTG: "QQ+ AKs AKo A5s",
  HJ: "JJ+ AQs+ AKo A5s",
  CO: "TT+ AQs+ AKo A5s A4s KQs",
  BTN: "99+ AJs+ AQo+ A5s A4s KQs",
  "BTN/SB": "88+ ATs+ AJo+ A5s A4s KJs+ QJs",
  SB: "88+ ATs+ AJo+ A5s A4s KJs+ QJs",
  BB: "JJ+ AQs+ AKo",
};

export const DEEP_OPEN_RANGES = Object.fromEntries(Object.entries(DEEP_OPEN_SPECS).map(([position, spec]) => [position, expandRange(spec)])) as Record<Position, Set<string>>;

const DEEP_CONTINUE_RANGES = Object.fromEntries(Object.entries(DEEP_CONTINUE_SPECS).map(([position, spec]) => [position, expandRange(spec)])) as Record<Position, Set<string>>;

const DEEP_THREE_BET_RANGES = Object.fromEntries(Object.entries(DEEP_THREE_BET_SPECS).map(([position, spec]) => [position, expandRange(spec)])) as Record<Position, Set<string>>;

const DEEP_FOUR_BET_RANGE = expandRange("QQ+ AKs AKo");

const DEEP_PREMIUM_STACK_OFF_RANGE = expandRange("KK+");

const DEEP_FOUR_BET_CONTINUE_RANGE = expandRange("QQ+ AKs AKo");

const BB_DEFENSE_SPECS: Partial<Record<Position, string>> = {
  UTG: "22+ A2s+ ATo+ K9s+ KQo Q9s+ J9s+ T9s 98s 87s",
  HJ: "22+ A2s+ A9o+ K7s+ KJo+ Q8s+ QJo J8s+ T8s+ 97s+ 86s+ 75s+",
  CO: "22+ A2s+ A7o+ K4s+ K9o+ Q6s+ Q9o+ J7s+ J9o+ T7s+ T9o 96s+ 86s+ 75s+ 65s 54s",
  BTN: "22+ A2s+ A2o+ K2s+ K7o+ Q5s+ Q8o+ J7s+ J8o+ T7s+ T8o+ 96s+ 97o+ 86s+ 87o 75s+ 65s 54s",
  SB: "22+ A2s+ A2o+ K2s+ K7o+ Q5s+ Q8o+ J7s+ J8o+ T7s+ T8o+ 96s+ 97o+ 86s+ 87o 75s+ 65s 54s",
};

const BB_THREE_BET_SPECS: Partial<Record<Position, string>> = {
  UTG: "QQ+ AKs AKo A5s",
  HJ: "JJ+ AQs+ AKo A5s",
  CO: "TT+ AJs+ AQo+ A5s A4s KQs",
  BTN: "88+ ATs+ AJo+ A5s A4s KJs+ QJs",
  SB: "77+ A8s+ ATo+ KTs+ KQo QJs A5s A4s",
};

const BB_DEFENSE_RANGES = Object.fromEntries(Object.entries(BB_DEFENSE_SPECS).map(([position, specification]) => [position, expandRange(specification!)])) as Partial<Record<Position, Set<string>>>;

const BB_THREE_BET_RANGES = Object.fromEntries(Object.entries(BB_THREE_BET_SPECS).map(([position, specification]) => [position, expandRange(specification!)])) as Partial<Record<Position, Set<string>>>;

const VS_THREE_BET_SPECS: Record<string, string> = {
  "UTG vs HJ": "TT+ AQs+ AKo KQs A5s",
  "UTG vs CO": "TT+ AQs+ AKo KQs A5s",
  "UTG vs BTN": "99+ AQs+ AQo+ KQs A5s A4s",
  "UTG vs SB": "99+ AJs+ AQo+ KQs A5s A4s",
  "UTG vs BB": "99+ AJs+ AQo+ KQs A5s A4s",
  "HJ vs CO": "99+ AQs+ AKo KQs A5s",
  "HJ vs BTN": "88+ AJs+ AQo+ KQs QJs A5s A4s",
  "HJ vs SB": "88+ AJs+ AQo+ KQs QJs A5s A4s",
  "HJ vs BB": "88+ AJs+ AQo+ KQs QJs A5s A4s",
  "CO vs BTN": "77+ ATs+ AQo+ KQs KJs QJs JTs A5s A4s",
  "CO vs SB": "66+ ATs+ AJo+ KQs KJs QJs JTs T9s A5s A4s",
  "CO vs BB": "66+ ATs+ AJo+ KQs KJs QJs JTs T9s A5s A4s",
  "BTN vs SB": "55+ A9s+ AJo+ KTs+ KQo QTs+ JTs T9s 98s A5s A4s",
  "BTN vs BB": "44+ A8s+ ATo+ KTs+ KQo QTs+ JTs T9s 98s 87s A5s A4s",
  "SB vs BB": "55+ A9s+ AJo+ KTs+ KQo QTs+ JTs T9s A5s A4s",
};

const VS_THREE_BET_RANGES = Object.fromEntries(Object.entries(VS_THREE_BET_SPECS)
  .map(([scenario, specification]) => [scenario, expandRange(specification)])) as Record<string, Set<string>>;

const SB_LIMP_SPEC = "22+ A2s+ K2s+ Q4s+ J6s+ T6s+ 95s+ 85s+ 74s+ 64s+ 54s A2o+ K7o+ Q8o+ J8o+ T8o+ 98o";

const SB_LIMP_RANGE = expandRange(SB_LIMP_SPEC);

const BB_VS_SB_CONTINUE_RANGE = expandRange("22+ A2s+ A2o+ K2s+ K7o+ Q5s+ Q8o+ J7s+ J8o+ T7s+ T8o+ 96s+ 97o+ 86s+ 87o 75s+ 65s 54s");

const BB_VS_SB_THREE_BET_RANGE = expandRange("77+ A8s+ ATo+ KTs+ KQo QJs A5s A4s");

export type PreflopChartDefinition = {
  id: string;
  label: string;
  description: string;
  selectorLabel: string;
  options: Array<{ label: string; specification: string; hands: string[] }>;
};

const chartOptions = (specifications: Partial<Record<Position, string>>, positions: Position[]) => positions.map((position) => ({
  label: position,
  specification: specifications[position]!,
  hands: [...expandRange(specifications[position]!)],
}));

const SIX_MAX_CHART_POSITIONS: Position[] = ["UTG", "HJ", "CO", "BTN", "SB"];

export const PREFLOP_CHARTS: PreflopChartDefinition[] = [
  {
    id: "open",
    label: "Open-raise",
    description: "Baseline hands to raise when everyone before you has folded. Limpers, opponent tendencies and stack depth can tighten this range.",
    selectorLabel: "Your position",
    options: chartOptions(DEEP_OPEN_SPECS, SIX_MAX_CHART_POSITIONS),
  },
  {
    id: "continue",
    label: "General continue",
    description: "A general response baseline indexed by the original raiser's position. Use the dedicated blind-defense chart when you are in the BB.",
    selectorLabel: "Raiser's position",
    options: chartOptions(DEEP_CONTINUE_SPECS, SIX_MAX_CHART_POSITIONS),
  },
  {
    id: "bb-defense",
    label: "BB defense",
    description: "Position-pair ranges for the big blind against each opener. A larger open tightens the marginal calling portion; a smaller open widens it.",
    selectorLabel: "Original raiser",
    options: chartOptions(BB_DEFENSE_SPECS, ["UTG", "HJ", "CO", "BTN", "SB"]),
  },
  {
    id: "bb-three-bet",
    label: "BB 3-bet",
    description: "Value and blocker-driven re-raises from the big blind, indexed by the opener's position.",
    selectorLabel: "Original raiser",
    options: chartOptions(BB_THREE_BET_SPECS, ["UTG", "HJ", "CO", "BTN", "SB"]),
  },
  {
    id: "sb-mixed",
    label: "SB first-in",
    description: "The small blind mixes raises and limps because it has only one player behind but will be out of position after the flop.",
    selectorLabel: "Action",
    options: [
      { label: "Raise", specification: DEEP_OPEN_SPECS.SB, hands: [...DEEP_OPEN_RANGES.SB] },
      { label: "Limp or mix", specification: SB_LIMP_SPEC, hands: [...SB_LIMP_RANGE] },
    ],
  },
  {
    id: "three-bet",
    label: "3-bet vs raise",
    description: "Value and selected bluffing hands used to make the first preflop re-raise against an opener from this position.",
    selectorLabel: "Raiser's position",
    options: chartOptions(DEEP_THREE_BET_SPECS, SIX_MAX_CHART_POSITIONS),
  },
  {
    id: "vs-three-bet",
    label: "Continue vs 3-bet",
    description: "Hands that continue after you open and a player behind re-raises. Select both your opening position and the three-bettor; calls and four-bets are shown together.",
    selectorLabel: "Position matchup",
    options: Object.entries(VS_THREE_BET_SPECS).map(([label, specification]) => ({
      label,
      specification,
      hands: [...VS_THREE_BET_RANGES[label]],
    })),
  },
  {
    id: "bb-vs-sb",
    label: "BB vs SB",
    description: "The big blind receives a good price and closes the action against the small blind's wide opening range.",
    selectorLabel: "Action",
    options: [
      { label: "Continue", specification: "22+ A2s+ A2o+ K2s+ K7o+ Q5s+ Q8o+ J7s+ J8o+ T7s+ T8o+ 96s+ 97o+ 86s+ 87o 75s+ 65s 54s", hands: [...BB_VS_SB_CONTINUE_RANGE] },
      { label: "3-bet", specification: "77+ A8s+ ATo+ KTs+ KQo QJs A5s A4s", hands: [...BB_VS_SB_THREE_BET_RANGE] },
    ],
  },
  {
    id: "four-bet",
    label: "Continue vs 4-bet",
    description: "Premium 100-BB hands that remain in the modeled continuing range after the second preflop re-raise.",
    selectorLabel: "Situation",
    options: [{ label: "100 BB", specification: "QQ+ AKs AKo", hands: [...DEEP_FOUR_BET_CONTINUE_RANGE] }],
  },
  {
    id: "short-stack",
    label: "Short-stack reshove",
    description: "Baseline all-in re-raise ranges at roughly 25 BB or less. The coach blends toward these ranges gradually as stacks shorten.",
    selectorLabel: "Raiser's position",
    options: chartOptions(SHORT_SHOVE_SPECS, SIX_MAX_CHART_POSITIONS),
  },
];

export type PreflopPlan = {
  preferred: "fold" | "call" | "raise" | "all-in";
  confidence: "High" | "Medium";
  effectiveStackBb: number;
  hand: string;
  reason: string;
  scenario: string;
  frequencies: Record<"fold" | "call" | "raise" | "all-in", number>;
};

export type PreflopChoice = keyof PreflopPlan["frequencies"];

function preflopPlan(
  hand: string,
  effectiveStackBb: number,
  scenario: string,
  reason: string,
  frequencies: Partial<Record<PreflopChoice, number>>,
  confidence: PreflopPlan["confidence"] = "Medium",
): PreflopPlan {
  const complete: PreflopPlan["frequencies"] = { fold: 0, call: 0, raise: 0, "all-in": 0, ...frequencies };
  const total = Object.values(complete).reduce((sum, frequency) => sum + Math.max(0, frequency), 0) || 1;
  (Object.keys(complete) as PreflopChoice[]).forEach((choice) => { complete[choice] = Math.max(0, complete[choice]) / total; });
  const preferred = (Object.keys(complete) as PreflopChoice[]).reduce((best, choice) => complete[choice] > complete[best] ? choice : best, "fold");
  return { preferred, confidence, effectiveStackBb, hand, reason, scenario, frequencies: complete };
}

function positionIsEarly(position: Position) {
  return position === "UTG" || position === "HJ";
}

function facingThreeBetPlan(
  state: HandState,
  seatIndex: number,
  hand: string,
  effectiveStackBb: number,
  aggressor: number,
  squeezed: boolean,
  callerCount: number,
) {
  const player = state.players[seatIndex];
  const aggressorPosition = state.players[aggressor].position;
  const inPosition = actsAfterPostflop(state, seatIndex, aggressor);
  const early = positionIsEarly(player.position);
  const lateVsBlind = (player.position === "CO" || player.position === "BTN") && (aggressorPosition === "SB" || aggressorPosition === "BB");
  const price = toCallFor(state, seatIndex) / Math.max(1, potTotal(state) + toCallFor(state, seatIndex));
  const veryDeep = effectiveStackBb > 140;
  const scenario = squeezed
    ? `${player.position} opener facing a ${aggressorPosition} squeeze${callerCount ? ` after ${callerCount} caller${callerCount === 1 ? "" : "s"}` : ""}`
    : `${player.position} opener facing a ${aggressorPosition} three-bet`;
  const detail = `${Math.round(price * 100)}% immediate price at ${effectiveStackBb} BB effective`;

  if (hand === "AA" || hand === "KK") {
    return preflopPlan(hand, effectiveStackBb, scenario, `${hand} remains a premium value hand in this ${squeezed ? "squeeze" : "three-bet"} pot; mix a four-bet with some calls to protect the calling range.`, { raise: 0.78, call: 0.22 }, "High");
  }
  if (hand === "QQ" || hand === "AKs") {
    return preflopPlan(hand, effectiveStackBb, scenario, `${hand} comfortably continues against this ${aggressorPosition} range; both four-betting and calling are credible at ${detail}.`, { raise: squeezed ? 0.5 : 0.42, call: squeezed ? 0.42 : 0.53, fold: squeezed ? 0.08 : 0.05 }, "High");
  }
  if (hand === "AKo" || hand === "JJ") {
    const fold = early && squeezed ? 0.2 : 0.1;
    return preflopPlan(hand, effectiveStackBb, scenario, `${hand} should usually continue, but position, depth, and the stronger range implied by a squeeze mean it is not always strong enough to play for all the chips.`, { call: inPosition ? 0.56 : 0.44, raise: 1 - fold - (inPosition ? 0.56 : 0.44), fold });
  }
  if (hand === "AQo") {
    if (early && squeezed) {
      return preflopPlan(hand, effectiveStackBb, scenario, `AQo is often dominated by the squeezer's likely hands and is difficult to play profitably out of position. The caller's chips improve the pot, but that player may also continue; fold most often and use only a small blocker four-bet mix.`, { fold: 0.87, raise: 0.1, call: 0.03 }, "Medium");
    }
    if (lateVsBlind && !squeezed) {
      return preflopPlan(hand, effectiveStackBb, scenario, `AQo is much stronger in a late-position versus blind battle because the blind's three-bet range is wider. Continue mostly by calling, with a smaller four-bet mix.`, { call: veryDeep ? 0.5 : 0.46, raise: 0.2, fold: veryDeep ? 0.3 : 0.34 }, "Medium");
    }
    return preflopPlan(hand, effectiveStackBb, scenario, `AQo is a mixed response: continue more against wide late-position aggression, but fold more when out of position, deep, or facing a squeeze.`, { fold: squeezed ? 0.62 : 0.66, raise: 0.18, call: squeezed ? 0.2 : 0.16 });
  }
  if (hand === "AQs" || hand === "KQs" || hand === "TT" || hand === "99") {
    const call = inPosition ? (veryDeep ? 0.58 : 0.52) : (veryDeep ? 0.28 : 0.38);
    const raise = hand === "AQs" ? 0.18 : 0.08;
    return preflopPlan(hand, effectiveStackBb, scenario, `Calling can let this hand reach showdown profitably, especially in position, but it should fold more often when deep and out of position${squeezed ? " against the tighter squeeze range" : ""}.`, { call, raise, fold: 1 - call - raise });
  }
  if (hand === "A5s" || hand === "A4s") {
    const raise = squeezed ? 0.08 : lateVsBlind ? 0.18 : 0.12;
    return preflopPlan(hand, effectiveStackBb, scenario, `${hand} is principally a low-frequency blocker four-bet, not a routine call.`, { raise, fold: 1 - raise });
  }
  const chartScenario = `${player.position} vs ${aggressorPosition}`;
  if (!squeezed && VS_THREE_BET_RANGES[chartScenario]?.has(hand)) {
    const pair = hand.length === 2;
    const fourBet = pair ? 0.12 : hand.startsWith("A") ? 0.16 : 0.08;
    const call = inPosition ? (veryDeep ? 0.48 : 0.56) : (veryDeep ? 0.3 : 0.4);
    return preflopPlan(hand, effectiveStackBb, scenario,
      `${hand} is inside the ${chartScenario} continuing range. Prefer calling hands that realize equity well and reserve the smaller four-bet frequency for value and credible blockers.`,
      { call, raise: fourBet, fold: 1 - call - fourBet });
  }
  const pairOrSuited = hand.length === 2 || hand.endsWith("s");
  const speculativeCall = pairOrSuited && inPosition && !squeezed && price <= 0.27 ? (veryDeep ? 0.22 : 0.14) : 0;
  return preflopPlan(hand, effectiveStackBb, scenario, `${hand} is outside the main continuing range once the ${aggressorPosition} three-bet, position, price, and ${squeezed ? "squeeze action" : "action"} are accounted for.`, { call: speculativeCall, fold: 1 - speculativeCall });
}

export function analyzePreflopSpot(state: HandState, seatIndex: number): PreflopPlan | null {
  if (state.street !== "preflop") return null;
  const player = state.players[seatIndex];
  const hand = startingHandKey(player.hole);
  if (!hand) return null;
  const context = buildBotContext(state, seatIndex);
  const preflopActions = context.actions.filter((action) => action.street === "preflop");
  const aggressiveActions = preflopActions.filter((action) => action.type === "raise" || action.type === "all-in");
  const lastRaiser = aggressiveActions.at(-1)?.seat ?? null;
  const opponentStack = lastRaiser === null
    ? Math.max(0, ...context.opponents.map((index) => state.players[index].stack + state.players[index].streetBet))
    : state.players[lastRaiser].stack + state.players[lastRaiser].streetBet;
  const effectiveStackBb = Math.round((Math.min(player.stack + player.streetBet, opponentStack || player.stack + player.streetBet) / 2) * 10) / 10;
  if (effectiveStackBb > 25) {
    if (state.raiseCount === 0) {
      const limperActions = preflopActions.filter((action) => action.type === "call" && action.raiseLevel === 0);
      const limpers = limperActions.length;
      if (player.position === "SB" && limpers === 0) {
        if (DEEP_OPEN_RANGES.SB.has(hand)) return preflopPlan(hand, effectiveStackBb, "Small blind first-in", `${hand} belongs to the SB raising range, with some limps retained to protect the passive line.`, { raise: 0.72, call: 0.24, fold: 0.04 });
        if (SB_LIMP_RANGE.has(hand)) return preflopPlan(hand, effectiveStackBb, "Small blind first-in", `${hand} can complete for one more small blind but is not strong enough to raise at full frequency out of position.`, { call: 0.76, raise: 0.12, fold: 0.12 });
        return preflopPlan(hand, effectiveStackBb, "Small blind first-in", `${hand} is outside the modeled SB participation range despite having only one player behind.`, { fold: 0.88, call: 0.1, raise: 0.02 });
      }
      const stickyLimp = limperActions.some((action) => {
        const stats = state.players[action.seat].stats;
        return stats.hands >= 25 && (stats.vpip - stats.pfr) / stats.hands >= 0.24;
      });
      const marginalOutOfPositionIsolation = limpers > 0
        && stickyLimp
        && (player.position === "SB" || player.position === "BB")
        && preflopStrength(player.hole) < 0.84;
      const preferred = DEEP_OPEN_RANGES[player.position].has(hand) && !marginalOutOfPositionIsolation ? "raise" : toCallFor(state, seatIndex) > 0 ? "fold" : "call";
      const scenario = limpers ? `${player.position} facing ${limpers} limper${limpers === 1 ? "" : "s"}` : `Unopened pot from ${player.position}`;
      if (preferred === "raise") return preflopPlan(hand, effectiveStackBb, scenario, `${hand} is inside the ${player.position} ${limpers ? "isolation-raising" : "opening"} range.`, { raise: limpers ? 0.85 : 0.94, call: limpers ? 0.15 : 0.06 });
      if (preferred === "call") return preflopPlan(hand, effectiveStackBb, scenario, `${hand} is outside the raising range, but checking the big blind or taking a very low-cost option is available.`, { call: 1 });
      return preflopPlan(hand, effectiveStackBb, scenario, `${hand} is outside the ${player.position} ${limpers ? "isolation" : "opening"} range.`, { fold: 0.96, call: 0.04 });
    }
    const opener = aggressiveActions[0]?.seat ?? context.opener;
    const openerPosition = opener === null || opener === undefined ? "UTG" : state.players[opener].position;
    const firstRaiseIndex = aggressiveActions.length >= 1 ? preflopActions.indexOf(aggressiveActions[0]) : -1;
    const secondRaiseIndex = aggressiveActions.length >= 2 ? preflopActions.indexOf(aggressiveActions[1]) : -1;
    const callersBetweenRaises = secondRaiseIndex < 0 ? [] : preflopActions.slice(firstRaiseIndex + 1, secondRaiseIndex)
      .filter((action) => action.type === "call" && action.raiseLevel >= 1);
    const callersBeforeThreeBet = callersBetweenRaises.filter((action) => action.seat !== seatIndex);
    const heroCalledOriginalRaise = callersBetweenRaises.some((action) => action.seat === seatIndex);
    const squeezed = aggressiveActions.length === 2 && callersBetweenRaises.length > 0;
    if (state.raiseCount === 2 && opener === seatIndex && lastRaiser !== null) {
      return facingThreeBetPlan(state, seatIndex, hand, effectiveStackBb, lastRaiser, squeezed, callersBeforeThreeBet.length);
    }
    if (state.raiseCount === 2 && lastRaiser !== null) {
      const aggressorPosition = state.players[lastRaiser].position;
      const limpersBeforeOpen = firstRaiseIndex < 0 ? [] : preflopActions.slice(0, firstRaiseIndex)
        .filter((action) => action.type === "call" && action.raiseLevel === 0);
      const raisedPotDescription = limpersBeforeOpen.length > 0 ? `${openerPosition} isolation raise` : `${openerPosition} raise`;
      const scenario = heroCalledOriginalRaise
        ? `${player.position} caller facing a ${aggressorPosition} squeeze`
        : squeezed
          ? `${player.position} facing a ${aggressorPosition} squeeze before entering the pot`
          : `${player.position} facing a ${aggressorPosition} three-bet after a ${raisedPotDescription}`;
      const pressureExplanation = heroCalledOriginalRaise
        ? `You called the original raise, then ${aggressorPosition} squeezed: a three-bet after a raise and at least one call. The original raiser can still act again.`
        : squeezed
          ? `${aggressorPosition} squeezed after a raise and call. You have not entered voluntarily, and both the three-bettor and original raiser can hold strong hands.`
          : `${aggressorPosition} three-bet the ${raisedPotDescription}. This is not a squeeze because nobody called the raise first; the original raiser can still act again.`;
      if (DEEP_FOUR_BET_RANGE.has(hand)) return preflopPlan(hand, effectiveStackBb, scenario, `${pressureExplanation} ${hand} is strong enough to continue, usually by making a value four-bet while retaining some calls.`, { raise: 0.62, call: 0.28, fold: 0.1 }, "High");
      if (hand === "JJ" || hand === "TT" || hand === "AQs" || hand === "AKo") return preflopPlan(hand, effectiveStackBb, scenario, `${pressureExplanation} ${hand} is near the top of the continuing range, but the two potentially strong ranges still require a tight defense.`, { call: 0.42, fold: 0.48, raise: 0.1 });
      return preflopPlan(hand, effectiveStackBb, scenario, `${pressureExplanation} Continue only with a very strong range; ${hand} should usually fold.`, { fold: 0.92, call: 0.08 });
    }
    if (state.raiseCount === 1 && player.position === "BB" && BB_DEFENSE_RANGES[openerPosition]) {
      const openingAction = aggressiveActions[0];
      const openSizeBb = Math.max(2, (openingAction?.amount ?? 5) / 2);
      const priceAdjustment = openSizeBb <= 2.25 ? 0.08 : openSizeBb >= 3 ? -0.08 : 0;
      const scenario = `BB defending against a ${openerPosition} ${openSizeBb.toFixed(1)} BB open`;
      if (BB_THREE_BET_RANGES[openerPosition]!.has(hand)) {
        return preflopPlan(hand, effectiveStackBb, scenario, `${hand} is strong enough to mix a value or blocker-driven three-bet against this ${openerPosition} opening range.`, { raise: 0.54, call: 0.42, fold: 0.04 });
      }
      if (BB_DEFENSE_RANGES[openerPosition]!.has(hand)) {
        const call = Math.max(0.48, Math.min(0.88, 0.72 + priceAdjustment));
        return preflopPlan(hand, effectiveStackBb, scenario, `${hand} is inside the dedicated BB-versus-${openerPosition} defense range. The big blind closes the action, while the ${openSizeBb.toFixed(1)} BB size determines the price.`, { call, raise: 0.04, fold: 0.96 - call });
      }
      return preflopPlan(hand, effectiveStackBb, scenario, `${hand} remains outside the dedicated BB-versus-${openerPosition} range at this price.`, { fold: openSizeBb <= 2.25 ? 0.86 : 0.94, call: openSizeBb <= 2.25 ? 0.14 : 0.06 });
    }
    if (state.raiseCount === 1 && DEEP_THREE_BET_RANGES[openerPosition].has(hand)) {
      const premium = PREMIUM_SHORT_RANGE.has(hand);
      return preflopPlan(hand, effectiveStackBb, `${player.position} facing a ${openerPosition} open`, `${hand} belongs to the value or mixed three-bet range against a ${openerPosition} open.`, { raise: premium ? 0.78 : 0.58, call: premium ? 0.2 : 0.2, fold: premium ? 0.02 : 0.22 }, premium ? "High" : "Medium");
    }
    if (state.raiseCount === 1 && DEEP_CONTINUE_RANGES[openerPosition].has(hand)) {
      const inPosition = lastRaiser !== null && actsAfterPostflop(state, seatIndex, lastRaiser);
      const call = inPosition ? 0.68 : 0.54;
      return preflopPlan(hand, effectiveStackBb, `${player.position} facing a ${openerPosition} open`, `${hand} can continue against this ${openerPosition} opening range and price${inPosition ? " with position" : ", though being out of position makes it harder to reach showdown profitably"}.`, { call, fold: 1 - call });
    }
    if (state.raiseCount >= 3 && DEEP_PREMIUM_STACK_OFF_RANGE.has(hand)) {
      const preferred = state.raiseCount === 3 && effectiveStackBb <= 150 ? "all-in" : "call";
      return preflopPlan(hand, effectiveStackBb, `Facing a four-bet at ${effectiveStackBb} BB`, preferred === "all-in"
        ? `${hand} is a premium hand that is strong enough to play for all the chips against a four-bet at ${effectiveStackBb} BB effective.`
        : `${hand} must continue against this re-raise; at this depth, calling preserves a wider continuing range.`, preferred === "all-in" ? { "all-in": 0.78, call: 0.22 } : { call: 0.62, raise: 0.38 }, "High");
    }
    if (state.raiseCount === 3 && DEEP_FOUR_BET_CONTINUE_RANGE.has(hand) && effectiveStackBb <= 120 && toCallFor(state, seatIndex) <= player.stack * 0.28) {
      return preflopPlan(hand, effectiveStackBb, `Facing a four-bet at ${effectiveStackBb} BB`, `${hand} remains inside the modeled four-bet continuing range at this price and stack depth.`, { call: 0.65, fold: 0.2, raise: 0.15 });
    }
    return preflopPlan(hand, effectiveStackBb, state.raiseCount === 1 ? `${player.position} facing a ${openerPosition} open` : "Facing a re-raised pot", `${hand} falls outside the modeled continuing range after position, price, and prior action are considered.`, { fold: 0.94, call: 0.06 });
  }

  if (state.raiseCount === 0) {
    const openRate = Math.min(0.68, POSITION_OPEN_RATE[player.position] * PROFILE[player.profile].openFactor + (effectiveStackBb <= 12 ? 0.08 : 0));
    const playable = preflopStrength(player.hole) >= 1 - openRate;
    if (!playable) return preflopPlan(hand, effectiveStackBb, `Short-stack unopened pot from ${player.position}`, "This hand falls outside the short-stack opening range.", toCallFor(state, seatIndex) > 0 ? { fold: 1 } : { call: 1 }, "High");
    return preflopPlan(hand, effectiveStackBb, `Short-stack unopened pot from ${player.position}`, effectiveStackBb <= 8 ? "At eight big blinds or less, this playable hand belongs in the open-shove range." : "Short stacks favor raising rather than limping a playable opening hand.", effectiveStackBb <= 8 ? { "all-in": 1 } : { raise: 1 }, "High");
  }

  const openerPosition = context.facingPosition ?? "UTG";
  const shoveRange = SHORT_SHOVE_RANGES[openerPosition];
  const premium = PREMIUM_SHORT_RANGE.has(hand);
  const shove = premium || shoveRange.has(hand);
  if (shove) {
    return preflopPlan(hand, effectiveStackBb, `Short-stack response to a ${openerPosition} raise`, premium
        ? `${hand} is a mandatory short-stack value shove against this raise.`
        : `${hand} is inside the ${openerPosition} short-stack reshove range.`, { "all-in": premium ? 1 : 0.78, fold: premium ? 0 : 0.22 }, premium ? "High" : "Medium");
  }
  if (state.raiseCount === 1 && SHORT_CONTINUE_RANGE.has(hand) && toCallFor(state, seatIndex) <= player.stack * 0.28) {
    return preflopPlan(hand, effectiveStackBb, `Short-stack response to a ${openerPosition} raise`, "The hand can continue at this price but is not strong enough to reshove.", { call: 0.68, fold: 0.32 });
  }
  return preflopPlan(hand, effectiveStackBb, `Short-stack response to a ${openerPosition} raise`, "The price and short effective stack leave insufficient room to continue profitably.", { fold: 1 }, "High");
}
