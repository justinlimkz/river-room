import { clockwiseDistance, emptyTrainingSummary, humanSeat, potTotal } from "./rules";
import { type BotDecisionContext, type HandState } from "./types";

export function actsAfterPostflop(state: HandState, actor: number, opponent: number) {
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

/** Public decision snapshot. Private profiles/cards/deck and prior coach outputs never enter coaching. */
export function coachView(state: HandState, observerSeat = humanSeat): HandState {
  return {
    version: 9, handNumber: state.handNumber, dealer: state.dealer, street: state.street,
    board: structuredClone(state.board), deck: [],
    players: state.players.map((p, index) => ({
      id: `seat-${index}`, name: index === observerSeat ? "You" : `Seat ${index + 1}`,
      isHuman: index === observerSeat, profile: "balanced",
      stack: p.stack, streetBet: p.streetBet, committed: p.committed,
      hole: index === observerSeat ? structuredClone(p.hole) : [],
      folded: p.folded, allIn: p.allIn, acted: p.acted, actedAtBet: p.actedAtBet,
      voluntaryPreflop: p.voluntaryPreflop, raisedPreflop: p.raisedPreflop,
      lastAction: p.lastAction, position: p.position, stats: { ...p.stats },
    })),
    currentBet: state.currentBet, minRaise: state.minRaise, raiseCount: state.raiseCount,
    preflopRaises: state.preflopRaises, preflopOpener: state.preflopOpener,
    preflopAggressor: state.preflopAggressor, lastAggressor: state.lastAggressor,
    actionLog: structuredClone(state.actionLog), currentActor: state.currentActor, status: state.status,
    history: [], reviews: [], reviewArchive: [], trainingDecisions: [], trainingSummary: emptyTrainingSummary(),
    result: "", sessionStart: 0, sessionHands: 0, sessionRake: 0,
  };
}

/**
 * What a bot may know when it acts: public table state, its own cards and its
 * own style. Opponents' cards, styles, the deck and learner history are removed.
 */
export function botView(state: HandState, seatIndex: number): HandState {
  return {
    ...state,
    deck: [],
    board: structuredClone(state.board),
    actionLog: structuredClone(state.actionLog),
    players: state.players.map((player, index) => index === seatIndex
      ? structuredClone(player)
      : { ...structuredClone(player), hole: [], profile: "balanced" }),
    history: [],
    reviews: [],
    reviewArchive: [],
    trainingDecisions: [],
    trainingSummary: structuredClone(state.trainingSummary),
  };
}
