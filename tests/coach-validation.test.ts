import assert from 'node:assert/strict';
import test from 'node:test';
import { applyAction, buildReview, coachView, evaluatePostflopActionsV10, seededRandom, createSession, type PokerAction, type HandState } from '../app/poker-engine';
import { riverState, rangeLedger, parseCard } from '../benchmarks/adapter';
const royalBoard=['Qs','Js','Ts','2d','3c'];
const evaluate=(state:HandState,action:PokerAction,opponent=['9c','9d'])=>evaluatePostflopActionsV10(state,5,36,seededRandom(1),rangeLedger(state,[{cards:opponent,weight:1}]),{actions:[action]})[0];

// Constants below are derived from the house rules, independently of evaluator
// implementation: $200 pot less $3 rake; a $20 call receives $237 minus its cost.
for (const [name, bet, expected] of [['check back',0,197],['call',20,217]] as const) {
  test(`royal flush ${name}: EV equals cash returned minus new investment`,()=>{
    const s=riverState(royalBoard,['As','Ks']);
    Object.assign(s.players[0],{committed:100+bet,streetBet:bet,stack:100-bet,hole:['9c','9d'].map(parseCard)});
    s.currentBet=bet;
    const action:PokerAction={type:bet?'call':'check'};
    const e=evaluate(s,action);
    assert.equal(e.ev,expected);assert.equal(e.evMethod,'terminal-enumeration');
    const result=applyAction(s,5,action);
    assert.equal(result.status,'handOver');
    assert.equal(result.players[5].stack-s.players[5].stack,expected);
  });
}
test('terminal losses and fractional weighted ranges have the correct incremental EV',()=>{
  const s=riverState(['2s','3h','4d','6c','7c'],['Ks','Kd']);
  Object.assign(s.players[0],{committed:120,streetBet:20});s.currentBet=20;
  assert.equal(evaluate(s,{type:'call'},['As','Ad']).ev,-20);
  const e=evaluatePostflopActionsV10(s,5,36,seededRandom(1),rangeLedger(s,[{cards:['As','Ad'],weight:3},{cards:['Qs','Qd'],weight:1}]),{actions:[{type:'call'}]})[0];
  assert.equal(e.ev,39.3); // .25 * 237 - 20 = 39.25, rounded to .1
});
test('short call excludes uncallable excess and all-in call is identical',()=>{
  const s=riverState(royalBoard,['As','Ks']);s.players[5].stack=20;
  Object.assign(s.players[0],{committed:200,streetBet:100,stack:0,allIn:true});s.currentBet=100;
  assert.equal(evaluate(s,{type:'call'}).ev,217);
  assert.equal(evaluate(s,{type:'all-in'}).ev,217);
  const r=buildReview(s,{type:'call'});assert.equal(r.toCall,20);assert.equal(r.potOdds,20/240);
});
test('split pot follows odd-chip position rather than multiplying by half',()=>{
  const s=riverState(['As','Ks','Qs','Js','Ts'],['2h','3h'],200);
  assert.equal(evaluate(s,{type:'check'},['4h','5h']).ev,98);
  s.dealer=0;assert.equal(evaluate(s,{type:'check'},['4h','5h']).ev,99);
});
test('small pots apply integer rake rounding and large pots apply the cap',()=>{
  assert.equal(evaluate(riverState(royalBoard,['As','Ks'],10),{type:'check'}).ev,9);
  assert.equal(evaluate(riverState(royalBoard,['As','Ks'],1000),{type:'check'}).ev,997);
});
test('multiway terminal payout respects side-pot eligibility and single hand rake cap',()=>{
  const s=riverState(royalBoard,['As','Ks'],100);s.players[5].committed=50;
  Object.assign(s.players[0],{committed:100,allIn:true});
  Object.assign(s.players[1],{committed:100,folded:false,allIn:true});
  const ledger={...rangeLedger(s,[{cards:['9c','9d'],weight:1}]),1:rangeLedger(s,[{cards:['8c','8d'],weight:1}])[0]};
  const e=evaluatePostflopActionsV10(s,5,36,seededRandom(1),ledger,{actions:[{type:'check'}]})[0];
  assert.equal(e.ev,147);assert.equal(e.evMethod,'terminal-sampling'); // hero only eligible for 3 * 50 less 3
});
test('a first river check is not incorrectly treated as a terminal payout',()=>{
  const s=riverState(royalBoard,['As','Ks']);s.players[0].acted=false;s.dealer=0;
  assert.equal(evaluate(s,{type:'check'}).evMethod,'heuristic');
});
test('coach never reads hidden profiles, opponent cards or the deck, on any street',()=>{
  for(const street of ['preflop','flop','turn','river'] as const){
    const s=riverState(royalBoard,['As','Ks']);s.street=street;
    s.board=s.board.slice(0,street==='preflop'?0:street==='flop'?3:street==='turn'?4:5);
    const expected=buildReview(s,{type:'check'});
    Object.defineProperty(s,'deck',{get(){throw new Error('Private deck read');}});
    s.players.forEach((p,i)=>{
      Object.defineProperty(p,'profile',{get(){throw new Error('Private profile read');}});
      if(i!==5)Object.defineProperty(p,'hole',{get(){throw new Error('Private cards read');}});
    });
    assert.deepEqual(buildReview(s,{type:'check'}),expected);
    assert.equal(expected.validationStatus,'unvalidated');
    assert.equal(coachView(s).players[0].hole.length,0);
  }
});
test('custom wager is evaluated at its actual size, without nearest-size grading',()=>{
  const s=riverState(royalBoard,['As','Ks']);
  const r=buildReview(s,{type:'raise',amount:47});
  assert.ok(r.alternatives.some(a=>a.action==='Bet to $47'));
});
test('preflop grades do not manufacture dollar regret without an EV estimate',()=>{
  let s=createSession(seededRandom(18));s.currentActor=5;s.players[5].acted=false;
  s.players[5].hole=['As','Ad'].map(parseCard);
  const next=applyAction(s,5,{type:'fold'});
  assert.notEqual(next,s);
  assert.equal(next.trainingDecisions.at(-1)?.estimatedRegret,0);
});

test('an oversized wager cannot risk unmatched chips or face a raise after all-in',()=>{
  const s=riverState(royalBoard,['As','Ks']);s.players[5].stack=1000;s.players[0].stack=20;
  const small=evaluate(s,{type:'raise',amount:20});
  const large=evaluate(s,{type:'all-in'});
  assert.equal(large.ev,small.ev);assert.equal(large.raiseProbability,0);
});
