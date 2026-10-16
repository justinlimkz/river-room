import assert from "node:assert/strict";
import test from "node:test";
import { createSession, describeHand, humanSeat, seededRandom, type Card } from "../app/poker-engine";
import { decisionFacts, potRaiseTarget } from "../app/training";

test("pot-size raises include the call and respect min and max", () => {
  const state = createSession(seededRandom(15));
  state.players.forEach((p) => { p.committed = 0; p.streetBet = 0; p.actedAtBet = null; });
  state.currentBet = 20;
  state.minRaise = 20;
  state.players[0].committed = 80;
  state.players[0].streetBet = 20;
  state.players[humanSeat].committed = 20;
  state.players[humanSeat].stack = 200;
  assert.equal(potRaiseTarget(state, humanSeat, 1), 140); // 20 call + (100 + 20) raise
  assert.equal(potRaiseTarget(state, humanSeat, 0.5), 80);
  state.players[humanSeat].stack = 65;
  assert.equal(potRaiseTarget(state, humanSeat, 1), 65);
  assert.equal(potRaiseTarget(state, humanSeat, 0.01), 40);
});

test("effective stack and net chips include current wagers, not folded opponents", () => {
  const state = createSession(seededRandom(9));
  state.players.forEach((p) => { p.folded = true; p.stack = 1000; p.streetBet = 0; p.committed = 0; });
  Object.assign(state.players[humanSeat], { folded: false, stack: 140, streetBet: 20, committed: 60 });
  Object.assign(state.players[0], { folded: false, stack: 50, streetBet: 30 });
  const facts = decisionFacts(state, humanSeat);
  assert.equal(facts.effective, 80);
  assert.equal(facts.net, 0);
});

test("short all-in price excludes side-pot chips the player cannot win", () => {
  const state = createSession(seededRandom(7));
  state.players.forEach((p) => { p.committed = 0; p.streetBet = 0; });
  state.currentBet = 100;
  state.players[0].committed = 100;
  state.players[1].committed = 100;
  state.players[humanSeat].stack = 20;
  const facts = decisionFacts(state, humanSeat);
  assert.equal(facts.call, 20);
  assert.equal(facts.contestablePot, 40);
  assert.equal(facts.price, 1 / 3);
});

test("hand descriptions read as plain language", () => {
  const hand = (text: string) => text.split(" ").map((c) => ({ rank: c[0], suit: ({ c: "clubs", d: "diamonds", h: "hearts", s: "spades" } as const)[c[1] as "c"] })) as Card[];
  assert.equal(describeHand(hand("Ks 7d 2s 9h Ac")), "Ace high");
  assert.equal(describeHand(hand("Ks Kd 2s 9h Ac")), "Pair of kings");
  assert.equal(describeHand(hand("Ks Kd 2s 2h Ac")), "Two pair, kings and twos");
  assert.equal(describeHand(hand("Ks Kd Kc 2h Ac")), "Three kings");
  assert.equal(describeHand(hand("5s 4d 3s 2h Ac")), "Straight, five high");
  assert.equal(describeHand(hand("Ks 7s 2s 9s Ac")), "Ace high");
  assert.equal(describeHand(hand("Ks 7s 2s 9s As")), "Flush, ace high");
  assert.equal(describeHand(hand("Ks Kd Kc 2h 2c")), "Full house, kings full of twos");
});
