import { createSession, seededRandom, classifyStrategicHand, type Card, type HandState, type PokerAction, type RangeLedger } from '../app/poker-engine';
export const parseCard = (text: string): Card => {
  if (!/^[2-9TJQKA][cdhs]$/.test(text)) throw new Error(`Invalid card: ${text}`);
  return { rank: text[0] as Card['rank'], suit: ({c:'clubs',d:'diamonds',h:'hearts',s:'spades'} as const)[text[1] as 'c'|'d'|'h'|'s'] };
};
export function riverState(board: string[], hero: string[], pot = 200, stack = 100): HandState {
  const state = createSession(seededRandom(1));
  Object.assign(state, { street:'river', board:board.map(parseCard), deck:[], dealer:5, currentActor:5, currentBet:0, minRaise:2, raiseCount:0, actionLog:[], status:'playing' });
  state.players.forEach((p,i) => Object.assign(p, { stack, committed: i === 0 || i === 5 ? pot / 2 : 0, streetBet:0, folded:i !== 0 && i !== 5, allIn:false, acted:i !== 5, actedAtBet:i !== 5 ? 0 : null, hole:i === 5 ? hero.map(parseCard) : [] }));
  return state;
}
export function rangeLedger(state: HandState, ranges: Array<{cards:string[];weight:number}>): RangeLedger {
  return {0:ranges.map(r=>({ cards:r.cards.map(parseCard) as [Card,Card], weight:r.weight, handClass:classifyStrategicHand(r.cards.map(parseCard), state.board) }))};
}
export function solverAction(token: string, toCall: number): PokerAction {
  if (token === 'f') return {type:'fold'};
  if (token === 'c') return {type:toCall > 0 ? 'call' : 'check'};
  if (/^b\d+$/.test(token)) return {type:'all-in'};
  throw new Error(`Unsupported solver action: ${token}`);
}
