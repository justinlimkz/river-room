import { SUITS, VALUES, cardLabel, evaluateHand, makeDeck } from "./cards";
import { type BoardProfile, type Card, type FlopTexture, type StrategicHandClass, type Suit, type TurnBucket } from "./types";

export function boardWetness(board: Card[]) {
  if (board.length < 3) return 0.5;
  const suitCounts = new Map<Suit, number>();
  board.forEach((card) => suitCounts.set(card.suit, (suitCounts.get(card.suit) ?? 0) + 1));
  const suitedness = Math.max(...suitCounts.values()) >= 3 ? 0.35 : Math.max(...suitCounts.values()) === 2 ? 0.18 : 0;
  const values = [...new Set(board.map((card) => VALUES[card.rank]))].sort((a, b) => a - b);
  const connected = values.some((value, index) => index > 0 && value - values[index - 1] <= 2) ? 0.3 : 0;
  const paired = values.length < board.length ? -0.12 : 0;
  return Math.max(0, Math.min(1, 0.25 + suitedness + connected + paired));
}

export function handFeatures(hole: Card[], board: Card[]) {
  const all = [...hole, ...board];
  const suitCounts = new Map<Suit, number>();
  all.forEach((card) => suitCounts.set(card.suit, (suitCounts.get(card.suit) ?? 0) + 1));
  const flushDraw = board.length < 5 && Math.max(...suitCounts.values()) === 4;
  const values = [...new Set(all.map((card) => VALUES[card.rank]))];
  if (values.includes(14)) values.push(1);
  let straightDraw = false;
  for (let start = 1; start <= 10; start += 1) {
    const hits = Array.from({ length: 5 }, (_, offset) => start + offset).filter((value) => values.includes(value)).length;
    if (hits >= 4 && board.length < 5) straightDraw = true;
  }
  const boardHigh = Math.max(0, ...board.map((card) => VALUES[card.rank]));
  const overcards = hole.filter((card) => VALUES[card.rank] > boardHigh).length;
  const made = evaluateHand(all).score[0];
  const holePair = hole.length === 2 && hole[0].rank === hole[1].rank;
  const pairsBoard = hole.some((card) => board.some((boardCard) => boardCard.rank === card.rank));
  const madeWithHole = holePair || pairsBoard || made >= 2;
  const blocker = hole.some((card) => VALUES[card.rank] === 14 && suitCounts.get(card.suit)! >= 3);
  return { flushDraw, straightDraw, overcards, made, madeWithHole, blocker, draw: flushDraw || straightDraw };
}

export function analyzeBoard(board: Card[]): BoardProfile {
  const ranks = board.map((card) => VALUES[card.rank]);
  const uniqueRanks = [...new Set(ranks)];
  const suits = new Map<Suit, number>();
  board.forEach((card) => suits.set(card.suit, (suits.get(card.suit) ?? 0) + 1));
  const maxSuit = Math.max(0, ...suits.values());
  const wheelRanks = uniqueRanks.includes(14) ? [...uniqueRanks, 1] : uniqueRanks;
  let fourStraight = false;
  for (let start = 1; start <= 10; start += 1) {
    if (Array.from({ length: 5 }, (_, offset) => start + offset).filter((rank) => wheelRanks.includes(rank)).length >= 4) fourStraight = true;
  }
  const wetness = boardWetness(board);
  return {
    paired: uniqueRanks.length < board.length,
    monotone: board.length >= 3 && maxSuit === board.length,
    fourFlush: maxSuit >= 4,
    fourStraight,
    wetness,
    dynamic: board.length < 5 && (wetness >= 0.5 || maxSuit >= 2),
    highCard: Math.max(0, ...ranks),
  };
}

export function analyzeFlopTexture(board: Card[]): FlopTexture {
  const flop = board.slice(0, 3);
  const base = analyzeBoard(flop);
  const ranks = [...new Set(flop.map((card) => VALUES[card.rank]))].sort((a, b) => a - b);
  const span = ranks.length > 1 ? ranks.at(-1)! - ranks[0] : 0;
  const adjacent = ranks.slice(1).filter((rank, index) => rank - ranks[index] <= 2).length;
  const connectedness = Math.max(0, Math.min(1, adjacent * 0.34 + (span <= 5 ? 0.32 : span <= 8 ? 0.14 : 0)));
  const suitCount = Math.max(0, ...SUITS.map((suit) => flop.filter((card) => card.suit === suit).length));
  const tone: FlopTexture["tone"] = suitCount >= 3 ? "monotone" : suitCount === 2 ? "two-tone" : "rainbow";
  const band: FlopTexture["band"] = base.highCard === 14 ? "ace-high" : base.highCard === 13 ? "king-high" : base.highCard >= 9 ? "middle" : "low";
  const dynamic = !base.paired && (tone !== "rainbow" || connectedness >= 0.45);
  return { ...base, band, connectedness, tone, dynamic, stability: dynamic ? "dynamic" : "static" };
}

export function representativeTurnBuckets(hole: Card[], flop: Card[]): Record<TurnBucket, number> {
  const known = new Set([...hole, ...flop].map(cardLabel));
  const texture = analyzeFlopTexture(flop);
  const boardRanks = new Set(flop.map((card) => VALUES[card.rank]));
  const boardSuits = new Map<Suit, number>();
  flop.forEach((card) => boardSuits.set(card.suit, (boardSuits.get(card.suit) ?? 0) + 1));
  const buckets: Record<TurnBucket, number> = { blank: 0, overcard: 0, "flush-completing": 0, "straight-completing": 0, "board-pairing": 0, "draw-adding": 0 };
  for (const card of makeDeck()) {
    if (known.has(cardLabel(card))) continue;
    if (boardRanks.has(VALUES[card.rank])) buckets["board-pairing"] += 1;
    else if ((boardSuits.get(card.suit) ?? 0) >= 2) buckets["flush-completing"] += 1;
    else if (analyzeBoard([...flop, card]).fourStraight && !texture.fourStraight) buckets["straight-completing"] += 1;
    else if (VALUES[card.rank] > texture.highCard) buckets.overcard += 1;
    else if (analyzeFlopTexture([...flop.slice(0, 2), card]).dynamic && !texture.dynamic) buckets["draw-adding"] += 1;
    else buckets.blank += 1;
  }
  const total = Object.values(buckets).reduce((sum, count) => sum + count, 0) || 1;
  (Object.keys(buckets) as TurnBucket[]).forEach((bucket) => { buckets[bucket] /= total; });
  return buckets;
}

export function classifyStrategicHandWithProfile(hole: Card[], board: Card[], profile: BoardProfile): StrategicHandClass {
  const features = handFeatures(hole, board);
  const score = features.made;
  if (score >= 6 || (score >= 5 && !profile.fourFlush && !profile.fourStraight)) return "nuts";
  if (score >= 3 || (score === 2 && features.madeWithHole)) return "strong-value";
  if (features.flushDraw && features.straightDraw) return "combo-draw";
  const aceFlushDraw = features.flushDraw && hole.some((card) => card.rank === "A" && board.some((boardCard) => boardCard.suit === card.suit));
  if (aceFlushDraw) return "nut-draw";
  if (features.draw) return "draw";
  if (score === 2 || (score === 1 && features.madeWithHole && !profile.fourFlush && !profile.fourStraight)) return board.length === 5 ? "thin-value" : "bluff-catcher";
  if (score >= 1 || features.overcards > 0) return "showdown-value";
  if (features.blocker) return "blocker-bluff";
  return "air";
}

export function classifyStrategicHand(hole: Card[], board: Card[]): StrategicHandClass {
  return classifyStrategicHandWithProfile(hole, board, analyzeBoard(board));
}
