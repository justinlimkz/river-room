"use client";

import { useEffect, useEffectEvent, useMemo, useState } from "react";
import {
  describeHand,
  humanSeat,
  legalBounds,
  potTotal,
  startHand,
  type PokerAction,
} from "./poker-engine";
import { ActionBar } from "./components/ActionBar";
import { formatChips, formatNet, resultLine } from "./components/format";
import { EmptySlot, PlayingCard } from "./components/PlayingCard";
import { ReviewPage } from "./components/ReviewPage";
import { SeatView } from "./components/SeatView";
import { SettingsPopover } from "./components/SettingsPopover";
import { decisionFacts, potRaiseTarget } from "./training";
import { useHandStart } from "./useHandStart";
import { useModalFocus } from "./useModalFocus";
import { usePokerEngine } from "./usePokerEngine";
import { useSavedSession } from "./useSavedSession";

// Keyboard shortcuts for the size presets.
const PRESET_FRACTIONS: Record<string, number> = { "5": 1 / 2, "7": 2 / 3, p: 1 };

export default function PokerTable() {
  const { state, setState, preferences, updatePreferences, storageWarning, resetSession } = useSavedSession();
  const { inBB, speed } = preferences;
  const [raiseTo, setRaiseTo] = useState<number | null>(null);
  const [reviewMode, setReviewMode] = useState<"current" | "history" | null>(null);
  const handStartStack = useHandStart(state);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const { run: runEngine, cancel: cancelEngine, busy, error: engineError } = usePokerEngine(setState);
  // The review is a full page, not a dialog, but the table stays paused while it is open.
  const modalOpen = Boolean(reviewMode || resetOpen);
  useModalFocus(resetOpen, () => setResetOpen(false));

  const bounds = useMemo(() => state ? legalBounds(state, humanSeat) : { toCall: 0, min: 0, max: 0, canRaise: false }, [state]);
  const humanTurn = state?.status === "playing" && state.currentActor === humanSeat && !busy && !paused && !modalOpen;
  const effectiveRaiseTo = Math.max(bounds.min, Math.min(bounds.max, Math.round(raiseTo ?? bounds.min)));

  const dealNext = () => {
    setReviewMode(null);
    setState((current) => current?.status === "handOver" ? startHand(current) : current);
  };

  const act = (action: PokerAction) => {
    if (!state || !humanTurn) return;
    setRaiseTo(null);
    runEngine(state, action);
  };

  // Bots act after a short, human-feeling pause.
  useEffect(() => {
    if (!state || state.status !== "playing" || state.currentActor < 0 || state.currentActor === humanSeat || busy || engineError || paused || modalOpen) return;
    const timer = window.setTimeout(() => runEngine(state), speed === "fast" ? 140 : 600 + Math.random() * 300);
    return () => window.clearTimeout(timer);
  }, [state, runEngine, busy, engineError, paused, modalOpen, speed]);

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (!state || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
    if ((event.target as HTMLElement).closest("input, textarea, select, [contenteditable=true]")) return;
    const key = event.key.toLowerCase();
    if (key === "escape") setSettingsOpen(false);
    if (reviewMode) {
      if (key === "v" || key === "escape") {
        event.preventDefault();
        setReviewMode(null);
      }
      if (key === "n" && state.status === "handOver") {
        event.preventDefault();
        dealNext();
      }
      return;
    }
    if (modalOpen || paused || busy) return;
    if (humanTurn) {
      if (bounds.canRaise && (key in PRESET_FRACTIONS || key === "a")) {
        event.preventDefault();
        setRaiseTo(key === "a" ? bounds.max : potRaiseTarget(state, humanSeat, PRESET_FRACTIONS[key]));
        return;
      }
      if (key === "f") act({ type: "fold" });
      if (key === "c") act(bounds.toCall ? { type: "call" } : { type: "check" });
      if (key === "r" && bounds.canRaise) act({ type: "raise", amount: effectiveRaiseTo });
      return;
    }
    if (state.status !== "handOver") return;
    if (key === "v" && state.reviews.length > 0) {
      event.preventDefault();
      setReviewMode("current");
    }
    if (key === "n") {
      event.preventDefault();
      dealNext();
    }
  });
  useEffect(() => {
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (!state) return <main className="loading">Shuffling the deck…</main>;

  const reset = () => {
    cancelEngine();
    setResetOpen(false);
    setPaused(false);
    setRaiseTo(null);
    setReviewMode(null);
    resetSession();
  };
  const hero = state.players[humanSeat];
  const pot = potTotal(state);
  const facts = decisionFacts(state, humanSeat);
  const chips = (amount: number) => formatChips(amount, inBB);
  const notice = storageWarning || engineError;
  const strength = state.board.length >= 3 && !hero.folded ? describeHand([...hero.hole, ...state.board]) : undefined;
  const presets = [
    { label: "½ pot", key: "5", value: potRaiseTarget(state, humanSeat, 1 / 2) },
    { label: "⅔ pot", key: "7", value: potRaiseTarget(state, humanSeat, 2 / 3) },
    { label: "Pot", key: "p", value: potRaiseTarget(state, humanSeat, 1) },
    { label: "All-in", key: "a", value: bounds.max },
  ];
  const waiting = state.status === "playing" && !humanTurn
    ? paused ? "Table paused" : `${state.players[state.currentActor]?.name ?? "Dealer"} is thinking…`
    : "";
  const net = facts.net;

  if (reviewMode && !resetOpen) {
    return <ReviewPage state={state} initial={reviewMode === "history" ? "list" : "hand"} handStartStack={handStartStack} onBack={() => setReviewMode(null)} onDeal={state.status === "handOver" ? dealNext : undefined} />;
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <strong className="wordmark">River Room</strong>
        <span className="table-meta mono">No-limit hold’em · $1/$2 · 6-max · Hand {state.handNumber}</span>
        <div className="header-actions">
          <span className="muted">Session</span>
          <span className={`mono net ${net > 0 ? "up" : net < 0 ? "down" : ""}`}>{formatNet(net, inBB)}</span>
          <button className="ghost" onClick={() => setReviewMode("history")} disabled={state.reviewArchive.length === 0}>Past hands</button>
          <button className="ghost icon-button" aria-label="Settings" aria-expanded={settingsOpen} onClick={() => setSettingsOpen(!settingsOpen)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" /></svg>
          </button>
          {settingsOpen && <SettingsPopover speed={speed} inBB={inBB} paused={paused} onSpeed={(value) => updatePreferences({ speed: value })} onUnits={() => updatePreferences({ inBB: !inBB })} onPause={() => setPaused(!paused)} onReset={() => { setSettingsOpen(false); setResetOpen(true); }} onClose={() => setSettingsOpen(false)} />}
        </div>
      </header>
      {notice && <div className="app-notice" role="alert">{notice}{engineError && state.currentActor !== humanSeat && <button onClick={() => runEngine(state)}>Retry</button>}</div>}

      <div className="stage">
        <section className="table" aria-label="Poker table">
          <div className="oval" />
          <div className="table-center">
            {state.status === "playing" && <div className="pot mono">Pot <b>{chips(pot)}</b></div>}
            <div className="board" aria-label="Community cards">
              {Array.from({ length: 5 }, (_, index) => state.board[index] ? <PlayingCard card={state.board[index]} key={index} /> : <EmptySlot key={index} />)}
            </div>
            <div className="street-name">{state.status === "playing" ? state.street : "Hand over"}</div>
          </div>
          {state.players.map((player, index) => <SeatView key={player.id} player={player} index={index} state={state} inBB={inBB} strength={strength} />)}
        </section>

        {state.status === "playing" ? (
          <div className="action-wrap">
            <p className="waiting" aria-live="polite">{waiting}</p>
            <ActionBar
              enabled={humanTurn}
              canRaise={bounds.canRaise}
              facing={bounds.toCall > 0}
              isBet={state.currentBet > 0}
              callAmount={facts.call}
              allInCall={facts.call === hero.stack}
              min={bounds.min}
              max={bounds.max}
              raiseTo={effectiveRaiseTo}
              presets={presets}
              inBB={inBB}
              onRaiseTo={setRaiseTo}
              onFold={() => act({ type: "fold" })}
              onCall={() => act(bounds.toCall ? { type: "call" } : { type: "check" })}
              onRaise={() => act({ type: "raise", amount: effectiveRaiseTo })}
            />
          </div>
        ) : (
          <section className="hand-over" aria-live="polite">
            <p>{resultLine(state)}</p>
            <div>
              {state.reviews.length > 0 && <button className="ghost" onClick={() => setReviewMode("current")}>Review hand</button>}
              {state.status === "busted"
                ? <button className="brass-button" onClick={() => setResetOpen(true)}>Reset bankroll</button>
                : <button className="brass-button" onClick={dealNext}>Deal next hand</button>}
            </div>
          </section>
        )}
      </div>

      {resetOpen && <div className="dialog-overlay" role="dialog" aria-modal="true" aria-labelledby="reset-title"><div className="dialog"><h2 id="reset-title">Start a fresh session?</h2><p>This resets your bankroll, statistics and saved decision history on this device.</p><div className="dialog-actions"><button className="ghost" onClick={() => setResetOpen(false)}>Keep playing</button><button className="brass-button" onClick={reset}>Reset session</button></div></div></div>}
    </main>
  );
}
