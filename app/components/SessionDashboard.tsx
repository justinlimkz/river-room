import { humanSeat, type HandState } from "../poker-engine";
import { formatChips } from "./format";

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

export function SessionDashboard({ state, inBB, net, reviewCount, historyLocked, onOpenHistory }: {
  state: HandState;
  inBB: boolean;
  net: number;
  reviewCount: number;
  historyLocked: boolean;
  onOpenHistory: () => void;
}) {
  const chips = (amount: number) => formatChips(amount, inBB);
  const heroStats = state.players[humanSeat].stats;
  const preflopDecisions = heroStats.preflopFolds + heroStats.preflopCalls + heroStats.preflopRaises;
  const postflopDecisions = heroStats.postflopFolds + heroStats.postflopCalls + heroStats.postflopRaises + heroStats.postflopChecks;
  const completedHands = Math.max(0, state.sessionHands - (state.status === "playing" ? 1 : 0));
  // Smoothed mistake rate so a couple of early flags do not dominate the ranking.
  const trainingLeaks = Object.entries(state.trainingSummary)
    .map(([key, stat]) => ({ key: key as keyof typeof LEAK_LABELS, ...stat, score: (stat.mistakes + 2) / (stat.opportunities + 8) }))
    .filter((leak) => leak.opportunities >= 8)
    .sort((a, b) => b.score - a.score || b.totalRegret - a.totalRegret)
    .slice(0, 3);
  return (
      <section className="session-dashboard" aria-label="Your session statistics">
        <div className="session-heading"><span className="eyebrow">Your session</span><small>Since last reset</small></div>
        <div className="session-summary">
          <div><strong>{net >= 0 ? "+" : ""}{chips(net)}</strong><small>NET · INCLUDES IN PLAY</small></div>
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
          <div className="stat-section-title"><strong>TRAINING FOCUS</strong><span>unvalidated model flags</span></div>
          {trainingLeaks.length ? trainingLeaks.map((leak) => (
            <div className="leak-row" key={leak.key}>
              <span><strong>{LEAK_LABELS[leak.key]}</strong><small>{leak.mistakes} model flags in {leak.opportunities} spots · ${leak.totalRegret.toFixed(0)} modeled cost</small></span>
              <b>{leak.opportunities >= 30 ? "30+ spots" : leak.opportunities >= 15 ? "15+ spots" : "Early"}</b>
            </div>
          )) : <p className="leak-empty">Keep playing: each category needs at least 8 relevant decisions before it is labeled a possible leak.</p>}
          {trainingLeaks[0] && <p className="practice-focus"><strong>Next-session drill:</strong> pause on every {LEAK_LABELS[trainingLeaks[0].key].toLowerCase()} spot and state your range, price, and purpose before acting.</p>}
        </section>
        {reviewCount > 0 && <button disabled={historyLocked} className="review-history-button" onClick={onOpenHistory}>Review learning history · {reviewCount}</button>}
      </section>
  );
}
