import { describe, expect, it } from 'vitest';
import {
  checkEquivalence,
  findReachable,
  findWitness,
  minimize,
  runString,
  validateDraft,
  type DFA,
  type DFADraft,
  type Transition,
} from '../../src/engine';
import { GUIDED_PRESET } from '../../src/fixtures/presets';

// Deterministic Mulberry32 PRNG
function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateRandomDfa(rng: () => number, index: number): DFA {
  const numStates = 1 + Math.floor(rng() * 8);
  const numSymbols = 1 + Math.floor(rng() * 3);
  const states = Array.from({ length: numStates }, (_, i) => ({
    id: `s${i}`,
    label: `S${i}`,
  }));
  const alphabet = Array.from({ length: numSymbols }, (_, i) => String(i));
  const startStateId = states[Math.floor(rng() * numStates)]!.id;
  const finalStateIds = states.filter(() => rng() < 0.4).map((s) => s.id);

  const transitions: Transition[] = [];
  for (const s of states) {
    for (const sym of alphabet) {
      const target = states[Math.floor(rng() * numStates)]!.id;
      transitions.push({ from: s.id, symbol: sym, to: target });
    }
  }

  const draft: DFADraft = {
    schemaVersion: 1,
    name: `Seeded-${index}`,
    states,
    alphabet,
    startStateId,
    finalStateIds,
    transitions,
  };

  const val = validateDraft(draft);
  if (!val.ok) {
    throw new Error(`Generator produced invalid draft: ${JSON.stringify(val.issues)}`);
  }
  return val.dfa;
}

function normalizeClasses(classes: string[][]): string {
  return JSON.stringify(
    classes.map((c) => [...c].sort()).sort((a, b) => a[0]!.localeCompare(b[0]!)),
  );
}

describe('Property-style seeded DFA suite (300 DFAs, seed=20261126)', () => {
  const SEED = 20261126;
  const rng = createRng(SEED);

  it('satisfies agreement, equivalence, minimality, idempotence, and bounded string equality across 300 DFAs', () => {
    for (let i = 0; i < 300; i++) {
      const dfa = generateRandomDfa(rng, i);
      const part = minimize(dfa, 'partition');
      const tf = minimize(dfa, 'table-filling');

      // 1. Both methods agree on removed states and class sets
      expect(part.removed).toEqual(tf.removed);
      expect(normalizeClasses(part.classes)).toBe(normalizeClasses(tf.classes));
      expect(part.minimized.transitions).toEqual(tf.minimized.transitions);

      // 2. Exact product equivalence & independent verification
      const eq = checkEquivalence(dfa, part.minimized);
      expect(eq.equivalent).toBe(true);
      expect(eq.counterexample).toBeNull();
      expect(part.verification.equivalent).toBe(true);
      expect(part.verification.allStatesReachable).toBe(true);
      expect(part.verification.pairwiseDistinguishable).toBe(true);
      expect(tf.verification.equivalent).toBe(true);
      expect(tf.verification.allStatesReachable).toBe(true);
      expect(tf.verification.pairwiseDistinguishable).toBe(true);

      // 3. Independent pairwise witness check on minimized output
      const minStates = part.minimized.states;
      for (let a = 0; a < minStates.length; a++) {
        for (let b = a + 1; b < minStates.length; b++) {
          const w = findWitness(part.minimized, minStates[a]!.id, minStates[b]!.id);
          expect(w).not.toBeNull();
          if (w !== null) {
            const ra = runString(part.minimized, w, minStates[a]!.id);
            const rb = runString(part.minimized, w, minStates[b]!.id);
            expect(ra.accepted).not.toBe(rb.accepted);
          }
        }
      }

      // 4. Bounds & idempotence
      expect(part.metrics.minimalCount).toBeGreaterThanOrEqual(1);
      expect(part.metrics.minimalCount).toBeLessThanOrEqual(part.metrics.originalCount);
      const second = minimize(part.minimized, 'partition');
      expect(second.metrics.minimalCount).toBe(part.metrics.minimalCount);
      expect(second.classes.every((c) => c.length === 1)).toBe(true);

      // 5. Bounded string enumeration (length 0..3) extra regression check
      const queue: string[][] = [[]];
      for (let qIdx = 0; qIdx < queue.length; qIdx++) {
        const w = queue[qIdx]!;
        const rOrig = runString(dfa, w);
        const rMin = runString(part.minimized, w);
        expect(rOrig.accepted).toBe(rMin.accepted);
        if (w.length < 3) {
          for (const sym of dfa.alphabet) {
            queue.push([...w, sym]);
          }
        }
      }
    }
  });

  it('satisfies metamorphic invariants (reordering states, renaming labels, reordering alphabet, adding unreachable component)', () => {
    const baseVal = validateDraft(GUIDED_PRESET.draft);
    expect(baseVal.ok).toBe(true);
    if (!baseVal.ok) return;
    const baseMin = minimize(baseVal.dfa, 'partition');

    // Permute states & rename labels & reverse alphabet
    const reversedStates = [...GUIDED_PRESET.draft.states]
      .reverse()
      .map((s) => ({ id: s.id, label: `LBL_${s.label}` }));
    const reversedAlphabet = [...GUIDED_PRESET.draft.alphabet].reverse();
    const permutedVal = validateDraft({
      ...GUIDED_PRESET.draft,
      states: reversedStates,
      alphabet: reversedAlphabet,
    });
    expect(permutedVal.ok).toBe(true);
    if (!permutedVal.ok) return;
    const permutedMin = minimize(permutedVal.dfa, 'table-filling');

    expect(permutedMin.metrics.minimalCount).toBe(baseMin.metrics.minimalCount);
    expect(normalizeClasses(permutedMin.classes)).toBe(normalizeClasses(baseMin.classes));
    expect(checkEquivalence(baseMin.minimized, permutedMin.minimized).equivalent).toBe(true);

    // Add another unreachable component
    const withExtraUnreachable = validateDraft({
      ...GUIDED_PRESET.draft,
      states: [
        ...GUIDED_PRESET.draft.states,
        { id: 'Z1', label: 'Z1' },
        { id: 'Z2', label: 'Z2' },
      ],
      finalStateIds: [...GUIDED_PRESET.draft.finalStateIds, 'Z2'],
      transitions: [
        ...GUIDED_PRESET.draft.transitions,
        { from: 'Z1', symbol: '0', to: 'Z2' },
        { from: 'Z1', symbol: '1', to: 'Z1' },
        { from: 'Z2', symbol: '0', to: 'Z2' },
        { from: 'Z2', symbol: '1', to: 'F' },
      ],
    });
    expect(withExtraUnreachable.ok).toBe(true);
    if (!withExtraUnreachable.ok) return;
    const extraMin = minimize(withExtraUnreachable.dfa, 'partition');
    expect(extraMin.removed).toEqual(['U', 'Z1', 'Z2']);
    expect(extraMin.metrics.minimalCount).toBe(4);
    expect(findReachable(extraMin.minimized).reachableIds).toHaveLength(4);
  });
});
