import { emptyStats, emptyTrainingSummary } from "./rules";
import { type HandState } from "./types";

export function isValidSavedState(value: unknown): value is HandState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<HandState>;
  return candidate.version === 9
    && typeof candidate.raiseCount === "number"
    && Array.isArray(candidate.actionLog)
    && Array.isArray(candidate.players)
    && candidate.players.length === 6
    && candidate.players.every((player) => typeof player.stats?.preflopFolds === "number")
    && Array.isArray(candidate.deck)
    && Array.isArray(candidate.board)
    && Array.isArray(candidate.reviews)
    && Array.isArray(candidate.reviewArchive)
    && Array.isArray(candidate.trainingDecisions)
    && Boolean(candidate.trainingSummary)
    && typeof candidate.sessionRake === "number";
}

export function migrateSavedState(value: unknown): HandState | null {
  if (isValidSavedState(value)) return value;
  if (!value || typeof value !== "object") return null;
  const legacy = value as Omit<Partial<HandState>, "version"> & { version?: number };
  if (![4, 5, 6, 7, 8].includes(legacy.version ?? 0) || !Array.isArray(legacy.players) || legacy.players.length !== 6) return null;
  const migrated = {
    ...legacy,
    version: 9,
    players: legacy.players.map((player) => ({
      ...player,
      stats: { ...emptyStats(), ...player.stats },
    })),
    preflopRaises: legacy.preflopRaises ?? (legacy.street === "preflop" ? legacy.raiseCount ?? 0 : 0),
    preflopOpener: legacy.preflopOpener ?? null,
    preflopAggressor: legacy.preflopAggressor ?? null,
    lastAggressor: legacy.lastAggressor ?? null,
    actionLog: legacy.actionLog ?? [],
    reviews: [],
    reviewArchive: [],
    trainingDecisions: legacy.trainingDecisions ?? [],
    trainingSummary: legacy.trainingSummary ?? emptyTrainingSummary(),
    sessionRake: legacy.sessionRake ?? 0,
  } as HandState;
  // A v4 in-progress hand lacks the public action sequence required by the
  // new range model. Preserve bankroll and statistics, then begin a clean hand.
  if (legacy.version === 4 && migrated.status === "playing") {
    migrated.status = "handOver";
    migrated.players.forEach((player) => {
      player.stack += player.committed;
      player.committed = 0;
      player.streetBet = 0;
    });
    migrated.result = "Strategy engine upgraded · deal a fresh hand";
    migrated.currentActor = -1;
  }
  return isValidSavedState(migrated) ? migrated : null;
}
