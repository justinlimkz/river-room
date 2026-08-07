"use client";

import { useEffect, useMemo, useState } from "react";
import {
  applyAction,
  cardLabel,
  createSession,
  decideBot,
  evaluateHand,
  humanSeat,
  isValidSavedState,
  legalBounds,
  potTotal,
  startHand,
  toCallFor,
  type Card,
  type HandState,
  type PokerAction,
  type Seat,
} from "./poker-engine";

const STORAGE_KEY = "riverroom-session-v3";
const SYMBOLS = { clubs: "♣", diamonds: "♦", hearts: "♥", spades: "♠" };
const SEAT_CLASS = ["seat top-left", "seat top-center", "seat top-right", "seat mid-right", "seat mid-left", "seat hero"];

function PlayingCard({ card, hidden = false, small = false }: { card?: Card; hidden?: boolean; small?: boolean }) {
  if (hidden || !card) return <div className={`card card-back ${small ? "small" : ""}`} aria-label="Face-down card"><span>RR</span></div>;
  const red = card.suit === "hearts" || card.suit === "diamonds";
  return (
    <div className={`card ${red ? "red" : "black"} ${small ? "small" : ""}`} aria-label={cardLabel(card)}>
      <strong>{card.rank}</strong><span>{SYMBOLS[card.suit]}</span>
    </div>
  );
}

function SeatView({ player, index, state }: { player: Seat; index: number; state: HandState }) {
  const showCards = player.isHuman || (state.status !== "playing" && !player.folded && !state.result.includes("uncontested"));
  const active = state.currentActor === index;
  return (
    <section className={`${SEAT_CLASS[index]} ${player.folded ? "folded" : ""} ${active ? "active" : ""}`} aria-label={`${player.name}, ${player.position}`}>
      <div className="seat-cards" aria-hidden={!showCards}>
        {player.hole.map((card, cardIndex) => <PlayingCard key={cardIndex} card={card} hidden={!showCards} small={!player.isHuman} />)}
      </div>
      <div className="seat-panel">
        <div className="seat-topline"><strong>{player.name}</strong><span className="position">{player.position}</span></div>
        <div className="stack"><i />${player.stack}</div>
        <div className="seat-action">{active ? <><b className="pulse" />Thinking</> : player.lastAction || "Ready"}</div>
        {!player.isHuman && player.stats.hands > 3 && (
          <div className="stats" title="Voluntarily put money in pot / preflop raise">
            VPIP {Math.round((player.stats.vpip / player.stats.hands) * 100)} · PFR {Math.round((player.stats.pfr / player.stats.hands) * 100)}
          </div>
        )}
      </div>
      {player.committed > 0 && <div className="wager"><i />${player.committed}</div>}
      {index === state.dealer && <div className="dealer" title="Dealer button">D</div>}
    </section>
  );
}

function ReviewPanel({ state, onClose }: { state: HandState; onClose: () => void }) {
  return (
    <div className="review-overlay" role="dialog" aria-modal="true" aria-labelledby="review-title">
      <div className="review-panel">
        <div className="review-header">
          <div><span className="eyebrow">Post-hand review</span><h2 id="review-title">Decision debrief</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Close review">×</button>
        </div>
        <p className="review-disclaimer">Range-based estimates only — useful for practice, not solver-grade GTO advice.</p>
        {state.reviews.length === 0 ? <p className="empty">You didn’t face a decision in this hand.</p> : (
          <div className="review-list">
            {state.reviews.map((item, index) => (
              <article className="review-item" key={`${item.street}-${index}`}>
                <div className="review-item-top"><span>{item.street} · {item.position}</span><b className={`grade ${item.grade.toLowerCase()}`}>{item.grade}</b></div>
                <div className="review-metrics">
                  <div><small>Your action</small><strong>{item.action}</strong></div>
                  <div><small>Est. equity</small><strong>{Math.round(item.equity * 100)}%</strong></div>
                  <div><small>Pot odds</small><strong>{Math.round(item.potOdds * 100)}%</strong></div>
                </div>
                <p><strong>Better line: {item.suggestion}.</strong> {item.note}</p>
              </article>
            ))}
          </div>
        )}
        <button className="primary wide" onClick={onClose}>Back to table</button>
      </div>
    </div>
  );
}

export default function PokerTable() {
  const [state, setState] = useState<HandState | null>(null);
  const [raiseTo, setRaiseTo] = useState(4);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const act = (action: PokerAction) => setState((current) => current ? applyAction(current, humanSeat, action) : current);
  const heroToCall = state ? toCallFor(state, humanSeat) : 0;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      const parsed: unknown = saved ? JSON.parse(saved) : null;
      queueMicrotask(() => setState(isValidSavedState(parsed) ? parsed : createSession()));
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      queueMicrotask(() => setState(createSession()));
    }
  }, []);

  useEffect(() => {
    if (!state) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const bounds = useMemo(() => state ? legalBounds(state, humanSeat) : { toCall: 0, min: 0, max: 0, canRaise: false }, [state]);
  const humanTurn = state?.status === "playing" && state.currentActor === humanSeat;

  useEffect(() => {
    if (!state || state.status !== "playing" || state.currentActor < 0 || state.currentActor === humanSeat) return;
    const timer = window.setTimeout(() => setState((current) => {
      if (!current || current.status !== "playing" || current.currentActor === humanSeat) return current;
      return applyAction(current, current.currentActor, decideBot(current, current.currentActor));
    }), 430 + Math.random() * 420);
    return () => window.clearTimeout(timer);
  }, [state]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!humanTurn || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement;
      if (target.tagName === "INPUT") return;
      if (event.key.toLowerCase() === "f") act({ type: "fold" });
      if (event.key.toLowerCase() === "c") act(heroToCall ? { type: "call" } : { type: "check" });
      if (event.key.toLowerCase() === "r" && bounds.canRaise) act({ type: "raise", amount: Math.max(bounds.min, Math.min(bounds.max, raiseTo)) });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [humanTurn, heroToCall, bounds.canRaise, bounds.min, bounds.max, raiseTo]);

  if (!state) return <main className="loading">Shuffling the deck…</main>;

  const reset = () => {
    localStorage.removeItem(STORAGE_KEY);
    setReviewOpen(false);
    setState(createSession());
  };
  const toCall = toCallFor(state, humanSeat);
  const pot = potTotal(state);
  const effectiveRaiseTo = Math.max(bounds.min, Math.min(bounds.max, raiseTo));
  const liveHand = evaluateHand([...state.players[humanSeat].hole, ...state.board]);
  const quickRaise = (fraction: number) => Math.max(bounds.min, Math.min(bounds.max, Math.round(state.currentBet + pot * fraction)));

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">R</span><div><strong>River Room</strong><small>Hold’em trainer</small></div></div>
        <div className="table-meta"><span>6-MAX CASH</span><b>$1 / $2 NL</b><span>100 BB BUY-IN</span></div>
        <div className="header-actions">
          <button onClick={() => setHistoryOpen(!historyOpen)} aria-expanded={historyOpen}>Hand log</button>
          <button onClick={reset}>Reset session</button>
        </div>
      </header>

      <div className="game-layout">
        <section className="table-zone" aria-label="Poker table">
          <div className="ambient ambient-one" /><div className="ambient ambient-two" />
          <div className="poker-table">
            <div className="rail"><div className="felt">
              <div className="table-center">
                <div className="pot-label">TOTAL POT</div><div className="pot-value"><i />${pot}</div>
                <div className="community" aria-label="Community cards">
                  {Array.from({ length: 5 }, (_, index) => state.board[index] ? <PlayingCard card={state.board[index]} key={index} /> : <div className="card empty-card" key={index} />)}
                </div>
                <div className="street-line"><span>{state.street.toUpperCase()}</span><i /><span>HAND #{state.handNumber}</span></div>
              </div>
            </div></div>
            {state.players.map((player, index) => <SeatView key={player.id} player={player} index={index} state={state} />)}
          </div>

          <div className="status-strip" aria-live="polite">
            <div><span className="eyebrow">Current hand</span><strong>{state.status === "playing" ? (humanTurn ? "Action is on you" : `${state.players[state.currentActor]?.name ?? "Dealer"} is thinking`) : state.result}</strong></div>
            <div className="hero-hand"><span>{state.board.length >= 3 ? liveHand.name : "Your hole cards"}</span><strong>{state.players[humanSeat].hole.map(cardLabel).join(" ")}</strong></div>
          </div>

          {state.status === "playing" ? (
            <section className={`action-dock ${humanTurn ? "ready" : "waiting"}`} aria-label="Poker actions">
              <div className="decision-context"><span>TO CALL <b>${toCall}</b></span><span>EFFECTIVE STACK <b>${state.players[humanSeat].stack}</b></span></div>
              <div className="action-buttons">
                <button className="fold" disabled={!humanTurn} onClick={() => act({ type: "fold" })}><kbd>F</kbd> Fold</button>
                <button disabled={!humanTurn} onClick={() => act(toCall ? { type: "call" } : { type: "check" })}><kbd>C</kbd> {toCall ? `Call $${Math.min(toCall, state.players[humanSeat].stack)}` : "Check"}</button>
                <button className="primary" disabled={!humanTurn || !bounds.canRaise} onClick={() => act({ type: "raise", amount: effectiveRaiseTo })}><kbd>R</kbd> {state.currentBet ? "Raise" : "Bet"} to ${effectiveRaiseTo}</button>
              </div>
              <div className="raise-tools">
                <div className="quick-sizes">
                  {[0.5, 0.75, 1].map((size) => <button key={size} disabled={!humanTurn || !bounds.canRaise} onClick={() => setRaiseTo(quickRaise(size))}>{size === 1 ? "Pot" : `${size * 100}%`}</button>)}
                  <button disabled={!humanTurn || !bounds.canRaise} onClick={() => setRaiseTo(bounds.max)}>All-in</button>
                </div>
                <input aria-label="Raise amount" type="range" min={bounds.min} max={Math.max(bounds.min, bounds.max)} value={effectiveRaiseTo} disabled={!humanTurn || !bounds.canRaise} onChange={(event) => setRaiseTo(Number(event.target.value))} />
                <label className="raise-input"><span>Raise to</span><b>$</b><input type="number" min={bounds.min} max={bounds.max} value={effectiveRaiseTo} disabled={!humanTurn || !bounds.canRaise} onChange={(event) => setRaiseTo(Math.max(bounds.min, Math.min(bounds.max, Number(event.target.value))))} /></label>
              </div>
            </section>
          ) : (
            <section className="between-hands">
              <div><span className="eyebrow">Hand complete</span><h2>{state.result}</h2><p>Your stack: ${state.players[humanSeat].stack} · Session: {state.sessionHands} hands</p></div>
              <div>
                {state.reviews.length > 0 && <button onClick={() => setReviewOpen(true)}>Review decisions</button>}
                {state.status === "busted" ? <button className="primary" onClick={reset}>Reset bankroll</button> : <button className="primary" onClick={() => setState(startHand(state))}>Deal next hand</button>}
              </div>
            </section>
          )}
        </section>

        <aside className={`history-panel ${historyOpen ? "open" : ""}`}>
          <div className="aside-header"><div><span className="eyebrow">Table feed</span><h2>Hand log</h2></div><button className="icon-button mobile-close" onClick={() => setHistoryOpen(false)}>×</button></div>
          <div className="history-list">
            {[...state.history].reverse().map((entry, index) => <div className={index === 0 ? "latest" : ""} key={`${entry}-${index}`}><span>{String(state.history.length - index).padStart(2, "0")}</span><p>{entry}</p></div>)}
          </div>
          <div className="session-card"><span className="eyebrow">Your session</span><div><strong>${state.players[humanSeat].stack - state.sessionStart >= 0 ? "+" : ""}{state.players[humanSeat].stack - state.sessionStart}</strong><small>NET CHIPS</small></div><div><strong>{state.sessionHands}</strong><small>HANDS</small></div></div>
          <p className="privacy-note">Saved on this device. Opponents never see hidden cards.</p>
        </aside>
      </div>
      {reviewOpen && <ReviewPanel state={state} onClose={() => setReviewOpen(false)} />}
    </main>
  );
}
