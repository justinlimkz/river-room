import { cardLabel, compareScores, cryptoRandom, evaluateHand, shuffledDeck } from "./cards";
import { type ActionValidation, type BotProfile, type Card, type HandState, type PlayerStats, type PokerAction, type Position, type Seat, type Street, type TrainingSummary } from "./types";

const POSITIONS: Position[] = ["BTN", "SB", "BB", "UTG", "HJ", "CO"];

// Seat indices follow component layout, not numeric clockwise order:
// top-left → top-center → top-right → right → hero → left.
export const CLOCKWISE_SEATS = [0, 1, 2, 3, 5, 4] as const;

const NAMES = ["Mara", "Theo", "June", "Silas", "Niko", "You"];

const PROFILES: BotProfile[] = ["balanced", "tag", "lag", "nit", "caller", "balanced"];

export const emptyStats = (): PlayerStats => ({
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

export const emptyTrainingSummary = (): TrainingSummary => ({
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

export function potTotal(state: HandState) {
  return state.players.reduce((sum, player) => sum + player.committed, 0);
}

export const CASH_RAKE = { rate: 0.05, cap: 3 } as const;

/** Rake on the whole contested pot: never preflop and never on returned uncalled chips. */
function rakeFor(contested: number, board: Card[]) {
  if (board.length < 3 || contested <= 0) return 0;
  return Math.min(CASH_RAKE.cap, Math.round(contested * CASH_RAKE.rate));
}

export function toCallFor(state: HandState, seat: number) {
  return Math.max(0, state.currentBet - state.players[seat].streetBet);
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

export function clockwiseDistance(start: number, target: number) {
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

/**
 * Applies one action under the house rules. Illegal actions return `input`
 * unchanged. Coaching is layered on separately by `applyAction` in game.ts.
 */
export function applyTableAction(input: HandState, seatIndex: number, action: PokerAction): HandState {
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
  const highestOther = Math.max(0, ...state.players.filter((player) => player !== winner).map((player) => player.committed));
  const uncalled = Math.max(0, winner.committed - highestOther);
  const rake = rakeFor(pot - uncalled, state.board);
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

function showdown(state: HandState): HandState {
  const contributions = [...new Set(state.players.map((player) => player.committed).filter(Boolean))].sort((a, b) => a - b);
  let previous = 0;
  const awards = new Map<number, number>();
  const returns = new Map<number, number>();
  const descriptions = new Set<string>();
  const showdownWinners = new Set<number>();
  let contestedTotal = 0;
  const layers = contributions.map((level) => {
    const contributors = state.players.filter((player) => player.committed >= level);
    const amount = (level - previous) * contributors.length;
    previous = level;
    return { contributors, eligible: contributors.filter((player) => !player.folded), amount };
  });
  // Rake the combined contested pot once (rounding per side pot would overcharge),
  // collecting it from the main pot first.
  const handRake = rakeFor(layers.reduce((sum, layer) => sum + (layer.contributors.length > 1 ? layer.amount : 0), 0), state.board);
  let rakeDue = handRake;
  layers.forEach(({ contributors, eligible, amount }) => {
    if (!eligible.length || !amount) return;
    if (contributors.length === 1) {
      const index = state.players.indexOf(contributors[0]);
      returns.set(index, (returns.get(index) ?? 0) + amount);
      return;
    }
    const layerRake = Math.min(rakeDue, amount);
    rakeDue -= layerRake;
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
