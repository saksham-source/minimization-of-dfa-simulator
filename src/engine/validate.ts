import {
  MAX_ALPHABET,
  MAX_STATE_LABEL_CP,
  MAX_STATES,
  MAX_TOKEN_CP,
  RESERVED_TOKENS,
  type DFA,
  type DFADraft,
  type LayoutNode,
  type ValidationIssue,
  type ValidationResult,
} from './types';
import { countCodePoints, hasControlCharacters } from './helpers';

export function validateLayout(draft: DFADraft): {
  layout: LayoutNode[];
  warnings: ValidationIssue[];
} {
  const warnings: ValidationIssue[] = [];
  if (!draft.layout || !Array.isArray(draft.layout)) {
    return { layout: [], warnings };
  }
  const stateIds = new Set(draft.states.map((s) => s.id));
  const seen = new Set<string>();
  const clean: LayoutNode[] = [];
  for (const node of draft.layout) {
    if (
      typeof node?.stateId !== 'string' ||
      !stateIds.has(node.stateId) ||
      seen.has(node.stateId) ||
      typeof node.x !== 'number' ||
      typeof node.y !== 'number' ||
      !Number.isFinite(node.x) ||
      !Number.isFinite(node.y) ||
      Math.abs(node.x) > 10000 ||
      Math.abs(node.y) > 10000
    ) {
      warnings.push({
        code: 'INVALID_LAYOUT',
        severity: 'warning',
        message: 'Some layout coordinates were invalid or out of bounds and will be auto-positioned.',
        field: 'layout',
      });
      continue;
    }
    seen.add(node.stateId);
    clean.push({ stateId: node.stateId, x: node.x, y: node.y });
  }
  return { layout: clean, warnings };
}

export function validateDraft(draft: DFADraft): ValidationResult {
  const issues: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  if (!draft || typeof draft !== 'object') {
    return {
      ok: false,
      issues: [{ code: 'INVALID_DRAFT', severity: 'error', message: 'Draft data is malformed.' }],
    };
  }

  // Validate states
  if (!Array.isArray(draft.states) || draft.states.length === 0) {
    issues.push({
      code: 'NO_STATES',
      severity: 'error',
      message: 'At least 1 state is required.',
      field: 'states',
    });
  } else if (draft.states.length > MAX_STATES) {
    issues.push({
      code: 'TOO_MANY_STATES',
      severity: 'error',
      message: `This simulator supports at most ${MAX_STATES} states (found ${draft.states.length}).`,
      field: 'states',
    });
  }

  const stateIds = new Set<string>();
  const stateLabels = new Set<string>();
  const normalizedStates: { id: string; label: string }[] = [];

  for (const s of draft.states ?? []) {
    if (!s || typeof s.id !== 'string' || s.id.trim().length === 0) {
      issues.push({
        code: 'EMPTY_STATE_ID',
        severity: 'error',
        message: 'Every state must have a non-empty internal ID.',
        field: 'states',
      });
      continue;
    }
    if (stateIds.has(s.id)) {
      issues.push({
        code: 'DUPLICATE_STATE_ID',
        severity: 'error',
        message: `Duplicate state ID "${s.id}".`,
        stateId: s.id,
        field: 'states',
      });
      continue;
    }
    stateIds.add(s.id);

    const trimmedLabel = typeof s.label === 'string' ? s.label.trim() : '';
    const cpLen = countCodePoints(trimmedLabel);
    if (cpLen === 0) {
      issues.push({
        code: 'EMPTY_STATE_LABEL',
        severity: 'error',
        message: 'State labels cannot be empty.',
        stateId: s.id,
        field: 'states',
      });
    } else if (cpLen > MAX_STATE_LABEL_CP) {
      issues.push({
        code: 'STATE_LABEL_TOO_LONG',
        severity: 'error',
        message: `State label "${trimmedLabel}" exceeds ${MAX_STATE_LABEL_CP} characters.`,
        stateId: s.id,
        field: 'states',
      });
    } else if (hasControlCharacters(trimmedLabel)) {
      issues.push({
        code: 'CONTROL_CHAR_LABEL',
        severity: 'error',
        message: `State label "${trimmedLabel}" contains disallowed control characters.`,
        stateId: s.id,
        field: 'states',
      });
    } else if (stateLabels.has(trimmedLabel)) {
      issues.push({
        code: 'DUPLICATE_STATE_LABEL',
        severity: 'error',
        message: `Duplicate state label "${trimmedLabel}". Each state must have a unique label.`,
        stateId: s.id,
        field: 'states',
      });
    } else {
      stateLabels.add(trimmedLabel);
    }

    normalizedStates.push({ id: s.id, label: trimmedLabel });
  }

  // Validate alphabet
  if (!Array.isArray(draft.alphabet) || draft.alphabet.length === 0) {
    issues.push({
      code: 'EMPTY_ALPHABET',
      severity: 'error',
      message: 'Alphabet must contain at least 1 symbol token.',
      field: 'alphabet',
    });
  } else if (draft.alphabet.length > MAX_ALPHABET) {
    issues.push({
      code: 'TOO_MANY_SYMBOLS',
      severity: 'error',
      message: `This simulator supports at most ${MAX_ALPHABET} alphabet symbols (found ${draft.alphabet.length}).`,
      field: 'alphabet',
    });
  }

  const alphabetSet = new Set<string>();
  const normalizedAlphabet: string[] = [];

  for (const rawSym of draft.alphabet ?? []) {
    const sym = typeof rawSym === 'string' ? rawSym.trim() : '';
    const cpLen = countCodePoints(sym);
    if (cpLen === 0) {
      issues.push({
        code: 'EMPTY_SYMBOL',
        severity: 'error',
        message: 'Alphabet symbols cannot be empty.',
        field: 'alphabet',
      });
      continue;
    }
    if (cpLen > MAX_TOKEN_CP) {
      issues.push({
        code: 'SYMBOL_TOO_LONG',
        severity: 'error',
        message: `Symbol "${sym}" exceeds ${MAX_TOKEN_CP} characters.`,
        symbol: sym,
        field: 'alphabet',
      });
    }
    if (/[\s,]/.test(sym) || hasControlCharacters(sym)) {
      issues.push({
        code: 'INVALID_SYMBOL_CHARS',
        severity: 'error',
        message: `Symbol "${sym}" cannot contain whitespace, commas, or control characters.`,
        symbol: sym,
        field: 'alphabet',
      });
    }
    if (RESERVED_TOKENS.has(sym)) {
      issues.push({
        code: 'RESERVED_SYMBOL',
        severity: 'error',
        message: `Symbol "${sym}" is reserved notation (epsilon / empty set) and cannot be an alphabet token.`,
        symbol: sym,
        field: 'alphabet',
      });
    }
    if (alphabetSet.has(sym)) {
      issues.push({
        code: 'DUPLICATE_SYMBOL',
        severity: 'error',
        message: `Duplicate alphabet symbol "${sym}".`,
        symbol: sym,
        field: 'alphabet',
      });
    } else {
      alphabetSet.add(sym);
      normalizedAlphabet.push(sym);
    }
  }

  // Validate start state
  if (!draft.startStateId) {
    issues.push({
      code: 'MISSING_START',
      severity: 'error',
      message: 'A start state must be selected.',
      field: 'startStateId',
    });
  } else if (!stateIds.has(draft.startStateId)) {
    issues.push({
      code: 'UNKNOWN_START',
      severity: 'error',
      message: `Start state "${draft.startStateId}" does not exist in the state list.`,
      field: 'startStateId',
    });
  }

  // Validate final states
  const finalSeen = new Set<string>();
  const normalizedFinals: string[] = [];
  for (const fid of draft.finalStateIds ?? []) {
    if (!stateIds.has(fid)) {
      issues.push({
        code: 'UNKNOWN_FINAL',
        severity: 'error',
        message: `Final state "${fid}" does not exist in the state list.`,
        stateId: fid,
        field: 'finalStateIds',
      });
      continue;
    }
    if (finalSeen.has(fid)) {
      issues.push({
        code: 'DUPLICATE_FINAL',
        severity: 'error',
        message: `State "${fid}" appears more than once in final states.`,
        stateId: fid,
        field: 'finalStateIds',
      });
      continue;
    }
    finalSeen.add(fid);
    normalizedFinals.push(fid);
  }

  // Validate transitions using safe nested Map
  const transitionMap = new Map<string, Map<string, string>>();
  for (const s of normalizedStates) {
    transitionMap.set(s.id, new Map<string, string>());
  }

  for (const t of draft.transitions ?? []) {
    if (!t || typeof t.from !== 'string' || typeof t.symbol !== 'string' || typeof t.to !== 'string') {
      issues.push({
        code: 'MALFORMED_TRANSITION',
        severity: 'error',
        message: 'A transition entry is missing from, symbol, or to.',
        field: 'transitions',
      });
      continue;
    }
    const sym = t.symbol.trim();
    if (RESERVED_TOKENS.has(sym)) {
      issues.push({
        code: 'EPSILON_TRANSITION_UNSUPPORTED',
        severity: 'error',
        message: `Epsilon transitions (${sym}) are not supported in a DFA. Only deterministic symbol transitions are allowed.`,
        stateId: t.from,
        symbol: sym,
        field: 'transitions',
      });
      continue;
    }
    if (!stateIds.has(t.from)) {
      issues.push({
        code: 'UNKNOWN_TRANSITION_SOURCE',
        severity: 'error',
        message: `Transition source "${t.from}" is not a known state.`,
        stateId: t.from,
        symbol: sym,
        field: 'transitions',
      });
      continue;
    }
    if (!stateIds.has(t.to)) {
      issues.push({
        code: 'UNKNOWN_TRANSITION_TARGET',
        severity: 'error',
        message: `Transition from "${t.from}" on "${sym}" points to unknown state "${t.to}".`,
        stateId: t.from,
        symbol: sym,
        field: 'transitions',
      });
      continue;
    }
    if (!alphabetSet.has(sym)) {
      issues.push({
        code: 'UNKNOWN_TRANSITION_SYMBOL',
        severity: 'error',
        message: `Transition from "${t.from}" uses symbol "${sym}" which is not in the alphabet.`,
        stateId: t.from,
        symbol: sym,
        field: 'transitions',
      });
      continue;
    }

    const row = transitionMap.get(t.from)!;
    if (row.has(sym)) {
      issues.push({
        code: 'NONDETERMINISTIC_TRANSITION',
        severity: 'error',
        message: `State "${t.from}" has multiple transitions on symbol "${sym}". A DFA must have at most one target per (state, symbol).`,
        stateId: t.from,
        symbol: sym,
        field: 'transitions',
      });
      continue;
    }
    row.set(sym, t.to);
  }

  // Check totality (every state × symbol pair defined)
  const labelById = new Map<string, string>();
  for (const s of normalizedStates) {
    labelById.set(s.id, s.label || s.id);
  }

  const orderedTransitions: { from: string; symbol: string; to: string }[] = [];
  for (const s of normalizedStates) {
    const row = transitionMap.get(s.id)!;
    for (const sym of normalizedAlphabet) {
      const target = row.get(sym);
      if (target === undefined) {
        issues.push({
          code: 'MISSING_TRANSITION',
          severity: 'error',
          message: `State ${labelById.get(s.id)} is missing a transition on "${sym}".`,
          stateId: s.id,
          symbol: sym,
          field: 'transitions',
        });
      } else {
        orderedTransitions.push({ from: s.id, symbol: sym, to: target });
      }
    }
  }

  const layoutCheck = validateLayout(draft);
  warnings.push(...layoutCheck.warnings);

  if (issues.length > 0 || !draft.startStateId) {
    return { ok: false, issues };
  }

  const dfa: DFA = {
    name: (draft.name ?? '').trim() || 'Untitled DFA',
    states: normalizedStates,
    alphabet: normalizedAlphabet,
    startStateId: draft.startStateId,
    finalStateIds: normalizedFinals,
    transitions: orderedTransitions,
  };

  return { ok: true, dfa, warnings };
}
