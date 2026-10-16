import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import test from "node:test";
import { promisify } from "node:util";
import type { BotProfile } from "../app/poker-engine";
import type { StyleRow } from "../scripts/style-report";

const run = promisify(execFile);

// Each opponent must play the way the table says it does. These are the bands shown to the player,
// measured over 5,000 seeded bots-only hands (five parallel runs of 1,000). It takes a few minutes,
// so it lives in `npm run test:style` rather than in `test:unit`.
const BANDS: Record<string, { seat: number; profile: BotProfile; vpip: [number, number]; pfr: [number, number]; threeBet: [number, number]; af: [number, number]; minWtsd?: number }> = {
  Mara: { seat: 0, profile: "balanced", vpip: [22, 27], pfr: [18, 22], threeBet: [6, 9], af: [2, 3] },
  Theo: { seat: 1, profile: "tag", vpip: [17, 21], pfr: [15, 19], threeBet: [5, 8], af: [2.5, 4] },
  June: { seat: 2, profile: "lag", vpip: [30, 38], pfr: [24, 30], threeBet: [10, 14], af: [3, 5] },
  Silas: { seat: 3, profile: "nit", vpip: [11, 15], pfr: [9, 12], threeBet: [2, 5], af: [1.5, 2.5] },
  Niko: { seat: 4, profile: "caller", vpip: [38, 50], pfr: [6, 12], threeBet: [1, 4], af: [0.5, 1.2], minWtsd: 35 },
};

test("every opponent plays inside its advertised style band", { timeout: 15 * 60_000 }, async () => {
  const seeds = [21, 22, 23, 24, 25];
  const runs = await Promise.all(seeds.map(async (seed) => {
    const { stdout } = await run("node", ["--import", "tsx", "scripts/style-report.ts", "--hands=1000", `--seed=${seed}`, "--json"], { maxBuffer: 1 << 20 });
    return JSON.parse(stdout) as StyleRow[];
  }));
  const mean = (seat: number, pick: (row: StyleRow) => number) => runs.reduce((sum, rows) => sum + pick(rows[seat]), 0) / runs.length;
  const failures: string[] = [];
  for (const [name, band] of Object.entries(BANDS)) {
    assert.equal(runs[0][band.seat].name, name);
    assert.equal(runs[0][band.seat].profile, band.profile);
    const check = (label: string, value: number, [low, high]: [number, number]) => {
      if (value < low || value > high) failures.push(`${name} ${label} ${value.toFixed(2)} outside ${low}–${high}`);
    };
    check("VPIP", mean(band.seat, (row) => row.vpip) * 100, band.vpip);
    check("PFR", mean(band.seat, (row) => row.pfr) * 100, band.pfr);
    check("3-bet", mean(band.seat, (row) => row.threeBet) * 100, band.threeBet);
    check("AF", mean(band.seat, (row) => row.af), band.af);
    if (band.minWtsd !== undefined) check("went to showdown", mean(band.seat, (row) => row.wtsd) * 100, [band.minWtsd, 100]);
  }
  assert.deepEqual(failures, []);
});
