import { useState } from "react";
import { cardLabel, type ReviewItem } from "../poker-engine";
import validation from "../coach-validation.json";

// Older saved reviews used wording that was later corrected; patch it on display
// rather than rewriting saved history.
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

export function ReviewPanel({ items, title, onClose, drill = false }: { items: ReviewItem[]; title: string; onClose: () => void; drill?: boolean }) {
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
        <p className="review-disclaimer">Strategy advice is unvalidated. The coach uses public actions, observed stats and your cards; it cannot read hidden bot profiles. EV bands are heuristic, not statistical confidence intervals.</p>
        <details className="coach-glossary coach-validation">
          <summary>What has been independently checked?</summary>
          <p>{validation.cases} public CFR+ reference decisions across three restricted heads-up river games. {validation.terminalEV.count} terminal EV comparisons pass within {validation.terminalEV.tolerance} chip. These reference games have no rake; separate regression tests check this table’s rake, refunds, short calls and odd chips.</p>
          <p>Across all tested actions, the coach’s maximum EV error is {validation.coach.maxAbsoluteEVError.toFixed(1)} chips. Future betting, inferred ranges, mixed strategies and real online transfer remain unvalidated. Small action-choice loss against a fixed solver strategy does not establish low exploitability.</p>
          <p><a href="/coach-validation-report.json" target="_blank" rel="noreferrer">Download benchmark results and exclusions</a> · <a href="https://github.com/noambrown/poker_solver/tree/6a10442877ffc8fd28af93e16e279b9bbdd97b2a" target="_blank" rel="noreferrer">Pinned independent solver</a></p>
        </details>
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
                <div className="review-item-top"><span>Hand #{item.handNumber} · {item.street} · {item.position}</span>{reveal && <b className={`grade ${item.grade.toLowerCase()}`}>Model: {item.grade}</b>}</div>
                <p className="validation-notice"><strong>Unvalidated strategy</strong> · {item.modelVersion === "public-coach-v2" ? "Public-information model · payout math tested; ranges and strategy not solver verified." : "Legacy review · predates the EV and privacy fixes. Old estimates have not been recalculated."}</p>
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
                {item.estimatedRegret !== undefined && <p className="ev-summary"><strong>Modeled opportunity cost:</strong> about ${item.estimatedRegret.toFixed(1)} versus the highest-EV line. Small gaps are inconclusive; these estimates do not establish optimal mixing frequencies.</p>}
                {item.recommendedSize && <p className="size-guidance">Sizing guide: target ${item.recommendedSize.target}; approximately ${item.recommendedSize.min}–${item.recommendedSize.max} remains reasonable.</p>}
                <div className="review-alternatives" aria-label="Action comparison">
                  {item.alternatives.map((alternative) => <div key={alternative.action}><b className={`mini-grade ${alternative.verdict.toLowerCase()}`}>{alternative.verdict}</b><strong>{alternative.action}</strong><span>{alternative.reason}</span></div>)}
                </div>
                <p className="review-takeaway"><strong>Remember:</strong> {item.takeaway}</p>
                {item.basis && <small className="review-basis">{item.confidence ?? "Low"} model separation (uncalibrated) · {item.basis}</small>}
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
