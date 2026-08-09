# River Room house rules

River Room models a six-seat $1/$2 no-limit Texas Hold'em cash table. These rules define the supported game; features listed as unsupported are intentionally outside the format rather than partially implemented.

## Table and stakes

- Every player begins a new session with $200 (100 BB). Chips are training chips and have no cash value.
- The game uses table stakes and integer-dollar chips. A player may wager no more than the chips in front of them.
- River Room removes 5% from postflop pots, capped at $3 per hand. There is no rake when a hand ends before the flop, and returned uncalled excess is not raked. There is no jackpot drop, ante, or blind escalation.
- Between hands, every bot is automatically topped up to $200 (100 BB). The learner's bankroll is never topped up automatically, so session results remain continuous.
- The table remains six-handed until the learner is busted or resets the session.

## Deal and action

- A standard 52-card deck is shuffled before each hand. Each seated player receives two private cards.
- Action begins left of the big blind preflop and left of the button postflop. Heads-up uses the exception above.
- One card is burned before the flop, turn, and river. The board is dealt three cards, then one, then one.
- Fold, check, call, bet, raise, and all-in actions are available only when legal. An invalid action does not alter game state.

## No-limit betting

- There is no cap on the number of raises.
- A minimum opening bet is one big blind. A minimum raise is at least the size of the last full bet or raise.
- A short all-in is valid but does not by itself reopen raising for a player who has already acted.
- Multiple short all-ins reopen raising when their cumulative increase reaches a full raise. The last full raise remains the minimum raise size.

## Pots and showdown

- Main and side pots are formed from contribution levels. A player may win only pots they funded and for which their hand remains live.
- Uncalled excess is returned before contested pots are awarded.
- Each live player uses the best five-card combination from their two hole cards and five community cards. Playing the board is allowed.
- Equal hands split the pot. An odd chip goes to the first tied winner clockwise left of the button.
- Opponent cards remain hidden after an uncontested win and are revealed for live hands at showdown.

## Unsupported optional cash-game rules

River Room does not currently offer straddles, missed-blind obligations, buying the button, running a board more than once, rabbit hunting, cash added during a hand, or verbal-action and exposed-card procedures.
