import { buildReview, recordTrainingDecision } from "./coach";
import { applyTableAction, humanSeat } from "./rules";
import type { HandState, PokerAction } from "./types";

/**
 * Applies an action and, when the learner acts, records the coach's review of
 * the decision. The review is computed from the pre-action public snapshot.
 */
export function applyAction(input: HandState, seatIndex: number, action: PokerAction): HandState {
  const state = applyTableAction(input, seatIndex, action);
  if (state === input || seatIndex !== humanSeat || !input.players[seatIndex].isHuman) return state;
  const review = buildReview(input, action);
  state.reviews.push(review);
  recordTrainingDecision(state, input, review);
  return state;
}
