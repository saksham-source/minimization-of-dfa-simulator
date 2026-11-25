import { buildTransitionMap } from './helpers';
import type { DFA, StateId, SymbolToken } from './types';

function pairKeyLocal(p: StateId, q: StateId): string {
  return `${JSON.stringify(p)}|${JSON.stringify(q)}`;
}

export function findWitness(dfa: DFA, p: StateId, q: StateId): SymbolToken[] | null {
  const stateIds = new Set(dfa.states.map((s) => s.id));
  if (!stateIds.has(p) || !stateIds.has(q)) {
    throw new Error(`Invalid state ID passed to findWitness: (${p}, ${q}).`);
  }
  if (p === q) return null;

  const delta = buildTransitionMap(dfa);
  const finalSet = new Set(dfa.finalStateIds);

  const startKey = pairKeyLocal(p, q);
  const visited = new Set<string>([startKey]);
  const parent = new Map<string, { fromKey: string; symbol: SymbolToken }>();
  const queue: [StateId, StateId][] = [[p, q]];

  let head = 0;
  while (head < queue.length) {
    const [u, v] = queue[head]!;
    head += 1;
    const curKey = pairKeyLocal(u, v);

    if (finalSet.has(u) !== finalSet.has(v)) {
      const tokens: SymbolToken[] = [];
      let traceKey = curKey;
      while (traceKey !== startKey) {
        const edge = parent.get(traceKey);
        if (!edge) break;
        tokens.push(edge.symbol);
        traceKey = edge.fromKey;
      }
      tokens.reverse();
      return tokens;
    }

    const rowU = delta.get(u)!;
    const rowV = delta.get(v)!;
    for (const sym of dfa.alphabet) {
      const nextU = rowU.get(sym)!;
      const nextV = rowV.get(sym)!;
      if (nextU === nextV) continue;
      const nextKey = pairKeyLocal(nextU, nextV);
      if (!visited.has(nextKey)) {
        visited.add(nextKey);
        parent.set(nextKey, { fromKey: curKey, symbol: sym });
        queue.push([nextU, nextV]);
      }
    }
  }

  return null;
}
