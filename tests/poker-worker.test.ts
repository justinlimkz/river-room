import assert from "node:assert/strict";
import test from "node:test";
import { applyAction, createSession, humanSeat, seededRandom } from "../app/poker-engine";
import type { EngineRequest, EngineResponse } from "../app/poker.worker";

test("background engine returns the same transition and handles errors without changing the input", async () => {
  let response: EngineResponse | undefined;
  const scope = { onmessage: (_event: MessageEvent<EngineRequest>) => {}, postMessage: (value: EngineResponse) => { response = value; } };
  Object.assign(globalThis, { self: scope });
  await import("../app/poker.worker");
  let state = createSession(seededRandom(33));
  while (state.currentActor !== humanSeat) state = applyAction(state, state.currentActor, { type: "fold" });
  const before = structuredClone(state);
  scope.onmessage({ data: { id: 42, state, action: { type: "call" } } } as MessageEvent<EngineRequest>);
  assert.equal(response?.id, 42);
  assert.deepEqual(response?.state, applyAction(state, humanSeat, { type: "call" }));
  assert.deepEqual(state, before);
  scope.onmessage({ data: { id: 43, state: null } } as unknown as MessageEvent<EngineRequest>);
  assert.equal(response?.id, 43);
  assert.ok(response?.error);
  assert.equal(response?.state, undefined);
});
