export type Suit = "clubs" | "diamonds" | "hearts" | "spades";
export type Rank = "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "T" | "J" | "Q" | "K" | "A";
export type Card = { rank: Rank; suit: Suit };
export type Position = "BTN" | "BTN/SB" | "SB" | "BB" | "UTG" | "HJ" | "CO";
export type Street = "preflop" | "flop" | "turn" | "river";
export type ActionKind = "fold" | "check" | "call" | "raise" | "all-in";
export type BotProfile = "balanced" | "tag" | "lag" | "nit" | "caller";

export type PokerAction = { type: ActionKind; amount?: number };
export type ActionValidation = { legal: boolean; reason: string; target?: number };
export type ActionEvaluation = {
  action: PokerAction;
  label: string;
  ev: number;
  evLow: number;
  evHigh: number;
  foldProbability?: number;
  equityWhenCalled?: number;
  raiseProbability?: number;
};
export type StrategicHandClass = "nuts" | "strong-value" | "thin-value" | "bluff-catcher" | "combo-draw" | "nut-draw" | "draw" | "showdown-value" | "blocker-bluff" | "air";
export type BoardProfile = {
  paired: boolean;
  monotone: boolean;
  fourFlush: boolean;
  fourStraight: boolean;
  wetness: number;
  dynamic: boolean;
  highCard: number;
};
export type FlopTexture = BoardProfile & {
  band: "ace-high" | "king-high" | "middle" | "low";
  connectedness: number;
  tone: "rainbow" | "two-tone" | "monotone";
  stability: "static" | "dynamic";
};
export type TurnBucket = "blank" | "overcard" | "flush-completing" | "straight-completing" | "board-pairing" | "draw-adding";
export type FlopStrategyModule = "value" | "cbet-suppression" | "range-bet" | "check-raise" | "defense";
export type FlopStrategicContext = {
  texture: FlopTexture;
  handClass: StrategicHandClass;
  rangeAdvantage: number;
  nutAdvantage: number;
  valueDensity: number;
  drawDensity: number;
  turnBuckets: Record<TurnBucket, number>;
};
export type RangeCombo = { cards: [Card, Card]; weight: number; handClass: StrategicHandClass };
export type RangeLedger = Record<number, RangeCombo[]>;
export type LeakKey = "bb-defense" | "preflop-aggression" | "three-bet-defense" | "missed-value" | "thin-value" | "bluff-selection" | "calling-price" | "bet-sizing";
export type LeakStat = { opportunities: number; mistakes: number; totalRegret: number };
export type TrainingDecision = {
  id: string;
  handNumber: number;
  street: Street;
  position: Position;
  chosenAction: string;
  recommendedAction: string;
  concept: string;
  leakKey: LeakKey;
  estimatedRegret: number;
  confidence: "High" | "Medium" | "Low";
};
export type TrainingSummary = Record<LeakKey, LeakStat>;
export type PlayerStats = {
  hands: number;
  vpip: number;
  pfr: number;
  aggression: number;
  preflopFolds: number;
  preflopCalls: number;
  preflopRaises: number;
  preflopChecks: number;
  threeBetOpportunities: number;
  threeBets: number;
  postflopFolds: number;
  postflopCalls: number;
  postflopRaises: number;
  postflopChecks: number;
  flopsSeen: number;
  handsWon: number;
  showdowns: number;
  showdownWins: number;
};
export type PublicAction = {
  street: Street;
  seat: number;
  type: ActionKind;
  amount: number;
  toCallBefore: number;
  raiseLevel: number;
  potBefore?: number;
};
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
  id: string;
  handNumber: number;
  street: Street;
  position: Position;
  cards: Card[];
  board: Card[];
  pot: number;
  toCall: number;
  effectiveStack: number;
  spr: number;
  opponents: number;
  actionLine: string[];
  action: string;
  equity?: number;
  equityLow?: number;
  equityHigh?: number;
  equityLabel: "Equity vs modeled ranges" | "Preflop reference";
  potOdds: number;
  grade: "Preferred" | "Viable" | "Costly";
  suggestion: string;
  concept: string;
  takeaway: string;
  alternatives: Array<{ action: string; verdict: "Preferred" | "Viable" | "Costly"; reason: string; frequency?: number; ev?: number; evLow?: number; evHigh?: number; foldProbability?: number; equityWhenCalled?: number }>;
  recommendedSize?: { target: number; min: number; max: number };
  note: string;
  confidence?: "High" | "Medium" | "Low";
  basis?: string;
  estimatedRegret?: number;
};

export type HandState = {
  version: 9;
  handNumber: number;
  dealer: number;
  street: Street;
  deck: Card[];
  board: Card[];
  players: Seat[];
  currentBet: number;
  minRaise: number;
  raiseCount: number;
  preflopRaises: number;
  preflopOpener: number | null;
  preflopAggressor: number | null;
  lastAggressor: number | null;
  actionLog: PublicAction[];
  currentActor: number;
  status: "playing" | "handOver" | "busted" | "tableClosed";
  history: string[];
  reviews: ReviewItem[];
  reviewArchive: ReviewItem[];
  trainingDecisions: TrainingDecision[];
  trainingSummary: TrainingSummary;
  result: string;
  sessionStart: number;
  sessionHands: number;
  sessionRake: number;
};

export type PublicGameView = Pick<HandState, "street" | "board" | "currentBet" | "minRaise"> & {
  pot: number;
  activePlayers: number;
  seat: Pick<Seat, "stack" | "streetBet" | "position" | "stats">;
};

export type BotDecisionContext = PublicGameView & {
  seatIndex: number;
  opponents: number[];
  opener: number | null;
  aggressor: number | null;
  facingPosition: Position | null;
  inPosition: boolean;
  callers: number;
  limpers: number;
  effectiveStack: number;
  spr: number;
  potType: "limped" | "single-raised" | "three-bet" | "four-bet-plus";
  actions: PublicAction[];
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

const emptyStats = (): PlayerStats => ({
  hands: 0,
  vpip: 0,
  pfr: 0,
  aggression: 0,
  preflopFolds: 0,
  preflopCalls: 0,
  preflopRaises: 0,
  preflopChecks: 0,
  threeBetOpportunities: 0,
  threeBets: 0,
  postflopFolds: 0,
  postflopCalls: 0,
  postflopRaises: 0,
  postflopChecks: 0,
  flopsSeen: 0,
  handsWon: 0,
  showdowns: 0,
  showdownWins: 0,
});

const emptyTrainingSummary = (): TrainingSummary => ({
  "bb-defense": { opportunities: 0, mistakes: 0, totalRegret: 0 },
  "preflop-aggression": { opportunities: 0, mistakes: 0, totalRegret: 0 },
  "three-bet-defense": { opportunities: 0, mistakes: 0, totalRegret: 0 },
  "missed-value": { opportunities: 0, mistakes: 0, totalRegret: 0 },
  "thin-value": { opportunities: 0, mistakes: 0, totalRegret: 0 },
  "bluff-selection": { opportunities: 0, mistakes: 0, totalRegret: 0 },
  "calling-price": { opportunities: 0, mistakes: 0, totalRegret: 0 },
  "bet-sizing": { opportunities: 0, mistakes: 0, totalRegret: 0 },
});

export const humanSeat = 5;
export const potTotal = (state: HandState) => state.players.reduce((sum, player) => sum + player.committed, 0);
export const CASH_RAKE = { rate: 0.05, cap: 3 } as const;

function rakeFor(amount: number, board: Card[], remainingCap = CASH_RAKE.cap) {
  if (board.length < 3 || amount <= 0 || remainingCap <= 0) return 0;
  return Math.min(remainingCap, Math.round(amount * CASH_RAKE.rate));
}
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
    stats: emptyStats(),
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

function seatedSeats(players: Seat[]) {
  return CLOCKWISE_SEATS.filter((seat) => players[seat].stack > 0);
}

function nextSeatedSeat(start: number, players: Seat[]) {
  return nextSeat(start, (seat) => players[seat].stack > 0);
}

function positionsForTable(size: number): Position[] {
  if (size === 5) return ["BTN", "SB", "BB", "UTG", "CO"];
  if (size === 4) return ["BTN", "SB", "BB", "CO"];
  if (size === 3) return ["BTN", "SB", "BB"];
  if (size === 2) return ["BTN/SB", "BB"];
  return POSITIONS;
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
    version: 9,
    handNumber: 0,
    dealer: 4,
    street: "preflop",
    deck: [],
    board: [],
    players: Array.from({ length: 6 }, (_, index) => baseSeat(index)),
    currentBet: 0,
    minRaise: 2,
    raiseCount: 0,
    preflopRaises: 0,
    preflopOpener: null,
    preflopAggressor: null,
    lastAggressor: null,
    actionLog: [],
    currentActor: -1,
    status: "handOver",
    history: [],
    reviews: [],
    reviewArchive: [],
    trainingDecisions: [],
    trainingSummary: emptyTrainingSummary(),
    result: "",
    sessionStart: 200,
    sessionHands: 0,
    sessionRake: 0,
  }, random);
}

export function startHand(previous: HandState, random: () => number = cryptoRandom): HandState {
  const reviewArchive = previous.reviews.length > 0
    ? [...(previous.reviewArchive ?? []), ...previous.reviews].slice(-120)
    : previous.reviewArchive ?? [];
  const players = previous.players.map((old, index) => ({
    ...old,
    // Online cash-game opponents automatically top back up to the standard
    // 100 BB buy-in between hands. The learner's bankroll remains continuous.
    stack: index === humanSeat ? old.stack : 200,
    streetBet: 0,
    committed: 0,
    hole: [] as Card[],
    folded: index === humanSeat && old.stack <= 0,
    allIn: index === humanSeat && old.stack <= 0,
    acted: false,
    actedAtBet: null,
    voluntaryPreflop: false,
    raisedPreflop: false,
    lastAction: "",
    stats: { ...old.stats, hands: old.stats.hands + (index !== humanSeat || old.stack > 0 ? 1 : 0) },
  }));
  if (players[humanSeat].stack <= 0) return { ...previous, players, status: "busted", result: "Your stack is gone. Review the session, then reset when you’re ready." };

  const seated = seatedSeats(players);

  const previousBigBlind = previous.players.findIndex((player) => player.position === "BB" && player.hole.length === 2);
  const headsUp = seated.length === 2;
  const headsUpBigBlind = headsUp && previousBigBlind >= 0
    ? nextSeatedSeat(previousBigBlind, players)
    : -1;
  const dealer = headsUp ? nextSeatedSeat(headsUpBigBlind, players) : nextSeatedSeat(previous.dealer, players);
  const positions = positionsForTable(seated.length);
  let positionSeat = dealer;
  positions.forEach((position, offset) => {
    if (offset > 0) positionSeat = nextSeatedSeat(positionSeat, players);
    players[positionSeat].position = position;
  });
  const deck = shuffledDeck(random);
  const dealOrder: number[] = [];
  let cursor = dealer;
  for (let count = 0; count < seated.length; count += 1) {
    cursor = nextSeatedSeat(cursor, players);
    dealOrder.push(cursor);
  }
  for (let round = 0; round < 2; round += 1) {
    dealOrder.forEach((seat) => players[seat].hole.push(deck.pop()!));
  }
  const sb = headsUp ? dealer : nextSeatedSeat(dealer, players);
  const bb = headsUp ? headsUpBigBlind : nextSeatedSeat(sb, players);
  pay(players[sb], 1);
  pay(players[bb], 2);
  players[sb].lastAction = "SB $1";
  players[bb].lastAction = "BB $2";
  return {
    ...previous,
    reviewArchive,
    handNumber: previous.handNumber + 1,
    dealer,
    street: "preflop",
    deck,
    board: [],
    players,
    currentBet: 2,
    minRaise: 2,
    raiseCount: 0,
    preflopRaises: 0,
    preflopOpener: null,
    preflopAggressor: null,
    lastAggressor: null,
    actionLog: [],
    currentActor: nextSeatedSeat(bb, players),
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

export function validateAction(state: HandState, seat: number, action: PokerAction): ActionValidation {
  if (state.status !== "playing") return { legal: false, reason: "The hand is not active." };
  if (state.currentActor !== seat) return { legal: false, reason: "It is not this seat's turn." };
  const player = state.players[seat];
  if (!player || player.folded || player.allIn || player.stack <= 0) return { legal: false, reason: "This seat cannot act." };
  const bounds = legalBounds(state, seat);
  if (action.type === "fold") return { legal: true, reason: "Fold is legal." };
  if (action.type === "check") return bounds.toCall === 0
    ? { legal: true, reason: "Check is legal." }
    : { legal: false, reason: `Checking is unavailable while facing $${bounds.toCall}.` };
  if (action.type === "call") return bounds.toCall > 0
    ? { legal: true, reason: "Call is legal." }
    : { legal: false, reason: "There is no wager to call." };

  if (action.type === "raise" && (!Number.isFinite(action.amount) || action.amount === undefined)) {
    return { legal: false, reason: "A raise requires a finite target amount." };
  }
  const target = action.type === "all-in" ? bounds.max : Math.round(action.amount!);
  if (action.type === "raise" && target <= state.currentBet) {
    return { legal: false, reason: "A raise must exceed the current wager." };
  }
  if (target > state.currentBet && !bounds.canRaise) {
    return { legal: false, reason: "Betting has not been reopened for this seat." };
  }
  if (target <= state.currentBet && action.type !== "all-in") {
    return { legal: false, reason: "Only a short all-in may call for less than the full amount." };
  }
  if (target > state.currentBet && target < bounds.min && target !== bounds.max) {
    return { legal: false, reason: `The minimum legal raise is to $${bounds.min}.` };
  }
  if (target > bounds.max || target <= player.streetBet) {
    return { legal: false, reason: "The target is outside this seat's available stack." };
  }
  return { legal: true, reason: action.type === "all-in" ? "All-in is legal." : "Raise is legal.", target };
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
  const validation = validateAction(input, seatIndex, action);
  if (!validation.legal) return input;
  const state = structuredClone(input) as HandState;
  const potBefore = potTotal(input);
  const player = state.players[seatIndex];
  const beforeToCall = toCallFor(state, seatIndex);
  const oldCurrentBet = state.currentBet;
  const raiseLevelBefore = state.raiseCount;
  let recordedKind: "fold" | "check" | "call" | "raise";

  if (action.type === "fold") {
    recordedKind = "fold";
    player.folded = true;
    player.acted = true;
    player.actedAtBet = state.currentBet;
    player.lastAction = "Fold";
  } else if (action.type === "check" && beforeToCall === 0) {
    recordedKind = "check";
    player.acted = true;
    player.actedAtBet = state.currentBet;
    player.lastAction = "Check";
  } else if (action.type === "call" && beforeToCall > 0) {
    recordedKind = "call";
    const paid = pay(player, beforeToCall);
    player.acted = true;
    player.actedAtBet = state.currentBet;
    player.lastAction = paid < beforeToCall ? `All-in $${player.streetBet}` : `Call $${paid}`;
    if (state.street === "preflop" && paid > 0 && !player.voluntaryPreflop) {
      player.stats.vpip += 1;
      player.voluntaryPreflop = true;
    }
  } else if (action.type === "all-in" || action.type === "raise") {
    const target = validation.target!;
    const paid = pay(player, target - player.streetBet);
    const raiseSize = target - oldCurrentBet;
    const fullRaise = target > oldCurrentBet && raiseSize >= state.minRaise;
    recordedKind = target > oldCurrentBet ? "raise" : "call";
    if (target > state.currentBet) state.currentBet = target;
    if (fullRaise) {
      state.minRaise = raiseSize;
      state.raiseCount += 1;
      state.lastAggressor = seatIndex;
      if (state.street === "preflop") {
        state.preflopRaises += 1;
        state.preflopAggressor = seatIndex;
        if (state.preflopOpener === null) state.preflopOpener = seatIndex;
      }
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

  const statsPrefix = state.street === "preflop" ? "preflop" : "postflop";
  const statsKey = `${statsPrefix}${recordedKind[0].toUpperCase()}${recordedKind.slice(1)}s` as
    | "preflopFolds" | "preflopChecks" | "preflopCalls" | "preflopRaises"
    | "postflopFolds" | "postflopChecks" | "postflopCalls" | "postflopRaises";
  player.stats[statsKey] += 1;
  if (state.street === "preflop" && raiseLevelBefore === 1 && state.preflopOpener !== seatIndex) {
    player.stats.threeBetOpportunities += 1;
    if (recordedKind === "raise" && state.raiseCount > raiseLevelBefore) player.stats.threeBets += 1;
  }

  state.actionLog.push({
    street: state.street,
    seat: seatIndex,
    type: action.type,
    amount: player.streetBet,
    toCallBefore: beforeToCall,
    raiseLevel: raiseLevelBefore,
    potBefore,
  });

  append(state, `${player.name} · ${player.lastAction}`);
  if (seatIndex === humanSeat && input.players[seatIndex].isHuman) {
    const review = buildReview(input, action);
    state.reviews.push(review);
    recordTrainingDecision(state, input, review);
  }

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
  const rake = rakeFor(pot, state.board);
  const awarded = pot - rake;
  const profit = awarded - winner.committed;
  winner.stack += awarded;
  state.sessionRake += rake;
  winner.stats.handsWon += 1;
  state.players.forEach((player) => { player.committed = 0; player.streetBet = 0; });
  state.status = winner.isHuman && winner.stack <= 0 ? "busted" : "handOver";
  state.currentActor = -1;
  state.result = `${winner.name} ${winner.isHuman ? "win" : "wins"} $${profit} uncontested${rake ? ` · $${rake} rake` : ""}`;
  append(state, state.result);
  return state;
}

function advanceStreet(state: HandState): HandState {
  const streetOrder: Street[] = ["preflop", "flop", "turn", "river"];
  const index = streetOrder.indexOf(state.street);
  if (index === 3) return showdown(state);
  const leavingPreflop = state.street === "preflop";
  state.street = streetOrder[index + 1];
  if (leavingPreflop) {
    state.players.forEach((player) => {
      if (!player.folded) player.stats.flopsSeen += 1;
    });
  }
  state.players.forEach((player) => {
    player.streetBet = 0;
    player.acted = player.folded || player.allIn;
    player.actedAtBet = null;
  });
  state.currentBet = 0;
  state.minRaise = 2;
  state.raiseCount = 0;
  state.lastAggressor = null;
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
  const returns = new Map<number, number>();
  const descriptions = new Set<string>();
  const showdownWinners = new Set<number>();
  let contestedTotal = 0;
  let handRake = 0;
  contributions.forEach((level) => {
    const contributors = state.players.filter((player) => player.committed >= level);
    const eligible = contributors.filter((player) => !player.folded);
    const amount = (level - previous) * contributors.length;
    previous = level;
    if (!eligible.length || !amount) return;
    if (contributors.length === 1) {
      const index = state.players.indexOf(contributors[0]);
      returns.set(index, (returns.get(index) ?? 0) + amount);
      return;
    }
    const layerRake = rakeFor(amount, state.board, CASH_RAKE.cap - handRake);
    handRake += layerRake;
    const distributable = amount - layerRake;
    contestedTotal += distributable;
    const ranked = eligible.map((player) => ({ player, result: evaluateHand([...player.hole, ...state.board]) }));
    const best = ranked.reduce((top, item) => compareScores(item.result.score, top.result.score) > 0 ? item : top);
    const winners = ranked.filter((item) => compareScores(item.result.score, best.result.score) === 0);
    const share = Math.floor(distributable / winners.length);
    let odd = distributable - share * winners.length;
    const clockwise = [...winners].sort((a, b) => clockwiseDistance(state.dealer, state.players.indexOf(a.player)) - clockwiseDistance(state.dealer, state.players.indexOf(b.player)));
    clockwise.forEach(({ player }) => {
      const playerIndex = state.players.indexOf(player);
      awards.set(playerIndex, (awards.get(playerIndex) ?? 0) + share + (odd-- > 0 ? 1 : 0));
      showdownWinners.add(playerIndex);
    });
    descriptions.add(`${winners.map(({ player }) => player.name).join(" & ")} · ${best.result.name}`);
  });
  awards.forEach((amount, index) => { state.players[index].stack += amount; });
  returns.forEach((amount, index) => { state.players[index].stack += amount; });
  state.sessionRake += handRake;
  state.players.forEach((player, index) => {
    if (!player.folded) player.stats.showdowns += 1;
    if (showdownWinners.has(index)) {
      player.stats.showdownWins += 1;
      player.stats.handsWon += 1;
    }
  });
  state.players.forEach((player) => { player.committed = 0; player.streetBet = 0; });
  state.status = state.players[humanSeat].stack <= 0 ? "busted" : "handOver";
  state.currentActor = -1;
  const returnText = [...returns.entries()]
    .map(([index, amount]) => `$${amount} returned to ${state.players[index].name}`)
    .join(" · ");
  state.result = `${[...descriptions].join(" · ")} · $${contestedTotal} awarded${handRake ? ` · $${handRake} rake` : ""}${returnText ? ` · ${returnText}` : ""}`;
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
const DEEP_OPEN_RANGES = Object.fromEntries(Object.entries(DEEP_OPEN_SPECS).map(([position, spec]) => [position, expandRange(spec)])) as Record<Position, Set<string>>;
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

type PreflopChoice = keyof PreflopPlan["frequencies"];

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

function actsAfterPostflop(state: HandState, actor: number, opponent: number) {
  return clockwiseDistance(state.dealer, actor) > clockwiseDistance(state.dealer, opponent);
}

export function buildBotContext(state: HandState, seatIndex: number): BotDecisionContext {
  const player = state.players[seatIndex];
  const opponents = state.players
    .map((opponent, index) => ({ opponent, index }))
    .filter(({ opponent, index }) => index !== seatIndex && !opponent.folded)
    .map(({ index }) => index);
  const actions = (state.actionLog ?? []).map((action) => ({ ...action }));
  const streetActions = actions.filter((action) => action.street === state.street);
  const callers = streetActions.filter((action) => action.type === "call").length;
  const limpers = state.street === "preflop"
    ? actions.filter((action) => action.street === "preflop" && action.raiseLevel === 0 && action.type === "call").length
    : 0;
  const opener = state.preflopOpener ?? null;
  const latestAggressiveAction = [...actions].reverse().find((action) => action.type === "raise" || action.type === "all-in");
  const aggressor = state.lastAggressor ?? latestAggressiveAction?.seat ?? (state.street !== "preflop" ? state.preflopAggressor : null);
  const effectiveStack = Math.min(
    player.stack + player.streetBet,
    Math.max(0, ...opponents.map((index) => state.players[index].stack + state.players[index].streetBet)),
  );
  const pot = potTotal(state);
  const inPosition = state.street !== "preflop" && opponents.every((opponent) => actsAfterPostflop(state, seatIndex, opponent));
  const preflopRaises = state.preflopRaises ?? state.raiseCount;
  return {
    street: state.street,
    board: [...state.board],
    currentBet: state.currentBet,
    minRaise: state.minRaise,
    pot,
    activePlayers: opponents.length + 1,
    seat: { stack: player.stack, streetBet: player.streetBet, position: player.position, stats: { ...player.stats } },
    seatIndex,
    opponents,
    opener,
    aggressor,
    facingPosition: opener === null ? null : state.players[opener].position,
    inPosition,
    callers,
    limpers,
    effectiveStack,
    spr: effectiveStack / Math.max(1, pot),
    potType: preflopRaises === 0 ? "limped" : preflopRaises === 1 ? "single-raised" : preflopRaises === 2 ? "three-bet" : "four-bet-plus",
    actions,
  };
}

function weightedHoleSample(
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

function opponentRangeWeightV6(state: HandState, opponentIndex: number, cards: Card[]) {
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
    const openRate = Math.min(0.62, modeledOpen);
    weight *= strength >= 1 - openRate ? 2.8 : bluffCandidate(cards) ? 0.72 : 0.08;
  } else if (calledRaise) {
    weight *= strength > 0.55 && strength < 0.96 ? 2.1 : strength >= 0.96 ? 0.72 : 0.18;
  }
  for (const action of postflop) {
    if (action.type === "raise" || action.type === "all-in") weight *= 0.3 + Math.pow(strength, 2.2) * 2.2;
    else if (action.type === "call") weight *= 0.55 + strength;
  }
  return weight;
}

export function estimateRangeEquityV6(
  state: HandState,
  seatIndex: number,
  iterations = 64,
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
      (cards) => opponentRangeWeightV6(state, opponent, cards),
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

function boardThroughStreet(board: Card[], street: Street) {
  const count: Record<Street, number> = { preflop: 0, flop: 3, turn: 4, river: 5 };
  return board.slice(0, count[street]);
}

function opponentRangeWeight(state: HandState, opponentIndex: number, cards: Card[], includeSizing = true) {
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

function responseRangeWeight(state: HandState, opponentIndex: number, cards: Card[], betFraction: number) {
  const features = handFeatures(cards, state.board);
  const madeContinue = features.made >= 4 ? 3.8
    : features.made === 3 ? 3.2
      : features.made === 2 ? 2.6
        : features.made === 1 ? 1.15
          : 0.16;
  const drawContinue = state.street === "river" ? 0 : features.draw ? 1.35 : features.overcards > 0 && state.street === "flop" ? 0.42 : 0;
  const sizePressure = Math.max(0.52, 1 - Math.max(0, betFraction - 0.35) * 0.42);
  const mediumHandPressure = features.made === 1 ? sizePressure : 1;
  return opponentRangeWeight(state, opponentIndex, cards) * Math.max(0.03, (madeContinue + drawContinue) * mediumHandPressure);
}

function estimateResponseEquity(
  state: HandState,
  seatIndex: number,
  betFraction: number,
  iterations: number,
  random: () => number,
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
      (cards) => responseRangeWeight(state, opponent, cards, betFraction),
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

export function evaluatePostflopActions(
  state: HandState,
  seatIndex: number,
  iterations = 180,
  random: () => number = Math.random,
): ActionEvaluation[] {
  if (state.street === "preflop" || state.players[seatIndex].hole.length !== 2) return [];
  const context = buildBotContext(state, seatIndex);
  const bounds = legalBounds(state, seatIndex);
  const pot = potTotal(state);
  const player = state.players[seatIndex];
  const overallEquity = estimateRangeEquity(state, seatIndex, iterations, random);
  const modelError = 0.055 + Math.max(0, context.activePlayers - 2) * 0.018;
  const observedGap = context.opponents.reduce((sum, index) => {
    const stats = state.players[index].stats;
    return sum + (stats.hands ? (stats.vpip - stats.pfr) / stats.hands : 0.1);
  }, 0) / Math.max(1, context.opponents.length);
  return postflopCandidates(state, seatIndex).map((action) => {
    let ev = 0;
    let foldProbability: number | undefined;
    let equityWhenCalled: number | undefined;
    let raiseProbability: number | undefined;
    let scale = pot;
    if (action.type === "fold") {
      ev = 0;
    } else if (action.type === "check") {
      const realization = state.street === "river" ? 1 : context.inPosition ? 0.94 : 0.82;
      ev = overallEquity * pot * realization;
    } else if (action.type === "call") {
      const call = Math.min(bounds.toCall, player.stack);
      scale = pot + call;
      const realization = state.street === "river" ? 1 : context.inPosition ? 0.94 : 0.84;
      ev = overallEquity * (pot + call) * realization - call;
    } else {
      const target = action.type === "all-in" ? bounds.max : action.amount!;
      const invest = Math.max(0, target - player.streetBet);
      const fraction = invest / Math.max(1, pot);
      const perOpponentFold = Math.max(0.08, Math.min(0.78,
        0.24 + fraction * 0.31 + (state.street === "river" ? 0.08 : 0) - Math.max(0, observedGap - 0.08) * 1.35,
      ));
      foldProbability = Math.pow(perOpponentFold, context.opponents.length);
      equityWhenCalled = estimateResponseEquity(state, seatIndex, fraction, Math.max(8, Math.min(20, Math.round(iterations * 0.3))), random);
      const expectedCallers = Math.max(1, context.opponents.length * (1 - perOpponentFold));
      const opponentCall = Math.max(0, target - state.currentBet);
      const calledPot = pot + invest + opponentCall * expectedCallers;
      scale = calledPot;
      const observedAggression = context.opponents.reduce((sum, index) => {
        const stats = state.players[index].stats;
        return sum + (stats.hands ? stats.aggression / Math.max(1, stats.hands) : 0.2);
      }, 0) / Math.max(1, context.opponents.length);
      raiseProbability = Math.max(0.02, Math.min(0.28, (1 - foldProbability) * (0.08 + observedAggression * 0.16)));
      ev = foldProbability * pot + (1 - foldProbability) * (equityWhenCalled * calledPot - invest) - raiseProbability * invest * 0.16;
    }
    const uncertainty = Math.max(1, scale * modelError);
    return {
      action,
      label: actionLabel({ ...state, currentActor: seatIndex }, action),
      ev: Math.round(ev * 10) / 10,
      evLow: Math.round((ev - uncertainty) * 10) / 10,
      evHigh: Math.round((ev + uncertainty) * 10) / 10,
      foldProbability,
      equityWhenCalled,
      raiseProbability,
    };
  }).sort((a, b) => b.ev - a.ev);
}

function sampleRangeCombo(combos: RangeCombo[], available: Card[], random: () => number, response?: (combo: RangeCombo) => number) {
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

function estimateLedgerEquity(
  state: HandState,
  seatIndex: number,
  ledger: RangeLedger,
  iterations: number,
  random: () => number,
  response?: (opponent: number, combo: RangeCombo) => number,
) {
  const hole = state.players[seatIndex].hole;
  const opponents = buildBotContext(state, seatIndex).opponents;
  const known = new Set([...hole, ...state.board].map(cardLabel));
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

export function evaluatePostflopActionsV10(
  state: HandState,
  seatIndex: number,
  iterations = 72,
  random: () => number = Math.random,
): ActionEvaluation[] {
  if (state.street === "preflop" || state.players[seatIndex].hole.length !== 2) return [];
  const context = buildBotContext(state, seatIndex);
  const bounds = legalBounds(state, seatIndex);
  const player = state.players[seatIndex];
  const pot = potTotal(state);
  const ledger = buildRangeLedger(state, seatIndex);
  const overallEquity = estimateLedgerEquity(state, seatIndex, ledger, iterations, random);
  const heroClass = classifyStrategicHand(player.hole, state.board);
  const board = analyzeBoard(state.board);
  const vulnerability = board.dynamic && ["strong-value", "thin-value", "bluff-catcher", "showdown-value"].includes(heroClass) ? 0.08 : 0;
  const positionRealization = context.inPosition ? 0.96 : 0.84;
  const streetRealization = state.street === "river" ? 1 : state.street === "turn" ? 0.94 : 0.88;
  return postflopCandidates(state, seatIndex).map((action) => {
    let ev = 0;
    let scale = pot;
    let foldProbability: number | undefined;
    let equityWhenCalled: number | undefined;
    let raiseProbability: number | undefined;
    if (action.type === "fold") ev = 0;
    else if (action.type === "check") ev = overallEquity * pot * Math.max(0.62, streetRealization * positionRealization - vulnerability);
    else if (action.type === "call") {
      const call = Math.min(bounds.toCall, player.stack);
      scale = pot + call;
      ev = overallEquity * (pot + call) * Math.max(0.6, streetRealization * positionRealization - vulnerability * 0.7) - call;
    } else {
      const target = action.type === "all-in" ? bounds.max : action.amount!;
      const invest = Math.max(0, target - player.streetBet);
      const fraction = invest / Math.max(1, pot);
      const rates = context.opponents.map((opponent) => rangeResponseRates(state, opponent, ledger[opponent] ?? [], fraction));
      foldProbability = rates.reduce((probability, rate) => probability * rate.fold, 1);
      raiseProbability = 1 - rates.reduce((probability, rate) => probability * (1 - rate.raise), 1);
      const expectedCallers = Math.max(1, rates.reduce((sum, rate) => sum + rate.call, 0));
      equityWhenCalled = estimateLedgerEquity(state, seatIndex, ledger, Math.max(16, Math.round(iterations * 0.55)), random,
        (opponent, combo) => rangeResponseWeight(combo.handClass, "call", fraction, state.street, state.players[opponent].profile));
      const opponentCall = Math.max(0, target - state.currentBet);
      const calledPot = pot + invest + opponentCall * expectedCallers;
      scale = calledPot;
      const raisePenalty = raiseProbability * invest * (["nuts", "strong-value", "combo-draw", "nut-draw"].includes(heroClass) ? 0.04 : 0.32);
      ev = foldProbability * pot + (1 - foldProbability) * (equityWhenCalled * calledPot - invest) - raisePenalty;
    }
    const rangeAmbiguity = state.street === "river" && ["thin-value", "bluff-catcher"].includes(heroClass) ? 0.065 : 0;
    const uncertainty = Math.max(1, scale * (0.045 + rangeAmbiguity + Math.max(0, context.activePlayers - 2) * 0.02));
    return { action, label: actionLabel({ ...state, currentActor: seatIndex }, action), ev: Math.round(ev * 10) / 10, evLow: Math.round((ev - uncertainty) * 10) / 10, evHigh: Math.round((ev + uncertainty) * 10) / 10, foldProbability, equityWhenCalled, raiseProbability };
  }).sort((a, b) => b.ev - a.ev);
}

function estimateRangeEquityV7(
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

const PROFILE = {
  balanced: { openFactor: 1, openRaise: 0.97, continueVsOpen: 0.17, threeBet: 0.075, defendVsThreeBet: 0.075, fourBet: 0.025, continueVsFourBet: 0.021, stackOff: 0.014, preflopAggression: 0.9, postflopAggression: 0.62, postflopContinue: 0.46, betThreshold: 0.58, raiseThreshold: 0.79, bluff: 0.075, callBias: 0 },
  tag: { openFactor: 0.88, openRaise: 0.98, continueVsOpen: 0.14, threeBet: 0.07, defendVsThreeBet: 0.062, fourBet: 0.026, continueVsFourBet: 0.02, stackOff: 0.015, preflopAggression: 0.94, postflopAggression: 0.68, postflopContinue: 0.49, betThreshold: 0.56, raiseThreshold: 0.77, bluff: 0.055, callBias: -0.015 },
  lag: { openFactor: 1.25, openRaise: 0.98, continueVsOpen: 0.23, threeBet: 0.115, defendVsThreeBet: 0.105, fourBet: 0.04, continueVsFourBet: 0.033, stackOff: 0.021, preflopAggression: 0.96, postflopAggression: 0.76, postflopContinue: 0.43, betThreshold: 0.52, raiseThreshold: 0.74, bluff: 0.11, callBias: 0.005 },
  nit: { openFactor: 0.64, openRaise: 0.97, continueVsOpen: 0.09, threeBet: 0.042, defendVsThreeBet: 0.043, fourBet: 0.017, continueVsFourBet: 0.014, stackOff: 0.01, preflopAggression: 0.9, postflopAggression: 0.46, postflopContinue: 0.53, betThreshold: 0.61, raiseThreshold: 0.82, bluff: 0.025, callBias: -0.035 },
  caller: { openFactor: 1.28, openRaise: 0.3, continueVsOpen: 0.29, threeBet: 0.028, defendVsThreeBet: 0.13, fourBet: 0.012, continueVsFourBet: 0.028, stackOff: 0.009, preflopAggression: 0.58, postflopAggression: 0.27, postflopContinue: 0.43, betThreshold: 0.68, raiseThreshold: 0.86, bluff: 0.025, callBias: 0.06 },
};

const POSITION_OPEN_RATE: Record<Position, number> = { UTG: 0.18, HJ: 0.23, CO: 0.3, BTN: 0.44, "BTN/SB": 0.72, SB: 0.4, BB: 0.34 };

function bluffCandidate(cards: Card[]) {
  const values = cards.map((card) => VALUES[card.rank]).sort((a, b) => b - a);
  const suited = cards[0].suit === cards[1].suit;
  return (suited && values[0] === 14 && values[1] <= 5) || (suited && values[0] >= 11 && values[1] >= 9);
}

function preflopRaiseAction(state: HandState, seatIndex: number): PokerAction {
  const player = state.players[seatIndex];
  const bounds = legalBounds(state, seatIndex);
  if (state.raiseCount >= 3) return { type: "all-in" };
  const inPosition = ["BTN", "BTN/SB", "CO"].includes(player.position);
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

export function decideBotLegacy(state: HandState, seatIndex: number, random: () => number = Math.random): PokerAction {
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

function contextualPreflopRaise(state: HandState, seatIndex: number): PokerAction {
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

function handFeatures(hole: Card[], board: Card[]) {
  const all = [...hole, ...board];
  const suitCounts = new Map<Suit, number>();
  all.forEach((card) => suitCounts.set(card.suit, (suitCounts.get(card.suit) ?? 0) + 1));
  const flushDraw = board.length < 5 && Math.max(...suitCounts.values()) === 4;
  const values = [...new Set(all.map((card) => VALUES[card.rank]))];
  if (values.includes(14)) values.push(1);
  let straightDraw = false;
  for (let start = 1; start <= 10; start += 1) {
    const hits = Array.from({ length: 5 }, (_, offset) => start + offset).filter((value) => values.includes(value)).length;
    if (hits >= 4 && board.length < 5) straightDraw = true;
  }
  const boardHigh = Math.max(0, ...board.map((card) => VALUES[card.rank]));
  const overcards = hole.filter((card) => VALUES[card.rank] > boardHigh).length;
  const made = evaluateHand(all).score[0];
  const holePair = hole.length === 2 && hole[0].rank === hole[1].rank;
  const pairsBoard = hole.some((card) => board.some((boardCard) => boardCard.rank === card.rank));
  const madeWithHole = holePair || pairsBoard || made >= 2;
  const blocker = hole.some((card) => VALUES[card.rank] === 14 && suitCounts.get(card.suit)! >= 3);
  return { flushDraw, straightDraw, overcards, made, madeWithHole, blocker, draw: flushDraw || straightDraw };
}

export function analyzeBoard(board: Card[]): BoardProfile {
  const ranks = board.map((card) => VALUES[card.rank]);
  const uniqueRanks = [...new Set(ranks)];
  const suits = new Map<Suit, number>();
  board.forEach((card) => suits.set(card.suit, (suits.get(card.suit) ?? 0) + 1));
  const maxSuit = Math.max(0, ...suits.values());
  const wheelRanks = uniqueRanks.includes(14) ? [...uniqueRanks, 1] : uniqueRanks;
  let fourStraight = false;
  for (let start = 1; start <= 10; start += 1) {
    if (Array.from({ length: 5 }, (_, offset) => start + offset).filter((rank) => wheelRanks.includes(rank)).length >= 4) fourStraight = true;
  }
  const wetness = boardWetness(board);
  return {
    paired: uniqueRanks.length < board.length,
    monotone: board.length >= 3 && maxSuit === board.length,
    fourFlush: maxSuit >= 4,
    fourStraight,
    wetness,
    dynamic: board.length < 5 && (wetness >= 0.5 || maxSuit >= 2),
    highCard: Math.max(0, ...ranks),
  };
}

export function analyzeFlopTexture(board: Card[]): FlopTexture {
  const flop = board.slice(0, 3);
  const base = analyzeBoard(flop);
  const ranks = [...new Set(flop.map((card) => VALUES[card.rank]))].sort((a, b) => a - b);
  const span = ranks.length > 1 ? ranks.at(-1)! - ranks[0] : 0;
  const adjacent = ranks.slice(1).filter((rank, index) => rank - ranks[index] <= 2).length;
  const connectedness = Math.max(0, Math.min(1, adjacent * 0.34 + (span <= 5 ? 0.32 : span <= 8 ? 0.14 : 0)));
  const suitCount = Math.max(0, ...SUITS.map((suit) => flop.filter((card) => card.suit === suit).length));
  const tone: FlopTexture["tone"] = suitCount >= 3 ? "monotone" : suitCount === 2 ? "two-tone" : "rainbow";
  const band: FlopTexture["band"] = base.highCard === 14 ? "ace-high" : base.highCard === 13 ? "king-high" : base.highCard >= 9 ? "middle" : "low";
  const dynamic = !base.paired && (tone !== "rainbow" || connectedness >= 0.45);
  return { ...base, band, connectedness, tone, dynamic, stability: dynamic ? "dynamic" : "static" };
}

function representativeTurnBuckets(hole: Card[], flop: Card[]): Record<TurnBucket, number> {
  const known = new Set([...hole, ...flop].map(cardLabel));
  const texture = analyzeFlopTexture(flop);
  const boardRanks = new Set(flop.map((card) => VALUES[card.rank]));
  const boardSuits = new Map<Suit, number>();
  flop.forEach((card) => boardSuits.set(card.suit, (boardSuits.get(card.suit) ?? 0) + 1));
  const buckets: Record<TurnBucket, number> = { blank: 0, overcard: 0, "flush-completing": 0, "straight-completing": 0, "board-pairing": 0, "draw-adding": 0 };
  for (const card of makeDeck()) {
    if (known.has(cardLabel(card))) continue;
    if (boardRanks.has(VALUES[card.rank])) buckets["board-pairing"] += 1;
    else if ((boardSuits.get(card.suit) ?? 0) >= 2) buckets["flush-completing"] += 1;
    else if (analyzeBoard([...flop, card]).fourStraight && !texture.fourStraight) buckets["straight-completing"] += 1;
    else if (VALUES[card.rank] > texture.highCard) buckets.overcard += 1;
    else if (analyzeFlopTexture([...flop.slice(0, 2), card]).dynamic && !texture.dynamic) buckets["draw-adding"] += 1;
    else buckets.blank += 1;
  }
  const total = Object.values(buckets).reduce((sum, count) => sum + count, 0) || 1;
  (Object.keys(buckets) as TurnBucket[]).forEach((bucket) => { buckets[bucket] /= total; });
  return buckets;
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

function classifyStrategicHandWithProfile(hole: Card[], board: Card[], profile: BoardProfile): StrategicHandClass {
  const features = handFeatures(hole, board);
  const score = features.made;
  if (score >= 6 || (score >= 5 && !profile.fourFlush && !profile.fourStraight)) return "nuts";
  if (score >= 3 || (score === 2 && features.madeWithHole)) return "strong-value";
  if (features.flushDraw && features.straightDraw) return "combo-draw";
  const aceFlushDraw = features.flushDraw && hole.some((card) => card.rank === "A" && board.some((boardCard) => boardCard.suit === card.suit));
  if (aceFlushDraw) return "nut-draw";
  if (features.draw) return "draw";
  if (score === 2 || (score === 1 && features.madeWithHole && !profile.fourFlush && !profile.fourStraight)) return board.length === 5 ? "thin-value" : "bluff-catcher";
  if (score >= 1 || features.overcards > 0) return "showdown-value";
  if (features.blocker) return "blocker-bluff";
  return "air";
}

export function classifyStrategicHand(hole: Card[], board: Card[]): StrategicHandClass {
  return classifyStrategicHandWithProfile(hole, board, analyzeBoard(board));
}

export function buildRangeLedger(state: HandState, observerSeat: number): RangeLedger {
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
  const baseCombos = rawCombos.sort((a, b) => comboHash(a) - comboHash(b)).slice(0, 280)
    .map((cards) => ({ cards, handClass: classifyStrategicHandWithProfile(cards, state.board, boardProfile) }));
  const ledger: RangeLedger = {};
  state.players.forEach((opponent, opponentIndex) => {
    if (opponentIndex === observerSeat || opponent.folded) return;
    const combos: RangeCombo[] = baseCombos.map(({ cards, handClass }) => ({ cards, handClass, weight: Math.max(0.0001, opponentRangeWeight(state, opponentIndex, cards)) }));
    const total = combos.reduce((sum, combo) => sum + combo.weight, 0) || 1;
    ledger[opponentIndex] = combos.map((combo) => ({ ...combo, weight: combo.weight / total }));
  });
  return ledger;
}

function rangeResponseWeight(handClass: StrategicHandClass, action: "fold" | "call" | "raise", fraction: number, street: Street, profile: BotProfile) {
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

function decideBotV6FromPublicState(state: HandState, seatIndex: number, random: () => number): PokerAction {
  if (state.street === "preflop") return preflopDecisionV6(state, seatIndex, random);

  const player = state.players[seatIndex];
  const style = PROFILE[player.profile];
  const response = RESPONSE_PROFILE[player.profile];
  const context = buildBotContext(state, seatIndex);
  const bounds = legalBounds(state, seatIndex);
  const features = handFeatures(player.hole, context.board);
  const equity = estimateRangeEquityV6(state, seatIndex, 48, random);
  const multiwayPenalty = Math.max(0, context.activePlayers - 2) * 0.025;
  const realization = context.inPosition ? 0.035 : -0.025;
  const drawRealization = features.draw && context.inPosition ? 0.018 : 0;
  const realizedEquity = Math.max(0, Math.min(1, equity + realization + drawRealization - multiwayPenalty));
  const potOdds = bounds.toCall / Math.max(1, context.pot + bounds.toCall);
  const isAggressor = context.aggressor === seatIndex;
  const wetness = boardWetness(context.board);
  const headsUp = context.activePlayers === 2;
  const pressure = bounds.toCall / Math.max(1, player.stack + bounds.toCall);
  const observed = context.opponents.map((index) => state.players[index].stats);
  const opponentSamples = observed.reduce((sum, stats) => sum + Math.min(60, stats.hands), 0);
  const observedVpips = observed.reduce((sum, stats) => sum + (stats.hands ? stats.vpip / stats.hands : 0.24), 0) / Math.max(1, observed.length);
  const observedPfrs = observed.reduce((sum, stats) => sum + (stats.hands ? stats.pfr / stats.hands : 0.18), 0) / Math.max(1, observed.length);
  const readConfidence = Math.min(0.65, opponentSamples / Math.max(1, observed.length * 60));
  const callingRead = Math.max(-0.04, Math.min(0.06, (observedVpips - observedPfrs - 0.08) * readConfidence));
  const futureRisk = context.inPosition ? 0.012 : 0.035 + Math.min(0.045, context.spr * 0.004);
  const callFloor = Math.max(potOdds + futureRisk, style.postflopContinue + multiwayPenalty - (features.draw ? 0.055 : 0));
  const valueRaise = (bounds.toCall > 0
    ? style.raiseThreshold + multiwayPenalty - (context.spr < 1 ? 0.055 : 0)
    : style.betThreshold + multiwayPenalty) - callingRead * 0.45;
  const rangeAdvantage = isAggressor && wetness < 0.48 ? 0.032 : 0;
  const positionBluff = context.inPosition ? 1.2 : 0.62;
  const initiativeBluff = isAggressor ? 1.18 : bounds.toCall === 0 && context.inPosition ? 0.92 : 0.55;
  const drawBluff = features.draw || features.blocker ? 1.35 : 0.7;
  const bluffChance = style.bluff * response.bluff * positionBluff * initiativeBluff * drawBluff * (headsUp ? 1 : 0.32) * (pressure > 0.45 ? 0.38 : 1) * (1 - Math.max(0, callingRead) * 4);

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
  const canBluff = random() < bluffChance;
  if (bounds.canRaise && (canValueBet || canBluff) && random() < style.postflopAggression) {
    return postflopRaiseAction(state, seatIndex, realizedEquity, context);
  }
  return { type: "check" };
}

export function decideBotV6(state: HandState, seatIndex: number, random: () => number = Math.random): PokerAction {
  const publicState = structuredClone(state) as HandState;
  publicState.players.forEach((player, index) => {
    if (index !== seatIndex) player.hole = [];
  });
  return decideBotV6FromPublicState(publicState, seatIndex, random);
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

export function decideBotV7(state: HandState, seatIndex: number, random: () => number = Math.random): PokerAction {
  const publicState = structuredClone(state) as HandState;
  publicState.players.forEach((player, index) => {
    if (index !== seatIndex) player.hole = [];
  });
  return decideBotV7FromPublicState(publicState, seatIndex, random);
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
  const publicState = structuredClone(state) as HandState;
  publicState.players.forEach((player, index) => {
    if (index !== seatIndex) player.hole = [];
  });
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
  const evaluations = evaluatePostflopActionsV10(state, seatIndex, 40, random);
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
  const publicState = structuredClone(state) as HandState;
  publicState.players.forEach((player, index) => { if (index !== seatIndex) player.hole = []; });
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
    const evaluations = evaluatePostflopActionsV10(state, seatIndex, 28, random);
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
  const publicState = structuredClone(state) as HandState;
  publicState.players.forEach((player, index) => { if (index !== seatIndex) player.hole = []; });
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
  const publicState = structuredClone(state) as HandState;
  publicState.players.forEach((player, index) => { if (index !== seatIndex) player.hole = []; });
  return decideBotV12FromPublicState(publicState, seatIndex, random);
}

export function decideBotV12Ablation(state: HandState, seatIndex: number, modules: FlopStrategyModule[], random: () => number = Math.random): PokerAction {
  const publicState = structuredClone(state) as HandState;
  publicState.players.forEach((player, index) => { if (index !== seatIndex) player.hole = []; });
  return decideBotV12FromPublicState(publicState, seatIndex, random, new Set(modules));
}

function evaluationForAction(evaluations: ActionEvaluation[], action: PokerAction) {
  const sameType = evaluations.filter((evaluation) => evaluation.action.type === action.type);
  if (action.type !== "raise") return sameType[0];
  return sameType.sort((a, b) => Math.abs((a.action.amount ?? 0) - (action.amount ?? 0)) - Math.abs((b.action.amount ?? 0) - (action.amount ?? 0)))[0];
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

function decideBotFromPublicState(state: HandState, seatIndex: number, random: () => number): PokerAction {
  return state.street === "preflop" ? decideBotV9FromPublicState(state, seatIndex, random) : decideBotV12FromPublicState(state, seatIndex, random);
}

export function decideBot(state: HandState, seatIndex: number, random: () => number = Math.random): PokerAction {
  const publicState = structuredClone(state) as HandState;
  publicState.players.forEach((player, index) => {
    if (index !== seatIndex) player.hole = [];
  });
  return decideBotFromPublicState(publicState, seatIndex, random);
}

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

function buildReviewV8(state: HandState, action: PokerAction): ReviewItem {
  const player = state.players[humanSeat];
  const toCall = toCallFor(state, humanSeat);
  const pot = potTotal(state);
  const context = buildBotContext(state, humanSeat);
  const bounds = legalBounds(state, humanSeat);
  const potOdds = toCall / Math.max(1, pot + toCall);
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
  const equity = estimateRangeEquity(state, humanSeat, iterations, seededRandom(reviewSeed(state)));
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

function buildReview(state: HandState, action: PokerAction): ReviewItem {
  const baseline = buildReviewV8(state, action);
  if (state.street === "preflop") return baseline;
  const reviewIterations = 36;
  const evaluations = evaluatePostflopActionsV10(state, humanSeat, reviewIterations, seededRandom(reviewSeed(state) ^ 0x9e3779b9));
  const best = evaluations[0];
  const chosen = evaluationForAction(evaluations, action);
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
      reason: `${formatEv(evaluation.ev)} modeled EV (${formatEv(evaluation.evLow)} to ${formatEv(evaluation.evHigh)}). ${response}`,
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
    : "The estimate compares legal actions using likely folds, the range that continues, future-card equity, position, stack depth and rake. Overlapping ranges indicate a genuinely close decision.";
  const flopTextureNote = flopAnalysis
    ? ` This is a ${flopAnalysis.texture.stability} ${flopAnalysis.texture.tone} ${flopAnalysis.texture.band} flop. ${flopAnalysis.rangeAdvantage >= 0.35
      ? "Your modeled range has the advantage: it contains more strong hands overall, which can support frequent small bets."
      : flopAnalysis.rangeAdvantage <= 0.12
        ? "The caller can hold more of the strongest two-pair, set, and draw combinations, so checking more often protects your checking range."
        : "Neither range has a decisive structural advantage, so hand class and position carry more weight."} ${flopAnalysis.texture.dynamic
      ? "Many turns change the best hand or complete draws, so strong made hands gain protection from betting and weak hands should bluff selectively."
      : "Few turn cards radically change the board, so small bets and slow plays are more defensible."}`
    : "";
  return {
    ...baseline,
    grade,
    suggestion: conservativeThinValue ? baseline.suggestion : best.label,
    concept,
    takeaway: concept === "Thin river value"
      ? "Judge a river value bet against the opponent's calling range. Hands that fold do not pay you simply because you were ahead of them."
      : flopAnalysis && state.currentBet === 0
        ? "Bet for value when worse hands can call, for protection when free cards matter, or as a bluff when better hands can fold. Let range advantage and board texture guide the size and frequency."
        : flopAnalysis
          ? "Compare the price with your equity against the bettor's range; raise a polarized range of strong value and robust draws rather than every hand that can continue."
      : "Compare actions by expected value, then treat small differences as mixes rather than absolute rules.",
    alternatives,
    note: thinValueNote + flopTextureNote,
    confidence,
    basis: `${evaluations.length} legal actions · persistent public-action ranges · ${reviewIterations} bounded multi-street rollouts${flopAnalysis ? " · flop texture, range advantage and representative turn branches" : ""} · EV intervals include model uncertainty`,
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

function recordTrainingDecision(state: HandState, before: HandState, review: ReviewItem) {
  const leakKey = leakForDecision(before, review);
  const regret = review.estimatedRegret ?? (review.grade === "Costly" ? Math.max(2, review.pot * 0.1) : 0);
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

export function isValidSavedState(value: unknown): value is HandState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<HandState>;
  return candidate.version === 9
    && typeof candidate.raiseCount === "number"
    && Array.isArray(candidate.actionLog)
    && Array.isArray(candidate.players)
    && candidate.players.length === 6
    && candidate.players.every((player) => typeof player.stats?.preflopFolds === "number")
    && Array.isArray(candidate.deck)
    && Array.isArray(candidate.board)
    && Array.isArray(candidate.reviews)
    && Array.isArray(candidate.reviewArchive)
    && Array.isArray(candidate.trainingDecisions)
    && Boolean(candidate.trainingSummary)
    && typeof candidate.sessionRake === "number";
}

export function migrateSavedState(value: unknown): HandState | null {
  if (isValidSavedState(value)) return value;
  if (!value || typeof value !== "object") return null;
  const legacy = value as Omit<Partial<HandState>, "version"> & { version?: number };
  if (![4, 5, 6, 7, 8].includes(legacy.version ?? 0) || !Array.isArray(legacy.players) || legacy.players.length !== 6) return null;
  const migrated = {
    ...legacy,
    version: 9,
    players: legacy.players.map((player) => ({
      ...player,
      stats: { ...emptyStats(), ...player.stats },
    })),
    preflopRaises: legacy.preflopRaises ?? (legacy.street === "preflop" ? legacy.raiseCount ?? 0 : 0),
    preflopOpener: legacy.preflopOpener ?? null,
    preflopAggressor: legacy.preflopAggressor ?? null,
    lastAggressor: legacy.lastAggressor ?? null,
    actionLog: legacy.actionLog ?? [],
    reviews: [],
    reviewArchive: [],
    trainingDecisions: legacy.trainingDecisions ?? [],
    trainingSummary: legacy.trainingSummary ?? emptyTrainingSummary(),
    sessionRake: legacy.sessionRake ?? 0,
  } as HandState;
  // A v4 in-progress hand lacks the public action sequence required by the
  // new range model. Preserve bankroll and statistics, then begin a clean hand.
  if (legacy.version === 4 && migrated.status === "playing") {
    migrated.status = "handOver";
    migrated.players.forEach((player) => {
      player.stack += player.committed;
      player.committed = 0;
      player.streetBet = 0;
    });
    migrated.result = "Strategy engine upgraded · deal a fresh hand";
    migrated.currentActor = -1;
  }
  return isValidSavedState(migrated) ? migrated : null;
}
