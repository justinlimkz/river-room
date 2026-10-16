import assert from "node:assert/strict";
import test from "node:test";
import {
  applyAction,
  buildTimeline,
  createSession,
  decideBot,
  decisionOpponent,
  explainDecision,
  humanActionIndexes,
  humanSeat,
  legalBounds,
  revealedHands,
  seededRandom,
  startHand,
  summarizeHand,
  type Card,
  type HandState,
  type ReviewItem,
} from "../app/poker-engine";

const parse = (text: string) => text.split(" ").map((c) => ({ rank: c[0], suit: ({ c: "clubs", d: "diamonds", h: "hearts", s: "spades" } as const)[c[1] as "c"] })) as Card[];

type Alt = ReviewItem["alternatives"][number];
const alt = (action: string, verdict: Alt["verdict"], extra: Partial<Alt> = {}): Alt => ({ action, verdict, reason: "x", ...extra });

function review(overrides: Partial<ReviewItem> & Pick<ReviewItem, "action" | "grade" | "alternatives">): ReviewItem {
  return {
    modelVersion: "public-coach-v2",
    validationStatus: "unvalidated",
    id: "48-turn-6",
    handNumber: 48,
    street: "turn",
    position: "BTN",
    cards: parse("As Js"),
    board: parse("Ks 7d 2s 9h"),
    pot: 42,
    toCall: 17,
    effectiveStack: 171,
    spr: 4,
    opponents: 1,
    actionLine: [],
    equity: 0.34,
    equityLabel: "Equity vs modeled ranges",
    potOdds: 0.29,
    suggestion: "Raise to about $55",
    concept: "Price, range and response EV",
    takeaway: "x",
    note: "x",
    confidence: "Medium",
    basis: "x",
    ...overrides,
  };
}

const raise55 = alt("Raise to $55", "Preferred", { ev: 6, foldProbability: 0.33, equityWhenCalled: 0.4 });
const call17 = (verdict: Alt["verdict"], ev = 3) => alt("Call", verdict, { ev });
const fold = (verdict: Alt["verdict"]) => alt("Fold", verdict, { ev: 0 });
const BANNED = /modeled|uncalibrated|solver|basis|EV band|unvalidated/i;

function allText(e: ReturnType<typeof explainDecision>) {
  return [e.verdictText, e.headline, e.tag, ...e.paragraphs, ...e.facts.flatMap((f) => [f.label, f.value]), ...e.options.flatMap((o) => [o.tag, o.action, o.reason]), e.resultNote ?? ""].join("\n");
}

test("a call with a better raise is reasonable and lists options best first", () => {
  const e = explainDecision(review({ action: "Call $17", grade: "Viable", alternatives: [fold("Costly"), call17("Viable"), raise55] }), { opponentName: "Theo", opponentStyle: "Tight, aggressive" });
  assert.equal(e.verdict, "reasonable");
  assert.equal(e.verdictText, "Reasonable. A raise was better.");
  assert.equal(e.tag, "Raise better");
  assert.equal(e.headline, "You called $17 into $42 with the nut flush draw");
  assert.deepEqual(e.options.map((o) => [o.tag, o.action]), [["Best", "Raise to $55"], ["Your move", "Call"], ["Mistake", "Fold"]]);
  assert.equal(e.paragraphs.length, 2);
  assert.match(e.paragraphs[0], /needed 29%.*about 34%/);
  assert.match(e.paragraphs[1], /A raise to \$55 was better|A raise was better/);
  assert.deepEqual(e.facts.map((f) => f.value), ["29%", "≈ 34%", "$171", "Tight, aggressive"]);
});

test("the best move is tagged as yours and gets a plain good verdict", () => {
  const e = explainDecision(review({ action: "Raise to $55", grade: "Preferred", alternatives: [raise55, call17("Viable"), fold("Costly")] }));
  assert.equal(e.verdict, "good");
  assert.equal(e.verdictText, "Good.");
  assert.equal(e.tag, "Good");
  assert.equal(e.options[0].tag, "Best · your move");
  assert.equal(e.paragraphs.length, 1);
});

test("folding a hand that was getting the price is a mistake and names the better move", () => {
  const e = explainDecision(review({ action: "Fold", grade: "Costly", equity: 0.4, potOdds: 0.25, alternatives: [call17("Preferred", 5), fold("Costly"), alt("Raise to $55", "Viable", { ev: 2, foldProbability: 0.1, equityWhenCalled: 0.3 })], suggestion: "Call" }));
  assert.equal(e.verdict, "mistake");
  assert.equal(e.verdictText, "Mistake. Calling was better.");
  assert.equal(e.tag, "Mistake");
  assert.equal(e.options.find((o) => o.yours)?.tag, "Mistake");
  assert.match(e.paragraphs[0], /Calling needed only 25%/);
});

test("options that the coach rates as equals are reported as close, not ranked", () => {
  const e = explainDecision(review({ action: "Call $17", grade: "Preferred", alternatives: [raise55, call17("Preferred", 5.5), fold("Costly")] }));
  assert.equal(e.verdictText, "Good. Calling and raising are close here.");
  assert.equal(e.tag, "Good");
  assert.equal(e.options.find((o) => o.yours)?.tag, "Best · your move");
  assert.equal(e.options.find((o) => o.action.startsWith("Raise"))?.tag, "Best");
  assert.equal(e.paragraphs.length, 2);
});

test("a low-confidence gap inside the close threshold counts as a tie", () => {
  const e = explainDecision(review({ action: "Call $17", grade: "Preferred", confidence: "Low", alternatives: [{ ...raise55, ev: 4 }, call17("Viable", 3), fold("Costly")] }));
  assert.equal(e.verdictText, "Good. Calling and raising are close here.");
});

test("a preflop decision gets one chart-based sentence", () => {
  const e = explainDecision(review({
    street: "preflop", board: [], toCall: 0, pot: 3, equity: undefined, potOdds: 0, equityLabel: "Preflop reference",
    action: "Raise to $5", grade: "Preferred", suggestion: "Raise to about $5", concept: "Unopened pot from BTN",
    alternatives: [alt("Fold", "Costly", { frequency: 0 }), alt("Call", "Viable", { frequency: 0.06 }), alt("Raise", "Preferred", { frequency: 0.94 })],
  }));
  assert.deepEqual(e.paragraphs, ["Raising first in from the button with A♠J♠ is standard."]);
  assert.equal(e.verdictText, "Good.");
  assert.equal(e.facts.some((f) => f.label === "Price to call"), false);
  assert.equal(e.options[0].tag, "Best · your move");
});

test("a costly preflop fold says what the usual play is", () => {
  const e = explainDecision(review({
    street: "preflop", board: [], toCall: 0, pot: 3, equity: undefined, potOdds: 0, action: "Fold", grade: "Costly",
    suggestion: "Raise to about $5", concept: "Unopened pot from BTN",
    alternatives: [alt("Fold", "Costly", { frequency: 0 }), alt("Raise", "Preferred", { frequency: 0.94 })],
  }));
  assert.equal(e.verdictText, "Mistake. A raise was better.");
  assert.match(e.paragraphs[0], /^Folding from the button with A♠J♠ is outside the usual play here; raising to about \$5 is standard\.$/);
});

test("result notes need revealed cards and only appear when the cards change the story", () => {
  const base = review({ action: "Call $17", grade: "Viable", alternatives: [fold("Costly"), call17("Viable"), raise55] });
  assert.equal(explainDecision(base, { opponentName: "Theo" }).resultNote, undefined);
  const revealed = explainDecision(base, { opponentName: "Theo", revealed: parse("Kc Qd"), outcome: "Theo won the pot." });
  assert.match(revealed.resultNote ?? "", /^Theo won the pot\. Theo held K♣ Q♦\. Against those exact cards, you were behind/);
  assert.match(revealed.resultNote ?? "", /doesn’t change which decision was better/);
  // Calling while ahead of the revealed hand needs no note.
  assert.equal(explainDecision(base, { opponentName: "Theo", revealed: parse("5c 4d") }).resultNote, undefined);
});

test("no output mentions models, bands or solvers", () => {
  const cases: ReviewItem[] = [
    review({ action: "Call $17", grade: "Viable", alternatives: [fold("Costly"), call17("Viable"), raise55] }),
    review({ action: "Fold", grade: "Costly", alternatives: [fold("Costly"), call17("Preferred"), raise55] }),
    review({ action: "Raise to $55", grade: "Preferred", alternatives: [raise55, call17("Viable"), fold("Costly")] }),
    review({ action: "Check", grade: "Viable", toCall: 0, alternatives: [alt("Check", "Viable", { ev: 2 }), alt("Bet to $20", "Preferred", { ev: 4, foldProbability: 0.4, equityWhenCalled: 0.6 })] }),
    review({ action: "Bet to $20", grade: "Preferred", toCall: 0, alternatives: [alt("Bet to $20", "Preferred", { ev: 4, foldProbability: 0.4, equityWhenCalled: 0.6 }), alt("Check", "Viable", { ev: 2 })] }),
    review({ modelVersion: undefined, action: "Call $17", grade: "Viable", alternatives: [{ ...call17("Viable"), reason: "40% modeled baseline. uncalibrated band" }, fold("Costly")], note: "uncalibrated", basis: "modeled" }),
  ];
  for (const item of cases) {
    const e = explainDecision(item, { opponentName: "Theo", opponentStyle: "Tight, aggressive", revealed: parse("Kc Qd"), outcome: "Theo won the pot." });
    assert.doesNotMatch(allText(e), BANNED, allText(e));
    assert.ok(e.paragraphs.length >= 1 && e.paragraphs.length <= 2);
  }
});

test("old saved reviews without a model version get short generic prose", () => {
  const e = explainDecision(review({ modelVersion: undefined, validationStatus: undefined, equity: undefined, action: "Call $17", grade: "Viable", alternatives: [call17("Viable"), fold("Costly")], suggestion: "Raise to about $55" }));
  assert.equal(e.verdict, "reasonable");
  assert.match(e.paragraphs.join(" "), /earlier version/);
  assert.equal(e.options.length, 2);
});

function playHand(seed: number, heroPolicy: (state: HandState, index: number) => Parameters<typeof applyAction>[2]) {
  const random = seededRandom(seed);
  let state = createSession(random);
  for (let hand = 0; hand < 1; hand += 1) {
    let guard = 0;
    while (state.status === "playing" && guard++ < 200) {
      const seat = state.currentActor;
      const action = seat === humanSeat ? heroPolicy(state, state.reviews.length) : decideBot(state, seat, random);
      state = applyAction(state, seat, action);
    }
  }
  return state;
}

test("the learner's logged actions line up one-to-one with the reviews", () => {
  const policies = [
    (state: HandState) => legalBounds(state, humanSeat).toCall > 0 ? { type: "call" as const } : { type: "check" as const },
    (state: HandState, index: number) => index % 2 === 0 && legalBounds(state, humanSeat).canRaise ? { type: "raise" as const, amount: legalBounds(state, humanSeat).min } : legalBounds(state, humanSeat).toCall > 0 ? { type: "call" as const } : { type: "check" as const },
    (state: HandState, index: number) => index === 1 ? { type: "fold" as const } : legalBounds(state, humanSeat).toCall > 0 ? { type: "call" as const } : { type: "check" as const },
  ];
  let checked = 0;
  for (const [policyIndex, policy] of policies.entries()) {
    for (const seed of [3, 11, 25]) {
      const state = playHand(seed * 10 + policyIndex, policy);
      assert.notEqual(state.status, "playing");
      const indexes = humanActionIndexes(state);
      assert.equal(indexes.length, state.reviews.length);
      indexes.forEach((logIndex, order) => {
        const entry = state.actionLog[logIndex];
        const item = state.reviews[order];
        assert.equal(entry.street, item.street);
        assert.equal(item.action.split(" ")[0].toLowerCase().replace(/^(bet|raise)$/, "raise"), entry.type === "all-in" ? "all-in" : entry.type === "raise" ? "raise" : entry.type);
        checked += 1;
      });
      const timeline = buildTimeline(state);
      const youItems = timeline.flatMap((street) => street.items.flatMap((entry) => entry.type === "you" ? [entry.reviewIndex] : []));
      assert.deepEqual(youItems, state.reviews.map((_, i) => i));
      assert.equal(timeline[0].street, "preflop");
      assert.equal(timeline[0].pot, 3);
      assert.equal(timeline.length, state.board.length === 0 ? 1 : state.board.length - 1);
      assert.ok(summarizeHand(state).length > 0);
      state.reviews.forEach((_, i) => { void decisionOpponent(state, i); void explainDecision(state.reviews[i], decisionOpponent(state, i)); });
      assert.ok(revealedHands(state).every((hand) => hand.cards.length === 2));
    }
  }
  assert.ok(checked >= 9);
});

test("a folded run is grouped and the learner's own actions stay separate", () => {
  let state = createSession(seededRandom(5));
  const names = state.players.map((p) => p.name);
  let guard = 0;
  while (state.status === "playing" && guard++ < 50) {
    const seat = state.currentActor;
    state = applyAction(state, seat, seat === humanSeat ? { type: "fold" } : { type: "fold" });
  }
  const timeline = buildTimeline(state);
  const text = timeline[0].items.map((item) => item.text).join(" ");
  assert.match(text, /fold/);
  assert.ok(names.length === 6);
  assert.equal(timeline[0].items.filter((item) => item.type === "you").length, state.reviews.length);
});

test("startHand keeps timelines independent between hands", () => {
  const first = playHand(8, () => ({ type: "fold" }));
  const next = startHand(first, seededRandom(9));
  assert.equal(buildTimeline(next)[0].items.length, 0);
});
