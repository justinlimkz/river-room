import assert from "node:assert/strict";
import test from "node:test";
import {
  applyAction,
  cardLabel,
  createSession,
  evaluateHand,
  legalBounds,
  seededRandom,
  shuffledDeck,
  startHand,
  type Card,
} from "../app/poker-engine";

const card = (rank: Card["rank"], suit: Card["suit"]): Card => ({ rank, suit });

test("seeded shuffle is deterministic and contains 52 unique cards", () => {
  const first = shuffledDeck(seededRandom(42));
  const second = shuffledDeck(seededRandom(42));
  assert.deepEqual(first, second);
  assert.equal(first.length, 52);
  assert.equal(new Set(first.map(cardLabel)).size, 52);
});

test("hand evaluator recognizes wheel, full house, and flush ordering", () => {
  const wheel = evaluateHand([
    card("A", "spades"), card("2", "clubs"), card("3", "diamonds"), card("4", "hearts"), card("5", "spades"), card("K", "clubs"), card("Q", "diamonds"),
  ]);
  const fullHouse = evaluateHand([
    card("A", "spades"), card("A", "clubs"), card("A", "diamonds"), card("K", "hearts"), card("K", "spades"), card("2", "clubs"), card("3", "diamonds"),
  ]);
  const flush = evaluateHand([
    card("A", "hearts"), card("J", "hearts"), card("8", "hearts"), card("4", "hearts"), card("2", "hearts"), card("K", "spades"), card("Q", "clubs"),
  ]);
  assert.equal(wheel.name, "Straight");
  assert.equal(wheel.score[1], 5);
  assert.equal(fullHouse.name, "Full house");
  assert.equal(flush.name, "Flush");
  assert.ok(fullHouse.score[0] > flush.score[0]);
});

test("button and named positions rotate every hand", () => {
  const first = createSession();
  const second = startHand({ ...first, status: "handOver" });
  assert.equal(second.dealer, (first.dealer + 1) % 6);
  assert.equal(second.players[second.dealer].position, "BTN");
  assert.equal(second.players[(second.dealer + 1) % 6].position, "SB");
  assert.equal(second.players[(second.dealer + 2) % 6].position, "BB");
});

test("folding around awards the blinds without losing chips", () => {
  let state = createSession();
  const totalBefore = state.players.reduce((sum, player) => sum + player.stack, 0) + state.players.reduce((sum, player) => sum + player.committed, 0);
  for (const seat of [3, 4, 5, 0, 1]) state = applyAction(state, seat, { type: "fold" });
  assert.equal(state.status, "handOver");
  assert.match(state.result, /wins \$3 uncontested/);
  const totalAfter = state.players.reduce((sum, player) => sum + player.stack, 0) + state.players.reduce((sum, player) => sum + player.committed, 0);
  assert.equal(totalAfter, totalBefore);
});

test("a short all-in does not reopen raising for players who already acted", () => {
  const state = createSession();
  state.currentActor = 3;
  state.currentBet = 10;
  state.minRaise = 8;
  state.players[3].stack = 14;
  state.players[4].acted = true;
  state.players[4].streetBet = 10;
  state.players[4].committed = 10;
  state.players[4].stack = 190;
  const next = applyAction(state, 3, { type: "all-in" });
  assert.equal(next.currentBet, 14);
  assert.equal(next.players[4].raiseLocked, true);
  assert.equal(legalBounds(next, 4).canRaise, false);
});
