import { buildTransitionMap, countCodePoints, splitCodePoints } from './helpers';
import {
  MAX_TEST_TOKENS,
  RESERVED_TOKENS,
  type DFA,
  type RunResult,
  type StateId,
  type SymbolToken,
} from './types';

export type ParseTokensResult =
  | { ok: true; tokens: SymbolToken[] }
  | { ok: false; message: string; position?: number; token?: string };

export function parseTokenInput(dfa: DFA, rawInput: string): ParseTokensResult {
  const trimmed = rawInput.trim();
  if (trimmed.length === 0) {
    return { ok: true, tokens: [] };
  }

  const alphabetSet = new Set(dfa.alphabet);
  const hasMultiCharToken = dfa.alphabet.some((t) => countCodePoints(t) > 1);

  let tokens: string[];
  if (hasMultiCharToken) {
    tokens = trimmed.split(/[\s,]+/).filter((t) => t.length > 0);
  } else if (/[\s,]/.test(trimmed)) {
    tokens = trimmed.split(/[\s,]+/).filter((t) => t.length > 0);
  } else {
    tokens = splitCodePoints(trimmed);
  }

  if (tokens.length > MAX_TEST_TOKENS) {
    return {
      ok: false,
      message: `Test input has ${tokens.length} tokens, which exceeds the ${MAX_TEST_TOKENS}-token limit.`,
    };
  }

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]!;
    if (RESERVED_TOKENS.has(tok)) {
      return {
        ok: false,
        position: i + 1,
        token: tok,
        message: `Token "${tok}" at position ${i + 1} is reserved notation, not an alphabet symbol. Use the "Empty string (ε)" button to test ε.`,
      };
    }
    if (!alphabetSet.has(tok)) {
      const allowed = dfa.alphabet.join(', ');
      const exampleMulti =
        hasMultiCharToken && dfa.alphabet.length >= 2
          ? ` Separate multi-character tokens with spaces or commas (for example: "${dfa.alphabet[0]} ${dfa.alphabet[1]}").`
          : '';
      return {
        ok: false,
        position: i + 1,
        token: tok,
        message: `Unknown token "${tok}" at position ${i + 1}. Allowed symbols: ${allowed}.${exampleMulti}`,
      };
    }
  }

  return { ok: true, tokens };
}

export function runString(
  dfa: DFA,
  tokens: readonly SymbolToken[],
  start?: StateId,
): RunResult {
  if (tokens.length > MAX_TEST_TOKENS) {
    throw new Error(`Input length ${tokens.length} exceeds limit of ${MAX_TEST_TOKENS} tokens.`);
  }

  const stateIds = new Set(dfa.states.map((s) => s.id));
  const startStateId = start ?? dfa.startStateId;
  if (!stateIds.has(startStateId)) {
    throw new Error(`Invalid start state "${startStateId}" in runString.`);
  }

  const alphabetSet = new Set(dfa.alphabet);
  const delta = buildTransitionMap(dfa);
  const finalSet = new Set(dfa.finalStateIds);

  let current = startStateId;
  const path: StateId[] = [current];
  const steps: RunResult['steps'] = [];

  for (let i = 0; i < tokens.length; i++) {
    const sym = tokens[i]!;
    if (!alphabetSet.has(sym)) {
      throw new Error(`Unknown symbol "${sym}" at token index ${i}.`);
    }
    const next = delta.get(current)!.get(sym);
    if (next === undefined) {
      throw new Error(`Missing transition (${current}, ${sym}) in runString.`);
    }
    steps.push({ index: i, from: current, symbol: sym, to: next });
    current = next;
    path.push(current);
  }

  return {
    ok: true,
    accepted: finalSet.has(current),
    startStateId,
    finalStateId: current,
    tokens: [...tokens],
    path,
    steps,
  };
}
