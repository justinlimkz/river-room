import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { evaluatePostflopActionsV10, decideBot, seededRandom, validateAction, type PokerAction } from '../app/poker-engine';
import { riverState, rangeLedger, solverAction } from '../benchmarks/adapter';

const fixtureBytes = readFileSync('benchmarks/fixtures/public-river-cfr.json');
const fixture = JSON.parse(fixtureBytes.toString());
assert.equal(fixture.schema, 1);
assert.equal(fixture.source.commit, '6a10442877ffc8fd28af93e16e279b9bbdd97b2a');
assert.deepEqual(fixture.source.rake, {rate:0,cap:0});
const rows: Array<Record<string, unknown>> = [];
let allActionCount = 0, allActionError = 0, allActionMaxError = 0;
let terminalCount = 0, terminalMaxError = 0, coachLoss = 0, coachMaxLoss = 0, botLoss = 0, botMatched = 0, botOffTree = 0;
for (const game of fixture.games) {
  assert.ok(game.exploitabilityChips < 0.002, 'Unconverged reference');
  const config = game.config;
  assert.equal(config.max_raises, 0); assert.equal(config.pot, 20);
  assert.deepEqual(config.bet_sizes, [config.stack / config.pot]);
  for (const c of game.cases) {
    const state = riverState(config.board, c.hero, config.pot, config.stack);
    const h = state.players[5], o = state.players[0];
    const hc = c.contributions[c.player], oc = c.contributions[1-c.player];
    Object.assign(h,{streetBet:hc, committed:config.pot/2+hc, stack:config.stack-hc, position:c.player===0?'SB':'BTN'});
    Object.assign(o,{streetBet:oc, committed:config.pot/2+oc, stack:config.stack-oc, allIn:oc===config.stack, acted:c.history.length>0, position:c.player===0?'BTN':'SB'});
    state.dealer=c.player===0?0:5; state.currentBet=Math.max(hc,oc);
    state.minRaise=state.currentBet||2;
    let priorPot=config.pot;
    const priorContrib=[0,0];
    c.history.forEach((token:string,index:number)=>{
      const actor=index%2, seat=actor===c.player?5:0;
      const before=Math.max(...priorContrib)-priorContrib[actor];
      const amount=token==='c'?before:Number(token.slice(1));
      state.actionLog.push({street:'river',seat,type:token==='c'?(before?'call':'check'):'all-in',amount,toCallBefore:before,raiseLevel:token==='c'?0:1,potBefore:priorPot});
      priorContrib[actor]+=amount;priorPot+=amount;
    });
    const actions: PokerAction[] = c.actions.map((a: {token:string})=>solverAction(a.token,oc-hc));
    assert.ok(actions.length>=2);
    assert.deepEqual(priorContrib,c.contributions,'Action prefix does not match contributions');
    c.actions.forEach((a:{token:string;ev:number})=>{
      assert.ok(Number.isFinite(a.ev));
      if(a.token.startsWith('b')) assert.equal(Number(a.token.slice(1)),config.stack,'Unsupported non-all-in sizing');
    });
    actions.forEach(action=>assert.ok(validateAction(state,5,action).legal,'Reference action illegal in adapter'));
    const estimates = evaluatePostflopActionsV10(state,5,36,seededRandom(73),rangeLedger(state,c.opponentRange),{actions, rake:fixture.source.rake});
    const key=(a:PokerAction)=>JSON.stringify(a);
    const refs = new Map<string,number>(actions.map((a,i)=>[key(a),c.actions[i].ev]));
    const bestEV = Math.max(...refs.values());
    const loss = Math.max(0,bestEV-refs.get(key(estimates[0].action))!);
    coachLoss+=loss; coachMaxLoss=Math.max(coachMaxLoss,loss);
    for(const e of estimates) {
      const error=Math.abs(e.ev-refs.get(key(e.action))!);
      allActionCount++;allActionError+=error;allActionMaxError=Math.max(allActionMaxError,error);
      if(e.evMethod==='terminal-enumeration') {terminalCount++; terminalMaxError=Math.max(terminalMaxError,error);}
    }
    // No hidden reference policy is supplied to the bot. Off-tree actions are
    // explicitly excluded rather than silently mapped to a nearby solver size.
    let matched=0, offTree=0, sumLoss=0;
    for(let seed=1;seed<=100;seed++) {
      const action=decideBot(state,5,seededRandom(Math.imul(seed,0x9e3779b9)>>>0));
      const normalized=action.type==='raise' && action.amount===h.stack+h.streetBet?{type:'all-in'} as PokerAction:action;
      const ref=refs.get(key(normalized));
      if(ref===undefined){offTree++;botOffTree++;continue;}
      matched++;botMatched++; const regret=Math.max(0,bestEV-ref);sumLoss+=regret;botLoss+=regret;
    }
    rows.push({id:c.id,reference:c.actions,coach:estimates.map(e=>({action:e.action,ev:e.ev,method:e.evMethod})),coachDecisionLossChips:loss,bot:{matched,offTree,meanLossOnMatched:matched?sumLoss/matched:null}});
  }
}
assert.ok(terminalCount>0,'Missing independent EV coverage');
const mathPassed=terminalMaxError<=0.051; // engine displays EV rounded to 0.1 chip
const report={schema:1,fixtureSha256:createHash('sha256').update(fixtureBytes).digest('hex'),reference:fixture.source,
  summary:{cases:rows.length,terminalEV:{count:terminalCount,maxAbsoluteError:terminalMaxError,tolerance:0.051,passed:mathPassed},
    coach:{actionEVCount:allActionCount,meanAbsoluteEVError:allActionError/allActionCount,maxAbsoluteEVError:allActionMaxError,meanDecisionLossChips:coachLoss/rows.length,maxDecisionLossChips:coachMaxLoss,rangeInput:'oracle ranges supplied; does not test inference'},
    bots:{rng:"LCG; 100 seeds dispersed by uint32 golden-ratio multiplication per case",draws:rows.length*100,matched:botMatched,offTree:botOffTree,meanLossOnMatched:botMatched?botLoss/botMatched:null,scope:'restricted no-rake reference; production bots use fixed raked-game heuristics, so diagnostic only'},
    strategyValidated:false,onlineTransferValidated:false,holdout:false},
  exclusions:['Preflop/flop/turn','Broad and multiway ranges','Population realism','Raked equilibrium strategy','Learning and retention in unseen human games'],rows};
writeFileSync('benchmarks/latest-report.json',JSON.stringify(report,null,2)+'\n');
writeFileSync('public/coach-validation-report.json',JSON.stringify(report,null,2)+'\n');
writeFileSync('app/coach-validation.json',JSON.stringify(report.summary,null,2)+'\n');
console.log(JSON.stringify(report.summary,null,2));
assert.ok(mathPassed,'Independent terminal EV mismatch');
// Strategy promotion must be a separate, deliberately strict gate. Expected to
// fail for the current heuristic coach; never convert math success into approval.
if(process.argv.includes('--strict-strategy')) assert.ok(allActionMaxError<=0.1 && coachMaxLoss<=0.1 && botOffTree===0 && botLoss/Math.max(1,botMatched)<=0.1,'Strategy gate failed; see report. This is not a transfer certification.');
