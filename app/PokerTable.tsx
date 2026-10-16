"use client";

import { useEffect, useEffectEvent, useMemo, useState } from "react";
import {
  cardLabel,
  evaluateHand,
  humanSeat,
  legalBounds,
  potTotal,
  startHand,
  toCallFor,
  type PokerAction,
} from "./poker-engine";
import { formatChips } from "./components/format";
import { PlayingCard } from "./components/PlayingCard";
import { ReviewPanel } from "./components/ReviewPanel";
import { SeatView } from "./components/SeatView";
import { SettingsPopover } from "./components/SettingsPopover";
import { decisionFacts, potRaiseTarget } from "./training";
import { useModalFocus } from "./useModalFocus";
import { usePokerEngine } from "./usePokerEngine";
import { useSavedSession } from "./useSavedSession";

const PRESET_FRACTIONS: Record<string, number> = { "5": 0.5, "7": 0.75, p: 1 };

export default function PokerTable() {
  const { state, setState, preferences, updatePreferences, storageWarning, resetSession } = useSavedSession();
  const { inBB, speed } = preferences;
  const [raiseTo, setRaiseTo] = useState<string | null>(null);
  const [reviewMode, setReviewMode] = useState<"current" | "history" | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const { run: runEngine, cancel: cancelEngine, busy, error: engineError } = usePokerEngine(setState);
  const modalOpen = Boolean(reviewMode || resetOpen);
  const closeModals = () => { setReviewMode(null); setResetOpen(false); };
  useModalFocus(modalOpen, closeModals);

  const bounds = useMemo(() => state ? legalBounds(state, humanSeat) : { toCall: 0, min: 0, max: 0, canRaise: false }, [state]);
  const humanTurn = state?.status === "playing" && state.currentActor === humanSeat && !busy && !paused && !modalOpen;
  const raiseInputValue = raiseTo ?? String(bounds.min);
  const enteredRaise = raiseInputValue.trim() === "" ? Number.NaN : Number(raiseInputValue);
  const effectiveRaiseTo = Number.isFinite(enteredRaise) ? Math.max(bounds.min, Math.min(bounds.max, Math.round(enteredRaise))) : bounds.min;

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
    if (reviewMode && key === "v") {
      event.preventDefault();
      setReviewMode(null);
      return;
    }
    if (event.key === "Escape") setSettingsOpen(false);
    if (modalOpen || paused || busy) return;
    if (humanTurn) {
      if (bounds.canRaise && (key in PRESET_FRACTIONS || key === "a")) {
        event.preventDefault();
        setRaiseTo(String(key === "a" ? bounds.max : potRaiseTarget(state, humanSeat, PRESET_FRACTIONS[key])));
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
      setState((current) => current?.status === "handOver" ? startHand(current) : current);
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
  const toCall = toCallFor(state, humanSeat);
  const pot = potTotal(state);
  const liveHand = evaluateHand([...hero.hole, ...state.board]);
  const quickRaise = (fraction: number) => potRaiseTarget(state, humanSeat, fraction);
  const facts = decisionFacts(state, humanSeat);
  const chips = (amount: number) => formatChips(amount, inBB);
  const pastReviews = [...state.reviewArchive, ...(state.status === "playing" ? [] : state.reviews)];
  const notice = storageWarning || engineError;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><div><strong>River Room</strong><small>Hold’em trainer</small></div></div>
        <div className="table-meta"><span>6-MAX CASH</span><b>$1 / $2 NL</b><span>100 BB BUY-IN</span></div>
        <div className="header-actions">
          <button onClick={() => setReviewMode("history")} disabled={pastReviews.length === 0}>Past hands</button>
          <button className="icon-button" aria-label="Settings" aria-expanded={settingsOpen} onClick={() => setSettingsOpen(!settingsOpen)}>⚙</button>
          {settingsOpen && <SettingsPopover speed={speed} inBB={inBB} paused={paused} onSpeed={(value) => updatePreferences({ speed: value })} onUnits={() => updatePreferences({ inBB: !inBB })} onPause={() => setPaused(!paused)} onReset={() => { setSettingsOpen(false); setResetOpen(true); }} onClose={() => setSettingsOpen(false)} />}
        </div>
      </header>

      {notice && <div className="app-notice" role="alert">{notice}{engineError && state.currentActor !== humanSeat && <button onClick={() => runEngine(state)}>Retry</button>}</div>}
      <div className="game-layout">
        <section className="table-zone" aria-label="Poker table">
          <div className="poker-table">
            <div className="rail"><div className="felt">
              <div className="table-center">
                <div className="pot-label">TOTAL POT</div><div className="pot-value"><i />{chips(pot)}</div>
                <div className="community" aria-label="Community cards">
                  {Array.from({ length: 5 }, (_, index) => state.board[index] ? <PlayingCard card={state.board[index]} key={index} /> : <div className="card empty-card" key={index} />)}
                </div>
                <div className="street-line"><span>{state.street.toUpperCase()}</span><i /><span>HAND #{state.handNumber}</span></div>
              </div>
            </div></div>
            {state.players.map((player, index) => <SeatView key={player.id} player={player} index={index} state={state} inBB={inBB} />)}
          </div>

          <div className="status-strip" aria-live="polite">
            <div><span className="eyebrow">Current hand</span><strong>{state.status === "playing" ? (paused ? "Table paused" : busy ? "Processing decision…" : humanTurn ? "Action is on you" : `${state.players[state.currentActor]?.name ?? "Dealer"} is thinking`) : state.result}</strong></div>
            <div className="hero-hand"><span>{state.board.length >= 3 ? liveHand.name : "Your hole cards"}</span><strong>{hero.hole.map(cardLabel).join(" ")}</strong></div>
          </div>

          {state.status === "playing" ? (
            <section className={`action-dock ${humanTurn ? "ready" : "waiting"}`} aria-label="Poker actions">
              <div className="decision-context">
                <span>TO CALL <b>{chips(facts.call)}</b></span>
                <span title="At the start of this betting round, against the deepest live opponent; shorter opponents have individual effective stacks.">EFFECTIVE <b>{chips(facts.effective)}</b></span>
                <span>POSITION <b>{hero.position}</b></span>
              </div>
              <div className="action-buttons">
                <button className="fold" disabled={!humanTurn} onClick={() => act({ type: "fold" })}><kbd>F</kbd> Fold</button>
                <button disabled={!humanTurn} onClick={() => act(toCall ? { type: "call" } : { type: "check" })}><kbd>C</kbd> {toCall ? `Call ${chips(facts.call)}${facts.call === hero.stack ? " · all-in" : ""}` : "Check"}</button>
                <button className="primary" disabled={!humanTurn || !bounds.canRaise} onClick={() => act({ type: "raise", amount: effectiveRaiseTo })}><kbd>R</kbd> {state.currentBet ? "Raise to" : "Bet"} {chips(effectiveRaiseTo)}</button>
              </div>
              <div className="raise-tools">
                <div className="quick-sizes">
                  <button aria-keyshortcuts="5" disabled={!humanTurn || !bounds.canRaise} onClick={() => setRaiseTo(String(quickRaise(0.5)))} title="Set raise to 50% pot (5)"><kbd>5</kbd>50%</button>
                  <button aria-keyshortcuts="7" disabled={!humanTurn || !bounds.canRaise} onClick={() => setRaiseTo(String(quickRaise(0.75)))} title="Set raise to 75% pot (7)"><kbd>7</kbd>75%</button>
                  <button aria-keyshortcuts="P" disabled={!humanTurn || !bounds.canRaise} onClick={() => setRaiseTo(String(quickRaise(1)))} title="Set a pot-sized raise (P)"><kbd>P</kbd>Pot</button>
                  <button aria-keyshortcuts="A" disabled={!humanTurn || !bounds.canRaise} onClick={() => setRaiseTo(String(bounds.max))} title="Set raise to all-in (A)"><kbd>A</kbd>All-in</button>
                </div>
                <input aria-label="Raise amount" type="range" min={bounds.min} max={Math.max(bounds.min, bounds.max)} value={effectiveRaiseTo} disabled={!humanTurn || !bounds.canRaise} onChange={(event) => setRaiseTo(event.target.value)} />
                <label className="raise-input"><span>{state.currentBet ? "Raise to" : "Bet"} ($)</span><input aria-label="Wager target in dollars" type="number" step="1" min={bounds.min} max={bounds.max} value={raiseInputValue} disabled={!humanTurn || !bounds.canRaise} onChange={(event) => setRaiseTo(event.target.value)} onBlur={() => setRaiseTo(String(effectiveRaiseTo))} /></label>
              </div>
            </section>
          ) : (
            <section className="between-hands">
              <div><span className="eyebrow">Hand complete</span><h2>{state.result}</h2><p>Your stack: ${hero.stack} · Session: {state.sessionHands} hands</p></div>
              <div>
                {state.reviews.length > 0 && <button onClick={() => setReviewMode("current")}><kbd>V</kbd> Review decisions</button>}
                {state.status === "busted"
                  ? <button className="primary" onClick={() => setResetOpen(true)}>Reset bankroll</button>
                  : <button className="primary" onClick={() => setState(startHand(state))}><kbd>N</kbd> Deal next hand</button>}
              </div>
            </section>
          )}
        </section>

      </div>
      {reviewMode && <ReviewPanel
        key={reviewMode}
        items={reviewMode === "current" ? state.reviews : pastReviews.slice(-120).reverse()}
        title={reviewMode === "current" ? `Hand #${state.handNumber} debrief` : "Past hands"}
        onClose={() => setReviewMode(null)}
      />}
      {resetOpen && <div className="review-overlay" role="dialog" aria-modal="true" aria-labelledby="reset-title"><div className="review-panel reset-panel"><h2 id="reset-title">Start a fresh session?</h2><p>This resets your bankroll, statistics and saved decision history on this device.</p><div className="review-navigation"><button onClick={() => setResetOpen(false)}>Keep playing</button><button onClick={reset}>Reset session</button></div></div></div>}
    </main>
  );
}
