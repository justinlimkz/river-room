import assert from "node:assert/strict";
import test from "node:test";
import {
  applyAction,
  analyzeBoard,
  analyzePreflopSpot,
  buildBotContext,
  buildRangeLedger,
  cardLabel,
  CLOCKWISE_SEATS,
  createSession,
  decideBot,
  decideBotCandidate,
  decideBotV8,
  decideBotV10,
  decideBotV10Candidate,
  decideBotV11Candidate,
  decideBotLegacy,
  decideBotV6,
  estimateRangeEquity,
  estimateRangeEquityV6,
  evaluatePostflopActions,
  evaluatePostflopActionsV10,
  evaluateHand,
  humanSeat,
  legalBounds,
  migrateSavedState,
  PREFLOP_CHARTS,
  potTotal,
  seededRandom,
  shuffledDeck,
  startHand,
  startingHandKey,
  classifyStrategicHand,
  toCallFor,
  validateAction,
  type BotProfile,
  type Card,
  type Position,
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

test("strategic hand and board classes distinguish value, draws, and dynamic textures", () => {
  assert.equal(classifyStrategicHand([card("A", "spades"), card("K", "spades")], [card("Q", "spades"), card("J", "spades"), card("T", "spades")]), "nuts");
  assert.equal(classifyStrategicHand([card("A", "hearts"), card("K", "hearts")], [card("Q", "hearts"), card("J", "spades"), card("2", "hearts")]), "combo-draw");
  assert.equal(classifyStrategicHand([card("Q", "clubs"), card("J", "diamonds")], [card("Q", "hearts"), card("J", "clubs"), card("4", "spades")]), "strong-value");
  const profile = analyzeBoard([card("9", "hearts"), card("T", "hearts"), card("J", "hearts"), card("Q", "clubs")]);
  assert.equal(profile.fourStraight, true);
  assert.equal(profile.dynamic, true);
});

test("published preflop charts expose the coach's exact positional ranges", () => {
  const opens = PREFLOP_CHARTS.find((chart) => chart.id === "open")!;
  const utg = opens.options.find((option) => option.label === "UTG")!;
  const button = opens.options.find((option) => option.label === "BTN")!;
  const smallBlind = opens.options.find((option) => option.label === "SB")!;
  assert.ok(button.hands.length > smallBlind.hands.length);
  assert.ok(smallBlind.hands.length > utg.hands.length);
  assert.equal(button.hands.includes("A7o"), true);
  assert.equal(utg.hands.includes("A7o"), false);
  assert.equal(PREFLOP_CHARTS.find((chart) => chart.id === "bb-vs-sb")!.options.find((option) => option.label === "Continue")!.hands.includes("K7o"), true);
  const bbDefense = PREFLOP_CHARTS.find((chart) => chart.id === "bb-defense")!;
  const bbThreeBet = PREFLOP_CHARTS.find((chart) => chart.id === "bb-three-bet")!;
  const sbFirstIn = PREFLOP_CHARTS.find((chart) => chart.id === "sb-mixed")!;
  assert.ok(bbDefense.options.find((option) => option.label === "BTN")!.hands.length > bbDefense.options.find((option) => option.label === "UTG")!.hands.length);
  assert.ok(bbThreeBet.options.every((option) => option.hands.length < bbDefense.options.find((defense) => defense.label === option.label)!.hands.length));
  assert.ok(sbFirstIn.options.find((option) => option.label === "Limp or mix")!.hands.length > 0);
});

test("all 2,598,960 five-card combinations match canonical category counts", () => {
  const deck = shuffledDeck(seededRandom(2026));
  const counts = Array.from({ length: 9 }, () => 0);
  for (let a = 0; a < 48; a += 1)
    for (let b = a + 1; b < 49; b += 1)
      for (let c = b + 1; c < 50; c += 1)
        for (let d = c + 1; d < 51; d += 1)
          for (let e = d + 1; e < 52; e += 1) counts[evaluateHand([deck[a], deck[b], deck[c], deck[d], deck[e]]).score[0]] += 1;
  assert.deepEqual(counts, [1_302_540, 1_098_240, 123_552, 54_912, 10_200, 5_108, 3_744, 624, 40]);
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

test("opponents automatically top up and the online table stays six-handed", () => {
  const state = createSession(seededRandom(41));
  const busted = state.players.findIndex((player) => !player.isHuman && player.position === "CO");
  state.players[busted].stack = 0;
  state.status = "handOver";
  const next = startHand(state, seededRandom(42));
  assert.equal(next.players[busted].stack + next.players[busted].committed, 200);
  assert.equal(next.players[busted].hole.length, 2);
  assert.equal(next.players[busted].folded, false);
  assert.equal(next.players.filter((player) => player.hole.length === 2).length, 6);
  assert.deepEqual(
    next.players.map((player) => player.position).sort(),
    ["BB", "BTN", "CO", "HJ", "SB", "UTG"].sort(),
  );
});

test("only opponents top up; the learner's bankroll remains continuous", () => {
  const state = createSession(seededRandom(43));
  state.players[humanSeat].stack = 73;
  state.players.forEach((player) => { if (!player.isHuman) player.stack = 41; });
  state.status = "handOver";
  const next = startHand(state, seededRandom(44));
  assert.ok(next.players[humanSeat].stack + next.players[humanSeat].committed <= 73);
  next.players.forEach((player) => { if (!player.isHuman) assert.equal(player.stack + player.committed, 200); });
});

test("folding around awards the blinds without losing chips", () => {
  let state = createSession();
  const totalBefore = state.players.reduce((sum, player) => sum + player.stack, 0) + state.players.reduce((sum, player) => sum + player.committed, 0);
  for (const seat of [3, 5, 4, 0, 1]) state = applyAction(state, seat, { type: "fold" });
  assert.equal(state.status, "handOver");
  assert.match(state.result, /wins \$1 uncontested/);
  const totalAfter = state.players.reduce((sum, player) => sum + player.stack, 0) + state.players.reduce((sum, player) => sum + player.committed, 0);
  assert.equal(totalAfter, totalBefore);
  assert.equal(state.sessionRake, 0, "no flop, no drop");
});

test("postflop pots pay capped rake while uncalled wagers remain unraked", () => {
  let state = createSession(seededRandom(47));
  state.street = "flop";
  state.board = [card("A", "clubs"), card("7", "diamonds"), card("2", "spades")];
  state.currentActor = 0;
  state.currentBet = 10;
  state.minRaise = 10;
  state.players.forEach((player, index) => {
    player.folded = index > 1;
    player.acted = index > 1;
    player.streetBet = index === 1 ? 10 : 0;
    player.committed = index <= 1 ? 100 : 0;
    player.stack = 100;
  });
  state = applyAction(state, 0, { type: "fold" });
  assert.equal(state.sessionRake, 3);
  assert.equal(state.players[1].stack, 297);
  assert.match(state.result, /wins \$97 uncontested · \$3 rake/);
  assert.equal(state.players.reduce((sum, player) => sum + player.stack, 0) + state.sessionRake, 600 + 200);
});

test("an uncontested result reports net profit and uses human grammar", () => {
  let state = createSession(seededRandom(9));
  state = applyAction(state, 3, { type: "fold" });
  state = applyAction(state, 5, { type: "raise", amount: 8 });
  for (const seat of [4, 0, 1, 2]) state = applyAction(state, seat, { type: "fold" });
  assert.equal(state.result, "You win $3 uncontested");
  assert.equal(state.players[5].stack, 203);
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

test("the action validator explains illegal checks and malformed raises without mutation", () => {
  const state = createSession(seededRandom(70));
  const actor = state.currentActor;
  assert.match(validateAction(state, actor, { type: "check" }).reason, /facing/i);
  assert.match(validateAction(state, actor, { type: "raise", amount: state.currentBet }).reason, /must exceed/i);
  assert.match(validateAction(state, actor, { type: "raise", amount: Number.NaN }).reason, /finite/i);
  assert.strictEqual(applyAction(state, actor, { type: "raise", amount: state.currentBet }), state);
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
  assert.equal(state.players[0].stack, 347);
  assert.equal(state.players[1].stack, 250);
  assert.equal(state.players[2].stack, 50);
  assert.equal(state.sessionRake, 3);
  assert.equal(state.result, `${state.players[0].name} · One pair · ${state.players[1].name} · One pair · $497 awarded · $3 rake`);
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
  assert.equal(state.result, `${state.players[0].name} · Full house · $97 awarded · $3 rake · $20 returned to ${state.players[0].name}`);
});

test("an unmatched wager is returned and is not described as a second showdown winner", () => {
  let state = createSession();
  state.street = "river";
  state.board = [card("A", "clubs"), card("7", "diamonds"), card("4", "hearts"), card("2", "spades"), card("J", "clubs")];
  state.currentBet = 0;
  state.currentActor = 0;
  state.players.forEach((player, index) => {
    player.folded = index > 1;
    player.allIn = false;
    player.acted = index > 1;
    player.actedAtBet = null;
    player.streetBet = 0;
    player.committed = index === 0 ? 100 : index === 1 ? 101 : 0;
    player.stack = 1;
  });
  state.players[0].hole = [card("A", "spades"), card("K", "hearts")];
  state.players[1].hole = [card("7", "clubs"), card("6", "hearts")];
  state = applyAction(state, 0, { type: "check" });
  state = applyAction(state, 1, { type: "check" });
  assert.equal(state.players[0].stack, 198);
  assert.equal(state.players[1].stack, 2);
  assert.equal(state.result, `${state.players[0].name} · One pair · $197 awarded · $3 rake · $1 returned to ${state.players[1].name}`);
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

test("bot decisions do not change when forbidden opponent cards change", () => {
  const state = createSession(seededRandom(91));
  const actor = state.currentActor;
  const altered = structuredClone(state);
  altered.players.forEach((player, index) => {
    if (index !== actor) player.hole = [card("2", "clubs"), card("3", "diamonds")];
  });
  assert.deepEqual(decideBot(state, actor, seededRandom(7)), decideBot(altered, actor, seededRandom(7)));
});

test("postflop range updates respond to board-relative value actions", () => {
  const state = createSession(seededRandom(810));
  const hero = 5;
  const opponent = 0;
  state.street = "river";
  state.currentActor = hero;
  state.board = [card("8", "hearts"), card("9", "clubs"), card("2", "clubs"), card("6", "hearts"), card("K", "hearts")];
  state.players[hero].hole = [card("A", "spades"), card("9", "spades")];
  state.players.forEach((player, index) => { player.folded = index !== hero && index !== opponent; });
  state.actionLog = [
    { street: "preflop", seat: hero, type: "raise", amount: 8, toCallBefore: 2, raiseLevel: 0 },
    { street: "preflop", seat: opponent, type: "call", amount: 8, toCallBefore: 6, raiseLevel: 1 },
    { street: "flop", seat: opponent, type: "check", amount: 0, toCallBefore: 0, raiseLevel: 0 },
    { street: "flop", seat: hero, type: "raise", amount: 18, toCallBefore: 0, raiseLevel: 0 },
    { street: "flop", seat: opponent, type: "call", amount: 18, toCallBefore: 18, raiseLevel: 1 },
    { street: "turn", seat: opponent, type: "check", amount: 0, toCallBefore: 0, raiseLevel: 0 },
    { street: "turn", seat: hero, type: "raise", amount: 59, toCallBefore: 0, raiseLevel: 0 },
    { street: "turn", seat: opponent, type: "call", amount: 59, toCallBefore: 59, raiseLevel: 1 },
    { street: "river", seat: opponent, type: "all-in", amount: 115, toCallBefore: 0, raiseLevel: 0 },
  ];
  const prior = estimateRangeEquityV6(state, hero, 1200, seededRandom(99));
  const revised = estimateRangeEquity(state, hero, 1200, seededRandom(99));
  assert.ok(revised < prior - 0.07, `prior ${prior}, revised ${revised}`);
});

test("passive profiles sometimes stab after the aggressor checks to them", () => {
  const state = createSession(seededRandom(811));
  const actor = state.players.findIndex((player) => player.position === "BTN");
  const opponent = state.players.findIndex((player) => player.position === "BB");
  state.street = "flop";
  state.currentActor = actor;
  state.currentBet = 0;
  state.minRaise = 2;
  state.board = [card("T", "hearts"), card("5", "hearts"), card("5", "spades")];
  state.players.forEach((player, index) => {
    player.folded = index !== actor && index !== opponent;
    player.committed = index === actor || index === opponent ? 8 : 0;
    player.streetBet = 0;
  });
  state.players[actor].profile = "caller";
  state.players[actor].hole = [card("9", "clubs"), card("8", "clubs")];
  state.preflopAggressor = opponent;
  state.actionLog = [
    { street: "preflop", seat: opponent, type: "raise", amount: 8, toCallBefore: 1, raiseLevel: 0 },
    { street: "preflop", seat: actor, type: "call", amount: 8, toCallBefore: 6, raiseLevel: 1 },
    { street: "flop", seat: opponent, type: "check", amount: 0, toCallBefore: 0, raiseLevel: 0 },
  ];
  let priorBets = 0;
  let revisedBets = 0;
  for (let seed = 1; seed <= 500; seed += 1) {
    if (["raise", "all-in"].includes(decideBotV6(state, actor, seededRandom(seed)).type)) priorBets += 1;
    if (["raise", "all-in"].includes(decideBot(state, actor, seededRandom(seed)).type)) revisedBets += 1;
  }
  assert.ok(revisedBets >= 35, `revised stabs ${revisedBets}`);
  assert.ok(revisedBets > priorBets + 25, `prior ${priorBets}, revised ${revisedBets}`);
});

test("live postflop play uses the benchmark-cleared candidate", () => {
  const state = createSession(seededRandom(815));
  const actor = state.players.findIndex((player) => player.position === "BTN");
  const opponent = state.players.findIndex((player) => player.position === "BB");
  state.street = "flop";
  state.currentActor = actor;
  state.currentBet = 0;
  state.minRaise = 2;
  state.board = [card("A", "hearts"), card("7", "clubs"), card("2", "diamonds")];
  state.players.forEach((player, index) => {
    player.folded = index !== actor && index !== opponent;
    player.committed = index === actor || index === opponent ? 8 : 0;
    player.streetBet = 0;
  });
  state.players[actor].profile = "balanced";
  state.players[actor].hole = [card("A", "spades"), card("A", "clubs")];
  state.preflopAggressor = actor;
  state.actionLog = [
    { street: "preflop", seat: actor, type: "raise", amount: 8, toCallBefore: 2, raiseLevel: 0, potBefore: 3 },
    { street: "preflop", seat: opponent, type: "call", amount: 8, toCallBefore: 6, raiseLevel: 1, potBefore: 10 },
    { street: "flop", seat: opponent, type: "check", amount: 0, toCallBefore: 0, raiseLevel: 0, potBefore: 16 },
  ];
  for (let seed = 1; seed <= 240; seed += 1) {
    const current = decideBot(state, actor, seededRandom(seed));
    const candidate = decideBotCandidate(state, actor, seededRandom(seed));
    assert.deepEqual(current, candidate);
  }
});

test("even a passive caller usually value-bets vulnerable top two pair when checked to", () => {
  const state = createSession(seededRandom(816));
  const actor = state.players.findIndex((player) => player.position === "CO");
  const opponent = state.players.findIndex((player) => player.position === "HJ");
  state.street = "flop";
  state.currentActor = actor;
  state.currentBet = 0;
  state.minRaise = 2;
  state.board = [card("Q", "hearts"), card("K", "diamonds"), card("A", "hearts")];
  state.players.forEach((player, index) => {
    player.folded = index !== actor && index !== opponent;
    player.committed = index === actor || index === opponent ? (index === actor ? 4 : 6) : 0;
    player.streetBet = 0;
  });
  state.players[actor].profile = "caller";
  state.players[actor].hole = [card("K", "clubs"), card("Q", "diamonds")];
  state.players[opponent].hole = [card("3", "spades"), card("3", "clubs")];
  state.preflopAggressor = opponent;
  state.actionLog = [
    { street: "preflop", seat: opponent, type: "raise", amount: 4, toCallBefore: 2, raiseLevel: 0, potBefore: 3 },
    { street: "preflop", seat: actor, type: "call", amount: 4, toCallBefore: 4, raiseLevel: 1, potBefore: 7 },
    { street: "flop", seat: opponent, type: "check", amount: 0, toCallBefore: 0, raiseLevel: 0, potBefore: 11 },
  ];

  let valueBets = 0;
  for (let seed = 1; seed <= 300; seed += 1) {
    const action = decideBot(state, actor, seededRandom(seed));
    assert.equal(validateAction(state, actor, action).legal, true);
    if (action.type === "raise" || action.type === "all-in") valueBets += 1;
  }
  assert.ok(valueBets >= 270, `value bets ${valueBets}/300`);
});

test("passive BTN players raise strong playable opens more often", () => {
  const state = createSession(seededRandom(812));
  const actor = state.players.findIndex((player) => player.position === "BTN");
  state.currentActor = actor;
  state.players[actor].profile = "caller";
  state.players[actor].hole = [card("A", "clubs"), card("9", "clubs")];
  let priorRaises = 0;
  let revisedRaises = 0;
  const priorRandom = seededRandom(8121);
  const revisedRandom = seededRandom(8121);
  for (let run = 1; run <= 300; run += 1) {
    if (["raise", "all-in"].includes(decideBotV6(state, actor, priorRandom).type)) priorRaises += 1;
    if (["raise", "all-in"].includes(decideBot(state, actor, revisedRandom).type)) revisedRaises += 1;
  }
  assert.ok(revisedRaises >= 120 && revisedRaises > priorRaises + 25, `prior ${priorRaises}, revised ${revisedRaises}`);
});

test("SB isolation ranges tighten against sticky limpers", () => {
  const state = createSession(seededRandom(813));
  const actor = state.players.findIndex((player) => player.position === "SB");
  const limper = state.players.findIndex((player) => player.position === "BTN");
  state.currentActor = actor;
  state.players[actor].hole = [card("A", "clubs"), card("8", "spades")];
  state.players[limper].stats.hands = 70;
  state.players[limper].stats.vpip = 35;
  state.players[limper].stats.pfr = 2;
  state.players[limper].voluntaryPreflop = true;
  state.actionLog = [{ street: "preflop", seat: limper, type: "call", amount: 2, toCallBefore: 2, raiseLevel: 0 }];
  let priorRaises = 0;
  let revisedRaises = 0;
  for (let seed = 1; seed <= 300; seed += 1) {
    if (["raise", "all-in"].includes(decideBotV6(state, actor, seededRandom(seed)).type)) priorRaises += 1;
    if (["raise", "all-in"].includes(decideBot(state, actor, seededRandom(seed)).type)) revisedRaises += 1;
  }
  assert.ok(revisedRaises < priorRaises * 0.5, `prior ${priorRaises}, revised ${revisedRaises}`);
});

test("the latest street aggressor remains the initiative owner", () => {
  const state = createSession(seededRandom(814));
  const preflopAggressor = state.players.findIndex((player) => player.position === "CO");
  const flopAggressor = state.players.findIndex((player) => player.position === "BTN");
  const actor = state.players.findIndex((player) => player.position === "BB");
  state.street = "turn";
  state.currentActor = actor;
  state.preflopAggressor = preflopAggressor;
  state.lastAggressor = null;
  state.actionLog = [
    { street: "preflop", seat: preflopAggressor, type: "raise", amount: 6, toCallBefore: 2, raiseLevel: 0 },
    { street: "flop", seat: flopAggressor, type: "raise", amount: 10, toCallBefore: 0, raiseLevel: 0 },
  ];
  assert.equal(buildBotContext(state, actor).aggressor, flopAggressor);
});

test("the new strategy remains behaviorally distinct from the frozen legacy benchmark", () => {
  const state = createSession(seededRandom(18));
  const actor = 2;
  const opener = 1;
  state.currentActor = actor;
  state.currentBet = 6;
  state.minRaise = 4;
  state.raiseCount = 1;
  state.preflopRaises = 1;
  state.preflopOpener = opener;
  state.preflopAggressor = opener;
  state.lastAggressor = opener;
  state.players[actor].position = "BB";
  state.players[actor].streetBet = 2;
  state.players[actor].hole = [card("K", "clubs"), card("7", "diamonds")];
  state.players[opener].position = "SB";
  state.players[opener].streetBet = 6;
  assert.equal(decideBot(state, actor, seededRandom(4)).type, "call");
  assert.equal(decideBotLegacy(state, actor, seededRandom(4)).type, "fold");
});

test("postflop position is computed relative to live opponents, including BB versus SB", () => {
  const state = createSession(seededRandom(21));
  state.street = "flop";
  state.board = [card("A", "clubs"), card("7", "diamonds"), card("2", "spades")];
  const sb = state.players.findIndex((player) => player.position === "SB");
  const bb = state.players.findIndex((player) => player.position === "BB");
  state.players.forEach((player, index) => { player.folded = index !== sb && index !== bb; });
  assert.equal(buildBotContext(state, bb).inPosition, true);
  assert.equal(buildBotContext(state, sb).inPosition, false);
});

test("BB defends materially wider against SB than against UTG", () => {
  const random = seededRandom(7012);
  const sample = (openerPosition: Position) => {
    const state = createSession(seededRandom(44));
    const actor = 2;
    const opener = 3;
    state.currentActor = actor;
    state.currentBet = 6;
    state.minRaise = 4;
    state.raiseCount = 1;
    state.preflopRaises = 1;
    state.preflopOpener = opener;
    state.preflopAggressor = opener;
    state.lastAggressor = opener;
    state.players[actor].position = "BB";
    state.players[actor].streetBet = 2;
    state.players[opener].position = openerPosition;
    state.players[opener].streetBet = 6;
    let continues = 0;
    for (let run = 0; run < 5000; run += 1) {
      state.players[actor].hole = shuffledDeck(random).slice(0, 2);
      if (decideBot(state, actor, random).type !== "fold") continues += 1;
    }
    return continues / 5000;
  };
  const versusUtg = sample("UTG");
  const versusSb = sample("SB");
  assert.ok(versusSb > versusUtg + 0.16, `SB ${versusSb}, UTG ${versusUtg}`);
});

test("short-stack coaching and the promoted bot policy agree on the JJ reshove", () => {
  const state = createSession(seededRandom(902));
  const actor = state.players.findIndex((player) => player.position === "BB");
  const opener = state.players.findIndex((player) => player.position === "SB");
  state.players.forEach((player, index) => { player.folded = index !== actor && index !== opener; });
  state.currentActor = actor;
  state.currentBet = 4;
  state.minRaise = 2;
  state.raiseCount = 1;
  state.preflopRaises = 1;
  state.preflopOpener = opener;
  state.preflopAggressor = opener;
  state.lastAggressor = opener;
  state.players[opener].streetBet = 4;
  state.players[opener].stack = 196;
  state.players[actor].streetBet = 2;
  state.players[actor].stack = 18;
  state.players[actor].hole = [card("J", "diamonds"), card("J", "clubs")];
  state.actionLog = [{ street: "preflop", seat: opener, type: "raise", amount: 4, toCallBefore: 1, raiseLevel: 0 }];
  assert.equal(startingHandKey(state.players[actor].hole), "JJ");
  assert.equal(analyzePreflopSpot(state, actor)?.preferred, "all-in");
  for (const profile of ["balanced", "tag", "lag", "nit", "caller"] as BotProfile[]) {
    state.players[actor].profile = profile;
    assert.deepEqual(decideBot(state, actor, seededRandom(1)), decideBotCandidate(state, actor, seededRandom(1)), profile);
  }
});

test("short-stack coaching uses the same chart and explains the recommendation", () => {
  const state = createSession(seededRandom(904));
  const opener = state.players.findIndex((player) => player.position === "SB");
  state.players.forEach((player, index) => { player.folded = index !== humanSeat && index !== opener; });
  state.players[humanSeat].position = "BB";
  state.players[humanSeat].hole = [card("J", "hearts"), card("J", "spades")];
  state.players[humanSeat].streetBet = 2;
  state.players[humanSeat].stack = 18;
  state.players[opener].streetBet = 4;
  state.players[opener].stack = 196;
  state.currentActor = humanSeat;
  state.currentBet = 4;
  state.minRaise = 2;
  state.raiseCount = 1;
  state.preflopRaises = 1;
  state.preflopOpener = opener;
  state.preflopAggressor = opener;
  state.actionLog = [{ street: "preflop", seat: opener, type: "raise", amount: 4, toCallBefore: 1, raiseLevel: 0 }];
  const next = applyAction(state, humanSeat, { type: "all-in" });
  assert.equal(next.reviews[0].suggestion, "Move all-in");
  assert.equal(next.reviews[0].grade, "Preferred");
  assert.equal(next.reviews[0].confidence, "High");
  assert.match(next.reviews[0].basis!, /JJ · 10 BB effective/);
});

test("deep-stack coaching uses position-specific starting-hand ranges", () => {
  const state = createSession(seededRandom(905));
  state.currentActor = humanSeat;
  state.players[humanSeat].position = "HJ";
  state.players[humanSeat].hole = [card("A", "hearts"), card("A", "spades")];
  const next = applyAction(state, humanSeat, { type: "raise", amount: 6 });
  assert.equal(next.reviews[0].suggestion, "Raise to about $6");
  assert.equal(next.reviews[0].grade, "Preferred");
  assert.equal(next.reviews[0].equity, undefined);
  assert.equal(next.reviews[0].equityLabel, "Preflop reference");
  assert.match(next.reviews[0].basis!, /AA · 100 BB effective/);
  assert.match(next.reviews[0].note, /HJ opening range/);
});

test("coaching grades the chosen raise size instead of only the action category", () => {
  const sensible = createSession(seededRandom(906));
  sensible.currentActor = humanSeat;
  sensible.players[humanSeat].position = "HJ";
  sensible.players[humanSeat].hole = [card("A", "hearts"), card("A", "spades")];
  const normalReview = applyAction(sensible, humanSeat, { type: "raise", amount: 6 }).reviews[0];

  const oversized = createSession(seededRandom(906));
  oversized.currentActor = humanSeat;
  oversized.players[humanSeat].position = "HJ";
  oversized.players[humanSeat].hole = [card("A", "hearts"), card("A", "spades")];
  const oversizedReview = applyAction(oversized, humanSeat, { type: "raise", amount: 100 }).reviews[0];

  assert.equal(normalReview.grade, "Preferred");
  assert.equal(oversizedReview.grade, "Costly");
  assert.deepEqual(normalReview.recommendedSize, { target: 6, min: 4, max: 8 });
});

function kkFacingFourBetSpot() {
  const state = createSession(seededRandom(910));
  const button = 3;
  const bigBlind = 4;
  state.players.forEach((player, index) => { player.folded = index !== humanSeat && index !== bigBlind; });
  state.players[humanSeat].position = "SB";
  state.players[humanSeat].hole = [card("K", "hearts"), card("K", "spades")];
  state.players[humanSeat].streetBet = 8;
  state.players[humanSeat].committed = 8;
  state.players[humanSeat].stack = 192;
  state.players[bigBlind].position = "BB";
  state.players[bigBlind].streetBet = 18;
  state.players[bigBlind].committed = 18;
  state.players[bigBlind].stack = 182;
  state.players[button].position = "BTN";
  state.players[button].streetBet = 5;
  state.players[button].committed = 5;
  state.currentActor = humanSeat;
  state.currentBet = 18;
  state.minRaise = 10;
  state.raiseCount = 3;
  state.preflopRaises = 3;
  state.preflopOpener = button;
  state.preflopAggressor = bigBlind;
  state.lastAggressor = bigBlind;
  state.actionLog = [
    { street: "preflop", seat: button, type: "raise", amount: 5, toCallBefore: 2, raiseLevel: 0 },
    { street: "preflop", seat: humanSeat, type: "raise", amount: 8, toCallBefore: 4, raiseLevel: 1 },
    { street: "preflop", seat: bigBlind, type: "raise", amount: 18, toCallBefore: 6, raiseLevel: 2 },
    { street: "preflop", seat: button, type: "fold", amount: 5, toCallBefore: 13, raiseLevel: 3 },
  ];
  return state;
}

test("KK facing a four-bet at 100 BB plays for all the chips, never folds", () => {
  const spot = kkFacingFourBetSpot();
  const plan = analyzePreflopSpot(spot, humanSeat);
  assert.equal(plan?.preferred, "all-in");
  assert.equal(plan?.confidence, "High");
  assert.match(plan?.reason ?? "", /play for all the chips/);

  const folded = applyAction(spot, humanSeat, { type: "fold" });
  assert.equal(folded.reviews[0].suggestion, "Move all-in");
  assert.equal(folded.reviews[0].grade, "Costly");

  const shoved = applyAction(kkFacingFourBetSpot(), humanSeat, { type: "all-in" });
  assert.equal(shoved.reviews[0].grade, "Preferred");
});

function aqoFacingThreeBetSpot({ squeeze, lateVsBlind = false }: { squeeze: boolean; lateVsBlind?: boolean }) {
  const state = createSession(seededRandom(lateVsBlind ? 913 : squeeze ? 911 : 912));
  const caller = 1;
  const aggressor = 2;
  state.players.forEach((player, index) => { player.folded = index !== humanSeat && index !== aggressor && (!squeeze || index !== caller); });
  state.players[humanSeat].position = lateVsBlind ? "BTN" : "UTG";
  state.players[humanSeat].hole = [card("A", "clubs"), card("Q", "spades")];
  state.players[humanSeat].streetBet = 4;
  state.players[humanSeat].committed = 4;
  state.players[humanSeat].stack = lateVsBlind ? 196 : 316;
  state.players[aggressor].position = lateVsBlind ? "BB" : "BTN";
  state.players[aggressor].streetBet = lateVsBlind ? 14 : 16;
  state.players[aggressor].committed = lateVsBlind ? 14 : 16;
  state.players[aggressor].stack = lateVsBlind ? 186 : 304;
  state.players[caller].position = "HJ";
  state.players[caller].streetBet = squeeze ? 4 : 0;
  state.players[caller].committed = squeeze ? 4 : 0;
  state.currentActor = humanSeat;
  state.currentBet = lateVsBlind ? 14 : 16;
  state.minRaise = lateVsBlind ? 10 : 12;
  state.raiseCount = 2;
  state.preflopRaises = 2;
  state.preflopOpener = humanSeat;
  state.preflopAggressor = aggressor;
  state.lastAggressor = aggressor;
  state.actionLog = [
    { street: "preflop", seat: humanSeat, type: "raise", amount: 4, toCallBefore: 2, raiseLevel: 0 },
    ...(squeeze ? [{ street: "preflop" as const, seat: caller, type: "call" as const, amount: 4, toCallBefore: 4, raiseLevel: 1 }] : []),
    { street: "preflop", seat: aggressor, type: "raise", amount: lateVsBlind ? 14 : 16, toCallBefore: lateVsBlind ? 2 : 4, raiseLevel: 1 },
  ];
  return state;
}

test("AQo UTG recognizes a squeeze and recommends folding rather than calling", () => {
  const spot = aqoFacingThreeBetSpot({ squeeze: true });
  const plan = analyzePreflopSpot(spot, humanSeat)!;
  assert.equal(plan.preferred, "fold");
  assert.match(plan.scenario, /UTG opener facing a BTN squeeze after 1 caller/);
  assert.equal(plan.frequencies.fold, 0.87);
  assert.equal(plan.frequencies.raise, 0.1);
  assert.equal(plan.frequencies.call, 0.03);
  assert.ok(Math.abs(Object.values(plan.frequencies).reduce((sum, value) => sum + value, 0) - 1) < 1e-9);

  const called = applyAction(aqoFacingThreeBetSpot({ squeeze: true }), humanSeat, { type: "call" });
  assert.equal(called.reviews[0].grade, "Costly");
  assert.match(called.reviews[0].concept, /squeeze/);
  assert.match(called.reviews[0].alternatives.find((alternative) => alternative.action === "Call")?.reason ?? "", /3% modeled baseline/);
});

test("AQo continues more often in a BTN-versus-BB three-bet pot than in an early-position squeeze", () => {
  const squeeze = analyzePreflopSpot(aqoFacingThreeBetSpot({ squeeze: true }), humanSeat)!;
  const blindBattle = analyzePreflopSpot(aqoFacingThreeBetSpot({ squeeze: false, lateVsBlind: true }), humanSeat)!;
  assert.equal(blindBattle.preferred, "call");
  assert.match(blindBattle.scenario, /BTN opener facing a BB three-bet/);
  assert.ok(blindBattle.frequencies.call > squeeze.frequencies.call + 0.4);
  assert.ok(blindBattle.frequencies.fold < squeeze.frequencies.fold - 0.45);
});

test("ordinary three-bets and squeezes produce distinct AQo recommendations", () => {
  const ordinary = analyzePreflopSpot(aqoFacingThreeBetSpot({ squeeze: false }), humanSeat)!;
  const squeeze = analyzePreflopSpot(aqoFacingThreeBetSpot({ squeeze: true }), humanSeat)!;
  assert.doesNotMatch(ordinary.scenario, /squeeze/);
  assert.match(squeeze.scenario, /squeeze/);
  assert.ok(squeeze.frequencies.fold > ordinary.frequencies.fold);
  assert.ok(squeeze.frequencies.call < ordinary.frequencies.call);
});

test("a three-bet after a limp and isolation raise is not mislabeled as a squeeze or cold call", () => {
  const state = createSession(seededRandom(915));
  const limper = 0;
  const opener = 1;
  const threeBettor = 2;
  state.players[humanSeat].position = "BB";
  state.players[humanSeat].hole = [card("A", "spades"), card("7", "spades")];
  state.players[humanSeat].streetBet = 2;
  state.players[humanSeat].committed = 2;
  state.players[humanSeat].stack = 198;
  state.players[limper].position = "UTG";
  state.players[opener].position = "HJ";
  state.players[threeBettor].position = "BTN";
  state.players[limper].streetBet = 2;
  state.players[opener].streetBet = 8;
  state.players[threeBettor].streetBet = 32;
  state.currentActor = humanSeat;
  state.currentBet = 32;
  state.minRaise = 24;
  state.raiseCount = 2;
  state.preflopRaises = 2;
  state.preflopOpener = opener;
  state.preflopAggressor = threeBettor;
  state.actionLog = [
    { street: "preflop", seat: limper, type: "call", amount: 2, toCallBefore: 2, raiseLevel: 0 },
    { street: "preflop", seat: opener, type: "raise", amount: 8, toCallBefore: 2, raiseLevel: 0 },
    { street: "preflop", seat: threeBettor, type: "raise", amount: 32, toCallBefore: 8, raiseLevel: 1 },
  ];
  const plan = analyzePreflopSpot(state, humanSeat)!;
  assert.equal(plan.preferred, "fold");
  assert.equal(plan.scenario, "BB facing a BTN three-bet after a HJ isolation raise");
  assert.doesNotMatch(plan.scenario, /squeeze|cold caller/);
  assert.match(plan.reason, /not a squeeze because nobody called the raise first/);
});

function postflopCoachingSpot() {
  const state = createSession(seededRandom(907));
  const opponent = 0;
  state.street = "flop";
  state.board = [card("A", "clubs"), card("K", "diamonds"), card("8", "hearts")];
  state.players.forEach((player, index) => { player.folded = index !== humanSeat && index !== opponent; });
  state.players[humanSeat].hole = [card("Q", "clubs"), card("J", "clubs")];
  state.players[humanSeat].stack = 180;
  state.players[humanSeat].committed = 20;
  state.players[humanSeat].streetBet = 0;
  state.players[opponent].stack = 172;
  state.players[opponent].committed = 28;
  state.players[opponent].streetBet = 8;
  state.players[opponent].hole = [card("A", "spades"), card("T", "spades")];
  state.currentBet = 8;
  state.minRaise = 8;
  state.currentActor = humanSeat;
  state.players[opponent].acted = true;
  state.lastAggressor = opponent;
  state.actionLog = [
    { street: "preflop", seat: opponent, type: "raise", amount: 6, toCallBefore: 2, raiseLevel: 0 },
    { street: "flop", seat: opponent, type: "raise", amount: 8, toCallBefore: 0, raiseLevel: 0 },
  ];
  return state;
}

function checkedToRiverTwoPairSpot() {
  const state = createSession(seededRandom(1303));
  const opponent = 0;
  state.street = "river";
  state.board = [card("Q", "clubs"), card("J", "diamonds"), card("7", "spades"), card("4", "hearts"), card("2", "clubs")];
  state.players.forEach((player, index) => { player.folded = index !== humanSeat && index !== opponent; });
  state.players[humanSeat].hole = [card("Q", "hearts"), card("J", "clubs")];
  state.players[humanSeat].position = "BTN";
  state.players[humanSeat].profile = "caller";
  state.players[humanSeat].stack = 176;
  state.players[humanSeat].committed = 24;
  state.players[humanSeat].streetBet = 0;
  state.players[opponent].position = "BB";
  state.players[opponent].stack = 176;
  state.players[opponent].committed = 24;
  state.players[opponent].streetBet = 0;
  state.players[opponent].acted = true;
  state.currentActor = humanSeat;
  state.currentBet = 0;
  state.minRaise = 2;
  state.actionLog = [
    { street: "preflop", seat: humanSeat, type: "raise", amount: 5, toCallBefore: 2, raiseLevel: 0 },
    { street: "preflop", seat: opponent, type: "call", amount: 5, toCallBefore: 3, raiseLevel: 1 },
    { street: "flop", seat: opponent, type: "check", amount: 0, toCallBefore: 0, raiseLevel: 0 },
    { street: "flop", seat: humanSeat, type: "raise", amount: 7, toCallBefore: 0, raiseLevel: 0, potBefore: 10 },
    { street: "flop", seat: opponent, type: "call", amount: 7, toCallBefore: 7, raiseLevel: 1, potBefore: 17 },
    { street: "turn", seat: opponent, type: "check", amount: 0, toCallBefore: 0, raiseLevel: 0 },
    { street: "turn", seat: humanSeat, type: "raise", amount: 12, toCallBefore: 0, raiseLevel: 0, potBefore: 24 },
    { street: "turn", seat: opponent, type: "call", amount: 12, toCallBefore: 12, raiseLevel: 1, potBefore: 36 },
    { street: "river", seat: opponent, type: "check", amount: 0, toCallBefore: 0, raiseLevel: 0, potBefore: 48 },
  ];
  return state;
}

test("v10 repairs missed heads-up river value without forcing every passive profile to bet", () => {
  let predecessorChecks = 0;
  let corrections = 0;
  for (let seed = 1; seed <= 20; seed += 1) {
    const state = checkedToRiverTwoPairSpot();
    state.handNumber = seed;
    const predecessor = decideBotV8(state, humanSeat, seededRandom(seed));
    const candidate = decideBotV10Candidate(state, humanSeat, seededRandom(seed));
    const live = decideBot(state, humanSeat, seededRandom(seed));
    assert.equal(validateAction(state, humanSeat, candidate).legal, true);
    assert.deepEqual(live, candidate);
    if (predecessor.type === "check") predecessorChecks += 1;
    if (predecessor.type === "check" && (candidate.type === "raise" || candidate.type === "all-in")) corrections += 1;
  }
  assert.ok(predecessorChecks > 0);
  assert.ok(corrections > 0 && corrections < predecessorChecks, `checks ${predecessorChecks}, corrections ${corrections}`);
  const deep = checkedToRiverTwoPairSpot();
  deep.players.filter((player) => !player.folded).forEach((player) => { player.stack = 376; });
  assert.deepEqual(decideBotV10Candidate(deep, humanSeat, seededRandom(9)), decideBotV8(deep, humanSeat, seededRandom(9)));
});

function firstToActTurnTwoPairSpot() {
  const state = createSession(seededRandom(1501));
  const opponent = 0;
  state.street = "turn";
  state.board = [card("Q", "clubs"), card("J", "diamonds"), card("7", "spades"), card("4", "hearts")];
  state.players.forEach((player, index) => { player.folded = index !== humanSeat && index !== opponent; });
  state.players[humanSeat].hole = [card("Q", "hearts"), card("J", "clubs")];
  state.players[humanSeat].position = "BB";
  state.players[humanSeat].profile = "caller";
  state.players[humanSeat].stack = 182;
  state.players[humanSeat].committed = 18;
  state.players[humanSeat].streetBet = 0;
  state.players[opponent].position = "BTN";
  state.players[opponent].stack = 182;
  state.players[opponent].committed = 18;
  state.players[opponent].streetBet = 0;
  state.players[opponent].acted = false;
  state.currentActor = humanSeat;
  state.currentBet = 0;
  state.minRaise = 2;
  state.preflopAggressor = opponent;
  state.lastAggressor = opponent;
  state.actionLog = [
    { street: "preflop", seat: opponent, type: "raise", amount: 5, toCallBefore: 2, raiseLevel: 0, potBefore: 3 },
    { street: "preflop", seat: humanSeat, type: "call", amount: 5, toCallBefore: 3, raiseLevel: 1, potBefore: 8 },
    { street: "flop", seat: humanSeat, type: "check", amount: 0, toCallBefore: 0, raiseLevel: 0, potBefore: 10 },
    { street: "flop", seat: opponent, type: "raise", amount: 8, toCallBefore: 0, raiseLevel: 0, potBefore: 10 },
    { street: "flop", seat: humanSeat, type: "call", amount: 8, toCallBefore: 8, raiseLevel: 1, potBefore: 18 },
  ];
  return state;
}

test("v11 selectively restores first-to-act turn value and remains the live policy", () => {
  let predecessorChecks = 0;
  let corrections = 0;
  for (let seed = 1; seed <= 18; seed += 1) {
    const state = firstToActTurnTwoPairSpot();
    state.handNumber = seed;
    const predecessor = decideBotV10(state, humanSeat, seededRandom(seed));
    const candidate = decideBotV11Candidate(state, humanSeat, seededRandom(seed));
    const live = decideBot(state, humanSeat, seededRandom(seed));
    assert.equal(validateAction(state, humanSeat, candidate).legal, true);
    assert.deepEqual(live, candidate);
    if (predecessor.type === "check") predecessorChecks += 1;
    if (predecessor.type === "check" && (candidate.type === "raise" || candidate.type === "all-in")) corrections += 1;
  }
  assert.ok(predecessorChecks > 0);
  assert.ok(corrections > 0 && corrections < predecessorChecks, `checks ${predecessorChecks}, corrections ${corrections}`);
  const deep = firstToActTurnTwoPairSpot();
  deep.players.filter((player) => !player.folded).forEach((player) => { player.stack = 382; });
  assert.deepEqual(decideBotV11Candidate(deep, humanSeat, seededRandom(11)), decideBotV10(deep, humanSeat, seededRandom(11)));
});

test("postflop coaching is deterministic and never uses an opponent's hidden cards", () => {
  const first = postflopCoachingSpot();
  const second = postflopCoachingSpot();
  second.players[0].hole = [card("2", "diamonds"), card("3", "diamonds")];
  const firstReview = applyAction(first, humanSeat, { type: "call" }).reviews[0];
  const secondReview = applyAction(second, humanSeat, { type: "call" }).reviews[0];
  assert.equal(firstReview.equity, secondReview.equity);
  assert.equal(firstReview.grade, secondReview.grade);
  assert.ok((firstReview.equityHigh ?? 0) > (firstReview.equityLow ?? 1));
  assert.match(firstReview.basis!, /persistent public-action ranges/);
});

test("postflop action EV is deterministic, legal, and hidden-card invariant", () => {
  const first = postflopCoachingSpot();
  const second = postflopCoachingSpot();
  second.players[0].hole = [card("2", "diamonds"), card("3", "diamonds")];
  const firstEvaluations = evaluatePostflopActions(first, humanSeat, 32, seededRandom(1201));
  const secondEvaluations = evaluatePostflopActions(second, humanSeat, 32, seededRandom(1201));
  assert.deepEqual(firstEvaluations, secondEvaluations);
  assert.ok(firstEvaluations.length >= 3);
  firstEvaluations.forEach((evaluation) => assert.equal(validateAction(first, humanSeat, evaluation.action).legal, true));
  assert.ok(firstEvaluations.every((evaluation) => evaluation.evLow <= evaluation.ev && evaluation.ev <= evaluation.evHigh));
});

test("v10 range ledger is normalized, card-aware, and hidden-card invariant", () => {
  const first = postflopCoachingSpot();
  const second = postflopCoachingSpot();
  second.players[0].hole = [card("2", "diamonds"), card("3", "diamonds")];
  const firstLedger = buildRangeLedger(first, humanSeat);
  const secondLedger = buildRangeLedger(second, humanSeat);
  assert.deepEqual(firstLedger, secondLedger);
  const combos = firstLedger[0];
  assert.ok(combos.length >= 250);
  assert.ok(Math.abs(combos.reduce((sum, combo) => sum + combo.weight, 0) - 1) < 1e-9);
  const known = new Set([...first.players[humanSeat].hole, ...first.board].map(cardLabel));
  assert.equal(combos.some((combo) => combo.cards.some((candidate) => known.has(cardLabel(candidate)))), false);
});

test("v10 bounded search is deterministic, legal, and does not inspect hidden cards", () => {
  const first = postflopCoachingSpot();
  const second = postflopCoachingSpot();
  second.players[0].hole = [card("2", "diamonds"), card("3", "diamonds")];
  const firstEvaluation = evaluatePostflopActionsV10(first, humanSeat, 24, seededRandom(1301));
  const secondEvaluation = evaluatePostflopActionsV10(second, humanSeat, 24, seededRandom(1301));
  assert.deepEqual(firstEvaluation, secondEvaluation);
  firstEvaluation.forEach((evaluation) => assert.equal(validateAction(first, humanSeat, evaluation.action).legal, true));
  assert.deepEqual(decideBotV10Candidate(first, humanSeat, seededRandom(1302)), decideBotV10Candidate(second, humanSeat, seededRandom(1302)));
});

test("river coaching does not confuse equity versus all hands with value versus a calling range", () => {
  const state = createSession(seededRandom(918));
  const opponent = state.players.findIndex((player) => player.position === "CO");
  state.street = "river";
  state.board = [card("T", "clubs"), card("Q", "spades"), card("9", "clubs"), card("5", "hearts"), card("2", "spades")];
  state.currentActor = humanSeat;
  state.currentBet = 0;
  state.minRaise = 2;
  state.players.forEach((player, index) => {
    player.folded = index !== humanSeat && index !== opponent;
    player.streetBet = 0;
    player.committed = index === humanSeat || index === opponent ? 22 : index < 2 ? index + 1 : 0;
  });
  state.players[humanSeat].position = "HJ";
  state.players[humanSeat].hole = [card("K", "clubs"), card("K", "hearts")];
  state.players[opponent].position = "CO";
  state.players[opponent].hole = [card("A", "hearts"), card("J", "hearts")];
  state.actionLog = [
    { street: "preflop", seat: humanSeat, type: "raise", amount: 4, toCallBefore: 2, raiseLevel: 0 },
    { street: "preflop", seat: opponent, type: "call", amount: 4, toCallBefore: 4, raiseLevel: 1 },
    { street: "flop", seat: humanSeat, type: "raise", amount: 6, toCallBefore: 0, raiseLevel: 0 },
    { street: "flop", seat: opponent, type: "call", amount: 6, toCallBefore: 6, raiseLevel: 1 },
    { street: "turn", seat: humanSeat, type: "raise", amount: 12, toCallBefore: 0, raiseLevel: 0 },
    { street: "turn", seat: opponent, type: "call", amount: 12, toCallBefore: 12, raiseLevel: 1 },
  ];
  const review = applyAction(state, humanSeat, { type: "check" }).reviews[0];
  assert.equal(review.grade, "Preferred");
  assert.equal(review.suggestion, "Check");
  assert.equal(review.concept, "Thin river value");
  assert.match(review.note, /missed draws.*usually fold/);
  assert.match(review.takeaway, /calling range/);
});

test("an unjustified deep-stack postflop all-in is never allowed to look reasonable", () => {
  const state = postflopCoachingSpot();
  state.players[humanSeat].hole = [card("7", "clubs"), card("2", "clubs")];
  const review = applyAction(state, humanSeat, { type: "all-in" }).reviews[0];
  assert.equal(review.grade, "Costly");
});

test("completed-hand decisions move into the capped learning archive", () => {
  const state = createSession(seededRandom(908));
  state.currentActor = humanSeat;
  state.players[humanSeat].position = "HJ";
  state.players[humanSeat].hole = [card("A", "hearts"), card("A", "spades")];
  const reviewed = applyAction(state, humanSeat, { type: "raise", amount: 6 });
  reviewed.status = "handOver";
  const next = startHand(reviewed, seededRandom(909));
  assert.equal(next.reviews.length, 0);
  assert.equal(next.reviewArchive.length, 1);
  assert.equal(next.reviewArchive[0].handNumber, state.handNumber);
  assert.equal(next.trainingDecisions.length, 1);
  assert.equal(Object.values(next.trainingSummary).reduce((sum, leak) => sum + leak.opportunities, 0), 1);
});

test("v8 sessions migrate to the training schema without losing progress", () => {
  const state = createSession(seededRandom(1202));
  state.players[humanSeat].stack = 448;
  const legacy = structuredClone(state) as unknown as Record<string, unknown> & { version: number };
  legacy.version = 8;
  delete legacy.trainingDecisions;
  delete legacy.trainingSummary;
  const migrated = migrateSavedState(legacy);
  assert.ok(migrated);
  assert.equal(migrated.version, 9);
  assert.equal(migrated.players[humanSeat].stack, 448);
  assert.deepEqual(migrated.trainingDecisions, []);
  assert.equal(Object.values(migrated.trainingSummary).every((leak) => leak.opportunities === 0), true);
});

test("deep-stack live bots remain legal relative to the frozen V8 policy", () => {
  const random = seededRandom(903);
  for (let run = 0; run < 300; run += 1) {
    const state = aqoFacingThreeBetSpot({ squeeze: run % 2 === 0 });
    const actor = humanSeat;
    state.players[actor].hole = shuffledDeck(random).slice(0, 2);
    const seed = 20_000 + run;
    const current = decideBot(state, actor, seededRandom(seed));
    const predecessor = decideBotV8(state, actor, seededRandom(seed));
    assert.equal(validateAction(state, actor, current).legal, true);
    assert.equal(validateAction(state, actor, predecessor).legal, true);
  }
});

test("legacy saves preserve bankroll and statistics while starting a clean upgraded hand", () => {
  const state = createSession(seededRandom(55));
  state.players[5].stack = 173;
  state.players[5].committed = 7;
  state.players[5].stats.vpip = 12;
  const legacy = { ...state, version: 4 };
  const migrated = migrateSavedState(legacy);
  assert.ok(migrated);
  assert.equal(migrated.version, 9);
  assert.equal(migrated.status, "handOver");
  assert.equal(migrated.players[5].stack, 180);
  assert.equal(migrated.players[5].stats.vpip, 12);
});

test("session statistics count action mix and 3-bet opportunities", () => {
  const facingOpen = () => {
    const state = createSession(seededRandom(63));
    state.currentActor = 5;
    state.currentBet = 6;
    state.minRaise = 4;
    state.raiseCount = 1;
    state.preflopRaises = 1;
    state.preflopOpener = 3;
    state.players[3].streetBet = 6;
    return state;
  };

  const folded = applyAction(facingOpen(), 5, { type: "fold" });
  assert.equal(folded.players[5].stats.preflopFolds, 1);
  assert.equal(folded.players[5].stats.threeBetOpportunities, 1);

  const called = applyAction(facingOpen(), 5, { type: "call" });
  assert.equal(called.players[5].stats.preflopCalls, 1);
  assert.equal(called.players[5].stats.threeBets, 0);

  const raised = applyAction(facingOpen(), 5, { type: "raise", amount: 20 });
  assert.equal(raised.players[5].stats.preflopRaises, 1);
  assert.equal(raised.players[5].stats.threeBetOpportunities, 1);
  assert.equal(raised.players[5].stats.threeBets, 1);
});

test("v5 saves gain empty counters without interrupting an active hand", () => {
  const state = createSession(seededRandom(72));
  const legacy = structuredClone(state) as unknown as { version: number; players: Array<{ stats: Record<string, number> }> };
  legacy.version = 5;
  legacy.players.forEach((player) => {
    for (const key of ["preflopFolds", "preflopCalls", "preflopRaises", "preflopChecks", "threeBetOpportunities", "threeBets", "postflopFolds", "postflopCalls", "postflopRaises", "postflopChecks", "flopsSeen", "handsWon", "showdowns", "showdownWins"]) delete player.stats[key];
  });
  const migrated = migrateSavedState(legacy);
  assert.ok(migrated);
  assert.equal(migrated.version, 9);
  assert.equal(migrated.status, "playing");
  assert.equal(migrated.currentActor, state.currentActor);
  assert.equal(migrated.players[5].stats.preflopFolds, 0);
});

test("v7 sessions migrate in place and begin tracking online rake", () => {
  const state = createSession(seededRandom(73));
  state.players[humanSeat].stack = 341;
  const legacy = structuredClone(state) as unknown as { version: number; sessionRake?: number };
  legacy.version = 7;
  delete legacy.sessionRake;
  const migrated = migrateSavedState(legacy);
  assert.ok(migrated);
  assert.equal(migrated.version, 9);
  assert.equal(migrated.status, "playing");
  assert.equal(migrated.players[humanSeat].stack, 341);
  assert.equal(migrated.sessionRake, 0);
});

test("preflop bot populations have distinct realistic frequencies and escalation", () => {
  const random = seededRandom(20260807);
  let state = createSession(random);
  state.players.forEach((player) => { player.isHuman = false; });
  const profiles = new Map<BotProfile, { hands: number; vpip: number; pfr: number; threeBetOpportunities: number; threeBets: number }>();
  const positions = new Map<Position, { opportunities: number; opens: number }>();
  const raisesPerHand: number[] = [];
  const openSizes: number[] = [];
  const threeBetSizes: number[] = [];
  const fourBetSizes: number[] = [];

  for (let hand = 0; hand < 6000; hand += 1) {
    if (hand > 0) {
      state.status = "handOver";
      state.players.forEach((player) => { player.stack = 200; });
      state = startHand(state, random);
    }
    let raises = 0;
    let actions = 0;
    while (state.status === "playing" && state.street === "preflop" && actions++ < 30) {
      const actor = state.currentActor;
      const player = state.players[actor];
      const level = state.raiseCount;
      const action = decideBot(state, actor, random);
      assert.equal(validateAction(state, actor, action).legal, true, `illegal preflop action in hand ${hand}`);
      const metrics = profiles.get(player.profile) ?? { hands: 0, vpip: 0, pfr: 0, threeBetOpportunities: 0, threeBets: 0 };
      profiles.set(player.profile, metrics);
      if (level === 0) {
        const position = positions.get(player.position) ?? { opportunities: 0, opens: 0 };
        position.opportunities += 1;
        if (action.type === "raise" || action.type === "all-in") position.opens += 1;
        positions.set(player.position, position);
      }
      if (level === 1) {
        metrics.threeBetOpportunities += 1;
        if (action.type === "raise" || action.type === "all-in") metrics.threeBets += 1;
      }
      if (action.type === "raise" || action.type === "all-in") {
        raises += 1;
        const target = action.type === "all-in" ? player.streetBet + player.stack : action.amount!;
        if (level === 0) openSizes.push(target);
        if (level === 1) threeBetSizes.push(target);
        if (level === 2) fourBetSizes.push(target);
      }
      state = applyAction(state, actor, action);
    }
    assert.ok(actions < 30, "preflop action should resolve without a raise loop");
    raisesPerHand.push(raises);
    state.players.forEach((player) => {
      const metrics = profiles.get(player.profile) ?? { hands: 0, vpip: 0, pfr: 0, threeBetOpportunities: 0, threeBets: 0 };
      metrics.hands += 1;
      if (player.voluntaryPreflop) metrics.vpip += 1;
      if (player.raisedPreflop) metrics.pfr += 1;
      profiles.set(player.profile, metrics);
    });
  }

  const rate = (profile: BotProfile, key: "vpip" | "pfr") => profiles.get(profile)![key] / profiles.get(profile)!.hands;
  const threeBetRate = (profile: BotProfile) => profiles.get(profile)!.threeBets / profiles.get(profile)!.threeBetOpportunities;
  const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const snapshot = Object.fromEntries((["nit", "tag", "balanced", "lag", "caller"] as BotProfile[]).map((profile) => [profile, {
    vpip: rate(profile, "vpip"),
    pfr: rate(profile, "pfr"),
    threeBet: threeBetRate(profile),
  }]));
  const ratesMessage = JSON.stringify(snapshot);
  assert.ok(rate("nit", "vpip") >= 0.09 && rate("nit", "vpip") <= 0.18, ratesMessage);
  assert.ok(rate("tag", "vpip") >= 0.16 && rate("tag", "vpip") <= 0.25, ratesMessage);
  assert.ok(rate("balanced", "vpip") >= 0.19 && rate("balanced", "vpip") <= 0.29, ratesMessage);
  assert.ok(rate("lag", "vpip") >= 0.25 && rate("lag", "vpip") <= 0.37, ratesMessage);
  assert.ok(rate("caller", "vpip") >= 0.26 && rate("caller", "vpip") <= 0.39, ratesMessage);
  assert.ok(rate("caller", "pfr") < rate("nit", "pfr"), ratesMessage);
  assert.ok(rate("nit", "pfr") < rate("balanced", "pfr"));
  assert.ok(rate("balanced", "pfr") < rate("lag", "pfr"));
  assert.ok(threeBetRate("caller") < threeBetRate("balanced"));
  assert.ok(threeBetRate("balanced") < threeBetRate("lag"));
  assert.ok(positions.get("BTN")!.opens / positions.get("BTN")!.opportunities > positions.get("UTG")!.opens / positions.get("UTG")!.opportunities + 0.12);
  assert.ok(average(raisesPerHand) >= 0.75 && average(raisesPerHand) <= 1.25);
  assert.ok(Math.max(...raisesPerHand) <= 4);
  assert.ok(average(openSizes) >= 4.5 && average(openSizes) <= 7);
  assert.ok(average(threeBetSizes) >= 14 && average(threeBetSizes) <= 28);
  assert.ok(average(fourBetSizes) >= 34 && average(fourBetSizes) <= 65);
});

test("postflop profiles separate calling, folding, and aggression without extremes", () => {
  const random = seededRandom(7701);
  let state = createSession(random);
  state.players.forEach((player) => { player.isHuman = false; });
  const metrics = new Map<BotProfile, { actions: number; facing: number; folds: number; aggressive: number }>();
  for (let hand = 0; hand < 700; hand += 1) {
    if (hand > 0) {
      state.status = "handOver";
      state.players.forEach((player) => { player.stack = 200; });
      state = startHand(state, random);
    }
    let actions = 0;
    while (state.status === "playing" && actions++ < 100) {
      const actor = state.currentActor;
      const player = state.players[actor];
      const action = decideBot(state, actor, random);
      assert.equal(validateAction(state, actor, action).legal, true, `illegal action in hand ${hand}`);
      if (state.street !== "preflop") {
        const profile = metrics.get(player.profile) ?? { actions: 0, facing: 0, folds: 0, aggressive: 0 };
        profile.actions += 1;
        if (toCallFor(state, actor) > 0) {
          profile.facing += 1;
          if (action.type === "fold") profile.folds += 1;
        }
        if (action.type === "raise" || action.type === "all-in") profile.aggressive += 1;
        metrics.set(player.profile, profile);
      }
      const chips = state.players.reduce((sum, participant) => sum + participant.stack, 0) + potTotal(state) + state.sessionRake;
      state = applyAction(state, actor, action);
      assert.equal(state.players.reduce((sum, participant) => sum + participant.stack, 0) + potTotal(state) + state.sessionRake, chips);
    }
    assert.ok(actions < 100, "postflop action should resolve");
  }
  const aggression = (profile: BotProfile) => metrics.get(profile)!.aggressive / metrics.get(profile)!.actions;
  const foldRate = (profile: BotProfile) => metrics.get(profile)!.folds / metrics.get(profile)!.facing;
  const profileMessage = JSON.stringify(Object.fromEntries((["caller", "nit", "balanced", "lag"] as BotProfile[]).map((profile) => [profile, { aggression: aggression(profile), fold: foldRate(profile) }])));
  assert.ok(aggression("caller") < aggression("nit"), profileMessage);
  assert.ok(aggression("nit") < aggression("balanced"), profileMessage);
  assert.ok(aggression("balanced") < aggression("lag"));
  assert.ok(foldRate("caller") < foldRate("balanced"));
  // A nit reaches postflop with a stronger range, so its population fold rate
  // need not exceed a wider balanced range even though its same-hand threshold
  // is more disciplined.
  assert.ok(foldRate("caller") < foldRate("nit"));
  assert.ok(foldRate("caller") >= 0.12 && foldRate("caller") <= 0.38, `caller fold rate ${foldRate("caller")}`);
  assert.ok(foldRate("nit") >= 0.32 && foldRate("nit") <= 0.62, `nit fold rate ${foldRate("nit")}`);
});
