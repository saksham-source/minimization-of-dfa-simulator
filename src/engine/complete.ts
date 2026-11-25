import {
  MAX_STATES,
  type CompletionResult,
  type DFADraft,
  type State,
  type Transition,
} from './types';
import { validateDraft } from './validate';

export function completeWithSink(draft: DFADraft): CompletionResult {
  const validation = validateDraft(draft);
  if (validation.ok) {
    return {
      ok: true,
      draft: {
        ...draft,
        states: draft.states.map((s) => ({ ...s })),
        alphabet: [...draft.alphabet],
        finalStateIds: [...draft.finalStateIds],
        transitions: draft.transitions.map((t) => ({ ...t })),
      },
      sinkState: null,
      addedTransitions: [],
    };
  }

  const nonMissingIssues = validation.issues.filter((issue) => issue.code !== 'MISSING_TRANSITION');
  if (nonMissingIssues.length > 0) {
    return {
      ok: false,
      message: 'Fix structural errors (start state, labels, symbols, or duplicate transitions) before completing with a sink state.',
      issues: nonMissingIssues,
    };
  }

  if (draft.states.length + 1 > MAX_STATES) {
    return {
      ok: false,
      message: `Cannot add a sink state because the DFA already has ${draft.states.length} states (the maximum allowed is ${MAX_STATES}). Remove a state or fill missing transitions manually.`,
      issues: [
        {
          code: 'SINK_EXCEEDS_LIMIT',
          severity: 'error',
          message: `Adding a sink state would exceed the ${MAX_STATES}-state limit.`,
          field: 'states',
        },
      ],
    };
  }

  const existingIds = new Set(draft.states.map((s) => s.id));
  const existingLabels = new Set(draft.states.map((s) => s.label.trim()));

  let sinkId = 'sink';
  let idIdx = 1;
  while (existingIds.has(sinkId)) {
    sinkId = `sink-${idIdx++}`;
  }

  let sinkLabel = 'Sink';
  let labelIdx = 2;
  while (existingLabels.has(sinkLabel)) {
    sinkLabel = `Sink ${labelIdx++}`;
  }

  const sinkState: State = { id: sinkId, label: sinkLabel };

  const existingMap = new Map<string, Map<string, string>>();
  for (const s of draft.states) {
    existingMap.set(s.id, new Map());
  }
  for (const t of draft.transitions) {
    const sym = t.symbol.trim();
    existingMap.get(t.from)?.set(sym, t.to);
  }

  const nextTransitions: Transition[] = draft.transitions.map((t) => ({
    from: t.from,
    symbol: t.symbol.trim(),
    to: t.to,
  }));
  const addedTransitions: Transition[] = [];

  for (const s of draft.states) {
    const row = existingMap.get(s.id)!;
    for (const rawSym of draft.alphabet) {
      const sym = rawSym.trim();
      if (!row.has(sym)) {
        const added: Transition = { from: s.id, symbol: sym, to: sinkId };
        nextTransitions.push(added);
        addedTransitions.push(added);
      }
    }
  }

  for (const rawSym of draft.alphabet) {
    const sym = rawSym.trim();
    const selfLoop: Transition = { from: sinkId, symbol: sym, to: sinkId };
    nextTransitions.push(selfLoop);
    addedTransitions.push(selfLoop);
  }

  let nextLayout = draft.layout ? draft.layout.map((l) => ({ ...l })) : undefined;
  if (nextLayout && nextLayout.length > 0) {
    const maxX = Math.max(...nextLayout.map((l) => l.x));
    const avgY = nextLayout.reduce((acc, l) => acc + l.y, 0) / nextLayout.length;
    nextLayout = [...nextLayout, { stateId: sinkId, x: maxX + 160, y: avgY + 90 }];
  }

  const completedDraft: DFADraft = {
    schemaVersion: 1,
    name: draft.name,
    states: [...draft.states.map((s) => ({ ...s })), sinkState],
    alphabet: draft.alphabet.map((a) => a.trim()),
    startStateId: draft.startStateId,
    finalStateIds: [...draft.finalStateIds],
    transitions: nextTransitions,
    ...(nextLayout ? { layout: nextLayout } : {}),
  };

  return {
    ok: true,
    draft: completedDraft,
    sinkState,
    addedTransitions,
  };
}
