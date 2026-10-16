import { useState } from "react";
import { cardLabel, type ReviewItem } from "../poker-engine";

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

export function ReviewPanel({ items, title, onClose }: { items: ReviewItem[]; title: string; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const selected = items[index] ? clarifyLegacyReview(items[index]) : null;
  const displayedItems = selected ? [selected] : [];
  const move = (step: number) => { setIndex((current) => Math.max(0, Math.min(items.length - 1, current + step))); };
  const focus = selected;
  return (
    <div className="review-overlay" role="dialog" aria-modal="true" aria-labelledby="review-title">
      <div className="review-panel">
        <div className="review-header">
          <div><span className="eyebrow">Decision coach</span><h2 id="review-title">{title}</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Close review">×</button>
        </div>
        <div className="review-navigation"><button disabled={index === 0} onClick={() => move(-1)}>← Previous</button><span>Decision {items.length ? index + 1 : 0} of {items.length}</span><button disabled={index >= items.length - 1} onClick={() => move(1)}>Next →</button></div>
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
                {item.equity !== undefined && <div className="equity-strip"><span><small>Estimated equity vs likely hands</small><strong>≈{Math.round(item.equity * 100)}%</strong></span><span><small>Pot odds (price to call)</small><strong>{Math.round(item.potOdds * 100)}%</strong></span></div>}
                <p className="review-verdict"><strong>Recommended baseline: {item.suggestion}.</strong> {item.note}</p>
                {item.recommendedSize && <p className="size-guidance">Sizing guide: target ${item.recommendedSize.target}; approximately ${item.recommendedSize.min}–${item.recommendedSize.max} remains reasonable.</p>}
                <div className="review-alternatives" aria-label="Action comparison">
                  {item.alternatives.map((alternative) => <div key={alternative.action}><b className={`mini-grade ${alternative.verdict.toLowerCase()}`}>{alternative.verdict}</b><strong>{alternative.action}</strong><span>{alternative.reason}</span></div>)}
                </div>
                <p className="review-takeaway"><strong>Remember:</strong> {item.takeaway}</p>
              </article>
            ))}
          </div>
        )}
        <button className="primary wide" onClick={onClose}>Back to table</button>
      </div>
    </div>
  );
}
