import { cardLabel, type Card } from "../poker-engine";

const SYMBOLS = { clubs: "♣", diamonds: "♦", hearts: "♥", spades: "♠" };

export function PlayingCard({ card, hidden = false, size = "md" }: { card?: Card; hidden?: boolean; size?: "sm" | "md" | "lg" }) {
  if (hidden || !card) return <div className={`card card-back card-${size}`} aria-label="Face-down card" />;
  const red = card.suit === "hearts" || card.suit === "diamonds";
  return (
    <div className={`card card-${size} ${red ? "red" : ""}`} aria-label={cardLabel(card)}>
      <b>{card.rank === "T" ? "10" : card.rank}</b><i>{SYMBOLS[card.suit]}</i>
    </div>
  );
}

export function EmptySlot() {
  return <div className="card card-md card-slot" />;
}
