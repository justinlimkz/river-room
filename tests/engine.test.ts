import assert from "node:assert/strict";
import test from "node:test";
import {
  applyAction,
  cardLabel,
  CLOCKWISE_SEATS,
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

test("two sets correctly make a full house using the lower set as the pair", () => {
  const result = evaluateHand([
    card("A", "spades"), card("A", "clubs"), card("A", "diamonds"),
    card("K", "spades"), card("K", "clubs"), card("K", "diamonds"), card("2", "hearts"),
  ]);
  assert.equal(result.name, "Full house");
  assert.deepEqual(result.score, [6, 14, 13]);
});

test("button and named positions rotate every hand", () => {
  const first = createSession();
  const second = startHand({ ...first, status: "handOver" });
  const firstDealerIndex = CLOCKWISE_SEATS.indexOf(first.dealer as (typeof CLOCKWISE_SEATS)[number]);
  assert.equal(second.dealer, CLOCKWISE_SEATS[(firstDealerIndex + 1) % 6]);
  assert.equal(second.players[second.dealer].position, "BTN");
  const dealerIndex = CLOCKWISE_SEATS.indexOf(second.dealer as (typeof CLOCKWISE_SEATS)[number]);
  assert.equal(second.players[CLOCKWISE_SEATS[(dealerIndex + 1) % 6]].position, "SB");
  assert.equal(second.players[CLOCKWISE_SEATS[(dealerIndex + 2) % 6]].position, "BB");
  assert.deepEqual(
    Array.from({ length: 6 }, (_, offset) => second.players[CLOCKWISE_SEATS[(dealerIndex + offset) % 6]].position),
    ["BTN", "SB", "BB", "UTG", "HJ", "CO"],
  );
});

test("folding around awards the blinds without losing chips", () => {
  let state = createSession();
  const totalBefore = state.players.reduce((sum, player) => sum + player.stack, 0) + state.players.reduce((sum, player) => sum + player.committed, 0);
  for (const seat of [3, 5, 4, 0, 1]) state = applyAction(state, seat, { type: "fold" });
  assert.equal(state.status, "handOver");
  assert.match(state.result, /wins \$3 uncontested/);
  const totalAfter = state.players.reduce((sum, player) => sum + player.stack, 0) + state.players.reduce((sum, player) => sum + player.committed, 0);
  assert.equal(totalAfter, totalBefore);
});

test("preflop action proceeds clockwise from the big blind and burns before the flop", () => {
  let state = createSession();
  assert.equal(state.currentActor, 3);
  for (const seat of [3, 5, 4, 0, 1]) state = applyAction(state, seat, { type: "call" });
  state = applyAction(state, 2, { type: "check" });
  assert.equal(state.street, "flop");
  assert.equal(state.board.length, 3);
  assert.equal(state.deck.length, 36);
  assert.equal(state.currentActor, 1);
});

test("a short all-in does not reopen raising for players who already acted", () => {
  const state = createSession();
  state.currentActor = 3;
  state.currentBet = 10;
  state.minRaise = 8;
  state.players[3].stack = 14;
  state.players[4].acted = true;
  state.players[4].actedAtBet = 10;
  state.players[4].streetBet = 10;
  state.players[4].committed = 10;
  state.players[4].stack = 190;
  const next = applyAction(state, 3, { type: "all-in" });
  assert.equal(next.currentBet, 14);
  assert.equal(legalBounds(next, 4).canRaise, false);
});

test("cumulative short all-ins reopen action once they total a full raise", () => {
  let state = createSession();
  state.street = "flop";
  state.currentBet = 100;
  state.minRaise = 100;
  state.currentActor = 3;
  state.players[0].acted = true;
  state.players[0].actedAtBet = 100;
  state.players[0].streetBet = 100;
  state.players[0].committed = 100;
  state.players[0].stack = 300;
  state.players[3].stack = 125;
  state = applyAction(state, 3, { type: "all-in" });
  assert.equal(state.currentBet, 125);
  assert.equal(legalBounds(state, 0).canRaise, false);
  state.players[state.currentActor].stack = 200;
  state = applyAction(state, state.currentActor, { type: "all-in" });
  assert.equal(state.currentBet, 200);
  assert.equal(legalBounds(state, 0).canRaise, true);
  assert.equal(legalBounds(state, 0).min, 300);
});

test("no-limit betting permits more than four raises on one street", () => {
  let state = createSession();
  state.players.forEach((player) => { player.stack = 1000; });
  for (let count = 0; count < 6; count += 1) {
    const actor = state.currentActor;
    const bounds = legalBounds(state, actor);
    assert.equal(bounds.canRaise, true);
    state = applyAction(state, actor, { type: "raise", amount: bounds.min });
  }
  assert.equal(state.status, "playing");
  assert.equal(state.currentBet, 14);
});

test("an all-in cannot bypass a short-raise lock when action is not reopened", () => {
  const state = createSession();
  state.currentActor = 3;
  state.currentBet = 10;
  state.minRaise = 8;
  state.players[3].actedAtBet = 6;
  state.players[3].stack = 100;
  const unchanged = applyAction(state, 3, { type: "all-in" });
  assert.equal(unchanged, state);
});

test("an all-in runout burns once before every community-card street", () => {
  let state = createSession();
  state.currentActor = 3;
  state.players.forEach((player, index) => {
    player.folded = index !== 3 && index !== 5;
    player.acted = player.folded;
  });
  state.players[5].allIn = true;
  state.players[5].stack = 0;
  state.players[5].streetBet = 2;
  state.players[5].committed = 2;
  state = applyAction(state, 3, { type: "call" });
  assert.notEqual(state.status, "playing");
  assert.equal(state.board.length, 5);
  assert.equal(state.deck.length, 32);
});

test("showdown awards main and side pots independently", () => {
  let state = createSession();
  state.street = "river";
  state.board = [card("2", "clubs"), card("3", "diamonds"), card("7", "hearts"), card("9", "spades"), card("J", "clubs")];
  state.currentBet = 0;
  state.currentActor = 0;
  state.players.forEach((player, index) => {
    player.folded = index > 2;
    player.allIn = false;
    player.acted = index > 2;
    player.actedAtBet = null;
    player.streetBet = 0;
    player.committed = index === 0 ? 100 : index <= 2 ? 200 : 0;
    player.stack = 50;
  });
  state.players[0].hole = [card("A", "spades"), card("A", "hearts")];
  state.players[1].hole = [card("K", "spades"), card("K", "hearts")];
  state.players[2].hole = [card("Q", "spades"), card("Q", "hearts")];
  state = applyAction(state, 0, { type: "check" });
  state = applyAction(state, 1, { type: "check" });
  state = applyAction(state, 2, { type: "check" });
  assert.equal(state.status, "handOver");
  assert.equal(state.players[0].stack, 350);
  assert.equal(state.players[1].stack, 250);
  assert.equal(state.players[2].stack, 50);
  assert.equal(state.result, `${state.players[0].name} · One pair · ${state.players[1].name} · One pair · $500 awarded`);
});

test("showdown summary does not repeat a winner for each side-pot layer", () => {
  let state = createSession();
  state.street = "river";
  state.board = [card("A", "clubs"), card("A", "diamonds"), card("A", "hearts"), card("K", "spades"), card("2", "clubs")];
  state.currentBet = 0;
  state.currentActor = 0;
  state.players.forEach((player, index) => {
    player.folded = index > 2;
    player.allIn = false;
    player.acted = index > 2;
    player.actedAtBet = null;
    player.streetBet = 0;
    player.committed = index === 0 ? 60 : index === 1 ? 40 : index === 2 ? 20 : 0;
    player.stack = 100;
  });
  state.players[0].hole = [card("K", "clubs"), card("Q", "spades")];
  state.players[1].hole = [card("Q", "clubs"), card("J", "spades")];
  state.players[2].hole = [card("J", "clubs"), card("T", "diamonds")];
  state = applyAction(state, 0, { type: "check" });
  state = applyAction(state, 1, { type: "check" });
  state = applyAction(state, 2, { type: "check" });
  assert.equal((state.result.match(/Full house/g) ?? []).length, 1);
  assert.equal(state.result, `${state.players[0].name} · Full house · $120 awarded`);
});

test("an odd chip in a tied pot goes to the first winner left of the button", () => {
  let state = createSession();
  state.street = "river";
  state.board = [card("A", "hearts"), card("K", "hearts"), card("Q", "hearts"), card("J", "hearts"), card("T", "hearts")];
  state.currentBet = 0;
  state.currentActor = 0;
  state.players.forEach((player, index) => {
    player.folded = index > 1;
    player.allIn = false;
    player.acted = index > 1;
    player.actedAtBet = null;
    player.streetBet = 0;
    player.committed = index <= 2 ? 1 : 0;
    player.stack = 10;
  });
  state.players[0].hole = [card("2", "spades"), card("3", "spades")];
  state.players[1].hole = [card("4", "clubs"), card("5", "clubs")];
  state = applyAction(state, 0, { type: "check" });
  state = applyAction(state, 1, { type: "check" });
  assert.equal(state.players[0].stack, 11);
  assert.equal(state.players[1].stack, 12);
});
