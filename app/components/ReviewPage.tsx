"use client";

import { useMemo, useRef, useState } from "react";
import {
  buildTimeline,
  cardLabel,
  decisionOpponent,
  explainDecision,
  humanSeat,
  revealedHands,
  STYLE_LABELS,
  streetName,
  summarizeHand,
  type DecisionExplanation,
  type HandState,
  type ReviewItem,
} from "../poker-engine";
import { formatNet } from "./format";
import { PlayingCard } from "./PlayingCard";

type Props = {
  state: HandState;
  /** Where to start: the hand that just ended, or the list of earlier hands. */
  initial: "hand" | "list";
  /** The learner's stack when the hand began, if known, for the net result. */
  handStartStack: number | null;
  onBack: () => void;
  onDeal?: () => void;
};

type View = { kind: "hand" } | { kind: "list" } | { kind: "past"; handNumber: number };
type Entry = { review: ReviewItem; explanation: DecisionExplanation };

const verdictClass = { good: "good", reasonable: "close", mistake: "bad" } as const;
const GRADE_RANK = { Costly: 2, Viable: 1, Preferred: 0 };

/** The costliest decision, or the first one when every decision was fine. */
function defaultSelection(reviews: ReviewItem[]) {
  let pick = 0;
  reviews.forEach((review, index) => {
    const current = reviews[pick];
    const worse = GRADE_RANK[review.grade] - GRADE_RANK[current.grade] || (review.estimatedRegret ?? 0) - (current.estimatedRegret ?? 0);
    if (worse > 0) pick = index;
  });
  return pick;
}

function optionClass(tag: string) {
  return tag.startsWith("Best") ? "good" : tag === "Mistake" ? "bad" : "close";
}

export function ReviewPage({ state, initial, handStartStack, onBack, onDeal }: Props) {
  const [view, setView] = useState<View>({ kind: initial });
  const [selected, setSelected] = useState<number | null>(null);
  const detail = useRef<HTMLElement>(null);

  const archive = state.reviewArchive;
  const pastHands = useMemo(() => {
    const groups = new Map<number, ReviewItem[]>();
    archive.forEach((review) => groups.set(review.handNumber, [...(groups.get(review.handNumber) ?? []), review]));
    return [...groups.entries()].sort((a, b) => b[0] - a[0]);
  }, [archive]);

  const reviews = useMemo(
    () => view.kind === "hand" ? state.reviews : view.kind === "past" ? groupFor(pastHands, view.handNumber) : [],
    [view, state.reviews, pastHands],
  );
  const entries: Entry[] = useMemo(() => reviews.map((review, index) => {
    const context = view.kind === "hand" ? decisionOpponent(state, index) : {};
    return {
      review,
      explanation: explainDecision(review, {
        opponentName: context.opponentName,
        opponentStyle: context.profile ? STYLE_LABELS[context.profile] : undefined,
        revealed: context.revealed,
        outcome: context.outcome,
      }),
    };
  }), [reviews, view.kind, state]);

  const index = Math.min(selected ?? defaultSelection(reviews), Math.max(0, entries.length - 1));
  const current = entries[index];
  const select = (next: number) => {
    setSelected(next);
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches) detail.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const open = (next: View) => { setView(next); setSelected(null); };

  return (
    <main className="app-shell review-shell">
      <header className="topbar">
        <strong className="wordmark">River Room</strong>
        <div className="header-actions">
          {view.kind !== "list" && pastHands.length > 0 && <button className="ghost" onClick={() => open({ kind: "list" })}>Past hands</button>}
          {view.kind === "list" && state.reviews.length > 0 && state.status !== "playing" && <button className="ghost" onClick={() => open({ kind: "hand" })}>This hand</button>}
          <button className="ghost" onClick={onBack}>Back to table</button>
          {onDeal && <button className="brass-button" onClick={onDeal}>Deal next hand</button>}
        </div>
      </header>

      {view.kind === "list" ? (
        <section className="review-list-page" aria-label="Past hands">
          <h1>Past hands</h1>
          {pastHands.length === 0 ? <p className="muted">Hands you have finished will appear here.</p> : (
            <ul>
              {pastHands.map(([handNumber, items]) => {
                const good = items.filter((item) => item.grade === "Preferred").length;
                return (
                  <li key={handNumber}>
                    <button onClick={() => open({ kind: "past", handNumber })}>
                      <span className="mono">Hand {handNumber}</span>
                      <span className="mini-cards">{items[0].cards.map((card, i) => <PlayingCard key={i} card={card} size="sm" />)}</span>
                      <span className="muted">{good} of {items.length} {items.length === 1 ? "decision" : "decisions"} good</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : (
        <div className="review-body">
          <aside className="review-hand" aria-label="The hand">
            {view.kind === "hand" ? <HandColumn state={state} entries={entries} index={index} net={handStartStack === null ? null : state.players[humanSeat].stack - handStartStack} onSelect={select} /> : (
              <PastColumn handNumber={view.kind === "past" ? view.handNumber : 0} entries={entries} index={index} onSelect={select} onList={() => open({ kind: "list" })} />
            )}
          </aside>
          <section className="review-detail" ref={detail} aria-label="Decision review">
            {current ? <Detail entry={current} index={index} count={entries.length} entries={entries} onSelect={select} /> : <p className="muted">You didn’t face a decision in this hand.</p>}
          </section>
        </div>
      )}
      <p className="review-footnote">Evaluations come from River Room’s built-in model, not a solver.</p>
    </main>
  );
}

function groupFor(hands: [number, ReviewItem[]][], handNumber: number) {
  return hands.find(([number]) => number === handNumber)?.[1] ?? [];
}

function HandColumn({ state, entries, index, net, onSelect }: { state: HandState; entries: Entry[]; index: number; net: number | null; onSelect: (index: number) => void }) {
  const hero = state.players[humanSeat];
  const timeline = useMemo(() => buildTimeline(state), [state]);
  const revealed = revealedHands(state);
  return (
    <>
      <div className="hand-title">
        <h1>Hand {state.handNumber}</h1>
        {net !== null && <span className={`mono net ${net > 0 ? "up" : net < 0 ? "down" : ""}`}>{formatNet(net, false)}</span>}
      </div>
      <p className="hand-summary">{summarizeHand(state)}</p>
      <div className="hand-cards">
        <div><small>You</small><div className="mini-cards">{hero.hole.map((card, i) => <PlayingCard key={i} card={card} size="sm" />)}</div></div>
        {revealed.map((player) => (
          <div key={player.name}><small>{player.name} · revealed</small><div className="mini-cards">{player.cards.map((card, i) => <PlayingCard key={i} card={card} size="sm" />)}</div></div>
        ))}
      </div>
      {timeline.map((street) => (
        <div className="street" key={street.street}>
          <div className="street-head">
            <span>{streetName(street.street)}{street.cards.length > 0 && <> · {street.cards.map(cardLabel).join(" ")}</>}</span>
            <span className="mono">${street.pot}</span>
          </div>
          {street.items.map((item, i) => item.type === "text"
            ? <div className="street-text" key={i}>{item.text}</div>
            : <DecisionButton key={i} text={item.text} entry={entries[item.reviewIndex]} selected={item.reviewIndex === index} onClick={() => onSelect(item.reviewIndex)} />)}
        </div>
      ))}
    </>
  );
}

function PastColumn({ handNumber, entries, index, onSelect, onList }: { handNumber: number; entries: Entry[]; index: number; onSelect: (index: number) => void; onList: () => void }) {
  const cards = entries[0]?.review.cards ?? [];
  return (
    <>
      <div className="hand-title"><h1>Hand {handNumber}</h1></div>
      <p className="hand-summary">Only your decisions were kept for earlier hands. <button className="link" onClick={onList}>All past hands</button></p>
      <div className="hand-cards"><div><small>You</small><div className="mini-cards">{cards.map((card, i) => <PlayingCard key={i} card={card} size="sm" />)}</div></div></div>
      <div className="street">
        {entries.map((entry, i) => <DecisionButton key={entry.review.id} text={`${streetName(entry.review.street)} · You ${entry.review.action.toLowerCase()}`} entry={entry} selected={i === index} onClick={() => onSelect(i)} />)}
      </div>
    </>
  );
}

function DecisionButton({ text, entry, selected, onClick }: { text: string; entry: Entry; selected: boolean; onClick: () => void }) {
  return (
    <button className={`decision ${selected ? "selected" : ""}`} aria-pressed={selected} onClick={onClick}>
      {text}<span className={verdictClass[entry.explanation.verdict]}>{entry.explanation.tag}</span>
    </button>
  );
}

function neighbour(entry: Entry) {
  const text = `you ${entry.review.action.toLowerCase()}`;
  return `${streetName(entry.review.street)}: ${text}`;
}

function Detail({ entry, index, count, entries, onSelect }: { entry: Entry; index: number; count: number; entries: Entry[]; onSelect: (index: number) => void }) {
  const { review, explanation } = entry;
  const previous = entries[index - 1];
  const next = entries[index + 1];
  return (
    <>
      <div>
        <div className="eyebrow">Decision {index + 1} of {count} · {streetName(review.street)}</div>
        <h2>{explanation.headline}</h2>
        <span className={`verdict ${verdictClass[explanation.verdict]}`}><i />{explanation.verdictText}</span>
      </div>
      <dl className="facts">
        {explanation.facts.map((fact) => <div key={fact.label}><dt>{fact.label}</dt><dd className="mono">{fact.value}</dd></div>)}
      </dl>
      <div className="prose">{explanation.paragraphs.map((paragraph, i) => <p key={i}>{paragraph}</p>)}</div>
      <div className="options">
        <div className="eyebrow">Options, best first</div>
        {explanation.options.map((option) => (
          <div className="option" key={option.action}>
            <b className={optionClass(option.tag)}>{option.tag}</b>
            <strong>{option.action}{option.yours && !/your move/i.test(option.tag) && <small> · your move</small>}</strong>
            <span>{option.reason}</span>
          </div>
        ))}
      </div>
      {explanation.resultNote && <p className="result-note">{explanation.resultNote}</p>}
      <nav className="decision-nav" aria-label="Decisions">
        {previous ? <button className="ghost" onClick={() => onSelect(index - 1)}>← {neighbour(previous)}</button> : <span />}
        {next ? <button className="ghost" onClick={() => onSelect(index + 1)}>{neighbour(next)} →</button> : <span />}
      </nav>
    </>
  );
}
