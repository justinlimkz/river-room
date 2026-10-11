import { legalBounds, potTotal, toCallFor, type HandState, type ReviewItem } from "./poker-engine";

// A pot raise includes the call in the pot before calculating the raise.
export function potRaiseTarget(state: HandState, seat: number, fraction: number) {
  const bounds = legalBounds(state, seat);
  return Math.max(bounds.min, Math.min(bounds.max,
    Math.round(state.currentBet + (potTotal(state) + bounds.toCall) * fraction)));
}

export function decisionFacts(state: HandState, seat: number) {
  const hero = state.players[seat];
  const call = Math.min(toCallFor(state, seat), hero.stack);
  const live = state.players.filter((player, index) => index !== seat && !player.folded);
  // Limit each contribution to what this player can contest; exclude side pots
  // above their total contribution after calling. Rake is deliberately excluded.
  const cap = hero.committed + call;
  const contestablePot = state.players.reduce((sum, player, index) =>
    sum + (index === seat ? player.committed : Math.min(player.committed, cap)), 0);
  return {
    call,
    price: call ? call / (contestablePot + call) : 0,
    contestablePot,
    effective: Math.min(hero.stack + hero.streetBet,
      Math.max(0, ...live.map((player) => player.stack + player.streetBet))),
    net: hero.stack + hero.committed - state.sessionStart,
  };
}

export function practiceQueue(items: ReviewItem[]): ReviewItem[] {
  const priority = { Costly: 0, Viable: 1, Preferred: 2 };
  return [...items].reverse().sort((a, b) => priority[a.grade] - priority[b.grade]).slice(0, 20);
}
