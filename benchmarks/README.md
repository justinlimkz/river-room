# Independent coaching validation

This benchmark is a development diagnostic, not a poker-skill or GTO certification. It explicitly reports `strategyValidated: false` and `onlineTransferValidated: false`. The fixture is independent of the application; the public cases are not an untouched holdout.

## Run

```sh
npm run benchmark:coach
npm run benchmark:coach:strict
node --import tsx --test tests/coach-validation.test.ts
```

The ordinary benchmark fails on independent terminal EV discrepancies (>0.051 chip, allowing the app's 0.1-chip display rounding). It reports, rather than conceals, strategy and nonterminal EV errors. The separate strict strategy gate also requires all-action EV errors and decision loss <=0.1 chip, no unsupported bot actions, and matched bot decision loss <=0.1 chip. **The current model fails this gate.** Passing it would still not prove transfer or equilibrium play.

`latest-report.json` contains every action estimate and reference EV, errors, bot coverage and exclusions. The same report is published at `/coach-validation-report.json`. `app/coach-validation.json` is the generated UI summary. Run the benchmark after modifying the evaluator or fixtures so all three remain synchronized.

## Reference provenance and regeneration

Reference: [Noam Brown's public river CFR solver](https://github.com/noambrown/poker_solver/tree/6a10442877ffc8fd28af93e16e279b9bbdd97b2a), MIT, pinned commit `6a10442877ffc8fd28af93e16e279b9bbdd97b2a`. These are independently generated CFR+ results from that implementation, not imported commercial solver charts or externally certified results. The solver never imports River Room code and is not shipped in the application.

```sh
git clone https://github.com/noambrown/poker_solver.git /tmp/river-room-reference-solver
git -C /tmp/river-room-reference-solver checkout 6a10442877ffc8fd28af93e16e279b9bbdd97b2a
python3 scripts/generate-solver-reference.py /tmp/river-room-reference-solver
npm run benchmark:coach
```

Python's standard library is sufficient. The generator checks the commit and rejects modified tracked solver source. It runs 20,000 deterministic, alternating CFR+ iterations with linear averaging. Every game must have exploitability <0.002 chip before its results can become a fixture. Inputs, configuration SHA-256, complete average strategies, convergence values, weighted conditional ranges, action EVs and frequencies are retained. The report records the fixture file's SHA-256. Zero-weight hands provide common strength support required by the upstream vector evaluator; they have no probability mass.

Three restricted games use board `2s 3h 4d 6c 7c`, a 20-chip pot, OOP equally weighted `AsAd/QsQd`, IP `KsKd`, and stacks 10/20/40. The only betting size is all-in, with checking and call/fold responses. Rake is zero. The generator additionally checks the analytical polarized-game solution: value always bets, the weak hand bets with frequency B/(P+B), and the bluff catcher calls with frequency P/(P+B). These formulas apply to this particular tree and range, not general river play.

Decision EV means expected chips returned minus additional investment from that decision. Prior contributions are sunk. Reference action values enumerate compatible private-hand pairs and follow the solver's average continuation policy. Opponent weights are conditioned on the public action prefix. Very low opponent reach (<1e-8) is excluded. Means across cases are equally weighted diagnostics, not estimates of online frequency.

## What the benchmark establishes

- **Terminal EV:** independent no-rake checks of river call/check payouts against weighted ranges. House-rule regressions separately check rake rounding/cap, short all-in calls, uncalled excess, odd-chip ties, and side-pot eligibility, including actual engine settlement in the original royal-flush regressions.
- **Privacy:** throwing getters on all profiles, opponent cards and deck prove the coach does not read them on any street. Public cards/actions/stats are retained; shared policy functions receive a neutral profile placeholder. Hidden profiles remain part of the opponents' own policy.
- **Coach estimates:** reference ranges are supplied to isolate EV/response modeling from range inference. Both decision loss against the fixed solver continuation and absolute action EV error are reported. Low decision loss does not establish correct mixing or low exploitability: a pure best response can exploit a fixed equilibrium while itself being exploitable.
- **Bots:** 100 reproducible RNG draws per case, public river prefixes supplied. Bets outside the reference action tree are counted as unsupported and never mapped to a nearby size. Matched loss is conditional on coverage. Bots are not told the artificial initial ranges and retain their production rake assumptions, so these results are stress diagnostics, not a fair estimate of full-game strength.

The initial report has 16 decisions and 10 independent terminal comparisons. Strategy remains unvalidated: nonterminal EVs show substantial errors even where action-choice loss is small.

## Remaining validation gaps

Preflop, flop/turn continuation, broad/multiway ranges, raked equilibrium strategies, public-stat range calibration, exploitability of the full bot policy, and human learning transfer are not covered. All live advice is marked **Unvalidated strategy**. Existing saved reviews retain a legacy warning because their estimates have not been recomputed.

For broader validation, obtain independent full-context solves with weighted ranges, stacks, rake, position, board and complete legal betting trees. Freeze separate families as holdouts before policy development. Unsupported configurations must remain excluded, never guessed or silently converted. Human transfer requires separate unassisted, unseen assessments and delayed retention checks; winning more against these bots is insufficient evidence.
