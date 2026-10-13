import type { HandState, Seat } from "../poker-engine";
import { formatChips } from "./format";
import { PlayingCard } from "./PlayingCard";

const SEAT_CLASS = ["seat top-left", "seat top-center", "seat top-right", "seat mid-right", "seat mid-left", "seat hero"];

export function SeatView({ player, index, state, inBB }: { player: Seat; index: number; state: HandState; inBB: boolean }) {
  const showCards = player.isHuman || (state.status !== "playing" && !player.folded && !state.result.includes("uncontested"));
  const active = state.status === "playing" && state.currentActor === index;
  const chips = (amount: number) => formatChips(amount, inBB);
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
