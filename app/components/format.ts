import type { HandState } from "../poker-engine";

/** Table amounts are whole dollars at $1/$2; big-blind units divide by two. */
export function formatChips(amount: number, inBB: boolean) {
  return inBB ? `${amount / 2} bb` : `$${amount}`;
}

/** A signed amount with a true minus sign, e.g. "+$63" or "−$29". */
export function formatNet(amount: number, inBB: boolean) {
  if (amount === 0) return formatChips(0, inBB);
  return `${amount > 0 ? "+" : "−"}${formatChips(Math.abs(amount), inBB)}`;
}

/** A short reading of the result line: "Theo · One pair · $59 awarded" becomes "Theo wins $59 with one pair". */
export function resultLine(state: HandState) {
  const match = state.result.match(/^([^·&]+?) · ([^·]+?) · \$(\d+) awarded/);
  const rest = state.result.slice(match?.[0].length ?? 0);
  if (!match || /\$\d+ awarded/.test(rest)) return state.result.replace(/ · \$\d+ rake/, "");
  const [, name, hand, amount] = match;
  return `${name} ${name === "You" ? "win" : "wins"} $${amount} with ${hand.toLowerCase()}`;
}
