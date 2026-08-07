export type Suit = "clubs" | "diamonds" | "hearts" | "spades";
export type Rank = "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "T" | "J" | "Q" | "K" | "A";
export type Card = { rank: Rank; suit: Suit };
export type Position = "BTN" | "SB" | "BB" | "UTG" | "HJ" | "CO";
export type Street = "preflop" | "flop" | "turn" | "river";
export type ActionKind = "fold" | "check" | "call" | "raise" | "all-in";
export type BotProfile = "balanced" | "tag" | "lag" | "nit" | "caller";

export type PokerAction = { type: ActionKind; amount?: number };
export type PlayerStats = { hands: number; vpip: number; pfr: number; aggression: number };
export type Seat = {
  id: string;
  name: string;
  isHuman: boolean;
  profile: BotProfile;
  stack: number;
  streetBet: number;
  committed: number;
  hole: Card[];
  folded: boolean;
  allIn: boolean;
  acted: boolean;
  actedAtBet: number | null;
  voluntaryPreflop: boolean;
  raisedPreflop: boolean;
  lastAction: string;
  position: Position;
  stats: PlayerStats;
};

export type ReviewItem = {
  street: Street;
  position: Position;
  cards: Card[];
  board: Card[];
  pot: number;
  toCall: number;
  action: string;
  equity: number;
  potOdds: number;
  grade: "Strong" | "Reasonable" | "Questionable";
  suggestion: string;
  note: string;
};

export type HandState = {
  version: 4;
  handNumber: number;
  dealer: number;
  street: Street;
  deck: Card[];
  board: Card[];
  players: Seat[];
  currentBet: number;
  minRaise: number;
  raiseCount: number;
  currentActor: number;
  status: "playing" | "handOver" | "busted";
  history: string[];
  reviews: ReviewItem[];
  result: string;
  sessionStart: number;
  sessionHands: number;
};

export type PublicGameView = Pick<HandState, "street" | "board" | "currentBet" | "minRaise"> & {
  pot: number;
  activePlayers: number;
  seat: Pick<Seat, "stack" | "streetBet" | "position" | "stats">;
};

const RANKS: Rank[] = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
const SUITS: Suit[] = ["clubs", "diamonds", "hearts", "spades"];
const VALUES: Record<Rank, number> = { "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, T: 10, J: 11, Q: 12, K: 13, A: 14 };
const POSITIONS: Position[] = ["BTN", "SB", "BB", "UTG", "HJ", "CO"];
// Seat indices follow component layout, not numeric clockwise order:
// top-left → top-center → top-right → right → hero → left.
export const CLOCKWISE_SEATS = [0, 1, 2, 3, 5, 4] as const;
const NAMES = ["Mara", "Theo", "June", "Silas", "Niko", "You"];
const PROFILES: BotProfile[] = ["balanced", "tag", "lag", "nit", "caller", "balanced"];

export const humanSeat = 5;
export const potTotal = (state: HandState) => state.players.reduce((sum, player) => sum + player.committed, 0);
export const toCallFor = (state: HandState, seat: number) => Math.max(0, state.currentBet - state.players[seat].streetBet);
export const cardLabel = (card: Card) => `${card.rank}${{ clubs: "♣", diamonds: "♦", hearts: "♥", spades: "♠" }[card.suit]}`;

function makeDeck(): Card[] {
  return SUITS.flatMap((suit) => RANKS.map((rank) => ({ rank, suit })));
}

function cryptoRandom() {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const value = new Uint32Array(1);
    crypto.getRandomValues(value);
    return value[0] / 4294967296;
  }
  return Math.random();
}

export function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

export function shuffledDeck(random = cryptoRandom): Card[] {
  const deck = makeDeck();
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [deck[index], deck[swap]] = [deck[swap], deck[index]];
  }
  return deck;
}

function baseSeat(index: number): Seat {
  return {
    id: index === humanSeat ? "hero" : `bot-${index}`,
    name: NAMES[index],
    isHuman: index === humanSeat,
    profile: PROFILES[index],
    stack: 200,
    streetBet: 0,
    committed: 0,
    hole: [],
    folded: false,
    allIn: false,
    acted: false,
    actedAtBet: null,
    voluntaryPreflop: false,
    raisedPreflop: false,
    lastAction: "",
    position: "UTG",
    stats: { hands: 0, vpip: 0, pfr: 0, aggression: 0 },
  };
}

function nextSeat(start: number, predicate: (seat: number) => boolean) {
  const startPosition = CLOCKWISE_SEATS.indexOf(start as (typeof CLOCKWISE_SEATS)[number]);
  for (let step = 1; step <= 6; step += 1) {
    const candidate = CLOCKWISE_SEATS[(startPosition + step) % 6];
    if (predicate(candidate)) return candidate;
  }
  return -1;
}

function clockwiseSeat(start: number, steps = 1) {
  const startPosition = CLOCKWISE_SEATS.indexOf(start as (typeof CLOCKWISE_SEATS)[number]);
  return CLOCKWISE_SEATS[(startPosition + steps) % 6];
}

function clockwiseDistance(start: number, target: number) {
  const from = CLOCKWISE_SEATS.indexOf(start as (typeof CLOCKWISE_SEATS)[number]);
  const to = CLOCKWISE_SEATS.indexOf(target as (typeof CLOCKWISE_SEATS)[number]);
  const distance = (to - from + 6) % 6;
  return distance === 0 ? 6 : distance;
}

function pay(player: Seat, amount: number) {
  const paid = Math.min(player.stack, amount);
  player.stack -= paid;
  player.streetBet += paid;
  player.committed += paid;
  if (player.stack === 0) player.allIn = true;
  return paid;
}

export function createSession(random: () => number = cryptoRandom): HandState {
  return startHand({
    version: 4,
    handNumber: 0,
    dealer: 4,
    street: "preflop",
    deck: [],
    board: [],
    players: Array.from({ length: 6 }, (_, index) => baseSeat(index)),
    currentBet: 0,
    minRaise: 2,
    raiseCount: 0,
    currentActor: -1,
    status: "handOver",
    history: [],
    reviews: [],
    result: "",
    sessionStart: 200,
    sessionHands: 0,
  }, random);
}

export function startHand(previous: HandState, random: () => number = cryptoRandom): HandState {
  const players = previous.players.map((old, index) => ({
    ...old,
    stack: index !== humanSeat && old.stack <= 0 ? 200 : old.stack,
    streetBet: 0,
    committed: 0,
    hole: [] as Card[],
    folded: false,
    allIn: false,
    acted: false,
    actedAtBet: null,
    voluntaryPreflop: false,
    raisedPreflop: false,
    lastAction: "",
    stats: { ...old.stats, hands: old.stats.hands + 1 },
  }));
  if (players[humanSeat].stack <= 0) return { ...previous, players, status: "busted", result: "Your stack is gone. Review the session, then reset when you’re ready." };

  const dealer = clockwiseSeat(previous.dealer);
  const dealerPosition = CLOCKWISE_SEATS.indexOf(dealer as (typeof CLOCKWISE_SEATS)[number]);
  players.forEach((player, index) => {
    const seatPosition = CLOCKWISE_SEATS.indexOf(index as (typeof CLOCKWISE_SEATS)[number]);
    const offset = (seatPosition - dealerPosition + 6) % 6;
    player.position = POSITIONS[offset];
  });
  const deck = shuffledDeck(random);
  const dealOrder: number[] = [];
  let cursor = dealer;
  for (let count = 0; count < 6; count += 1) {
    cursor = clockwiseSeat(cursor);
    dealOrder.push(cursor);
  }
  for (let round = 0; round < 2; round += 1) {
    dealOrder.forEach((seat) => players[seat].hole.push(deck.pop()!));
  }
  const sb = clockwiseSeat(dealer);
  const bb = clockwiseSeat(dealer, 2);
  pay(players[sb], 1);
  pay(players[bb], 2);
  players[sb].lastAction = "SB $1";
  players[bb].lastAction = "BB $2";
  return {
    ...previous,
    handNumber: previous.handNumber + 1,
    dealer,
    street: "preflop",
    deck,
    board: [],
    players,
    currentBet: 2,
    minRaise: 2,
    raiseCount: 0,
    currentActor: clockwiseSeat(bb),
    status: "playing",
    history: [`Hand #${previous.handNumber + 1} · $1/$2 No-Limit Hold’em`],
    reviews: [],
    result: "",
    sessionHands: previous.sessionHands + 1,
  };
}

export function legalBounds(state: HandState, seat: number) {
  const player = state.players[seat];
  const max = player.streetBet + player.stack;
  const min = Math.min(max, state.currentBet + state.minRaise);
  const actionReopened = player.actedAtBet === null || state.currentBet - player.actedAtBet >= state.minRaise;
  return { toCall: toCallFor(state, seat), min, max, canRaise: max > state.currentBet && actionReopened };
}

function activePlayers(state: HandState) {
  return state.players.filter((player) => !player.folded);
}

function bettingComplete(state: HandState) {
  return state.players.every((player) => player.folded || player.allIn || (player.acted && player.streetBet === state.currentBet));
}

function append(state: HandState, message: string) {
  state.history = [...state.history, message].slice(-60);
}

export function applyAction(input: HandState, seatIndex: number, action: PokerAction): HandState {
  if (input.status !== "playing" || input.currentActor !== seatIndex) return input;
  const state = structuredClone(input) as HandState;
  const player = state.players[seatIndex];
  const beforeToCall = toCallFor(state, seatIndex);
  const bounds = legalBounds(state, seatIndex);
  const oldCurrentBet = state.currentBet;

  if (action.type === "fold") {
    player.folded = true;
    player.acted = true;
    player.actedAtBet = state.currentBet;
    player.lastAction = "Fold";
  } else if (action.type === "check" && beforeToCall === 0) {
    player.acted = true;
    player.actedAtBet = state.currentBet;
    player.lastAction = "Check";
  } else if (action.type === "call" && beforeToCall > 0) {
    const paid = pay(player, beforeToCall);
    player.acted = true;
    player.actedAtBet = state.currentBet;
    player.lastAction = paid < beforeToCall ? `All-in $${player.streetBet}` : `Call $${paid}`;
    if (state.street === "preflop" && paid > 0 && !player.voluntaryPreflop) {
      player.stats.vpip += 1;
      player.voluntaryPreflop = true;
    }
  } else if (action.type === "all-in" || action.type === "raise") {
    let target = action.type === "all-in" ? bounds.max : Math.round(action.amount ?? bounds.min);
    target = Math.max(player.streetBet, Math.min(bounds.max, target));
    if (target > state.currentBet && !bounds.canRaise) return input;
    if (target <= state.currentBet && target < bounds.max) return input;
    if (target > state.currentBet && target < bounds.min && target !== bounds.max) return input;
    const paid = pay(player, target - player.streetBet);
    const raiseSize = target - oldCurrentBet;
    const fullRaise = target > oldCurrentBet && raiseSize >= state.minRaise;
    if (target > state.currentBet) state.currentBet = target;
    if (fullRaise) {
      state.minRaise = raiseSize;
      state.raiseCount += 1;
      state.players.forEach((other, index) => {
        if (index !== seatIndex && !other.folded && !other.allIn) {
          other.acted = false;
        }
      });
    }
    player.acted = true;
    player.actedAtBet = state.currentBet;
    player.lastAction = player.allIn ? `All-in $${target}` : `${oldCurrentBet === 0 ? "Bet" : "Raise"} to $${target}`;
    if (state.street === "preflop") {
      if (!player.voluntaryPreflop) {
        player.stats.vpip += 1;
        player.voluntaryPreflop = true;
      }
      if (!player.raisedPreflop) {
        player.stats.pfr += 1;
        player.raisedPreflop = true;
      }
    }
    player.stats.aggression += paid > 0 ? 1 : 0;
  } else {
    return input;
  }

  append(state, `${player.name} · ${player.lastAction}`);
  if (seatIndex === humanSeat) state.reviews.push(buildReview(input, action));

  if (activePlayers(state).length === 1) return awardUncontested(state);
  if (bettingComplete(state)) return advanceStreet(state);

  const next = nextSeat(seatIndex, (index) => {
    const candidate = state.players[index];
    return !candidate.folded && !candidate.allIn && (!candidate.acted || candidate.streetBet < state.currentBet);
  });
  state.currentActor = next;
  return state;
}

function awardUncontested(state: HandState) {
  const winner = state.players.find((player) => !player.folded)!;
  const pot = potTotal(state);
  winner.stack += pot;
  state.players.forEach((player) => { player.committed = 0; player.streetBet = 0; });
  state.status = winner.isHuman && winner.stack <= 0 ? "busted" : "handOver";
  state.currentActor = -1;
  state.result = `${winner.name} wins $${pot} uncontested`;
  append(state, state.result);
  return state;
}

function advanceStreet(state: HandState): HandState {
  const streetOrder: Street[] = ["preflop", "flop", "turn", "river"];
  const index = streetOrder.indexOf(state.street);
  if (index === 3) return showdown(state);
  state.street = streetOrder[index + 1];
  state.players.forEach((player) => {
    player.streetBet = 0;
    player.acted = player.folded || player.allIn;
    player.actedAtBet = null;
  });
  state.currentBet = 0;
  state.minRaise = 2;
  state.raiseCount = 0;
  state.deck.pop(); // One burn card before every community-card street.
  const count = state.street === "flop" ? 3 : 1;
  for (let card = 0; card < count; card += 1) state.board.push(state.deck.pop()!);
  append(state, `${state.street[0].toUpperCase()}${state.street.slice(1)} · ${state.board.map(cardLabel).join(" ")}`);

  const able = state.players.filter((player) => !player.folded && !player.allIn);
  if (able.length <= 1) return runOut(state);
  state.currentActor = nextSeat(state.dealer, (seat) => !state.players[seat].folded && !state.players[seat].allIn);
  return state;
}

function runOut(state: HandState): HandState {
  while (state.board.length < 5) {
    state.deck.pop();
    const count = state.board.length === 0 ? 3 : 1;
    for (let card = 0; card < count; card += 1) state.board.push(state.deck.pop()!);
  }
  state.street = "river";
  append(state, `Runout · ${state.board.map(cardLabel).join(" ")}`);
  return showdown(state);
}

type HandScore = number[];

export function evaluateHand(cards: Card[]): { score: HandScore; name: string } {
  if (cards.length < 5) return { score: [0], name: "High card" };
  let best: { score: HandScore; name: string } | null = null;
  const combinations: Card[][] = [];
  for (let a = 0; a < cards.length - 4; a += 1)
    for (let b = a + 1; b < cards.length - 3; b += 1)
      for (let c = b + 1; c < cards.length - 2; c += 1)
        for (let d = c + 1; d < cards.length - 1; d += 1)
          for (let e = d + 1; e < cards.length; e += 1) combinations.push([cards[a], cards[b], cards[c], cards[d], cards[e]]);
  combinations.forEach((combo) => {
    const ranked = rankFive(combo);
    if (!best || compareScores(ranked.score, best.score) > 0) best = ranked;
  });
  return best!;
}

function rankFive(cards: Card[]) {
  const values = cards.map((card) => VALUES[card.rank]).sort((a, b) => b - a);
  const counts = new Map<number, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const flush = cards.every((card) => card.suit === cards[0].suit);
  const unique = [...new Set(values)];
  if (unique[0] === 14) unique.push(1);
  let straightHigh = 0;
  for (let i = 0; i <= unique.length - 5; i += 1) if (unique[i] - unique[i + 4] === 4) straightHigh = Math.max(straightHigh, unique[i]);
  if (flush && straightHigh) return { score: [8, straightHigh], name: straightHigh === 14 ? "Royal flush" : "Straight flush" };
  if (groups[0][1] === 4) return { score: [7, groups[0][0], groups[1][0]], name: "Four of a kind" };
  if (groups[0][1] === 3 && groups[1][1] >= 2) return { score: [6, groups[0][0], groups[1][0]], name: "Full house" };
  if (flush) return { score: [5, ...values], name: "Flush" };
  if (straightHigh) return { score: [4, straightHigh], name: "Straight" };
  if (groups[0][1] === 3) return { score: [3, groups[0][0], ...groups.slice(1).map(([value]) => value).sort((a, b) => b - a)], name: "Three of a kind" };
  if (groups[0][1] === 2 && groups[1][1] === 2) return { score: [2, Math.max(groups[0][0], groups[1][0]), Math.min(groups[0][0], groups[1][0]), groups[2][0]], name: "Two pair" };
  if (groups[0][1] === 2) return { score: [1, groups[0][0], ...groups.slice(1).map(([value]) => value).sort((a, b) => b - a)], name: "One pair" };
  return { score: [0, ...values], name: "High card" };
}

export function compareScores(a: HandScore, b: HandScore) {
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    if ((a[index] ?? 0) !== (b[index] ?? 0)) return (a[index] ?? 0) - (b[index] ?? 0);
  }
  return 0;
}

function showdown(state: HandState): HandState {
  const contributions = [...new Set(state.players.map((player) => player.committed).filter(Boolean))].sort((a, b) => a - b);
  let previous = 0;
  const awards = new Map<number, number>();
  const descriptions = new Set<string>();
  contributions.forEach((level) => {
    const contributors = state.players.filter((player) => player.committed >= level);
    const eligible = contributors.filter((player) => !player.folded);
    const amount = (level - previous) * contributors.length;
    previous = level;
    if (!eligible.length || !amount) return;
    const ranked = eligible.map((player) => ({ player, result: evaluateHand([...player.hole, ...state.board]) }));
    const best = ranked.reduce((top, item) => compareScores(item.result.score, top.result.score) > 0 ? item : top);
    const winners = ranked.filter((item) => compareScores(item.result.score, best.result.score) === 0);
    const share = Math.floor(amount / winners.length);
    let odd = amount - share * winners.length;
    const clockwise = [...winners].sort((a, b) => clockwiseDistance(state.dealer, state.players.indexOf(a.player)) - clockwiseDistance(state.dealer, state.players.indexOf(b.player)));
    clockwise.forEach(({ player }) => {
      awards.set(state.players.indexOf(player), (awards.get(state.players.indexOf(player)) ?? 0) + share + (odd-- > 0 ? 1 : 0));
    });
    descriptions.add(`${winners.map(({ player }) => player.name).join(" & ")} · ${best.result.name}`);
  });
  awards.forEach((amount, index) => { state.players[index].stack += amount; });
  const total = potTotal(state);
  state.players.forEach((player) => { player.committed = 0; player.streetBet = 0; });
  state.status = state.players[humanSeat].stack <= 0 ? "busted" : "handOver";
  state.currentActor = -1;
  state.result = `${[...descriptions].join(" · ")} · $${total} awarded`;
  append(state, state.result);
  return state;
}

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

export function estimateEquity(hole: Card[], board: Card[], opponents: number, iterations = 70, random: () => number = Math.random) {
  if (hole.length !== 2) return 0;
  const known = new Set([...hole, ...board].map(cardLabel));
  let wins = 0;
  for (let run = 0; run < iterations; run += 1) {
    const available = shuffledDeck(random).filter((card) => !known.has(cardLabel(card)));
    const rivalHands: Card[][] = [];
    for (let rival = 0; rival < opponents; rival += 1) rivalHands.push([available.pop()!, available.pop()!]);
    const completed = [...board];
    while (completed.length < 5) completed.push(available.pop()!);
    const hero = evaluateHand([...hole, ...completed]).score;
    const rivals = rivalHands.map((cards) => evaluateHand([...cards, ...completed]).score);
    const better = rivals.some((score) => compareScores(score, hero) > 0);
    if (!better) {
      const tied = rivals.filter((score) => compareScores(score, hero) === 0).length;
      wins += 1 / (tied + 1);
    }
  }
  return wins / iterations;
}

const PROFILE = {
  balanced: { openFactor: 1, openRaise: 0.97, continueVsOpen: 0.17, threeBet: 0.075, defendVsThreeBet: 0.075, fourBet: 0.025, continueVsFourBet: 0.021, stackOff: 0.014, preflopAggression: 0.9, postflopAggression: 0.62, postflopContinue: 0.46, betThreshold: 0.58, raiseThreshold: 0.79, bluff: 0.075, callBias: 0 },
  tag: { openFactor: 0.88, openRaise: 0.98, continueVsOpen: 0.14, threeBet: 0.07, defendVsThreeBet: 0.062, fourBet: 0.026, continueVsFourBet: 0.02, stackOff: 0.015, preflopAggression: 0.94, postflopAggression: 0.68, postflopContinue: 0.49, betThreshold: 0.56, raiseThreshold: 0.77, bluff: 0.055, callBias: -0.015 },
  lag: { openFactor: 1.25, openRaise: 0.98, continueVsOpen: 0.23, threeBet: 0.115, defendVsThreeBet: 0.105, fourBet: 0.04, continueVsFourBet: 0.033, stackOff: 0.021, preflopAggression: 0.96, postflopAggression: 0.76, postflopContinue: 0.43, betThreshold: 0.52, raiseThreshold: 0.74, bluff: 0.11, callBias: 0.005 },
  nit: { openFactor: 0.64, openRaise: 0.97, continueVsOpen: 0.09, threeBet: 0.042, defendVsThreeBet: 0.043, fourBet: 0.017, continueVsFourBet: 0.014, stackOff: 0.01, preflopAggression: 0.9, postflopAggression: 0.46, postflopContinue: 0.53, betThreshold: 0.61, raiseThreshold: 0.82, bluff: 0.025, callBias: -0.035 },
  caller: { openFactor: 1.28, openRaise: 0.3, continueVsOpen: 0.29, threeBet: 0.028, defendVsThreeBet: 0.13, fourBet: 0.012, continueVsFourBet: 0.028, stackOff: 0.009, preflopAggression: 0.58, postflopAggression: 0.27, postflopContinue: 0.43, betThreshold: 0.68, raiseThreshold: 0.86, bluff: 0.025, callBias: 0.06 },
};

const POSITION_OPEN_RATE: Record<Position, number> = { UTG: 0.18, HJ: 0.23, CO: 0.3, BTN: 0.44, SB: 0.4, BB: 0.34 };

function bluffCandidate(cards: Card[]) {
  const values = cards.map((card) => VALUES[card.rank]).sort((a, b) => b - a);
  const suited = cards[0].suit === cards[1].suit;
  return (suited && values[0] === 14 && values[1] <= 5) || (suited && values[0] >= 11 && values[1] >= 9);
}

function preflopRaiseAction(state: HandState, seatIndex: number): PokerAction {
  const player = state.players[seatIndex];
  const bounds = legalBounds(state, seatIndex);
  if (state.raiseCount >= 3) return { type: "all-in" };
  const inPosition = ["BTN", "CO"].includes(player.position);
  const limpers = state.players.filter((other, index) => index !== seatIndex && other.voluntaryPreflop && !other.raisedPreflop && !other.folded).length;
  let target: number;
  if (state.raiseCount === 0) target = (player.position === "SB" ? 6 : 5) + limpers * 2;
  else if (state.raiseCount === 1) target = Math.round(state.currentBet * (inPosition ? 3.2 : 3.8) + limpers * state.currentBet);
  else target = Math.round(state.currentBet * (inPosition ? 2.3 : 2.5));
  target = Math.min(bounds.max, Math.max(bounds.min, target));
  return target === bounds.max ? { type: "all-in" } : { type: "raise", amount: target };
}

function boardWetness(board: Card[]) {
  if (board.length < 3) return 0.5;
  const suitCounts = new Map<Suit, number>();
  board.forEach((card) => suitCounts.set(card.suit, (suitCounts.get(card.suit) ?? 0) + 1));
  const suitedness = Math.max(...suitCounts.values()) >= 3 ? 0.35 : Math.max(...suitCounts.values()) === 2 ? 0.18 : 0;
  const values = [...new Set(board.map((card) => VALUES[card.rank]))].sort((a, b) => a - b);
  const connected = values.some((value, index) => index > 0 && value - values[index - 1] <= 2) ? 0.3 : 0;
  const paired = values.length < board.length ? -0.12 : 0;
  return Math.max(0, Math.min(1, 0.25 + suitedness + connected + paired));
}

export function decideBot(state: HandState, seatIndex: number, random: () => number = Math.random): PokerAction {
  const player = state.players[seatIndex];
  const view: PublicGameView = {
    street: state.street,
    board: state.board,
    currentBet: state.currentBet,
    minRaise: state.minRaise,
    pot: potTotal(state),
    activePlayers: activePlayers(state).length,
    seat: { stack: player.stack, streetBet: player.streetBet, position: player.position, stats: player.stats },
  };
  const bounds = legalBounds(state, seatIndex);
  const style = PROFILE[player.profile];
  let strength = state.street === "preflop"
    ? preflopStrength(player.hole)
    : estimateEquity(player.hole, view.board, Math.max(1, view.activePlayers - 1), 54, random);
  if (state.street !== "preflop") {
    const opponents = state.players.filter((other, index) => index !== seatIndex && !other.folded);
    const rangePressure = opponents.reduce((sum, opponent) => sum + (opponent.raisedPreflop ? 0.09 : opponent.voluntaryPreflop ? 0.04 : 0), 0) / Math.max(1, opponents.length);
    strength -= rangePressure;
  }
  strength = Math.max(0, Math.min(1, strength + (random() - 0.5) * 0.035));
  const potOdds = bounds.toCall / Math.max(1, view.pot + bounds.toCall);

  if (state.street === "preflop") {
    if (state.raiseCount === 0) {
      const openRate = Math.min(0.58, POSITION_OPEN_RATE[player.position] * style.openFactor);
      if (strength < 1 - openRate) return bounds.toCall > 0 ? { type: "fold" } : { type: "check" };
      if (bounds.canRaise && random() < style.openRaise) return preflopRaiseAction(state, seatIndex);
      return bounds.toCall > 0 ? { type: "call" } : { type: "check" };
    }

    if (state.raiseCount === 1) {
      const canThreeBet = strength >= 1 - style.threeBet || (bluffCandidate(player.hole) && random() < style.bluff);
      if (bounds.canRaise && canThreeBet && random() < style.preflopAggression) return preflopRaiseAction(state, seatIndex);
      if (strength >= 1 - style.continueVsOpen) return bounds.toCall > 0 ? { type: "call" } : { type: "check" };
      return bounds.toCall > 0 ? { type: "fold" } : { type: "check" };
    }

    if (state.raiseCount === 2) {
      const canFourBet = strength >= 1 - style.fourBet || (bluffCandidate(player.hole) && random() < style.bluff * 0.45);
      if (bounds.canRaise && canFourBet && random() < style.preflopAggression) return preflopRaiseAction(state, seatIndex);
      if (strength >= 1 - style.defendVsThreeBet) return bounds.toCall > 0 ? { type: "call" } : { type: "check" };
      return bounds.toCall > 0 ? { type: "fold" } : { type: "check" };
    }

    if (state.raiseCount === 3) {
      if (bounds.canRaise && strength >= 1 - style.stackOff) return { type: "all-in" };
      if (strength >= 1 - style.continueVsFourBet && bounds.toCall <= player.stack * 0.35) return bounds.toCall > 0 ? { type: "call" } : { type: "check" };
      return bounds.toCall > 0 ? { type: "fold" } : { type: "check" };
    }

    if (strength >= 1 - style.stackOff) return bounds.toCall > 0 ? { type: "call" } : { type: "check" };
    return bounds.toCall > 0 ? { type: "fold" } : { type: "check" };
  }

  const headsUp = view.activePlayers === 2;
  const spr = player.stack / Math.max(1, view.pot);
  const bluffChance = style.bluff * (headsUp ? 1 : 0.45) * (spr < 0.7 ? 0.45 : 1);
  const continueThreshold = style.postflopContinue + (headsUp ? 0 : 0.035) + (state.street === "river" ? 0.015 : 0);
  if (bounds.toCall > 0 && strength + style.callBias < Math.max(potOdds + 0.055, continueThreshold) && random() > bluffChance) return { type: "fold" };
  const valueThreshold = (bounds.toCall > 0 ? style.raiseThreshold : style.betThreshold) + (headsUp ? 0 : 0.055);
  if (bounds.canRaise && (strength > valueThreshold || random() < bluffChance) && random() < style.postflopAggression) {
    const wetness = boardWetness(view.board);
    const fraction = strength > 0.8 ? (wetness > 0.55 ? 0.82 : 0.68) : (wetness > 0.55 ? 0.62 : 0.42);
    const target = Math.min(bounds.max, Math.max(bounds.min, state.currentBet + Math.max(state.minRaise, Math.round(view.pot * fraction))));
    if (target === bounds.max && (spr <= 0.75 || strength > 0.84)) return { type: "all-in" };
    return { type: "raise", amount: target };
  }
  return bounds.toCall > 0 ? { type: "call" } : { type: "check" };
}

function buildReview(state: HandState, action: PokerAction): ReviewItem {
  const player = state.players[humanSeat];
  const toCall = toCallFor(state, humanSeat);
  const pot = potTotal(state);
  const opponents = Math.max(1, activePlayers(state).length - 1);
  const equity = state.street === "preflop" ? preflopStrength(player.hole) : estimateEquity(player.hole, state.board, opponents, 110);
  const potOdds = toCall / Math.max(1, pot + toCall);
  const strong = equity > Math.max(0.56, potOdds + 0.18);
  const weak = equity < potOdds - 0.03;
  const suggestion = toCall === 0 ? (strong ? "Bet for value" : "Check is sound") : weak ? "Fold" : strong ? "Raise for value" : "Call";
  let grade: ReviewItem["grade"] = "Reasonable";
  if ((action.type === "fold" && weak) || ((action.type === "call" || action.type === "check") && !strong && !weak) || ((action.type === "raise" || action.type === "all-in") && strong)) grade = "Strong";
  if ((action.type === "fold" && strong) || ((action.type === "call" || action.type === "raise") && weak)) grade = "Questionable";
  const actionText = action.type === "raise" ? `Raised to $${action.amount}` : action.type.replace("-", " ");
  return {
    street: state.street,
    position: player.position,
    cards: player.hole,
    board: state.board,
    pot,
    toCall,
    action: actionText[0].toUpperCase() + actionText.slice(1),
    equity,
    potOdds,
    grade,
    suggestion,
    note: weak
      ? "Your estimated equity trails the price being offered. Preserve the stack unless you have a specific read."
      : strong
        ? "Your range has a meaningful edge here. Building the pot is usually preferable to giving a free card."
        : "This is a close, range-dependent spot. Position and future betting matter nearly as much as raw equity.",
  };
}

export function isValidSavedState(value: unknown): value is HandState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<HandState>;
  return candidate.version === 4 && typeof candidate.raiseCount === "number" && Array.isArray(candidate.players) && candidate.players.length === 6 && Array.isArray(candidate.deck) && Array.isArray(candidate.board);
}
