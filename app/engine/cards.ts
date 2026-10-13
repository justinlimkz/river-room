import { type Card, type Rank, type Suit } from "./types";

export const RANKS: Rank[] = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];

export const SUITS: Suit[] = ["clubs", "diamonds", "hearts", "spades"];

export const VALUES: Record<Rank, number> = { "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, T: 10, J: 11, Q: 12, K: 13, A: 14 };

export const cardLabel = (card: Card) => `${card.rank}${{ clubs: "♣", diamonds: "♦", hearts: "♥", spades: "♠" }[card.suit]}`;

export function makeDeck(): Card[] {
  return SUITS.flatMap((suit) => RANKS.map((rank) => ({ rank, suit })));
}

export function cryptoRandom() {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const value = new Uint32Array(1);
    crypto.getRandomValues(value);
    return value[0] / 4294967296;
  }
  return Math.random();
}

export function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

export function shuffledDeck(random = cryptoRandom): Card[] {
  const deck = makeDeck();
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [deck[index], deck[swap]] = [deck[swap], deck[index]];
  }
  return deck;
}

type HandScore = number[];

export function evaluateHand(cards: Card[]): { score: HandScore; name: string } {
  if (cards.length < 5) return { score: [0], name: "High card" };
  let best: { score: HandScore; name: string } | null = null;
  const combinations: Card[][] = [];
  for (let a = 0; a < cards.length - 4; a += 1)
    for (let b = a + 1; b < cards.length - 3; b += 1)
      for (let c = b + 1; c < cards.length - 2; c += 1)
        for (let d = c + 1; d < cards.length - 1; d += 1)
          for (let e = d + 1; e < cards.length; e += 1) combinations.push([cards[a], cards[b], cards[c], cards[d], cards[e]]);
  combinations.forEach((combo) => {
    const ranked = rankFive(combo);
    if (!best || compareScores(ranked.score, best.score) > 0) best = ranked;
  });
  return best!;
}

function rankFive(cards: Card[]) {
  const values = cards.map((card) => VALUES[card.rank]).sort((a, b) => b - a);
  const counts = new Map<number, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const flush = cards.every((card) => card.suit === cards[0].suit);
  const unique = [...new Set(values)];
  if (unique[0] === 14) unique.push(1);
  let straightHigh = 0;
  for (let i = 0; i <= unique.length - 5; i += 1) if (unique[i] - unique[i + 4] === 4) straightHigh = Math.max(straightHigh, unique[i]);
  if (flush && straightHigh) return { score: [8, straightHigh], name: straightHigh === 14 ? "Royal flush" : "Straight flush" };
  if (groups[0][1] === 4) return { score: [7, groups[0][0], groups[1][0]], name: "Four of a kind" };
  if (groups[0][1] === 3 && groups[1][1] >= 2) return { score: [6, groups[0][0], groups[1][0]], name: "Full house" };
  if (flush) return { score: [5, ...values], name: "Flush" };
  if (straightHigh) return { score: [4, straightHigh], name: "Straight" };
  if (groups[0][1] === 3) return { score: [3, groups[0][0], ...groups.slice(1).map(([value]) => value).sort((a, b) => b - a)], name: "Three of a kind" };
  if (groups[0][1] === 2 && groups[1][1] === 2) return { score: [2, Math.max(groups[0][0], groups[1][0]), Math.min(groups[0][0], groups[1][0]), groups[2][0]], name: "Two pair" };
  if (groups[0][1] === 2) return { score: [1, groups[0][0], ...groups.slice(1).map(([value]) => value).sort((a, b) => b - a)], name: "One pair" };
  return { score: [0, ...values], name: "High card" };
}

export function compareScores(a: HandScore, b: HandScore) {
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    if ((a[index] ?? 0) !== (b[index] ?? 0)) return (a[index] ?? 0) - (b[index] ?? 0);
  }
  return 0;
}
