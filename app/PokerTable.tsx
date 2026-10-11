"use client";

import { useEffect, useMemo, useState } from "react";
import {
  cardLabel,
  createSession,
  evaluateHand,
  humanSeat,
  isValidSavedState,
  migrateSavedState,
  PREFLOP_CHARTS,
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

import { decisionFacts, potRaiseTarget, practiceQueue } from "./training";
import { usePokerEngine } from "./usePokerEngine";

const STORAGE_KEY = "riverroom-session-v9";
const LEGACY_STORAGE_KEYS = ["riverroom-session-v8", "riverroom-session-v7", "riverroom-session-v6", "riverroom-session-v5", "riverroom-session-v4"];
const SYMBOLS = { clubs: "♣", diamonds: "♦", hearts: "♥", spades: "♠" };
const SEAT_CLASS = ["seat top-left", "seat top-center", "seat top-right", "seat mid-right", "seat mid-left", "seat hero"];
const CHART_RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
const LEAK_LABELS = {
  "bb-defense": "Big blind defense",
  "preflop-aggression": "Preflop aggression",
  "three-bet-defense": "Facing 3-bets",
  "missed-value": "Missed value bets",
  "thin-value": "Thin river value",
  "bluff-selection": "Bluff selection",
  "calling-price": "Calls and pot odds",
  "bet-sizing": "Bet sizing",
} as const;

function PlayingCard({ card, hidden = false, small = false }: { card?: Card; hidden?: boolean; small?: boolean }) {
  if (hidden || !card) return <div className={`card card-back ${small ? "small" : ""}`} aria-label="Face-down card"><span>RR</span></div>;
  const red = card.suit === "hearts" || card.suit === "diamonds";
  return (
    <div className={`card ${red ? "red" : "black"} ${small ? "small" : ""}`} aria-label={cardLabel(card)}>
      <strong>{card.rank}</strong><span>{SYMBOLS[card.suit]}</span>
    </div>
  );
}

function SeatView({ player, index, state, inBB }: { player: Seat; index: number; state: HandState; inBB: boolean }) {
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
  const active = state.status === "playing" && state.currentActor === index;
  const chips = (amount: number) => inBB ? `${amount / 2} bb` : `$${amount}`;
  return (
    <section className={`${SEAT_CLASS[index]} ${player.folded ? "folded" : ""} ${active ? "active" : ""}`} aria-label={`${player.name}, ${player.position}`}>
      <div className="seat-cards" aria-hidden={!showCards}>
        {player.hole.map((card, cardIndex) => <PlayingCard key={cardIndex} card={card} hidden={!showCards} small={!player.isHuman} />)}
      </div>
      <div className="seat-panel">
        <div className="seat-topline"><strong>{player.name}</strong><span className="position">{player.position}</span></div>
        <div className="stack"><i />{chips(player.stack)}</div>
        <div className="seat-action">{active ? <><b className="pulse" />{player.isHuman ? "Your turn" : "Thinking"}</> : player.lastAction || "Ready"}</div>
        {!player.isHuman && player.stats.hands > 3 && (
          <div className="stats" title="Voluntarily put money in pot / preflop raise">
            VPIP {Math.round((player.stats.vpip / player.stats.hands) * 100)} · PFR {Math.round((player.stats.pfr / player.stats.hands) * 100)} · {player.stats.hands}h
          </div>
        )}
      </div>
      {player.streetBet > 0 && <div className="wager"><i />{chips(player.streetBet)}</div>}
      {index === state.dealer && <div className="dealer" title="Dealer button">D</div>}
    </section>
  );
}

function clarifyLegacyReview(item: ReviewItem): ReviewItem {
  item = { ...item,
    note: item.note.replace(/ This approximate range model uses \d+% \w+ as its most frequent action\./g, ""),
    alternatives: item.alternatives.map((alternative) => ({ ...alternative, reason: alternative.reason.replace(/^\d+% modeled baseline\.\s*/, "") })),
  };
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

function ReviewPanel({ items, title, onClose, drill = false }: { items: ReviewItem[]; title: string; onClose: () => void; drill?: boolean }) {
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState<string | null>(null);
  const [reveal, setReveal] = useState(!drill);
  const selected = items[index] ? clarifyLegacyReview(items[index]) : null;
  const displayedItems = selected ? [selected] : [];
  const move = (step: number) => { setIndex((current) => Math.max(0, Math.min(items.length - 1, current + step))); setAnswer(null); setReveal(!drill); };
  const focus = reveal ? selected : null;
  return (
    <div className="review-overlay" role="dialog" aria-modal="true" aria-labelledby="review-title">
      <div className="review-panel">
        <div className="review-header">
          <div><span className="eyebrow">Decision coach</span><h2 id="review-title">{title}</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Close review">×</button>
        </div>
        <div className="review-navigation"><button disabled={index === 0} onClick={() => move(-1)}>← Previous</button><span>Decision {items.length ? index + 1 : 0} of {items.length}</span><button disabled={index >= items.length - 1} onClick={() => move(1)}>Next →</button></div>
        {drill && <p className="drill-intro">Recall practice · choose a line before revealing the coach. These are your past decisions, prioritized by the coach’s mistake labels, not new simulated hands.</p>}
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
                <div className="review-item-top"><span>Hand #{item.handNumber} · {item.street} · {item.position}</span>{reveal && <b className={`grade ${item.grade.toLowerCase()}`}>{item.grade}</b>}</div>
                <div className="review-cards">
                  <div><small>Your hand</small><span>{item.cards.map(cardLabel).join(" ")}</span></div>
                  <div><small>Board</small><span>{item.board.length ? item.board.map(cardLabel).join(" ") : "Not dealt"}</span></div>
                </div>
                {item.actionLine.length > 0 && <p className="review-line"><strong>Before you:</strong> {item.actionLine.slice(-5).join(" → ")}</p>}
                <div className="review-metrics">
                  {reveal && <div><small>Your action</small><strong>{item.action}</strong></div>}
                  <div><small>Pot · to call</small><strong>${item.pot} · ${item.toCall}</strong></div>
                  <div><small>Effective stack · SPR</small><strong>${item.effectiveStack} · {item.spr}</strong></div>
                </div>
                {reveal && item.equity !== undefined && <div className="equity-strip"><span><small>Estimated equity vs likely hands</small><strong>{Math.round((item.equityLow ?? item.equity) * 100)}–{Math.round((item.equityHigh ?? item.equity) * 100)}%</strong></span><span><small>Pot odds (price to call)</small><strong>{Math.round(item.potOdds * 100)}%</strong></span></div>}
                {!reveal && <section className="recall-options"><h3>What would you do here?</h3><p>Consider position, the range you face, and the price.</p>{[...item.alternatives].sort((a, b) => a.action.localeCompare(b.action)).map((alternative) => <button key={alternative.action} onClick={() => { setAnswer(alternative.action); setReveal(true); }}>{alternative.action}</button>)}</section>}
                {reveal && <>
                {answer && <p className="recall-answer" role="status">You chose {answer} · coach assessment: {item.alternatives.find((candidate) => candidate.action === answer)?.verdict}. Compare the reasoning below.</p>}
                <p className="review-verdict"><strong>Recommended baseline: {item.suggestion}.</strong> {item.note}</p>
                {item.estimatedRegret !== undefined && <p className="ev-summary"><strong>Modeled opportunity cost:</strong> about ${item.estimatedRegret.toFixed(1)} versus the highest-EV line. Treat small gaps and overlapping intervals as mixes.</p>}
                {item.recommendedSize && <p className="size-guidance">Sizing guide: target ${item.recommendedSize.target}; approximately ${item.recommendedSize.min}–${item.recommendedSize.max} remains reasonable.</p>}
                <div className="review-alternatives" aria-label="Action comparison">
                  {item.alternatives.map((alternative) => <div key={alternative.action}><b className={`mini-grade ${alternative.verdict.toLowerCase()}`}>{alternative.verdict}</b><strong>{alternative.action}</strong><span>{alternative.reason}</span></div>)}
                </div>
                <p className="review-takeaway"><strong>Remember:</strong> {item.takeaway}</p>
                {item.basis && <small className="review-basis">{item.confidence ?? "Low"} confidence · {item.basis}</small>}
                </>}
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
        <p className="source-reading">Further reading: <a href="https://www.pokerstars.com/poker/learn/lesson/pot-odds/" target="_blank" rel="noreferrer">Pot odds</a> · <a href="https://www.pokerstars.com/poker/learn/lesson/opening-the-pot/" target="_blank" rel="noreferrer">Position and opening ranges</a>. The coach is River Room’s own heuristic model; these sources do not validate its recommendations.</p>
        <button className="primary wide" onClick={onClose}>Back to table</button>
      </div>
    </div>
  );
}

function chartHand(row: number, column: number) {
  if (row === column) return `${CHART_RANKS[row]}${CHART_RANKS[column]}`;
  const highIndex = Math.min(row, column);
  const lowIndex = Math.max(row, column);
  return `${CHART_RANKS[highIndex]}${CHART_RANKS[lowIndex]}${row < column ? "s" : "o"}`;
}

function PreflopChartsPanel({ onClose }: { onClose: () => void }) {
  const [chartIndex, setChartIndex] = useState(0);
  const [optionIndex, setOptionIndex] = useState(0);
  const chart = PREFLOP_CHARTS[chartIndex];
  const option = chart.options[Math.min(optionIndex, chart.options.length - 1)];
  const included = new Set(option.hands);
  return (
    <div className="review-overlay" role="dialog" aria-modal="true" aria-labelledby="charts-title">
      <div className="review-panel charts-panel">
        <div className="review-header">
          <div><span className="eyebrow">Decision coach reference</span><h2 id="charts-title">Preflop charts</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Close preflop charts">×</button>
        </div>
        <p className="review-disclaimer">These are the coach’s baseline ranges, not automatic answers. Exact action order, position, price, effective stack and players still to act can change the recommendation.</p>
        <div className="chart-tabs" role="tablist" aria-label="Preflop chart type">
          {PREFLOP_CHARTS.map((candidate, index) => <button
            key={candidate.id}
            className={index === chartIndex ? "selected" : ""}
            role="tab"
            aria-selected={index === chartIndex}
            onClick={() => { setChartIndex(index); setOptionIndex(0); }}
          >{candidate.label}</button>)}
        </div>
        <div className="chart-heading">
          <div><strong>{chart.label}</strong><p>{chart.description}</p></div>
          <label><span>{chart.selectorLabel}</span><select value={optionIndex} onChange={(event) => setOptionIndex(Number(event.target.value))}>
            {chart.options.map((candidate, index) => <option key={candidate.label} value={index}>{candidate.label}</option>)}
          </select></label>
        </div>
        <div className="range-matrix" aria-label={`${chart.label}, ${option.label}`}>
          {CHART_RANKS.flatMap((_, row) => CHART_RANKS.map((__, column) => {
            const hand = chartHand(row, column);
            return <span key={`${row}-${column}`} className={included.has(hand) ? "included" : ""} aria-label={`${hand}, ${included.has(hand) ? "included" : "not included"}`}>{hand}</span>;
          }))}
        </div>
        <div className="chart-legend"><span><i className="included" />Included in baseline</span><span><i />Usually outside baseline</span></div>
        <p className="range-notation"><strong>Range notation:</strong> “s” means suited, “o” means offsuit, and “+” includes every stronger hand in that family. Current shorthand: {option.specification}.</p>
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
  const [reviewMode, setReviewMode] = useState<"current" | "history" | "drill" | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [chartsOpen, setChartsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [mode, setMode] = useState<"study" | "play">("study");
  const [inBB, setInBB] = useState(true);
  const [speed, setSpeed] = useState("normal");
  const [paused, setPaused] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [priceGuess, setPriceGuess] = useState("");
  const [priceRevealed, setPriceRevealed] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const engine = usePokerEngine(setState);
  const modalOpen = Boolean(reviewMode || rulesOpen || chartsOpen || resetOpen);
  const act = (action: PokerAction) => {
    if (!state || state.currentActor !== humanSeat || state.status !== "playing" || engine.busy || modalOpen || paused) return;
    setRaiseTo(null);
    setPriceGuess("");
    setPriceRevealed(false);
    engine.run(state, action);
  };
  const heroToCall = state ? toCallFor(state, humanSeat) : 0;

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("riverroom-preferences-v1") ?? "null");
      if (saved?.mode === "study" || saved?.mode === "play") setMode(saved.mode);
      if (typeof saved?.inBB === "boolean") setInBB(saved.inBB);
      if (saved?.speed === "normal" || saved?.speed === "fast") setSpeed(saved.speed);
    } catch { /* Preferences are optional; the saved hand has independent recovery. */ }
    setPreferencesReady(true);
  }, []);
  useEffect(() => {
    if (!preferencesReady) return;
    try { localStorage.setItem("riverroom-preferences-v1", JSON.stringify({ mode, inBB, speed })); }
    catch { /* Session persistence reports actionable storage errors separately. */ }
  }, [mode, inBB, speed, preferencesReady]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) ?? LEGACY_STORAGE_KEYS.map((key) => localStorage.getItem(key)).find(Boolean) ?? null;
      const parsed: unknown = saved ? JSON.parse(saved) : null;
      const restored = isValidSavedState(parsed) ? parsed : migrateSavedState(parsed);
      queueMicrotask(() => setState(restored ?? createSession()));
    } catch {
      queueMicrotask(() => { setSaveError("Saved session could not be read. A new table is open; the original save has not been deleted."); setState(createSession()); });
    }
  }, []);

  useEffect(() => {
    if (!state || saveError.startsWith("Saved session could not")) return;
    const save = () => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
      catch { setSaveError("Device storage is unavailable or full. Play can continue, but this session may not survive a reload."); }
    };
    const timer = window.setTimeout(save, 250);
    window.addEventListener("pagehide", save);
    return () => { window.clearTimeout(timer); window.removeEventListener("pagehide", save); save(); };
  }, [state, saveError]);

  const bounds = useMemo(() => state ? legalBounds(state, humanSeat) : { toCall: 0, min: 0, max: 0, canRaise: false }, [state]);
  const humanTurn = state?.status === "playing" && state.currentActor === humanSeat && !engine.busy && !paused && !modalOpen;
  const raiseInputValue = raiseTo ?? String(bounds.min);
  const enteredRaise = raiseInputValue.trim() === "" ? Number.NaN : Number(raiseInputValue);
  const effectiveRaiseTo = Number.isFinite(enteredRaise) ? Math.max(bounds.min, Math.min(bounds.max, Math.round(enteredRaise))) : bounds.min;

  useEffect(() => {
    if (!state || state.status !== "playing" || state.currentActor < 0 || state.currentActor === humanSeat || engine.busy || engine.error || paused || modalOpen) return;
    const timer = window.setTimeout(() => engine.run(state), speed === "fast" ? 140 : 600 + Math.random() * 300);
    return () => window.clearTimeout(timer);
  }, [state, engine.run, engine.busy, engine.error, paused, modalOpen, speed]);

  useEffect(() => {
    if (!modalOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.querySelector<HTMLElement>("button")?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setReviewMode(null); setRulesOpen(false); setChartsOpen(false); setResetOpen(false); }
      if (event.key !== "Tab") return;
      const targets = Array.from(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select, summary, a[href], [tabindex="0"]') ?? []).filter((target) => target.getClientRects().length);
      const first = targets[0]; const last = targets.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", trap);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", trap); if (previous?.isConnected) previous.focus(); };
  }, [modalOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!state || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable=true]")) return;
      const key = event.key.toLowerCase();
      if (chartsOpen || rulesOpen) {
        if (key === "escape") {
          event.preventDefault();
          setChartsOpen(false);
          setRulesOpen(false);
        }
        return;
      }
      if (reviewMode && key === "v") {
        event.preventDefault();
        setReviewMode(null);
        return;
      }
      if (modalOpen || paused || engine.busy) return;
      if (humanTurn) {
        if (bounds.canRaise && ["5", "7", "p", "a"].includes(key)) {
          event.preventDefault();
          const fraction = key === "5" ? 0.5 : key === "7" ? 0.75 : 1;
          const preset = key === "a"
            ? bounds.max
            : potRaiseTarget(state, humanSeat, fraction);
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
  }, [state, reviewMode, rulesOpen, chartsOpen, modalOpen, paused, engine.busy, humanTurn, heroToCall, bounds.canRaise, bounds.min, bounds.max, effectiveRaiseTo]);

  if (!state) return <main className="loading">Shuffling the deck…</main>;

  const reset = () => {
    engine.cancel();
    setResetOpen(false);
    setSaveError("");
    setPaused(false);
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
  const quickRaise = (fraction: number) => potRaiseTarget(state, humanSeat, fraction);
  const facts = decisionFacts(state, humanSeat);
  const chips = (amount: number) => inBB ? `${amount / 2} bb` : `$${amount}`;
  const pastReviews = [...state.reviewArchive, ...(state.status === "playing" ? [] : state.reviews)];
  const retryItems = practiceQueue(pastReviews);
  const completedHands = Math.max(0, state.sessionHands - (state.status === "playing" ? 1 : 0));
  const trainingLeaks = Object.entries(state.trainingSummary)
    .map(([key, stat]) => ({ key: key as keyof typeof LEAK_LABELS, ...stat, score: (stat.mistakes + 2) / (stat.opportunities + 8) }))
    .filter((leak) => leak.opportunities >= 8)
    .sort((a, b) => b.score - a.score || b.totalRegret - a.totalRegret)
    .slice(0, 3);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">R</span><div><strong>River Room</strong><small>Hold’em trainer</small></div></div>
        <div className="table-meta"><span>{seatedPlayers === 6 ? "6-MAX" : `${seatedPlayers}-HANDED`} CASH</span><b>$1 / $2 NL</b><span>100 BB BUY-IN</span></div>
        <div className="header-actions">
          <button disabled={mode === "play" && state.status === "playing"} onClick={() => setChartsOpen(true)}>Preflop charts</button>
          <button onClick={() => setRulesOpen(true)}>Table rules</button>
          <button className="log-toggle" onClick={() => setHistoryOpen(!historyOpen)} aria-expanded={historyOpen}>Coach & log</button>
          <button onClick={() => setResetOpen(true)}>Reset session</button>
        </div>
      </header>

      <section className="training-toolbar" aria-label="Training settings">
        <div className="mode-control"><button aria-pressed={mode === "study"} onClick={() => setMode("study")}>Study table</button><button aria-pressed={mode === "play"} onClick={() => setMode("play")}>Unassisted play</button></div>
        <p>{mode === "study" ? "Think through the spot. Learn after the hand." : "No live coaching or charts. Review after the hand."}</p>
        <label>Pace <select aria-label="Bot pace" value={speed} onChange={(event) => setSpeed(event.target.value)}><option value="normal">Natural</option><option value="fast">Fast</option></select></label>
        <button aria-pressed={inBB} onClick={() => setInBB(!inBB)}>{inBB ? "BB" : "$"} units</button>
        <button aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused ? "Resume" : "Pause"}</button>
      </section>
      {(saveError || engine.error) && <div className="app-notice" role="alert">{saveError || engine.error}{engine.error && state.currentActor !== humanSeat && <button onClick={() => engine.run(state)}>Retry</button>}</div>}
      <div className="game-layout">
        <section className="table-zone" aria-label="Poker table">
          <div className="ambient ambient-one" /><div className="ambient ambient-two" />
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
            <div><span className="eyebrow">Current hand</span><strong>{state.status === "playing" ? (paused ? "Table paused" : engine.busy ? "Processing decision…" : humanTurn ? "Action is on you" : `${state.players[state.currentActor]?.name ?? "Dealer"} is thinking`) : state.result}</strong></div>
            <div className="hero-hand"><span>{mode === "study" && state.board.length >= 3 ? liveHand.name : "Your hole cards"}</span><strong>{state.players[humanSeat].hole.map(cardLabel).join(" ")}</strong></div>
          </div>

          {state.status === "playing" ? (
            <section className={`action-dock ${humanTurn ? "ready" : "waiting"}`} aria-label="Poker actions">
              <div className="decision-context"><span>TO CALL <b>{chips(facts.call)}</b></span><span title="At the start of this betting round, against the deepest live opponent; shorter opponents have individual effective stacks.">EFFECTIVE <b>{chips(facts.effective)}</b></span><span>POSITION <b>{state.players[humanSeat].position}</b></span></div>
              <div className="action-buttons">
                <button className="fold" disabled={!humanTurn} onClick={() => act({ type: "fold" })}><kbd>F</kbd> Fold</button>
                <button disabled={!humanTurn} onClick={() => act(toCall ? { type: "call" } : { type: "check" })}><kbd>C</kbd> {toCall ? `Call ${chips(facts.call)}${facts.call === state.players[humanSeat].stack ? " · all-in" : ""}` : "Check"}</button>
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
              <div><span className="eyebrow">Hand complete</span><h2>{state.result}</h2><p>Your stack: ${state.players[humanSeat].stack} · Session: {state.sessionHands} hands</p></div>
              <div>
                {state.reviews.length > 0 && <button onClick={() => setReviewMode("current")}><kbd>V</kbd> Review decisions</button>}
                {state.status === "busted" ? <button className="primary" onClick={() => setResetOpen(true)}>Reset bankroll</button>
                  : state.status === "tableClosed" ? <button className="primary" onClick={() => setResetOpen(true)}>Start new table</button>
                    : <button className="primary" onClick={() => setState(startHand(state))}><kbd>N</kbd> Deal next hand</button>}
              </div>
            </section>
          )}
        </section>

        <aside className={`history-panel ${historyOpen ? "open" : ""}`} aria-label="Learning and session">
          <section className="learning-card">
            <div className="learning-heading"><span className="eyebrow">Your practice</span><span className="live-dot">{mode === "study" ? "GUIDED" : "UNASSISTED"}</span></div>
            <h2>{state.status !== "playing" ? "Good decisions compound." : "Range. Price. Purpose."}</h2>
            {mode === "study" && state.status === "playing" ? <>
              <p>Which hands reach this spot? What continues if you bet? What changes on the next card?</p>
              {humanTurn && facts.call > 0 && <div className="price-practice"><label htmlFor="price-guess">What equity does this call need?</label><div><input id="price-guess" inputMode="decimal" type="number" min="0" max="100" placeholder="Your estimate %" value={priceGuess} onChange={(event) => setPriceGuess(event.target.value)} /><button onClick={() => setPriceRevealed(true)}>Check</button></div>{priceRevealed && <p role="status"><strong>{(facts.price * 100).toFixed(1)}% before rake.</strong> {facts.call} ÷ ({facts.contestablePot} + {facts.call}). {priceGuess.trim() && Number.isFinite(Number(priceGuess)) ? Math.abs(Number(priceGuess) - facts.price * 100) <= 2 ? "Good estimate. " : "Compare that with your estimate. " : ""}This is the price, not your actual equity. Future bets, rake and equity realization matter.</p>}</div>}
            </> : <p>{state.status === "playing" ? "Trust your process. Coaching becomes available when the hand ends." : "Separate the quality of your choices from the cards that came next. Review, then recall the lesson."}</p>}
            <button className="practice-button" disabled={!retryItems.length || (mode === "play" && state.status === "playing")} onClick={() => setReviewMode("drill")}>Practice past decisions <span>{retryItems.length || "—"}</span></button>
            {!retryItems.length && <small>Complete a hand to build your practice queue.</small>}
          </section>
          <div className="aside-header"><div><span className="eyebrow">Table feed</span><h2>Hand log</h2></div><button aria-label="Close hand log" className="icon-button mobile-close" onClick={() => setHistoryOpen(false)}>×</button></div>
          <div className="history-list">
            {[...state.history].reverse().map((entry, index) => <div className={index === 0 ? "latest" : ""} key={`${entry}-${index}`}><span>{String(state.history.length - index).padStart(2, "0")}</span><p>{entry}</p></div>)}
          </div>
          <section className="session-dashboard" aria-label="Your session statistics">
            <div className="session-heading"><span className="eyebrow">Your session</span><small>Since last reset</small></div>
            <div className="session-summary">
              <div><strong>{facts.net >= 0 ? "+" : ""}{chips(facts.net)}</strong><small>NET · INCLUDES IN PLAY</small></div>
              <div><strong>{completedHands}</strong><small>COMPLETED HANDS</small></div>
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
            <section className="leak-dashboard" aria-label="Training focus">
              <div className="stat-section-title"><strong>TRAINING FOCUS</strong><span>confidence-adjusted</span></div>
              {trainingLeaks.length ? trainingLeaks.map((leak) => (
                <div className="leak-row" key={leak.key}>
                  <span><strong>{LEAK_LABELS[leak.key]}</strong><small>{leak.mistakes} costly choices in {leak.opportunities} spots · ${leak.totalRegret.toFixed(0)} modeled cost</small></span>
                  <b>{leak.opportunities >= 30 ? "Established" : leak.opportunities >= 15 ? "Emerging" : "Early"}</b>
                </div>
              )) : <p className="leak-empty">Keep playing: each category needs at least 8 relevant decisions before it is labeled a possible leak.</p>}
              {trainingLeaks[0] && <p className="practice-focus"><strong>Next-session drill:</strong> pause on every {LEAK_LABELS[trainingLeaks[0].key].toLowerCase()} spot and state your range, price, and purpose before acting.</p>}
            </section>
            {(pastReviews.length > 0) && <button disabled={mode === "play" && state.status === "playing"} className="review-history-button" onClick={() => setReviewMode("history")}>Review learning history · {pastReviews.length}</button>}
          </section>
          <p className="privacy-note">Saved on this device. Opponents never see hidden cards.</p>
        </aside>
      </div>
      {reviewMode && <ReviewPanel
        key={reviewMode}
        drill={reviewMode === "drill"}
        items={reviewMode === "current" ? state.reviews : reviewMode === "drill" ? retryItems : pastReviews.slice(-120).reverse()}
        title={reviewMode === "current" ? `Hand #${state.handNumber} debrief` : reviewMode === "drill" ? "Make the decision again" : "Learning history"}
        onClose={() => setReviewMode(null)}
      />}
      {resetOpen && <div className="review-overlay" role="dialog" aria-modal="true" aria-labelledby="reset-title"><div className="review-panel reset-panel"><h2 id="reset-title">Start a fresh session?</h2><p>This resets your bankroll, statistics and saved decision history on this device.</p><div className="review-navigation"><button onClick={() => setResetOpen(false)}>Keep playing</button><button onClick={reset}>Reset session</button></div></div></div>}
      {rulesOpen && <RulesPanel onClose={() => setRulesOpen(false)} />}
      {chartsOpen && <PreflopChartsPanel onClose={() => setChartsOpen(false)} />}
    </main>
  );
}
