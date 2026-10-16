import { humanSeat } from "./rules";
import type { Card, HandState, Street } from "./types";

// Reads a finished hand back as a street-by-street story. Pure; used by the review page and its tests.

export type TimelineItem =
  | { type: "text"; text: string }
  /** One of the learner's own actions. `reviewIndex` points into `state.reviews`. */
  | { type: "you"; text: string; reviewIndex: number };

export type TimelineStreet = { street: Street; cards: Card[]; pot: number; items: TimelineItem[] };

const STREETS: Street[] = ["preflop", "flop", "turn", "river"];
const STREET_NAMES: Record<Street, string> = { preflop: "Preflop", flop: "Flop", turn: "Turn", river: "River" };
export const streetName = (street: Street) => STREET_NAMES[street];

/** The log indexes of the learner's actions, in order. They line up one-to-one with `state.reviews`. */
export function humanActionIndexes(state: HandState) {
  return state.actionLog.flatMap((entry, index) => entry.seat === humanSeat ? [index] : []);
}

function describe(state: HandState, index: number) {
  const entry = state.actionLog[index];
  const you = entry.seat === humanSeat;
  const name = state.players[entry.seat].name;
  const subject = you ? "You" : name;
  const verb = (singular: string, plural: string) => you ? plural : singular;
  const amount = `$${entry.amount}`;
  switch (entry.type) {
    case "fold": return { subject, text: `${subject} ${verb("folds", "fold")}` };
    case "check": return { subject, text: `${subject} ${verb("checks", "check")}` };
    case "call": return { subject, text: `${subject} ${verb("calls", "call")} $${entry.toCallBefore}` };
    case "all-in": return { subject, text: `${subject} ${verb("is", "are")} all-in for ${amount}` };
    default: {
      const opening = entry.raiseLevel === 0 && entry.street !== "preflop";
      return { subject, text: `${subject} ${opening ? verb("bets", "bet") : verb("raises to", "raise to")} ${amount}` };
    }
  }
}

function joinNames(names: string[]) {
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** Collapses a run of other players' actions into sentences: "Mara, June and Niko fold. Theo calls $5." */
function sentences(state: HandState, indexes: number[]) {
  const parts: string[] = [];
  let folders: string[] = [];
  const flush = () => {
    if (folders.length) parts.push(`${joinNames(folders)} fold${folders.length === 1 ? "s" : ""}.`);
    folders = [];
  };
  indexes.forEach((index) => {
    if (state.actionLog[index].type === "fold") folders.push(state.players[state.actionLog[index].seat].name);
    else { flush(); parts.push(`${describe(state, index).text}.`); }
  });
  flush();
  return parts.join(" ");
}

export function buildTimeline(state: HandState): TimelineStreet[] {
  const visible = STREETS.filter((street) => street === "preflop" || state.board.length >= 3 + STREETS.indexOf(street) - 1);
  const reviewOrder = new Map(humanActionIndexes(state).map((logIndex, order) => [logIndex, order]));
  // Blinds are posted before the log starts; track what each seat has in on the current street.
  let pot = 3;
  return visible.map((street) => {
    const entries = state.actionLog.flatMap((entry, index) => entry.street === street ? [index] : []);
    const streetBets = new Map<number, number>();
    if (street === "preflop") state.players.forEach((player, seat) => {
      if (player.position === "SB" || player.position === "BTN/SB") streetBets.set(seat, 1);
      if (player.position === "BB") streetBets.set(seat, 2);
    });
    const startPot = entries.length ? state.actionLog[entries[0]].potBefore ?? pot : pot;
    const items: TimelineItem[] = [];
    let others: number[] = [];
    const flushOthers = () => {
      if (others.length) items.push({ type: "text", text: sentences(state, others) });
      others = [];
    };
    entries.forEach((index) => {
      const entry = state.actionLog[index];
      if (entry.seat === humanSeat) {
        flushOthers();
        items.push({ type: "you", text: describe(state, index).text, reviewIndex: reviewOrder.get(index)! });
      } else others.push(index);
      const before = streetBets.get(entry.seat) ?? 0;
      pot = (entry.potBefore ?? pot) + Math.max(0, entry.amount - before);
      streetBets.set(entry.seat, entry.amount);
    });
    flushOthers();
    const cards = street === "preflop" ? [] : street === "flop" ? state.board.slice(0, 3) : state.board.slice(STREETS.indexOf(street) + 1, STREETS.indexOf(street) + 2);
    return { street, cards, pot: startPot, items };
  });
}

/** One sentence on how the hand ended, from the learner's point of view. */
export function summarizeHand(state: HandState) {
  const hero = state.players[humanSeat];
  const last = state.actionLog.filter((entry) => entry.seat === humanSeat).at(-1);
  const uncontested = state.result.match(/^(\S+) wins? \$\d+ uncontested/);
  const showdown = state.result.match(/^([^·]+?) · ([^·]+?) · \$\d+ awarded/);
  const winners = (uncontested?.[1] ?? showdown?.[1] ?? "").split(" & ").filter(Boolean);
  const handName = showdown?.[2].toLowerCase();
  if (hero.folded) {
    const when = last && last.street !== "preflop" ? `the ${last.street}` : "preflop";
    const to = winners.length === 1 && winners[0] !== "You" ? ` to ${winners[0]}` : "";
    return `You folded ${when}${to}.`;
  }
  if (uncontested) return winners[0] === "You" ? "Everyone else folded, so you won without a showdown." : `${winners[0]} won the pot after everyone else folded.`;
  if (showdown) {
    if (winners.includes("You")) return winners.length > 1 ? "You split the pot at showdown." : `You won at showdown with ${handName}.`;
    return `${joinNames(winners)} won at showdown with ${handName}.`;
  }
  return state.result;
}

/** Opponents who still held cards when the hand ended, with those cards. Shown even when the learner folded. */
export function revealedHands(state: HandState) {
  if (state.status === "playing") return [];
  return state.players.flatMap((player) => !player.isHuman && !player.folded && player.hole.length === 2 ? [{ name: player.name, cards: player.hole, profile: player.profile }] : []);
}

/**
 * Who the learner was up against at a decision, and what became of the hand.
 * `revealed` is only set for a single opponent who stayed in to the end.
 */
export function decisionOpponent(state: HandState, reviewIndex: number) {
  const logIndex = humanActionIndexes(state)[reviewIndex];
  if (logIndex === undefined) return {};
  const folded = new Set(state.actionLog.slice(0, logIndex).filter((entry) => entry.type === "fold").map((entry) => entry.seat));
  const live = state.players.flatMap((player, seat) => seat === humanSeat || folded.has(seat) ? [] : [player]);
  if (live.length !== 1) return {};
  const opponent = live[0];
  const stayed = !opponent.folded && opponent.hole.length === 2 && state.status !== "playing";
  const winners = state.result.match(/^(\S+) wins? \$\d+ uncontested/)?.[1] ?? state.result.match(/^([^·]+?) · /)?.[1];
  const outcome = stayed && winners ? (winners.includes(opponent.name) ? `${opponent.name} won the pot.` : winners.includes("You") ? "You won the pot." : "") : "";
  return { opponentName: opponent.name, profile: opponent.profile, revealed: stayed ? opponent.hole : undefined, outcome: outcome || undefined };
}
