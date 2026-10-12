"""Generate offline fixtures with an independent, pinned public CFR+ solver.
Usage: python3 scripts/generate-solver-reference.py /path/to/noambrown/poker_solver
No application code is imported. The upstream checkout is read-only.
"""
import hashlib
import json
import subprocess
import sys
from pathlib import Path

REVISION = '6a10442877ffc8fd28af93e16e279b9bbdd97b2a'
root = Path(sys.argv[1]).resolve()
assert subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD'], text=True).strip() == REVISION
assert not subprocess.check_output(['git', '-C', str(root), 'diff', '--', 'python/src'], text=True).strip(), 'Modified solver source'
sys.path.insert(0, str(root / 'python/src'))
from games.river_holdem import RiverHoldemConfig, RiverHoldemGame, card_str
from algorithms.vector_cfr import VectorCFRConfig, VectorCFRTrainer
from algorithms.vector_eval import build_strength_summary, exploitability, profile_strategy, action_tokens

output = {'schema': 1, 'source': {'url': 'https://github.com/noambrown/poker_solver', 'commit': REVISION,
    'algorithm': 'CFR+', 'iterations': 20000, 'seed': None, 'license': 'MIT',
    'evConvention': 'chips returned minus additional investment from the decision; prior contributions are sunk',
    'rake': {'rate': 0, 'cap': 0}, 'scope': 'Heads-up river, restricted ranges, check or single all-in sizing; no online-population claim'}, 'games': []}
for stack in (10, 20, 40):
    # Zero-weight support keeps the upstream vector strength lookup defined
    # for disjoint ranges. These extra hands never contribute probability.
    config = {'board': ['2s', '3h', '4d', '6c', '7c'], 'pot': 20, 'stack': stack,
              'bet_sizes': [stack / 20], 'include_all_in': True, 'max_raises': 0,
              'players': [{'hands': ['AsAd', 'QsQd', 'KsKd'], 'weights': [1, 1, 0]}, {'hands': ['AsAd', 'QsQd', 'KsKd'], 'weights': [0, 0, 1]}]}
    game = RiverHoldemGame(RiverHoldemConfig(board=config['board'], pot=20, stacks=(stack, stack),
        bet_sizes=config['bet_sizes'], include_all_in=True, max_raises=0,
        ranges=tuple(p['hands'] for p in config['players']), range_weights=tuple(p['weights'] for p in config['players'])))
    trainer = VectorCFRTrainer(game, VectorCFRConfig(use_plus=True, linear_weighting=True, alternating=True))
    trainer.run(20000)
    profile = trainer.average_strategy_profile()
    exp = exploitability(game, profile, {0: build_strength_summary(game.hands[1]), 1: build_strength_summary(game.hands[0])})
    assert exp <= 0.002, f'Solver convergence failed: {exp}'
    # Closed-form polarized river game: value always bets, bluff fraction
    # B/(P+B) within the equally weighted weak range; catcher calls P/(P+B).
    root_mix = profile[0]['root'][1]
    response_mix = profile[1][f'b{stack}'][1]
    analytic = {'valueBet': 1, 'weakBet': stack / (20 + stack), 'catcherCall': 20 / (20 + stack)}
    assert abs(root_mix[0][1] - analytic['valueBet']) < 0.001
    assert abs(root_mix[1][1] - analytic['weakBet']) < 0.001
    assert abs(response_mix[2][0] - analytic['catcherCall']) < 0.001
    cases = []
    def continuation(state, hands, target):
        if game.is_terminal(state):
            if state.terminal_winner is not None:
                share = float(state.terminal_winner == target)
            else:
                a, b = (game.hands[i][hands[i]].strength for i in (target, 1-target))
                share = 1.0 if a > b else 0.5 if a == b else 0.0
            return share * game.pot_total(state) - state.contrib[target]
        player = state.player
        probs = profile_strategy(game, profile[player], state, player, len(game.hands[player]))[hands[player]]
        return sum(p * continuation(game.next_state(state, a), hands, target) for a, p in zip(game.legal_actions(state), probs))
    def visit(state, reach):
        if game.is_terminal(state): return
        player = state.player; other = 1-player
        actions = game.legal_actions(state)
        matrix = profile_strategy(game, profile[player], state, player, len(game.hands[player]))
        for h, hand in enumerate(game.hands[player]):
            if game.hand_weights[player][h] <= 0: continue
            legal = [(i, w) for i, w in enumerate(reach[other]) if w > 1e-10 and not set(hand.cards).intersection(game.hands[other][i].cards)]
            total = sum(w for _, w in legal)
            if total <= 1e-8: continue
            refs = []
            for a, token, frequency in zip(actions, action_tokens(actions), matrix[h]):
                ev = 0
                for o, w in legal:
                    hands = [0, 0]; hands[player] = h; hands[other] = o
                    ev += w / total * (continuation(game.next_state(state, a), hands, player) + state.contrib[player])
                refs.append({'token': token, 'ev': ev, 'frequency': frequency})
            cases.append({'id': f'jam-{stack}:{"/".join(state.history) or "root"}:{player}:{h}',
                'history': state.history, 'player': player, 'contributions': state.contrib,
                'hero': [card_str(c) for c in hand.cards],
                'opponentRange': [{'cards': [card_str(c) for c in game.hands[other][i].cards], 'weight': w / total} for i, w in legal],
                'actions': refs})
        for a_idx, action in enumerate(actions):
            child_reach = [list(r) for r in reach]
            child_reach[player] = [w * matrix[h][a_idx] for h, w in enumerate(reach[player])]
            visit(game.next_state(state, action), child_reach)
    visit(game.initial_state(), [list(w) for w in game.hand_weights])
    output['games'].append({'config': config, 'configSha256': hashlib.sha256(json.dumps(config, sort_keys=True).encode()).hexdigest(),
        'analyticalEquilibriumCheck': analytic, 'exploitabilityChips': exp, 'profile': profile, 'cases': cases})
path = Path('benchmarks/fixtures/public-river-cfr.json')
path.write_text(json.dumps(output, indent=2) + '\n')
print(json.dumps({'path': str(path), 'cases': sum(len(g['cases']) for g in output['games']), 'exploitability': [g['exploitabilityChips'] for g in output['games']]}))
