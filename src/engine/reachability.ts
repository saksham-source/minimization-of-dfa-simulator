import { buildTransitionMap } from './helpers';
import type { DFA, ReachabilityResult, ReachabilityStep, StateId, SymbolToken } from './types';

export function findReachable(dfa: DFA): ReachabilityResult {
  const delta = buildTransitionMap(dfa);
  const visited = new Set<StateId>([dfa.startStateId]);
  const queue: StateId[] = [dfa.startStateId];
  const parent = new Map<StateId, { from: StateId; symbol: SymbolToken }>();
  const steps: ReachabilityStep[] = [];

  let head = 0;
  while (head < queue.length) {
    const q = queue[head]!;
    head += 1;
    steps.push({
      type: 'dequeue',
      stateId: q,
      visited: Array.from(visited),
      queue: queue.slice(head),
    });

    const row = delta.get(q)!;
    for (const a of dfa.alphabet) {
      const t = row.get(a);
      if (t === undefined) {
        throw new Error(`Invariant violation: missing transition (${q}, ${a}) in validated DFA.`);
      }
      const isNew = !visited.has(t);
      if (isNew) {
        visited.add(t);
        queue.push(t);
        parent.set(t, { from: q, symbol: a });
      }
      steps.push({
        type: 'inspect',
        stateId: q,
        symbol: a,
        targetId: t,
        isNew,
        visited: Array.from(visited),
        queue: queue.slice(head),
      });
    }
  }

  const reachableIds = dfa.states.filter((s) => visited.has(s.id)).map((s) => s.id);
  const unreachableIds = dfa.states.filter((s) => !visited.has(s.id)).map((s) => s.id);

  const witnessStrings = new Map<StateId, SymbolToken[]>();
  for (const id of reachableIds) {
    const tokens: SymbolToken[] = [];
    let cur = id;
    while (cur !== dfa.startStateId) {
      const p = parent.get(cur);
      if (!p) break;
      tokens.push(p.symbol);
      cur = p.from;
    }
    tokens.reverse();
    witnessStrings.set(id, tokens);
  }

  return {
    reachableIds,
    discoveryOrder: queue,
    unreachableIds,
    parent,
    witnessStrings,
    steps,
  };
}

export function restrictToReachable(dfa: DFA, reach: ReachabilityResult): DFA {
  const reachableSet = new Set(reach.reachableIds);
  if (!reachableSet.has(dfa.startStateId)) {
    throw new Error('Invariant violation: start state must be reachable.');
  }

  const states = dfa.states.filter((s) => reachableSet.has(s.id));
  const finalStateIds = dfa.finalStateIds.filter((fid) => reachableSet.has(fid));
  const transitions = dfa.transitions.filter((t) => {
    if (!reachableSet.has(t.from)) return false;
    if (!reachableSet.has(t.to)) {
      throw new Error(
        `Invariant violation: reachable state ${t.from} transitions to unreachable state ${t.to}.`,
      );
    }
    return true;
  });

  return {
    name: dfa.name,
    states,
    alphabet: [...dfa.alphabet],
    startStateId: dfa.startStateId,
    finalStateIds,
    transitions,
  };
}
