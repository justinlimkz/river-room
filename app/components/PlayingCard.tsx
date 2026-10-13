import { cardLabel, type Card } from "../poker-engine";

const SYMBOLS = { clubs: "♣", diamonds: "♦", hearts: "♥", spades: "♠" };

export function PlayingCard({ card, hidden = false, small = false }: { card?: Card; hidden?: boolean; small?: boolean }) {
  if (hidden || !card) return <div className={`card card-back ${small ? "small" : ""}`} aria-label="Face-down card"><span>RR</span></div>;
  const red = card.suit === "hearts" || card.suit === "diamonds";
  return (
    <div className={`card ${red ? "red" : "black"} ${small ? "small" : ""}`} aria-label={cardLabel(card)}>
      <strong>{card.rank}</strong><span>{SYMBOLS[card.suit]}</span>
    </div>
  );
}
