import type { DFA, State, StateId, SymbolToken } from './types';

export function countCodePoints(str: string): number {
  return Array.from(str).length;
}

export function splitCodePoints(str: string): string[] {
  return Array.from(str);
}

export function hasControlCharacters(str: string): boolean {
  for (const ch of str) {
    const code = ch.codePointAt(0) ?? 0;
    if ((code >= 0x00 && code <= 0x1f) || (code >= 0x7f && code <= 0x9f)) {
      return true;
    }
  }
  return false;
}

export function buildTransitionMap(dfa: DFA): Map<StateId, Map<SymbolToken, StateId>> {
  const map = new Map<StateId, Map<SymbolToken, StateId>>();
  for (const s of dfa.states) {
    map.set(s.id, new Map<SymbolToken, StateId>());
  }
  for (const t of dfa.transitions) {
    const row = map.get(t.from);
    if (row) {
      row.set(t.symbol, t.to);
    }
  }
  return map;
}

export function buildStateLabelMap(states: readonly State[]): Map<StateId, string> {
  const map = new Map<StateId, string>();
  for (const s of states) {
    map.set(s.id, s.label);
  }
  return map;
}

export function buildStateIndexMap(states: readonly State[]): Map<StateId, number> {
  const map = new Map<StateId, number>();
  states.forEach((s, idx) => {
    map.set(s.id, idx);
  });
  return map;
}

export function canonicalPair(
  a: StateId,
  b: StateId,
  indexMap: Map<StateId, number>,
): [StateId, StateId] {
  const ia = indexMap.get(a) ?? 0;
  const ib = indexMap.get(b) ?? 0;
  return ia <= ib ? [a, b] : [b, a];
}

export function pairKey(a: StateId, b: StateId, indexMap: Map<StateId, number>): string {
  const [p, q] = canonicalPair(a, b, indexMap);
  return `${JSON.stringify(p)}|${JSON.stringify(q)}`;
}

export function formatTokens(tokens: readonly SymbolToken[]): string {
  if (tokens.length === 0) return 'ε';
  const allSingle = tokens.every((t) => countCodePoints(t) === 1);
  return allSingle ? tokens.join('') : tokens.join(' ');
}

export function computeDfaFingerprint(dfa: DFA): string {
  const canonical = {
    states: dfa.states.map((s) => ({ id: s.id, label: s.label })),
    alphabet: [...dfa.alphabet],
    start: dfa.startStateId,
    finals: [...dfa.finalStateIds],
    transitions: dfa.transitions.map((t) => [t.from, t.symbol, t.to]),
  };
  return JSON.stringify(canonical);
}

export function labelOf(labelMap: Map<StateId, string>, id: StateId): string {
  return labelMap.get(id) ?? id;
}
