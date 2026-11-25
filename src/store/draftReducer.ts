import { MAX_ALPHABET, MAX_STATES, type DFADraft, type LayoutNode, type StateId, type SymbolToken } from '../engine/types';

export const MAX_UNDO_HISTORY = 50;

export interface DraftHistoryEntry {
  label: string;
  draft: DFADraft;
}

export interface DraftStoreState {
  draft: DFADraft;
  undoStack: DraftHistoryEntry[];
  redoStack: DraftHistoryEntry[];
  semanticRevision: number;
  layoutRevision: number;
}

export type DraftAction =
  | { type: 'renameDraft'; name: string }
  | { type: 'addState'; label?: string }
  | { type: 'renameState'; stateId: StateId; label: string }
  | { type: 'removeState'; stateId: StateId }
  | { type: 'setStart'; stateId: StateId }
  | { type: 'toggleFinal'; stateId: StateId }
  | { type: 'setTransition'; from: StateId; symbol: SymbolToken; to: StateId | null }
  | { type: 'addSymbol'; symbol: SymbolToken }
  | { type: 'removeSymbol'; symbol: SymbolToken }
  | { type: 'updateLayout'; layout: LayoutNode[] }
  | { type: 'clearLayout' }
  | { type: 'replaceDraft'; draft: DFADraft; label?: string; resetHistory?: boolean }
  | { type: 'undo' }
  | { type: 'redo' };

function cloneDraft(d: DFADraft): DFADraft {
  return {
    schemaVersion: 1,
    name: d.name,
    states: d.states.map((s) => ({ ...s })),
    alphabet: [...d.alphabet],
    startStateId: d.startStateId,
    finalStateIds: [...d.finalStateIds],
    transitions: d.transitions.map((t) => ({ ...t })),
    ...(d.layout ? { layout: d.layout.map((l) => ({ ...l })) } : {}),
  };
}

function pushHistory(
  state: DraftStoreState,
  label: string,
  nextDraft: DFADraft,
): DraftStoreState {
  const undoStack = [...state.undoStack, { label, draft: cloneDraft(state.draft) }].slice(
    -MAX_UNDO_HISTORY,
  );
  return {
    draft: nextDraft,
    undoStack,
    redoStack: [],
    semanticRevision: state.semanticRevision + 1,
    layoutRevision: state.layoutRevision + 1,
  };
}

function generateStateId(existingIds: Set<string>): string {
  let idx = existingIds.size;
  while (existingIds.has(`q${idx}`)) {
    idx += 1;
  }
  return `q${idx}`;
}

function generateStateLabel(existingLabels: Set<string>): string {
  let idx = existingLabels.size;
  while (existingLabels.has(`Q${idx}`)) {
    idx += 1;
  }
  return `Q${idx}`;
}

export function createInitialDraftState(initialDraft: DFADraft): DraftStoreState {
  return {
    draft: cloneDraft(initialDraft),
    undoStack: [],
    redoStack: [],
    semanticRevision: 1,
    layoutRevision: 1,
  };
}

export function draftReducer(state: DraftStoreState, action: DraftAction): DraftStoreState {
  switch (action.type) {
    case 'renameDraft': {
      const next = cloneDraft(state.draft);
      next.name = action.name;
      return pushHistory(state, 'Rename DFA', next);
    }

    case 'addState': {
      if (state.draft.states.length >= MAX_STATES) return state;
      const existingIds = new Set(state.draft.states.map((s) => s.id));
      const existingLabels = new Set(state.draft.states.map((s) => s.label));
      const id = generateStateId(existingIds);
      const label = action.label?.trim() || generateStateLabel(existingLabels);
      const next = cloneDraft(state.draft);
      next.states.push({ id, label });
      if (next.layout && next.layout.length > 0) {
        const maxX = Math.max(...next.layout.map((l) => l.x));
        const avgY = next.layout.reduce((sum, l) => sum + l.y, 0) / next.layout.length;
        next.layout.push({ stateId: id, x: Math.min(9500, maxX + 130), y: avgY });
      }
      return pushHistory(state, `Add state ${label}`, next);
    }

    case 'renameState': {
      const trimmed = action.label.trim();
      const target = state.draft.states.find((s) => s.id === action.stateId);
      if (!target || target.label === trimmed) return state;
      const next = cloneDraft(state.draft);
      const s = next.states.find((item) => item.id === action.stateId);
      if (s) s.label = trimmed;
      return pushHistory(state, `Rename state to ${trimmed}`, next);
    }

    case 'removeState': {
      if (state.draft.states.length <= 1) return state;
      const target = state.draft.states.find((s) => s.id === action.stateId);
      if (!target) return state;
      const next = cloneDraft(state.draft);
      next.states = next.states.filter((s) => s.id !== action.stateId);
      next.finalStateIds = next.finalStateIds.filter((id) => id !== action.stateId);
      if (next.startStateId === action.stateId) {
        next.startStateId = null;
      }
      next.transitions = next.transitions.filter(
        (t) => t.from !== action.stateId && t.to !== action.stateId,
      );
      if (next.layout) {
        next.layout = next.layout.filter((l) => l.stateId !== action.stateId);
      }
      return pushHistory(state, `Delete state ${target.label}`, next);
    }

    case 'setStart': {
      if (state.draft.startStateId === action.stateId) return state;
      const target = state.draft.states.find((s) => s.id === action.stateId);
      if (!target) return state;
      const next = cloneDraft(state.draft);
      next.startStateId = action.stateId;
      return pushHistory(state, `Set start state ${target.label}`, next);
    }

    case 'toggleFinal': {
      const target = state.draft.states.find((s) => s.id === action.stateId);
      if (!target) return state;
      const next = cloneDraft(state.draft);
      if (next.finalStateIds.includes(action.stateId)) {
        next.finalStateIds = next.finalStateIds.filter((id) => id !== action.stateId);
        return pushHistory(state, `Unmark ${target.label} as final`, next);
      }
      next.finalStateIds = [...next.finalStateIds, action.stateId];
      return pushHistory(state, `Mark ${target.label} as final`, next);
    }

    case 'setTransition': {
      const next = cloneDraft(state.draft);
      const filtered = next.transitions.filter(
        (t) => !(t.from === action.from && t.symbol === action.symbol),
      );
      if (action.to !== null) {
        filtered.push({ from: action.from, symbol: action.symbol, to: action.to });
      }
      next.transitions = filtered;
      const fromLbl = next.states.find((s) => s.id === action.from)?.label ?? action.from;
      const toLbl = action.to
        ? next.states.find((s) => s.id === action.to)?.label ?? action.to
        : 'missing';
      return pushHistory(state, `Set δ(${fromLbl}, ${action.symbol}) → ${toLbl}`, next);
    }

    case 'addSymbol': {
      const sym = action.symbol.trim();
      if (!sym || state.draft.alphabet.length >= MAX_ALPHABET || state.draft.alphabet.includes(sym)) {
        return state;
      }
      const next = cloneDraft(state.draft);
      next.alphabet = [...next.alphabet, sym];
      return pushHistory(state, `Add symbol "${sym}"`, next);
    }

    case 'removeSymbol': {
      if (state.draft.alphabet.length <= 1) return state;
      if (!state.draft.alphabet.includes(action.symbol)) return state;
      const next = cloneDraft(state.draft);
      next.alphabet = next.alphabet.filter((s) => s !== action.symbol);
      next.transitions = next.transitions.filter((t) => t.symbol !== action.symbol);
      return pushHistory(state, `Remove symbol "${action.symbol}"`, next);
    }

    case 'updateLayout': {
      const next = cloneDraft(state.draft);
      next.layout = action.layout.map((l) => ({ ...l }));
      // Layout drag does NOT alter semanticRevision or invalidate trace
      return {
        ...state,
        draft: next,
        layoutRevision: state.layoutRevision + 1,
      };
    }

    case 'clearLayout': {
      const next = cloneDraft(state.draft);
      delete next.layout;
      return {
        ...state,
        draft: next,
        layoutRevision: state.layoutRevision + 1,
      };
    }

    case 'replaceDraft': {
      if (action.resetHistory) {
        return createInitialDraftState(action.draft);
      }
      return pushHistory(state, action.label ?? 'Replace DFA', cloneDraft(action.draft));
    }

    case 'undo': {
      if (state.undoStack.length === 0) return state;
      const prev = state.undoStack[state.undoStack.length - 1]!;
      const nextUndo = state.undoStack.slice(0, -1);
      const nextRedo = [
        ...state.redoStack,
        { label: prev.label, draft: cloneDraft(state.draft) },
      ].slice(-MAX_UNDO_HISTORY);
      return {
        draft: cloneDraft(prev.draft),
        undoStack: nextUndo,
        redoStack: nextRedo,
        semanticRevision: state.semanticRevision + 1,
        layoutRevision: state.layoutRevision + 1,
      };
    }

    case 'redo': {
      if (state.redoStack.length === 0) return state;
      const entry = state.redoStack[state.redoStack.length - 1]!;
      const nextRedo = state.redoStack.slice(0, -1);
      const nextUndo = [
        ...state.undoStack,
        { label: entry.label, draft: cloneDraft(state.draft) },
      ].slice(-MAX_UNDO_HISTORY);
      return {
        draft: cloneDraft(entry.draft),
        undoStack: nextUndo,
        redoStack: nextRedo,
        semanticRevision: state.semanticRevision + 1,
        layoutRevision: state.layoutRevision + 1,
      };
    }
  }
}
