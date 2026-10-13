/** Table amounts are whole dollars at $1/$2; big-blind units divide by two. */
export function formatChips(amount: number, inBB: boolean) {
  return inBB ? `${amount / 2} bb` : `$${amount}`;
}
