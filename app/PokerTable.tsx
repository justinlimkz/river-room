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
  migrateSavedState,
  legalBounds,
  potTotal,
  startHand,
  toCallFor,
  type Card,
  type HandState,
  type PokerAction,
  type ReviewItem,
  type Seat,
} from "./poker-engine";

const STORAGE_KEY = "riverroom-session-v8";
const LEGACY_STORAGE_KEYS = ["riverroom-session-v7", "riverroom-session-v6", "riverroom-session-v5", "riverroom-session-v4"];
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
  const vacant = !player.isHuman && player.stack <= 0 && player.hole.length === 0;
  if (vacant) {
    return (
      <section className={`${SEAT_CLASS[index]} vacant`} aria-label="Open seat">
        <div className="seat-panel vacant-panel">
          <div className="seat-topline"><strong>Open seat</strong></div>
          <div className="seat-action">Player left</div>
        </div>
      </section>
    );
  }
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

function clarifyLegacyReview(item: ReviewItem): ReviewItem {
  const match = item.concept.match(/^(\S+) cold caller facing a (\S+) squeeze$/);
  const hadAlreadyCalled = item.actionLine.some((action) => action.startsWith("You called"));
  if (!match || hadAlreadyCalled) return item;
  const concept = `${match[1]} facing a ${match[2]} three-bet before entering the pot`;
  const legacy = "Cold callers must defend tightly against a squeeze because both the squeezer and original raiser represent live ranges.";
  const clearer = "You had not called the original raise, so you were not a cold caller. Continue very tightly because the three-bettor has shown strength and the original raiser can still act again.";
  return {
    ...item,
    concept,
    note: item.note.replace(legacy, clearer),
    basis: item.basis?.replace(item.concept, concept),
    alternatives: item.alternatives.map((alternative) => ({ ...alternative, reason: alternative.reason.replace(legacy, clearer) })),
  };
}

function ReviewPanel({ items, title, onClose }: { items: ReviewItem[]; title: string; onClose: () => void }) {
  const displayedItems = items.map(clarifyLegacyReview);
  const focus = displayedItems.find((item) => item.grade === "Costly") ?? displayedItems.find((item) => item.grade === "Viable") ?? displayedItems[0];
  return (
    <div className="review-overlay" role="dialog" aria-modal="true" aria-labelledby="review-title">
      <div className="review-panel">
        <div className="review-header">
          <div><span className="eyebrow">Decision coach</span><h2 id="review-title">{title}</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Close review">×</button>
        </div>
        <p className="review-disclaimer">Advice uses only information available when you acted. Close spots are labeled as such; estimates are approximate rather than solver-grade GTO solutions.</p>
        <details className="coach-glossary">
          <summary>Poker terms used in the coach</summary>
          <div>
            <p><strong>Range</strong><span>The set of hands a player could plausibly hold.</span></p>
            <p><strong>Equity</strong><span>Your estimated share of the pot if the hand were played to showdown many times.</span></p>
            <p><strong>Pot odds</strong><span>The percentage of the final calling pot that your call would contribute.</span></p>
            <p><strong>Effective stack</strong><span>The most you and the relevant opponent can win from one another.</span></p>
            <p><strong>SPR</strong><span>Stack-to-pot ratio: the effective stack divided by the pot at the start of a postflop street.</span></p>
            <p><strong>3-bet / 4-bet</strong><span>The first preflop re-raise / the next re-raise.</span></p>
            <p><strong>Squeeze</strong><span>A 3-bet made after an initial raise and at least one call.</span></p>
            <p><strong>Cold call</strong><span>Calling a raise without having voluntarily invested earlier in that betting round.</span></p>
            <p><strong>Blocker</strong><span>A card you hold that makes certain strong opponent hands less likely.</span></p>
            <p><strong>Semi-bluff</strong><span>A bet that can win immediately but also has a meaningful draw when called.</span></p>
          </div>
        </details>
        {focus && <section className="review-focus"><span>Best lesson to keep</span><strong>{focus.concept}</strong><p>{focus.takeaway}</p></section>}
        {displayedItems.length === 0 ? <p className="empty">You didn’t face a decision in this hand.</p> : (
          <div className="review-list">
            {displayedItems.map((item) => (
              <article className="review-item" key={item.id}>
                <div className="review-item-top"><span>Hand #{item.handNumber} · {item.street} · {item.position}</span><b className={`grade ${item.grade.toLowerCase()}`}>{item.grade}</b></div>
                <div className="review-cards">
                  <div><small>Your hand</small><span>{item.cards.map(cardLabel).join(" ")}</span></div>
                  <div><small>Board</small><span>{item.board.length ? item.board.map(cardLabel).join(" ") : "Not dealt"}</span></div>
                </div>
                {item.actionLine.length > 0 && <p className="review-line"><strong>Before you:</strong> {item.actionLine.slice(-5).join(" → ")}</p>}
                <div className="review-metrics">
                  <div><small>Your action</small><strong>{item.action}</strong></div>
                  <div><small>Pot · to call</small><strong>${item.pot} · ${item.toCall}</strong></div>
                  <div><small>Effective stack · SPR</small><strong>${item.effectiveStack} · {item.spr}</strong></div>
                </div>
                {item.equity !== undefined && <div className="equity-strip"><span><small>Estimated equity vs likely hands</small><strong>{Math.round((item.equityLow ?? item.equity) * 100)}–{Math.round((item.equityHigh ?? item.equity) * 100)}%</strong></span><span><small>Pot odds (price to call)</small><strong>{Math.round(item.potOdds * 100)}%</strong></span></div>}
                <p className="review-verdict"><strong>Recommended baseline: {item.suggestion}.</strong> {item.note}</p>
                {item.recommendedSize && <p className="size-guidance">Sizing guide: target ${item.recommendedSize.target}; approximately ${item.recommendedSize.min}–${item.recommendedSize.max} remains reasonable.</p>}
                <div className="review-alternatives" aria-label="Action comparison">
                  {item.alternatives.map((alternative) => <div key={alternative.action}><b className={`mini-grade ${alternative.verdict.toLowerCase()}`}>{alternative.verdict}</b><strong>{alternative.action}{alternative.frequency !== undefined ? ` · ${Math.round(alternative.frequency * 100)}%` : ""}</strong><span>{alternative.reason}</span></div>)}
                </div>
                <p className="review-takeaway"><strong>Remember:</strong> {item.takeaway}</p>
                {item.basis && <small className="review-basis">{item.confidence ?? "Low"} confidence · {item.basis}</small>}
              </article>
            ))}
          </div>
        )}
        <button className="primary wide" onClick={onClose}><kbd>V</kbd> Back to table</button>
      </div>
    </div>
  );
}

function RulesPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="review-overlay" role="dialog" aria-modal="true" aria-labelledby="rules-title">
      <div className="review-panel rules-panel">
        <div className="review-header">
          <div><span className="eyebrow">River Room house rules</span><h2 id="rules-title">$1/$2 no-limit cash</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Close table rules">×</button>
        </div>
        <div className="rules-list">
          <p><strong>Format</strong><span>Six seats, $200 initial stacks, table stakes, and no blind escalation. Opponents automatically top back up to 100 BB between hands.</span></p>
          <p><strong>Online rake</strong><span>Five percent of postflop pots, capped at $3 per hand. No flop, no drop; uncalled wagers are never raked.</span></p>
          <p><strong>Betting</strong><span>No cap on raises. A full raise establishes the next minimum; cumulative short all-ins reopen action only after totaling a full raise.</span></p>
          <p><strong>All-ins</strong><span>Main and side pots are awarded independently. Uncalled excess is returned before the contested pot is described.</span></p>
          <p><strong>Showdown</strong><span>The best five-card Hold’em hand wins. Ties split the pot; an odd chip goes to the first tied winner clockwise left of the button.</span></p>
          <p><strong>Seats</strong><span>The table remains six-handed. Opponent bankrolls are replenished between hands; your bankroll is continuous until you bust or reset.</span></p>
          <p><strong>Not offered</strong><span>No straddles, missed-blind posting, buying the button, running it twice, or rabbit hunting.</span></p>
        </div>
        <button className="primary wide" onClick={onClose}>Back to table</button>
      </div>
    </div>
  );
}

const percent = (count: number, total: number) => total ? `${Math.round((count / total) * 100)}%` : "—";

function ActionMix({
  label,
  values,
  note,
}: {
  label: string;
  values: { label: string; count: number; tone: string }[];
  note?: string;
}) {
  const total = values.reduce((sum, value) => sum + value.count, 0);
  return (
    <section className="action-mix" aria-label={label}>
      <div className="stat-section-title"><strong>{label}</strong><span>{total} decisions</span></div>
      <div className="mix-bar" aria-hidden="true">
        {values.map((value) => value.count > 0 && <i key={value.label} className={value.tone} style={{ width: `${(value.count / total) * 100}%` }} />)}
      </div>
      <div className="mix-legend">
        {values.map((value) => <div key={value.label}><i className={value.tone} /><span>{value.label}</span><b>{percent(value.count, total)}</b></div>)}
      </div>
      {note && <small className="stat-note">{note}</small>}
    </section>
  );
}

export default function PokerTable() {
  const [state, setState] = useState<HandState | null>(null);
  const [raiseTo, setRaiseTo] = useState<string | null>(null);
  const [reviewMode, setReviewMode] = useState<"current" | "history" | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const act = (action: PokerAction) => {
    setRaiseTo(null);
    setState((current) => current ? applyAction(current, humanSeat, action) : current);
  };
  const heroToCall = state ? toCallFor(state, humanSeat) : 0;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) ?? LEGACY_STORAGE_KEYS.map((key) => localStorage.getItem(key)).find(Boolean) ?? null;
      const parsed: unknown = saved ? JSON.parse(saved) : null;
      const restored = isValidSavedState(parsed) ? parsed : migrateSavedState(parsed);
      queueMicrotask(() => setState(restored ?? createSession()));
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      LEGACY_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
      queueMicrotask(() => setState(createSession()));
    }
  }, []);

  useEffect(() => {
    if (!state) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const bounds = useMemo(() => state ? legalBounds(state, humanSeat) : { toCall: 0, min: 0, max: 0, canRaise: false }, [state]);
  const humanTurn = state?.status === "playing" && state.currentActor === humanSeat;
  const raiseInputValue = raiseTo ?? String(bounds.min);
  const enteredRaise = raiseInputValue.trim() === "" ? Number.NaN : Number(raiseInputValue);
  const effectiveRaiseTo = Number.isFinite(enteredRaise) ? Math.max(bounds.min, Math.min(bounds.max, enteredRaise)) : bounds.min;

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
      if (!state || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement;
      if (target.tagName === "INPUT") return;
      const key = event.key.toLowerCase();
      if (reviewMode && key === "v") {
        event.preventDefault();
        setReviewMode(null);
        return;
      }
      if (humanTurn) {
        if (bounds.canRaise && ["5", "7", "p", "a"].includes(key)) {
          event.preventDefault();
          const fraction = key === "5" ? 0.5 : key === "7" ? 0.75 : 1;
          const preset = key === "a"
            ? bounds.max
            : Math.max(bounds.min, Math.min(bounds.max, Math.round(state.currentBet + potTotal(state) * fraction)));
          setRaiseTo(String(preset));
          return;
        }
        if (key === "f") act({ type: "fold" });
        if (key === "c") act(heroToCall ? { type: "call" } : { type: "check" });
        if (key === "r" && bounds.canRaise) act({ type: "raise", amount: effectiveRaiseTo });
        return;
      }
      if (state.status === "handOver" && key === "v" && state.reviews.length > 0) {
        event.preventDefault();
        setReviewMode("current");
      }
      if (state.status === "handOver" && key === "n") {
        event.preventDefault();
        setState((current) => current?.status === "handOver" ? startHand(current) : current);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [state, reviewMode, humanTurn, heroToCall, bounds.canRaise, bounds.min, bounds.max, effectiveRaiseTo]);

  if (!state) return <main className="loading">Shuffling the deck…</main>;

  const reset = () => {
    localStorage.removeItem(STORAGE_KEY);
    LEGACY_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
    setRaiseTo(null);
    setReviewMode(null);
    setState(createSession());
  };
  const toCall = toCallFor(state, humanSeat);
  const pot = potTotal(state);
  const liveHand = evaluateHand([...state.players[humanSeat].hole, ...state.board]);
  const heroStats = state.players[humanSeat].stats;
  const preflopDecisions = heroStats.preflopFolds + heroStats.preflopCalls + heroStats.preflopRaises;
  const postflopDecisions = heroStats.postflopFolds + heroStats.postflopCalls + heroStats.postflopRaises + heroStats.postflopChecks;
  const seatedPlayers = state.players.filter((player) => player.stack > 0 || player.hole.length > 0).length;
  const quickRaise = (fraction: number) => Math.max(bounds.min, Math.min(bounds.max, Math.round(state.currentBet + pot * fraction)));

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">R</span><div><strong>River Room</strong><small>Hold’em trainer</small></div></div>
        <div className="table-meta"><span>{seatedPlayers === 6 ? "6-MAX" : `${seatedPlayers}-HANDED`} CASH</span><b>$1 / $2 NL</b><span>100 BB BUY-IN</span></div>
        <div className="header-actions">
          <button onClick={() => setRulesOpen(true)}>Table rules</button>
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
                  <button aria-keyshortcuts="5" disabled={!humanTurn || !bounds.canRaise} onClick={() => setRaiseTo(String(quickRaise(0.5)))} title="Set raise to 50% pot (5)"><kbd>5</kbd>50%</button>
                  <button aria-keyshortcuts="7" disabled={!humanTurn || !bounds.canRaise} onClick={() => setRaiseTo(String(quickRaise(0.75)))} title="Set raise to 75% pot (7)"><kbd>7</kbd>75%</button>
                  <button aria-keyshortcuts="P" disabled={!humanTurn || !bounds.canRaise} onClick={() => setRaiseTo(String(quickRaise(1)))} title="Set a pot-sized raise (P)"><kbd>P</kbd>Pot</button>
                  <button aria-keyshortcuts="A" disabled={!humanTurn || !bounds.canRaise} onClick={() => setRaiseTo(String(bounds.max))} title="Set raise to all-in (A)"><kbd>A</kbd>All-in</button>
                </div>
                <input aria-label="Raise amount" type="range" min={bounds.min} max={Math.max(bounds.min, bounds.max)} value={effectiveRaiseTo} disabled={!humanTurn || !bounds.canRaise} onChange={(event) => setRaiseTo(event.target.value)} />
                <label className="raise-input"><span>Raise to</span><b>$</b><input type="number" min={bounds.min} max={bounds.max} value={raiseInputValue} disabled={!humanTurn || !bounds.canRaise} onChange={(event) => setRaiseTo(event.target.value)} onBlur={() => setRaiseTo(String(effectiveRaiseTo))} /></label>
              </div>
            </section>
          ) : (
            <section className="between-hands">
              <div><span className="eyebrow">Hand complete</span><h2>{state.result}</h2><p>Your stack: ${state.players[humanSeat].stack} · Session: {state.sessionHands} hands</p></div>
              <div>
                {state.reviews.length > 0 && <button onClick={() => setReviewMode("current")}><kbd>V</kbd> Review decisions</button>}
                {state.status === "busted" ? <button className="primary" onClick={reset}>Reset bankroll</button>
                  : state.status === "tableClosed" ? <button className="primary" onClick={reset}>Start new table</button>
                    : <button className="primary" onClick={() => setState(startHand(state))}><kbd>N</kbd> Deal next hand</button>}
              </div>
            </section>
          )}
        </section>

        <aside className={`history-panel ${historyOpen ? "open" : ""}`}>
          <div className="aside-header"><div><span className="eyebrow">Table feed</span><h2>Hand log</h2></div><button className="icon-button mobile-close" onClick={() => setHistoryOpen(false)}>×</button></div>
          <div className="history-list">
            {[...state.history].reverse().map((entry, index) => <div className={index === 0 ? "latest" : ""} key={`${entry}-${index}`}><span>{String(state.history.length - index).padStart(2, "0")}</span><p>{entry}</p></div>)}
          </div>
          <section className="session-dashboard" aria-label="Your session statistics">
            <div className="session-heading"><span className="eyebrow">Your session</span><small>Since last reset</small></div>
            <div className="session-summary">
              <div><strong>${state.players[humanSeat].stack - state.sessionStart >= 0 ? "+" : ""}{state.players[humanSeat].stack - state.sessionStart}</strong><small>NET CHIPS</small></div>
              <div><strong>{state.sessionHands}</strong><small>HANDS</small></div>
            </div>
            <small className="stat-note">Online cash model · 5% capped rake · ${state.sessionRake} removed from table pots</small>
            <div className="stat-grid">
              <div title={`${heroStats.vpip} of ${heroStats.hands} hands`}><strong>{percent(heroStats.vpip, heroStats.hands)}</strong><small>VPIP</small></div>
              <div title={`${heroStats.pfr} of ${heroStats.hands} hands`}><strong>{percent(heroStats.pfr, heroStats.hands)}</strong><small>PFR</small></div>
              <div title={`${heroStats.threeBets} of ${heroStats.threeBetOpportunities} opportunities`}><strong>{percent(heroStats.threeBets, heroStats.threeBetOpportunities)}</strong><small>3-BET</small></div>
              <div title={`${heroStats.flopsSeen} of ${heroStats.hands} hands`}><strong>{percent(heroStats.flopsSeen, heroStats.hands)}</strong><small>SAW FLOP</small></div>
              <div title={`${heroStats.handsWon} of ${heroStats.hands} hands`}><strong>{percent(heroStats.handsWon, heroStats.hands)}</strong><small>HANDS WON</small></div>
              <div title={`${heroStats.showdownWins} of ${heroStats.showdowns} showdowns`}><strong>{percent(heroStats.showdownWins, heroStats.showdowns)}</strong><small>W$SD</small></div>
            </div>
            <ActionMix
              label="Preflop mix"
              values={[
                { label: "Fold", count: heroStats.preflopFolds, tone: "fold-tone" },
                { label: "Call", count: heroStats.preflopCalls, tone: "call-tone" },
                { label: "Raise", count: heroStats.preflopRaises, tone: "raise-tone" },
              ]}
              note={`${preflopDecisions} voluntary decisions · BB checks excluded`}
            />
            <ActionMix
              label="Postflop mix"
              values={[
                { label: "Fold", count: heroStats.postflopFolds, tone: "fold-tone" },
                { label: "Call", count: heroStats.postflopCalls, tone: "call-tone" },
                { label: "Raise", count: heroStats.postflopRaises, tone: "raise-tone" },
                { label: "Check", count: heroStats.postflopChecks, tone: "check-tone" },
              ]}
              note={`${postflopDecisions} decisions after the flop`}
            />
            {(state.reviewArchive.length > 0 || state.reviews.length > 0) && <button className="review-history-button" onClick={() => setReviewMode("history")}>Review learning history · {state.reviewArchive.length + state.reviews.length}</button>}
          </section>
          <p className="privacy-note">Saved on this device. Opponents never see hidden cards.</p>
        </aside>
      </div>
      {reviewMode && <ReviewPanel
        items={reviewMode === "current" ? state.reviews : [...state.reviewArchive, ...state.reviews].slice(-120).reverse()}
        title={reviewMode === "current" ? `Hand #${state.handNumber} debrief` : "Learning history"}
        onClose={() => setReviewMode(null)}
      />}
      {rulesOpen && <RulesPanel onClose={() => setRulesOpen(false)} />}
    </main>
  );
}
