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
npm run dev
npm test
```

`npm test` builds the production site, checks server rendering, and runs engine, training-math, and worker-protocol tests. `npm run benchmark:bot` and `npm run audit:postflop` run the existing policy comparisons; these are more expensive and do not test the new UI.

- `app/poker-engine.ts`: rules, bot policies, range model, reviews, and migrations.
- `app/training.ts`: pot-size targets, contestable calling price, effective stacks, session accounting, and recall ordering.
- `app/poker.worker.ts` / `app/usePokerEngine.ts`: background decisions and coaching, duplicate-request guard, stale-result cancellation, timeout recovery, and compatibility fallback.
- `app/PokerTable.tsx` / `app/globals.css`: responsive table, learning views, controls, and accessible dialogs.

The worker moves expensive work off the UI thread; it does not change the underlying strategy or make computations cheaper. If workers are unavailable, compatibility mode runs on the main thread. Reviews render one item at a time to keep long histories small in the DOM.

## Hosting

The existing private Site identity is in `.openai/hosting.json`. Preserve its audience and use the Sites workflow to synchronize, build, package, and deploy. Do not replace the source with the generic starter.

### Coach validation and private information

The `public-coach-v2` update fixes terminal river payout EV, incorporates rake into coaching estimates, handles short calls/refunds/side-pot eligibility and odd chips, and evaluates the actual custom bet size. The coach receives an explicit public snapshot with no hidden opponent cards, deck or bot-profile values. Opponents retain their own policies.

Every recommendation is marked **Unvalidated strategy**; old saved reviews show a legacy warning. Heuristic EV bands are not confidence intervals, and preflop grades no longer invent a dollar cost. Run `npm run benchmark:coach` for the independent public CFR+ reference comparisons, or `npm run benchmark:coach:strict` for the deliberately stricter strategy gate (currently fails). See [benchmark provenance, results and limitations](benchmarks/README.md).
