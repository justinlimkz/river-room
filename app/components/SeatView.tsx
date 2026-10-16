import { STYLE_LABELS, type HandState, type Seat } from "../poker-engine";
import { formatChips } from "./format";
import { PlayingCard } from "./PlayingCard";

// Opponents sit clockwise from the player's seat at the bottom: seat 0 is bottom-left.
const SEAT_PLACE = ["bottom-left", "top-left", "top", "top-right", "bottom-right", "hero"];

function betVerb(lastAction: string) {
  if (lastAction.startsWith("Bet")) return "Bets";
  if (lastAction.startsWith("Raise")) return "Raises to";
  if (lastAction.startsWith("Call")) return "Calls";
  if (lastAction.startsWith("All-in")) return "All-in";
  if (lastAction.startsWith("SB")) return "Small blind";
  if (lastAction.startsWith("BB")) return "Big blind";
  return "In for";
}

export function SeatView({ player, index, state, inBB, strength }: { player: Seat; index: number; state: HandState; inBB: boolean; strength?: string }) {
  const active = state.status === "playing" && state.currentActor === index;
  const showCards = !player.isHuman && state.status !== "playing" && !player.folded && !state.result.includes("uncontested");
  const chips = (amount: number) => formatChips(amount, inBB);
  const bet = player.streetBet > 0 ? `${betVerb(player.lastAction)} ${chips(player.streetBet)}` : "";
  const label = player.isHuman ? "" : `${STYLE_LABELS[player.profile]}${player.folded ? " · folded" : ""}`;
  if (player.isHuman) {
    return (
      <section className={`hero-seat ${player.folded ? "folded" : ""}`} aria-label={`You, ${player.position}`}>
        {bet && <div className="bet-pill">{bet}</div>}
        <div className="hero-cards">{player.hole.map((card, i) => <PlayingCard key={i} card={card} size="lg" />)}</div>
        <div className="hero-line"><strong>You</strong><span className="mono muted">{player.position}</span><span className="mono">{chips(player.stack)}</span></div>
        {strength && <div className="hero-strength">{strength}</div>}
      </section>
    );
  }
  return (
    <section className={`seat place-${SEAT_PLACE[index]} ${player.folded ? "folded" : ""} ${active ? "active" : ""}`} aria-label={`${player.name}, ${player.position}`}>
      <div className="seat-top"><span className="seat-name">{player.name}{index === state.dealer && <span className="dealer" title="Dealer button">D</span>}</span><span className="mono muted">{player.position}</span></div>
      <div className="mono">{chips(player.stack)}</div>
      <div className="seat-read">{label}</div>
      {showCards && <div className="seat-reveal">{player.hole.map((card, i) => <PlayingCard key={i} card={card} size="sm" />)}</div>}
      {bet && <div className="bet-pill">{bet}</div>}
    </section>
  );
}
