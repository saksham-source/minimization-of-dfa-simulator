import { buildStateIndexMap, buildTransitionMap } from './helpers';
import type {
  DFA,
  QuotientClassInfo,
  QuotientResult,
  QuotientTransitionEvidence,
  State,
  StateId,
  Transition,
} from './types';

export function buildQuotient(dfa: DFA, classes: StateId[][]): QuotientResult {
  const delta = buildTransitionMap(dfa);
  const stateIndex = buildStateIndexMap(dfa.states);
  const finalSet = new Set(dfa.finalStateIds);

  if (classes.length === 0) {
    throw new Error('Invariant violation: quotient construction requires at least one class.');
  }

  const canonicalClasses = classes
    .filter((c) => c.length > 0)
    .map((c) => [...c].sort((a, b) => (stateIndex.get(a) ?? 0) - (stateIndex.get(b) ?? 0)))
    .sort((c1, c2) => (stateIndex.get(c1[0]!) ?? 0) - (stateIndex.get(c2[0]!) ?? 0));

  const seenStates = new Set<StateId>();
  const classOf = new Map<StateId, StateId>();
  const classInfos: QuotientClassInfo[] = [];
  const minimizedStates: State[] = [];
  const finalStateIds: StateId[] = [];
  const mapping: { originalId: StateId; minimizedId: StateId }[] = [];

  let startStateId: StateId | null = null;

  canonicalClasses.forEach((members, idx) => {
    const minimizedId = `min-${idx}`;
    const minimizedLabel = `M${idx}`;
    const firstIsFinal = finalSet.has(members[0]!);
    let containsStart = false;

    for (const m of members) {
      if (!stateIndex.has(m)) {
        throw new Error(`Invariant violation: unknown state "${m}" in quotient class.`);
      }
      if (seenStates.has(m)) {
        throw new Error(`Invariant violation: state "${m}" appears in multiple quotient classes.`);
      }
      if (finalSet.has(m) !== firstIsFinal) {
        throw new Error(
          `Invariant violation: class ${minimizedLabel} mixes final and non-final states.`,
        );
      }
      seenStates.add(m);
      classOf.set(m, minimizedId);
      if (m === dfa.startStateId) {
        containsStart = true;
      }
    }

    if (containsStart) {
      startStateId = minimizedId;
    }
    if (firstIsFinal) {
      finalStateIds.push(minimizedId);
    }

    minimizedStates.push({ id: minimizedId, label: minimizedLabel });
    classInfos.push({
      minimizedId,
      minimizedLabel,
      members,
      isStart: containsStart,
      isFinal: firstIsFinal,
    });
  });

  if (seenStates.size !== dfa.states.length) {
    throw new Error('Invariant violation: quotient classes do not cover all states of the DFA.');
  }
  if (!startStateId) {
    throw new Error('Invariant violation: no quotient class contains the original start state.');
  }

  for (const s of dfa.states) {
    mapping.push({
      originalId: s.id,
      minimizedId: classOf.get(s.id)!,
    });
  }

  const transitions: Transition[] = [];
  const transitionEvidence: QuotientTransitionEvidence[] = [];

  for (const info of classInfos) {
    const representativeId = info.members[0]!;
    const repRow = delta.get(representativeId)!;

    for (const sym of dfa.alphabet) {
      const representativeTargetId = repRow.get(sym)!;
      const toClassId = classOf.get(representativeTargetId)!;

      const memberTargets: { memberId: StateId; targetId: StateId }[] = [];
      for (const m of info.members) {
        const targetId = delta.get(m)!.get(sym)!;
        const mTargetClass = classOf.get(targetId)!;
        if (mTargetClass !== toClassId) {
          throw new Error(
            `Invariant violation: inconsistent transition on "${sym}" in class ${info.minimizedLabel}.`,
          );
        }
        memberTargets.push({ memberId: m, targetId });
      }

      transitions.push({
        from: info.minimizedId,
        symbol: sym,
        to: toClassId,
      });

      transitionEvidence.push({
        fromClassId: info.minimizedId,
        symbol: sym,
        toClassId,
        representativeId,
        representativeTargetId,
        memberTargets,
      });
    }
  }

  const minimized: DFA = {
    name: `${dfa.name} (Minimized)`,
    states: minimizedStates,
    alphabet: [...dfa.alphabet],
    startStateId,
    finalStateIds,
    transitions,
  };

  return {
    minimized,
    mapping,
    classInfos,
    transitionEvidence,
  };
}
