# River Room: maintenance notes

A locally run six-max $1/$2 no-limit Hold'em practice table with heuristic bots and a post-hand decision coach. See README.md for the code map and RULES.md for the supported game. Earlier history (built with Codex) is in git; the original checkout is `~/Documents/Codex/2026-08-06/i-d`.

## Checks
- `npm run typecheck`, `npm run lint`, `npm run test:unit` after any change. `npm test` adds the production build, the server-render test and the coach benchmark.
- Rules changes need a test in `tests/engine.test.ts` that conserves chips and pins exact stacks and rake. Use pots below the $3 rake cap, or the cap hides errors.

## Conventions
- Import from `app/poker-engine.ts` outside the engine. Inside `app/engine/`, keep the layering in that file's header: rules never import the coach or bots.
- Settlement logic exists in two places: `rules.ts` (`awardUncontested`, `showdown`) and the coach's `terminalRiverEV` in `evaluation.ts`. Change them together.
- Bots must only see `botView`; the coach must only see `coachView`. No hidden cards, styles or deck.
- Bot policy changes follow the promotion gate: add a candidate layer, compare it with the frozen baseline (`npm run benchmark:bot`, `npm run audit:postflop`), and only then route `decideBot` through it. The gate applies to the balanced and tight-aggressive styles only, which may lose at most 3 bb/100 against the frozen policy (the style layer has to widen Mara's range to hit her advertised bands). Loose-aggressive, very tight and calling-station styles are meant to be exploitable: judge them by `npm run style:report` and `npm run test:style`, which pin each opponent to the bands shown at the table.
- The review page carries one quiet footnote: "Evaluations come from River Room's built-in model, not a solver." Don't claim GTO, solver accuracy, calibration or skill transfer that the benchmarks don't show. Review prose comes from `app/engine/explain.ts` and never prints EV bands, "modeled" or `basis` text. `app/coach-validation.json` must match `npm run benchmark:coach` output.
- Saved sessions are `HandState` version 9 in local storage. Schema changes need a version bump and a `migrateSavedState` path, with a migration test.
