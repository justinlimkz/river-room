# River Room

A private, six-seat no-limit Hold’em practice table. Training chips only. See [RULES.md](RULES.md) for betting, side pots, rake, and supported cash-game rules.

## Practice loop

- **Study table:** position and effective-stack context, optional pot-odds estimation, and reference charts. Finish the hand before reading the decision coach.
- **Unassisted play:** live charts and coaching are unavailable; review becomes available after the hand. This is a practice setting, not a locked exam.
- **Review:** inspect one decision at a time, including the information available before acting, alternative lines, and model uncertainty.
- **Recall:** retry up to 20 recent decisions, prioritizing costly choices. Recommendations and the original action remain hidden until you choose. This is recall of historical spots, not a solver or a counterfactual replay.

The coach and opponents use heuristic range models. Grades, equity estimates, and modeled regret are diagnostic suggestions, not validated GTO results or a measure of human poker skill. Bot win rates in self-play do not establish strength against online players. Short session profit is not a learning score.

## Controls and persistence

Use dollars or big blinds for table amounts; the editable wager target is always explicitly in dollars. Fractional-pot raises include the call before calculating the raise. Chips beside seats show this street’s wager; the total pot includes all streets.

`F`: fold; `C`: check/call; `R`: submit wager; `5`/`7`/`P`/`A`: 50%/75%/pot/all-in presets. `N`: next hand; `V`: review/back; `Escape`: close dialogs. Input fields and open dialogs prevent game shortcuts. Pause and natural/fast bot pacing are available. A decision already being processed can finish while paused; the following action waits.

Sessions and preferences live in this browser’s local storage. Existing v9 saves are retained; older supported versions migrate through the existing engine. Storage failures show a visible warning. Reset requires confirmation and clears the session’s learning history. No account sync or real-money integration is provided.

## Development and checks

Requires Node.js 22.13+ and the dependencies in `package-lock.json`.

```sh
npm install
npm run dev        # http://localhost:3000
npm run test:unit  # engine, training-math, worker and coach tests (~1 min)
npm test           # production build, server render, unit tests, coach benchmark
npm run typecheck
npm run lint
```

`npm run benchmark:bot` and `npm run audit:postflop` run the paired bot-policy comparisons; they are slow and do not exercise the UI.

### Code map

- `app/poker-engine.ts`: public entry point that re-exports `app/engine/*`. Modules are layered so lower ones never import higher ones:
  - `types.ts`, `cards.ts` (deck, RNG, hand evaluator)
  - `rules.ts`: house rules, betting, side pots, rake and showdown (`applyTableAction`, no coaching)
  - `board.ts`, `profiles.ts`, `context.ts`: board texture and hand classes, bot style constants, public decision context, `coachView` and `botView`
  - `preflop.ts`: ranges, charts and preflop plans
  - `ranges.ts`, `evaluation.ts`: public-action range ledgers, equity and action-EV estimates
  - `bots.ts`: bot policies. Live play is V9 preflop and V12 → V11 → V10 → candidate → V7 postflop. The frozen `decideBotV8/V10/V11` exports are the baselines that new candidates must beat.
  - `coach.ts`: decision reviews and training-leak accounting
  - `game.ts`: `applyAction`, which applies the rules and records the coach's review when the learner acts
  - `persistence.ts`: save validation and migration
- `app/training.ts`: pot-size targets, contestable calling price, effective stacks and recall ordering.
- `app/poker.worker.ts` / `app/usePokerEngine.ts`: background decisions and coaching, a duplicate-request guard, stale-result cancellation, and timeout recovery. A failed worker is restarted on the next request, falling back to the main thread after repeated failures.
- `app/useSavedSession.ts`: local-storage session and preferences. Saves are debounced and flushed on page hide. An unreadable save is backed up to `riverroom-session-unreadable` before a new table opens.
- `app/PokerTable.tsx`, `app/components/*`, `app/globals.css`: the table, learning views, controls and accessible dialogs.

Bots decide from `botView`: the public state plus their own cards and style. Opponents' cards and styles, the deck and learner history are removed. The coach uses `coachView`, which also hides every bot's style.

## Running locally

River Room runs locally only; there is no hosted deployment. `npm run dev` serves it at http://localhost:3000 with hot reload. `npm run build && npm start` serves the production build through a local Workers runtime (Miniflare).

### Coach validation and private information

The `public-coach-v2` update fixes terminal river payout EV, incorporates rake into coaching estimates, handles short calls/refunds/side-pot eligibility and odd chips, and evaluates the actual custom bet size. The coach receives an explicit public snapshot with no hidden opponent cards, deck or bot-profile values. Opponents retain their own policies.

Every recommendation is marked **Unvalidated strategy**; old saved reviews show a legacy warning. Heuristic EV bands are not confidence intervals, and preflop grades no longer invent a dollar cost. Run `npm run benchmark:coach` for the independent public CFR+ reference comparisons, or `npm run benchmark:coach:strict` for the deliberately stricter strategy gate (currently fails). See [benchmark provenance, results and limitations](benchmarks/README.md).
