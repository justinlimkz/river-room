import assert from "node:assert/strict";
import test from "node:test";
import { createSession, humanSeat, seededRandom, type ReviewItem } from "../app/poker-engine";
import { decisionFacts, potRaiseTarget, practiceQueue } from "../app/training";

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

test("recall prioritizes mistakes and keeps recent decisions without mutating history", () => {
  const items = [
    { id: "old", grade: "Costly" }, { id: "good", grade: "Preferred" },
    { id: "new", grade: "Costly" }, { id: "close", grade: "Viable" },
  ] as ReviewItem[];
  assert.deepEqual(practiceQueue(items).map((r) => r.id), ["new", "old", "close", "good"]);
  assert.deepEqual(items.map((r) => r.id), ["old", "good", "new", "close"]);
  assert.equal(practiceQueue(Array.from({ length: 50 }, () => items[0])).length, 20);
});
