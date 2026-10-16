import { cardLabel, compareScores, describeHand, evaluateHand, makeDeck, VALUES } from "./cards";
import type { Card, ReviewItem } from "./types";

// Plain-language evaluation of one of the learner's decisions. Pure: no React, no randomness,
// and nothing here reads hidden opponent information beyond the cards a caller chooses to reveal.

export type DecisionExplanation = {
  verdict: "good" | "reasonable" | "mistake";
  verdictText: string;
  headline: string;
  tag: string;
  paragraphs: string[];
  options: { tag: "Best" | "Also fine" | "Your move" | "Best · your move" | "Mistake"; action: string; reason: string; yours?: boolean }[];
  facts: { label: string; value: string }[];
  resultNote?: string;
};

export type ExplainContext = {
  opponentName?: string;
  /** The opponent's public style label, e.g. "Tight, aggressive". Shown as a read, never used in the maths. */
  opponentStyle?: string;
  /** The opponent's cards, when they were shown at the end of the hand. */
  revealed?: Card[];
  /** One plain sentence about how the hand ended, e.g. "Theo won the pot." */
  outcome?: string;
};

type Alternative = ReviewItem["alternatives"][number];
type Kind = "fold" | "check" | "call" | "raise" | "all-in";

const pct = (value: number) => `${Math.round(value * 100)}%`;
const money = (value: number) => `$${Math.round(value)}`;
const capitalize = (text: string) => text[0].toUpperCase() + text.slice(1);

function kindOf(action: string): Kind {
  const word = action.trim().split(/\s+/)[0].toLowerCase();
  if (word === "fold" || word === "check" || word === "call") return word;
  if (word === "all-in") return "all-in";
  return "raise";
}

const GERUND: Record<Kind, string> = { fold: "Folding", check: "Checking", call: "Calling", raise: "Raising", "all-in": "Moving all-in" };

function sameAction(reviewAction: string, alternative: string) {
  const kind = kindOf(reviewAction);
  if (kind !== kindOf(alternative)) return false;
  // Sized actions must match exactly when the alternative carries a size ("Raise to $55"); chart options ("Raise") match by kind.
  return !/\$\d/.test(alternative) || reviewAction === alternative;
}

/** "Raise to $55" becomes "a raise to $55"; "Fold" becomes "folding". */
function betterPhrase(alternative: Alternative, withSize: boolean) {
  const kind = kindOf(alternative.action);
  if (kind === "raise") {
    const verb = alternative.action.toLowerCase().startsWith("bet") ? "bet" : "raise";
    return withSize && /\$\d/.test(alternative.action) ? `a ${alternative.action.charAt(0).toLowerCase()}${alternative.action.slice(1)}` : `a ${verb}`;
  }
  return GERUND[kind].toLowerCase();
}

function joinOr(items: string[]) {
  return items.length <= 1 ? items[0] ?? "" : `${items.slice(0, -1).join(", ")} or ${items.at(-1)}`;
}

function kindLabel(kind: Kind, option: Alternative) {
  if (kind === "raise") return option.action.toLowerCase().startsWith("bet") ? "Bet" : "Raise";
  return kind === "all-in" ? "All-in" : capitalize(kind);
}

function joinList(items: string[]) {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

function withArticle(name: string) {
  const lower = name[0].toLowerCase() + name.slice(1);
  if (/^(pair|straight|flush|full house|royal)/i.test(name)) return `a ${lower}`;
  return lower;
}

function drawDescription(hole: Card[], board: Card[]): string | null {
  if (board.length < 3 || board.length > 4 || hole.length !== 2) return null;
  const all = [...hole, ...board];
  if (new Set(all.map((card) => card.suit)).size < all.length) {
    // Flush draw: four cards of a suit with at least one in hand.
    for (const suit of ["spades", "hearts", "diamonds", "clubs"] as const) {
      const suited = all.filter((card) => card.suit === suit);
      const holeSuited = hole.filter((card) => card.suit === suit);
      if (suited.length === 4 && holeSuited.length > 0) {
        const onBoard = new Set(board.filter((card) => card.suit === suit).map((card) => VALUES[card.rank]));
        let nut = 14;
        while (onBoard.has(nut)) nut -= 1;
        return holeSuited.some((card) => VALUES[card.rank] === nut) ? "the nut flush draw" : "a flush draw";
      }
    }
  }
  const outs = (cards: Card[]) => {
    const have = new Set(cards.map((card) => VALUES[card.rank]));
    if (have.has(14)) have.add(1);
    const completing = new Set<number>();
    for (let low = 1; low <= 10; low += 1) {
      const window = [low, low + 1, low + 2, low + 3, low + 4];
      const missing = window.filter((value) => !have.has(value));
      if (missing.length === 1) completing.add(missing[0] === 1 ? 14 : missing[0]);
    }
    return completing;
  };
  const boardOuts = outs(board);
  const heroOuts = [...outs(all)].filter((value) => !boardOuts.has(value));
  if (heroOuts.length >= 2) return "an open-ended straight draw";
  if (heroOuts.length === 1) return "a gutshot straight draw";
  return null;
}

function holdingPhrase(review: ReviewItem) {
  if (review.board.length < 3) return review.cards.map(cardLabel).join("");
  const made = describeHand([...review.cards, ...review.board]);
  const draw = review.street === "river" ? null : drawDescription(review.cards, review.board);
  const highCardOnly = /high$/.test(made) && !/(straight|flush)/i.test(made);
  if (draw && highCardOnly) return draw;
  return draw ? `${withArticle(made)} and ${draw}` : withArticle(made);
}

function headline(review: ReviewItem) {
  const kind = kindOf(review.action);
  const amount = review.action.match(/\$(\d+)/)?.[1];
  const holding = holdingPhrase(review);
  const facing = review.toCall > 0;
  const into = ` into ${money(review.pot)}`;
  switch (kind) {
    case "fold": return `You folded${facing ? ` to a ${money(review.toCall)} bet` : ""} with ${holding}`;
    case "check": return `You checked with ${holding}`;
    case "call": return `You called ${amount ? `$${amount}` : money(review.toCall)}${into} with ${holding}`;
    case "all-in": return `You moved all-in${amount ? ` for $${amount}` : ""} with ${holding}`;
    default: return review.action.toLowerCase().startsWith("bet")
      ? `You bet $${amount}${into} with ${holding}`
      : `You raised to $${amount}${facing ? ` over a ${money(review.toCall)} bet` : ""} with ${holding}`;
  }
}

function positionPhrase(position: ReviewItem["position"]) {
  return { BTN: "the button", "BTN/SB": "the button", SB: "the small blind", BB: "the big blind", UTG: "under the gun", HJ: "the hijack", CO: "the cutoff" }[position];
}

function suggestionPhrase(suggestion: string) {
  const lower = suggestion.toLowerCase();
  if (lower.startsWith("move all-in")) return "moving all-in";
  if (lower.startsWith("raise")) return lower.replace(/^raise( to about)?/, (_, rest) => rest ? "raising to about" : "raising");
  if (lower.startsWith("bet")) return lower.replace(/^bet( to about)?/, (_, rest) => rest ? "betting about" : "betting");
  if (lower === "call") return "calling";
  if (lower === "check") return "checking";
  return "folding";
}

function preflopSentence(review: ReviewItem) {
  const kind = kindOf(review.action);
  const hand = review.cards.map(cardLabel).join("");
  const firstIn = /^Unopened pot/.test(review.concept ?? "");
  const reraise = review.actionLine.some((line) => /raised|all-in/.test(line));
  const lead = kind === "raise" ? (firstIn ? "Raising first in" : reraise ? "Re-raising" : "Raising")
    : kind === "all-in" ? "Moving all-in"
      : kind === "call" ? (review.toCall > 0 ? "Calling" : "Checking")
        : kind === "check" ? "Checking" : "Folding";
  const where = `from ${positionPhrase(review.position)} with ${hand}`;
  if (review.grade === "Preferred") return `${lead} ${where} is standard.`;
  const usual = suggestionPhrase(review.suggestion);
  if (review.grade === "Viable") return `${lead} ${where} is playable, though ${usual} is the usual play.`;
  return `${lead} ${where} is outside the usual play here; ${usual} is standard.`;
}

const CONCEPT_TIPS: Record<string, string> = {
  "Thin river value": "On the river, a bet only earns money from worse hands that call.",
  "River bluff-catching": "On the river, a call only has to beat the bluffs and thin value bets in their betting hands.",
  "Draws and semi-bluffing": "A draw can win two ways: when they fold now, and when it improves later.",
  "Value betting": "Bet when worse hands can call.",
  "Checking and pot control": "Checking is a real choice when a bet would only get called by better hands.",
  "Checking and equity realization": "Checking is a real choice when a bet would only get called by better hands.",
  "Playing against multiple opponents": "With more players in the pot, someone is more likely to have a strong hand.",
  "Flop value and protection": "On a board where many cards change the best hand, a strong hand wants to bet before they get a free card.",
  "Dynamic-board caution": "On a board where many cards change the best hand, weak hands should bluff only now and then.",
};

type Computed = {
  review: ReviewItem;
  options: Alternative[];
  user?: Alternative;
  best: Alternative[];
  opp: string;
  leads: string;
};

function equityLine(c: Computed) {
  const { review } = c;
  return review.equity === undefined ? "" : `about ${pct(review.equity)}`;
}

function foldAndCalledText(option: Alternative | undefined) {
  if (!option || option.foldProbability === undefined) return null;
  return { fold: pct(option.foldProbability), called: option.equityWhenCalled === undefined ? null : pct(option.equityWhenCalled) };
}

function firstParagraph(c: Computed) {
  const { review, user } = c;
  const kind = kindOf(review.action);
  const eq = equityLine(c);
  const tip = CONCEPT_TIPS[review.concept];
  const facing = review.toCall > 0;
  const price = pct(review.potOdds);
  let text: string;
  if (review.equity === undefined) {
    text = `The coach rated this ${review.grade === "Preferred" ? "a good" : review.grade === "Viable" ? "a reasonable" : "a poor"} choice.`;
  } else if (facing && kind === "call") {
    text = review.equity >= review.potOdds
      ? `You needed ${price} to call and had ${eq} against the hands ${c.leads}, so the call pays on price alone.`
      : `You needed ${price} to call but had only ${eq} against the hands ${c.leads}, so the price was too high for a call on its own.`;
  } else if (facing && kind === "fold") {
    text = review.equity < review.potOdds
      ? `Calling needed ${price} and you had ${eq} against the hands ${c.leads}, so folding saves chips.`
      : `Calling needed only ${price} and you had ${eq} against the hands ${c.leads}, which is enough to continue.`;
  } else if (kind === "raise" || kind === "all-in") {
    const info = foldAndCalledText(user);
    const base = facing ? `The price to call was ${price} and you had ${eq} against the hands ${c.leads}.` : `You had ${eq} against the hands ${c.leads}.`;
    if (info) {
      const equityCalled = info.called ? ` When called, you had ${info.called} to win.` : "";
      text = `${base} We estimate they fold ${info.fold} of the time, and that is when the bet wins on the spot.${equityCalled}`;
    } else text = base;
  } else {
    text = `You had ${eq} against the hands ${c.leads}. ${kind === "check" ? "Checking keeps the pot small." : ""}`.trim();
  }
  return tip && review.grade === "Preferred" ? `${text} ${tip}` : text;
}

function betKind(user: Alternative | undefined, review: ReviewItem) {
  if (review.toCall > 0 || !user || user.equityWhenCalled === undefined) return "";
  if (user.equityWhenCalled >= 0.6) return " This works as a value bet: even when called, you still win most of the time.";
  if (user.equityWhenCalled >= 0.4) return " This bet protects a medium-strength hand and also wins when they fold.";
  return " This is mostly a bluff, so it needs folds to make money.";
}

function secondParagraph(c: Computed, tied: boolean) {
  const { review, best } = c;
  const top = best[0];
  if (!top) return null;
  const kind = kindOf(top.action);
  const info = foldAndCalledText(top);
  if (tied) {
    const others = best.filter((option) => !sameAction(review.action, option.action));
    const other = others[0];
    if (!other) return null;
    const detail = kindOf(other.action) === "raise" && foldAndCalledText(other)
      ? ` ${capitalize(betterPhrase(other, false))} wins the pot right away about ${foldAndCalledText(other)!.fold} of the time.`
      : "";
    return `${capitalize(betterPhrase(other, false))} is about as good here.${detail} Which is better depends on how the hand plays out later.`;
  }
  if (kind === "raise" || kind === "all-in") {
    const sizeMatters = kindOf(review.action) === kind;
    const lead = `${capitalize(betterPhrase(top, sizeMatters))} was better because it gives you two ways to win.`;
    const detail = info ? ` We estimate they fold ${info.fold} of the time${info.called ? `, and when they call you still have about ${info.called} to win` : ""}.` : "";
    return `${lead}${detail}`;
  }
  if (kind === "fold") {
    return review.equity !== undefined && review.toCall > 0
      ? `Folding was better: you needed ${pct(review.potOdds)} and had about ${pct(review.equity)}, so calling loses chips over time.`
      : "Folding was better here, because continuing risks more than it is likely to win back.";
  }
  if (kind === "call") return `Calling was better: it risks less than raising and keeps weaker hands in the pot.`;
  return "Checking was better: it keeps the pot small and lets weaker hands stay in.";
}

function optionReason(option: Alternative, c: Computed): string {
  const { review } = c;
  const kind = kindOf(option.action);
  if (option.ev === undefined) {
    // Chart-based (preflop or legacy) options carry no EV.
    return option.verdict === "Preferred" ? "The standard play with this hand."
      : option.verdict === "Viable" ? "Played some of the time with this hand." : "Rarely the right play with this hand.";
  }
  if (kind === "raise" || kind === "all-in") {
    const info = foldAndCalledText(option);
    if (!info) return "Puts chips in to win the pot or build it.";
    const called = info.called ? ` and you have about ${info.called} to win when called` : "";
    const tail = option.verdict === "Costly" ? ", which is too little for the chips at risk" : "";
    return `We estimate ${info.fold} fold right away${called}${tail}.`;
  }
  if (kind === "call") {
    if (review.equity === undefined) return "Pays the price to see more cards.";
    return review.equity >= review.potOdds
      ? `Pays ${pct(review.potOdds)} for about ${pct(review.equity)} equity, which is a fair price.`
      : `Pays ${pct(review.potOdds)} for about ${pct(review.equity)} equity, which is short of the price.`;
  }
  if (kind === "fold") {
    return review.equity !== undefined && review.equity >= review.potOdds
      ? "Gives up a hand that had enough equity for the price."
      : "Saves chips when the price is higher than your chances.";
  }
  return option.verdict === "Costly" ? "Gives up value you could have earned." : "Keeps the pot small and lets weaker hands stay in.";
}

function tagFor(grade: Alternative["verdict"], yours: boolean): DecisionExplanation["options"][number]["tag"] {
  if (grade === "Preferred") return yours ? "Best · your move" : "Best";
  if (grade === "Viable") return yours ? "Your move" : "Also fine";
  return "Mistake";
}

function sortOptions(alternatives: Alternative[]) {
  const rank = { Preferred: 0, Viable: 1, Costly: 2 };
  return [...alternatives].sort((a, b) => {
    if (a.ev !== undefined && b.ev !== undefined) return b.ev - a.ev;
    return rank[a.verdict] - rank[b.verdict] || (b.frequency ?? 0) - (a.frequency ?? 0);
  });
}

/** The learner's exact chance to win against known cards, counting ties as halves. Only used for flop and later. */
function exactEquity(hero: Card[], villain: Card[], board: Card[]): number | null {
  if (board.length < 3 || hero.length !== 2 || villain.length !== 2) return null;
  const used = new Set([...hero, ...villain, ...board].map(cardLabel));
  const deck = makeDeck().filter((card) => !used.has(cardLabel(card)));
  const need = 5 - board.length;
  let wins = 0;
  let runs = 0;
  const score = (cards: Card[]) => evaluateHand(cards).score;
  const finish = (extra: Card[]) => {
    const full = [...board, ...extra];
    const result = compareScores(score([...hero, ...full]), score([...villain, ...full]));
    wins += result > 0 ? 1 : result === 0 ? 0.5 : 0;
    runs += 1;
  };
  if (need === 0) finish([]);
  else if (need === 1) deck.forEach((card) => finish([card]));
  else for (let a = 0; a < deck.length - 1; a += 1) for (let b = a + 1; b < deck.length; b += 1) finish([deck[a], deck[b]]);
  return wins / runs;
}

function resultNote(review: ReviewItem, context: ExplainContext, kind: Kind): string | undefined {
  if (!context.revealed || context.revealed.length !== 2 || !context.opponentName) return undefined;
  const equity = exactEquity(review.cards, context.revealed, review.board);
  if (equity === null) return undefined;
  const folded = kind === "fold";
  // Only say something when the cards add a lesson about luck: you folded a winner, or you put chips in while behind.
  const surprising = folded ? equity >= 0.5 : equity < 0.5;
  if (!surprising) return undefined;
  const held = `${context.opponentName} held ${context.revealed.map(cardLabel).join(" ")}.`;
  const chance = equity < 0.01 ? "almost no chance to win" : equity > 0.99 ? "almost certain to win" : `about ${pct(equity)} to win`;
  const against = folded
    ? `Against those exact cards, your hand was ahead at that point: ${chance}.`
    : `Against those exact cards, you were behind at that point: ${chance}.`;
  const lead = context.outcome ? `${context.outcome} ` : "";
  return `${lead}${held} ${against} That is the result. It doesn’t change which decision was better, because you could not see those cards.`;
}

export function explainDecision(review: ReviewItem, context: ExplainContext = {}): DecisionExplanation {
  const current = review.modelVersion === "public-coach-v2";
  const verdict = review.grade === "Preferred" ? "good" : review.grade === "Viable" ? "reasonable" : "mistake";
  const options = sortOptions(review.alternatives);
  const user = options.find((option) => sameAction(review.action, option.action));
  const best = options.filter((option) => option.verdict === "Preferred");
  const kind = kindOf(review.action);
  const closeLowConfidence = review.confidence === "Low" && user?.ev !== undefined && options[0]?.ev !== undefined
    && options[0].ev - user.ev <= Math.max(1.5, review.pot * 0.045);
  const tied = verdict === "good" && (best.length > 1 || closeLowConfidence);
  const opp = context.opponentName ?? (review.opponents > 1 ? "your opponents" : "your opponent");
  const leads = context.opponentName ? `${context.opponentName} leads with here` : review.opponents > 1 ? "your opponents continue with" : "your opponent leads with here";
  const c: Computed = { review, options, user, best, opp, leads };

  // Verdict
  const bestKinds = [...new Set(best.map((option) => kindOf(option.action)))];
  const sizeMatters = bestKinds.length === 1 && bestKinds[0] === kind;
  const betterText = bestKinds.length === 0 ? "Another line"
    : joinOr(bestKinds.map((k, i) => {
      const text = betterPhrase(best.find((option) => kindOf(option.action) === k)!, sizeMatters);
      return i === 0 ? capitalize(text) : text;
    }));
  let verdictText: string;
  let tag: string;
  if (verdict === "good") {
    const closeKinds = [kind, ...bestKinds.filter((k) => k !== kind)];
    verdictText = tied && closeKinds.length > 1 ? `Good. ${capitalize(joinList(closeKinds.map((k) => GERUND[k].toLowerCase())))} are close here.` : "Good.";
    tag = "Good";
  } else {
    verdictText = `${verdict === "reasonable" ? "Reasonable" : "Mistake"}. ${betterText} was better.`;
    tag = verdict === "mistake" ? "Mistake" : bestKinds.length === 1 ? `${kindLabel(bestKinds[0], best[0])} better` : "Other line better";
  }

  // Options: the best of each kind, plus the move that was made.
  const seen = new Set<Kind>();
  const shown = options.filter((option) => {
    const k = kindOf(option.action);
    const yours = option === user;
    if (yours) { seen.add(k); return true; }
    if (seen.has(k) || (k === kind && user)) return false;
    seen.add(k);
    return true;
  });
  const rows = shown.map((option) => {
    const yours = option === user;
    const grade = yours ? review.grade : option.verdict;
    return {
      tag: tagFor(grade, yours),
      action: option.action,
      reason: current ? optionReason({ ...option, verdict: grade }, c) : legacyReason(grade),
      ...(yours ? { yours: true } : {}),
    };
  });
  if (!user) {
    rows.push({ tag: tagFor(review.grade, true), action: review.action, reason: legacyReason(review.grade), yours: true });
  }

  // Prose
  const paragraphs: string[] = [];
  if (!current) {
    paragraphs.push("This decision was saved by an earlier version of River Room, so its evaluation is short.");
    paragraphs.push(`The coach’s pick at the time was ${suggestionPhrase(review.suggestion)}.`);
  } else if (review.street === "preflop") {
    paragraphs.push(preflopSentence(review));
  } else {
    paragraphs.push(`${firstParagraph(c)}${kind === "raise" || kind === "all-in" ? betKind(user, review) : ""}`);
    const second = verdict === "good" && !tied ? null : secondParagraph(c, tied);
    if (second) paragraphs.push(second);
  }

  // Facts
  const facts: DecisionExplanation["facts"] = [];
  if (review.toCall > 0) facts.push({ label: "Price to call", value: pct(review.potOdds) });
  if (review.equity !== undefined && review.street !== "preflop") {
    facts.push({ label: context.opponentName ? `Your equity vs ${context.opponentName}’s likely hands` : "Your equity vs their likely hands", value: `≈ ${pct(review.equity)}` });
  }
  facts.push({ label: "Effective stack", value: money(review.effectiveStack) });
  if (context.opponentName && context.opponentStyle) facts.push({ label: context.opponentName, value: context.opponentStyle });

  const note = current && review.street !== "preflop" ? resultNote(review, context, kind) : undefined;
  return {
    verdict,
    verdictText,
    headline: current && review.street !== "preflop" ? headline(review) : preflopHeadline(review),
    tag,
    paragraphs,
    options: rows,
    facts: facts.slice(0, 4),
    ...(note ? { resultNote: note } : {}),
  };
}

function preflopHeadline(review: ReviewItem) {
  const kind = kindOf(review.action);
  const amount = review.action.match(/\$(\d+)/)?.[1];
  const hand = review.cards.map(cardLabel).join("");
  const text = kind === "raise" ? `You raised to $${amount}` : kind === "call" ? (review.toCall > 0 ? `You called ${money(review.toCall)}` : "You checked")
    : kind === "all-in" ? `You moved all-in${amount ? ` for $${amount}` : ""}` : kind === "check" ? "You checked" : "You folded";
  return `${text} with ${hand} from ${positionPhrase(review.position)}`;
}

function legacyReason(grade: Alternative["verdict"]) {
  return grade === "Preferred" ? "Rated best by the earlier coach." : grade === "Viable" ? "Rated reasonable by the earlier coach." : "Rated a mistake by the earlier coach.";
}
