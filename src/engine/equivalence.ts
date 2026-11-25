import { buildTransitionMap } from './helpers';
import type { DFA, EquivalenceResult, StateId, SymbolToken } from './types';

function prodKey(p: StateId, q: StateId): string {
  return `${JSON.stringify(p)}|${JSON.stringify(q)}`;
}

export function checkEquivalence(a: DFA, b: DFA): EquivalenceResult {
  const setA = new Set(a.alphabet);
  const setB = new Set(b.alphabet);
  if (setA.size !== setB.size || a.alphabet.some((sym) => !setB.has(sym))) {
    throw new Error(
      'Alphabet mismatch: equivalence can only be decided between two DFAs over the exact same alphabet set.',
    );
  }

  const deltaA = buildTransitionMap(a);
  const deltaB = buildTransitionMap(b);
  const finalA = new Set(a.finalStateIds);
  const finalB = new Set(b.finalStateIds);

  const visited = new Set<string>();
  const parent = new Map<string, { fromKey: string; symbol: SymbolToken }>();
  const queue: [StateId, StateId][] = [[a.startStateId, b.startStateId]];
  const startKey = prodKey(a.startStateId, b.startStateId);
  visited.add(startKey);

  const discoveredPairs: EquivalenceResult['discoveredPairs'] = [];

  let head = 0;
  while (head < queue.length) {
    const [p, q] = queue[head]!;
    head += 1;
    const curKey = prodKey(p, q);
    const pFinal = finalA.has(p);
    const qFinal = finalB.has(q);

    const outgoing: { symbol: SymbolToken; nextP: StateId; nextQ: StateId }[] = [];
    for (const sym of a.alphabet) {
      const nextP = deltaA.get(p)!.get(sym)!;
      const nextQ = deltaB.get(q)!.get(sym)!;
      outgoing.push({ symbol: sym, nextP, nextQ });
    }

    discoveredPairs.push({ p, q, pFinal, qFinal, outgoing });

    if (pFinal !== qFinal) {
      const tokens: SymbolToken[] = [];
      let traceKey = curKey;
      while (traceKey !== startKey) {
        const edge = parent.get(traceKey);
        if (!edge) break;
        tokens.push(edge.symbol);
        traceKey = edge.fromKey;
      }
      tokens.reverse();
      return {
        equivalent: false,
        visitedPairCount: visited.size,
        counterexample: tokens,
        discoveredPairs,
      };
    }

    for (const edge of outgoing) {
      const nextKey = prodKey(edge.nextP, edge.nextQ);
      if (!visited.has(nextKey)) {
        visited.add(nextKey);
        parent.set(nextKey, { fromKey: curKey, symbol: edge.symbol });
        queue.push([edge.nextP, edge.nextQ]);
      }
    }
  }

  return {
    equivalent: true,
    visitedPairCount: visited.size,
    counterexample: null,
    discoveredPairs,
  };
}
