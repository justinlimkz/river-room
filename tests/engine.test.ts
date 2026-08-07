import assert from "node:assert/strict";
import test from "node:test";
import {
  applyAction,
  buildBotContext,
  cardLabel,
  CLOCKWISE_SEATS,
  createSession,
  decideBot,
  decideBotLegacy,
  evaluateHand,
  legalBounds,
  migrateSavedState,
  potTotal,
  seededRandom,
  shuffledDeck,
  startHand,
  toCallFor,
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
  assert.match(state.result, /wins \$1 uncontested/);
  const totalAfter = state.players.reduce((sum, player) => sum + player.stack, 0) + state.players.reduce((sum, player) => sum + player.committed, 0);
  assert.equal(totalAfter, totalBefore);
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
  assert.equal(state.result, `${state.players[0].name} · Full house · $100 awarded · $20 returned to ${state.players[0].name}`);
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
    player.stack = 0;
  });
  state.players[0].hole = [card("A", "spades"), card("K", "hearts")];
  state.players[1].hole = [card("7", "clubs"), card("6", "hearts")];
  state = applyAction(state, 0, { type: "check" });
  state = applyAction(state, 1, { type: "check" });
  assert.equal(state.players[0].stack, 200);
  assert.equal(state.players[1].stack, 1);
  assert.equal(state.result, `${state.players[0].name} · One pair · $200 awarded · $1 returned to ${state.players[1].name}`);
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

test("legacy saves preserve bankroll and statistics while starting a clean upgraded hand", () => {
  const state = createSession(seededRandom(55));
  state.players[5].stack = 173;
  state.players[5].committed = 7;
  state.players[5].stats.vpip = 12;
  const legacy = { ...state, version: 4 };
  const migrated = migrateSavedState(legacy);
  assert.ok(migrated);
  assert.equal(migrated.version, 5);
  assert.equal(migrated.status, "handOver");
  assert.equal(migrated.players[5].stack, 180);
  assert.equal(migrated.players[5].stats.vpip, 12);
});

test("preflop bot populations have distinct realistic frequencies and escalation", () => {
  const random = seededRandom(20260807);
  let state = createSession(random);
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
  assert.ok(rate("nit", "vpip") >= 0.09 && rate("nit", "vpip") <= 0.18);
  assert.ok(rate("tag", "vpip") >= 0.16 && rate("tag", "vpip") <= 0.25);
  assert.ok(rate("balanced", "vpip") >= 0.19 && rate("balanced", "vpip") <= 0.29);
  assert.ok(rate("lag", "vpip") >= 0.25 && rate("lag", "vpip") <= 0.37);
  assert.ok(rate("caller", "vpip") >= 0.26 && rate("caller", "vpip") <= 0.39);
  assert.ok(rate("caller", "pfr") < rate("nit", "pfr"));
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
      const chips = state.players.reduce((sum, participant) => sum + participant.stack, 0) + potTotal(state);
      state = applyAction(state, actor, action);
      assert.equal(state.players.reduce((sum, participant) => sum + participant.stack, 0) + potTotal(state), chips);
    }
    assert.ok(actions < 100, "postflop action should resolve");
  }
  const aggression = (profile: BotProfile) => metrics.get(profile)!.aggressive / metrics.get(profile)!.actions;
  const foldRate = (profile: BotProfile) => metrics.get(profile)!.folds / metrics.get(profile)!.facing;
  assert.ok(aggression("caller") < aggression("nit"));
  assert.ok(aggression("nit") < aggression("balanced"));
  assert.ok(aggression("balanced") < aggression("lag"));
  assert.ok(foldRate("caller") < foldRate("balanced"));
  assert.ok(foldRate("balanced") < foldRate("nit"));
  assert.ok(foldRate("caller") >= 0.12 && foldRate("caller") <= 0.38);
  assert.ok(foldRate("nit") >= 0.32 && foldRate("nit") <= 0.62);
});
