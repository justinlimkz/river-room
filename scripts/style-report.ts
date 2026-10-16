import { applyAction, createSession, decideBot, humanSeat, seededRandom, startHand, type BotProfile, type HandState } from "../app/poker-engine";

// Bots-only self-play with a bot in the human seat. Prints how each style actually plays.
// usage: npm run style:report -- --hands=5000 --seed=1 [--preflop-only]

export type StyleRow = {
  seat: number;
  name: string;
  profile: BotProfile;
  hands: number;
  vpip: number;
  pfr: number;
  threeBet: number;
  af: number;
  wtsd: number;
  bbPer100: number;
};

export function runStyleReport(hands: number, seed: number, preflopOnly = false): StyleRow[] {
  const random = seededRandom(seed);
  let state: HandState = createSession(random);
  const profit = Array.from({ length: 6 }, () => 0);
  const startStacks = Array.from({ length: 6 }, () => 0);
  state.players[humanSeat].isHuman = false;
  for (let hand = 0; hand < hands; hand += 1) {
    if (hand > 0) {
      // Keep every seat at 100 bb, including the (bot) player seat, so each hand is comparable.
      state.players.forEach((player) => { player.stack = 200; });
      state = startHand(state, random);
      state.players[humanSeat].isHuman = false;
    }
    state.players.forEach((player, seat) => { startStacks[seat] = player.stack + player.committed; });
    let guard = 0;
    // preflopOnly abandons each hand at the flop: much faster, and enough for VPIP, PFR and 3-bet.
    while (state.status === "playing" && guard++ < 300 && !(preflopOnly && state.street !== "preflop")) {
      const seat = state.currentActor;
      state = applyAction(state, seat, decideBot(state, seat, random));
    }
    state.players.forEach((player, seat) => { profit[seat] += player.stack - startStacks[seat]; });
  }
  return state.players.map((player, seat) => {
    const s = player.stats;
    return {
      seat,
      name: seat === humanSeat ? "Seat 5 (player)" : player.name,
      profile: player.profile,
      hands: s.hands,
      vpip: s.vpip / s.hands,
      pfr: s.pfr / s.hands,
      threeBet: s.threeBetOpportunities ? s.threeBets / s.threeBetOpportunities : 0,
      af: s.postflopCalls ? s.postflopRaises / s.postflopCalls : s.postflopRaises,
      wtsd: s.flopsSeen ? s.showdowns / s.flopsSeen : 0,
      bbPer100: (profit[seat] / 2 / s.hands) * 100,
    };
  });
}

export function formatStyleReport(rows: StyleRow[]) {
  const pct = (value: number) => (value * 100).toFixed(1).padStart(5);
  const lines = ["seat  name             profile    hands   VPIP   PFR  3-bet    AF  WTSD  bb/100"];
  rows.forEach((row) => lines.push(
    `${String(row.seat).padEnd(5)} ${row.name.padEnd(16)} ${row.profile.padEnd(9)} ${String(row.hands).padStart(6)} ${pct(row.vpip)} ${pct(row.pfr)} ${pct(row.threeBet)} ${row.af.toFixed(2).padStart(5)} ${pct(row.wtsd)} ${row.bbPer100.toFixed(1).padStart(7)}`,
  ));
  return lines.join("\n");
}

const isMain = process.argv[1]?.endsWith("style-report.ts");
if (isMain) {
  const arg = (name: string, fallback: number) => Number(process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? fallback);
  const hands = arg("hands", 5000);
  const started = Date.now();
  const rows = runStyleReport(hands, arg("seed", 1), process.argv.includes("--preflop-only"));
  console.log(formatStyleReport(rows));
  console.log(`\n${hands} hands in ${((Date.now() - started) / 1000).toFixed(0)}s`);
}
