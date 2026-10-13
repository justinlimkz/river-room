export type Suit = "clubs" | "diamonds" | "hearts" | "spades";

export type Rank = "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "T" | "J" | "Q" | "K" | "A";

export type Card = { rank: Rank; suit: Suit };

export type Position = "BTN" | "BTN/SB" | "SB" | "BB" | "UTG" | "HJ" | "CO";

export type Street = "preflop" | "flop" | "turn" | "river";

export type ActionKind = "fold" | "check" | "call" | "raise" | "all-in";

export type BotProfile = "balanced" | "tag" | "lag" | "nit" | "caller";

export type PokerAction = { type: ActionKind; amount?: number };

export type ActionValidation = { legal: boolean; reason: string; target?: number };

export type ActionEvaluation = {
  action: PokerAction;
  label: string;
  ev: number;
  evLow: number;
  evHigh: number;
  rangeEquity?: number;
  evMethod?: "terminal-enumeration" | "terminal-sampling" | "heuristic";
  foldProbability?: number;
  equityWhenCalled?: number;
  raiseProbability?: number;
};

export type StrategicHandClass = "nuts" | "strong-value" | "thin-value" | "bluff-catcher" | "combo-draw" | "nut-draw" | "draw" | "showdown-value" | "blocker-bluff" | "air";

export type BoardProfile = {
  paired: boolean;
  monotone: boolean;
  fourFlush: boolean;
  fourStraight: boolean;
  wetness: number;
  dynamic: boolean;
  highCard: number;
};

export type FlopTexture = BoardProfile & {
  band: "ace-high" | "king-high" | "middle" | "low";
  connectedness: number;
  tone: "rainbow" | "two-tone" | "monotone";
  stability: "static" | "dynamic";
};

export type TurnBucket = "blank" | "overcard" | "flush-completing" | "straight-completing" | "board-pairing" | "draw-adding";

export type FlopStrategyModule = "value" | "cbet-suppression" | "range-bet" | "check-raise" | "defense";

export type FlopStrategicContext = {
  texture: FlopTexture;
  handClass: StrategicHandClass;
  rangeAdvantage: number;
  nutAdvantage: number;
  valueDensity: number;
  drawDensity: number;
  turnBuckets: Record<TurnBucket, number>;
};

export type RangeCombo = { cards: [Card, Card]; weight: number; handClass: StrategicHandClass; showdownShare?: number };

export type RangeLedger = Record<number, RangeCombo[]>;

export type LeakKey = "bb-defense" | "preflop-aggression" | "three-bet-defense" | "missed-value" | "thin-value" | "bluff-selection" | "calling-price" | "bet-sizing";

export type LeakStat = { opportunities: number; mistakes: number; totalRegret: number };

export type TrainingDecision = {
  id: string;
  handNumber: number;
  street: Street;
  position: Position;
  chosenAction: string;
  recommendedAction: string;
  concept: string;
  leakKey: LeakKey;
  estimatedRegret: number;
  confidence: "High" | "Medium" | "Low";
};

export type TrainingSummary = Record<LeakKey, LeakStat>;

export type PlayerStats = {
  hands: number;
  vpip: number;
  pfr: number;
  aggression: number;
  preflopFolds: number;
  preflopCalls: number;
  preflopRaises: number;
  preflopChecks: number;
  threeBetOpportunities: number;
  threeBets: number;
  postflopFolds: number;
  postflopCalls: number;
  postflopRaises: number;
  postflopChecks: number;
  flopsSeen: number;
  handsWon: number;
  showdowns: number;
  showdownWins: number;
};

export type PublicAction = {
  street: Street;
  seat: number;
  type: ActionKind;
  amount: number;
  toCallBefore: number;
  raiseLevel: number;
  potBefore?: number;
};

export type Seat = {
  id: string;
  name: string;
  isHuman: boolean;
  profile: BotProfile;
  stack: number;
  streetBet: number;
  committed: number;
  hole: Card[];
  folded: boolean;
  allIn: boolean;
  acted: boolean;
  actedAtBet: number | null;
  voluntaryPreflop: boolean;
  raisedPreflop: boolean;
  lastAction: string;
  position: Position;
  stats: PlayerStats;
};

export type ReviewItem = {
  modelVersion?: "public-coach-v2";
  validationStatus?: "unvalidated";
  id: string;
  handNumber: number;
  street: Street;
  position: Position;
  cards: Card[];
  board: Card[];
  pot: number;
  toCall: number;
  effectiveStack: number;
  spr: number;
  opponents: number;
  actionLine: string[];
  action: string;
  equity?: number;
  equityLow?: number;
  equityHigh?: number;
  equityLabel: "Equity vs modeled ranges" | "Preflop reference";
  potOdds: number;
  grade: "Preferred" | "Viable" | "Costly";
  suggestion: string;
  concept: string;
  takeaway: string;
  alternatives: Array<{ action: string; verdict: "Preferred" | "Viable" | "Costly"; reason: string; frequency?: number; ev?: number; evLow?: number; evHigh?: number; foldProbability?: number; equityWhenCalled?: number }>;
  recommendedSize?: { target: number; min: number; max: number };
  note: string;
  confidence?: "High" | "Medium" | "Low";
  basis?: string;
  estimatedRegret?: number;
};

export type HandState = {
  version: 9;
  handNumber: number;
  dealer: number;
  street: Street;
  deck: Card[];
  board: Card[];
  players: Seat[];
  currentBet: number;
  minRaise: number;
  raiseCount: number;
  preflopRaises: number;
  preflopOpener: number | null;
  preflopAggressor: number | null;
  lastAggressor: number | null;
  actionLog: PublicAction[];
  currentActor: number;
  status: "playing" | "handOver" | "busted";
  history: string[];
  reviews: ReviewItem[];
  reviewArchive: ReviewItem[];
  trainingDecisions: TrainingDecision[];
  trainingSummary: TrainingSummary;
  result: string;
  sessionStart: number;
  sessionHands: number;
  sessionRake: number;
};

export type PublicGameView = Pick<HandState, "street" | "board" | "currentBet" | "minRaise"> & {
  pot: number;
  activePlayers: number;
  seat: Pick<Seat, "stack" | "streetBet" | "position" | "stats">;
};

export type BotDecisionContext = PublicGameView & {
  seatIndex: number;
  opponents: number[];
  opener: number | null;
  aggressor: number | null;
  facingPosition: Position | null;
  inPosition: boolean;
  callers: number;
  limpers: number;
  effectiveStack: number;
  spr: number;
  potType: "limped" | "single-raised" | "three-bet" | "four-bet-plus";
  actions: PublicAction[];
};
