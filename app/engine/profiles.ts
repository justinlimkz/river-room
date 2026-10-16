import { VALUES } from "./cards";
import { type BotProfile, type Card, type Position } from "./types";

export const PROFILE = {
  balanced: { openFactor: 1, openRaise: 0.97, continueVsOpen: 0.17, threeBet: 0.075, defendVsThreeBet: 0.075, fourBet: 0.025, continueVsFourBet: 0.021, stackOff: 0.014, preflopAggression: 0.9, postflopAggression: 0.62, postflopContinue: 0.46, betThreshold: 0.58, raiseThreshold: 0.79, bluff: 0.075, callBias: 0 },
  tag: { openFactor: 0.88, openRaise: 0.98, continueVsOpen: 0.14, threeBet: 0.07, defendVsThreeBet: 0.062, fourBet: 0.026, continueVsFourBet: 0.02, stackOff: 0.015, preflopAggression: 0.94, postflopAggression: 0.68, postflopContinue: 0.49, betThreshold: 0.56, raiseThreshold: 0.77, bluff: 0.055, callBias: -0.015 },
  lag: { openFactor: 1.25, openRaise: 0.98, continueVsOpen: 0.23, threeBet: 0.115, defendVsThreeBet: 0.105, fourBet: 0.04, continueVsFourBet: 0.033, stackOff: 0.021, preflopAggression: 0.96, postflopAggression: 0.76, postflopContinue: 0.43, betThreshold: 0.52, raiseThreshold: 0.74, bluff: 0.11, callBias: 0.005 },
  nit: { openFactor: 0.64, openRaise: 0.97, continueVsOpen: 0.09, threeBet: 0.042, defendVsThreeBet: 0.043, fourBet: 0.017, continueVsFourBet: 0.014, stackOff: 0.01, preflopAggression: 0.9, postflopAggression: 0.46, postflopContinue: 0.53, betThreshold: 0.61, raiseThreshold: 0.82, bluff: 0.025, callBias: -0.035 },
  caller: { openFactor: 1.28, openRaise: 0.3, continueVsOpen: 0.29, threeBet: 0.028, defendVsThreeBet: 0.13, fourBet: 0.012, continueVsFourBet: 0.028, stackOff: 0.009, preflopAggression: 0.58, postflopAggression: 0.27, postflopContinue: 0.43, betThreshold: 0.68, raiseThreshold: 0.86, bluff: 0.025, callBias: 0.06 },
};

export const POSITION_OPEN_RATE: Record<Position, number> = { UTG: 0.18, HJ: 0.23, CO: 0.3, BTN: 0.44, "BTN/SB": 0.72, SB: 0.4, BB: 0.34 };

export function bluffCandidate(cards: Card[]) {
  const values = cards.map((card) => VALUES[card.rank]).sort((a, b) => b - a);
  const suited = cards[0].suit === cards[1].suit;
  return (suited && values[0] === 14 && values[1] <= 5) || (suited && values[0] >= 11 && values[1] >= 9);
}

/** The public one-line description of each opponent's style. Shown to the player; never read by the bots or the coach. */
export const STYLE_LABELS: Record<BotProfile, string> = {
  balanced: "Balanced",
  tag: "Tight, aggressive",
  lag: "Loose, aggressive",
  nit: "Very tight",
  caller: "Calls too much",
};
