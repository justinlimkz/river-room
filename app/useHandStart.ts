"use client";
import { useEffect, useState } from "react";
import { humanSeat, type HandState } from "./poker-engine";

const KEY = "riverroom-hand-start-v1";
type Start = { hand: number; stack: number };

/**
 * The player's stack when the current hand began, so the hand's net result can be shown after it ends.
 * During a hand it is stack + committed; the value is also kept beside (not inside) the saved session
 * so it survives a reload while the hand is being reviewed.
 */
export function useHandStart(state: HandState | null): number | null {
  const [saved, setSaved] = useState<Start | null>(null);
  const hero = state?.players[humanSeat];
  const live = state?.status === "playing" && hero ? { hand: state.handNumber, stack: hero.stack + hero.committed } : null;
  const liveHand = live?.hand;
  const liveStack = live?.stack;

  useEffect(() => {
    if (liveHand !== undefined && liveStack !== undefined) {
      try { localStorage.setItem(KEY, JSON.stringify({ hand: liveHand, stack: liveStack })); } catch { /* Optional. */ }
      return;
    }
    try {
      const value = JSON.parse(localStorage.getItem(KEY) ?? "null");
      if (typeof value?.hand === "number" && typeof value?.stack === "number") queueMicrotask(() => setSaved(value));
    } catch { /* Ignore unreadable data. */ }
  }, [liveHand, liveStack]);

  if (live) return live.stack;
  return state && saved?.hand === state.handNumber ? saved.stack : null;
}
