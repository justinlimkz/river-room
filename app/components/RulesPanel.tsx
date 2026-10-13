export function RulesPanel({ onClose }: { onClose: () => void }) {
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
