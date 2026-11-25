import { describe, expect, it } from 'vitest';
import {
  buildQuotient,
  checkEquivalence,
  completeWithSink,
  fillDistinguishabilityTable,
  findReachable,
  findWitness,
  formatExplanation,
  getStepSnapshot,
  minimize,
  parseTokenInput,
  refinePartitions,
  restrictToReachable,
  runString,
  validateDraft,
  type DFADraft,
} from '../../src/engine';
import { GUIDED_PRESET, PRESET_FIXTURES } from '../../src/fixtures/presets';

function normalizeClassSets(classes: string[][]): string {
  return JSON.stringify(
    classes
      .map((c) => [...c].sort())
      .sort((a, b) => a[0]!.localeCompare(b[0]!)),
  );
}

describe('DFA Engine — Guided Reference (§5)', () => {
  it('validates and solves the 7-to-4 guided example identically under both methods', () => {
    const val = validateDraft(GUIDED_PRESET.draft);
    expect(val.ok).toBe(true);
    if (!val.ok) return;

    const partRes = minimize(val.dfa, 'partition');
    const pairRes = minimize(val.dfa, 'table-filling');

    // Reachability discovery order: A, B, D, F, C, E; removed: U
    expect(partRes.reachability.discoveryOrder).toEqual(['A', 'B', 'D', 'F', 'C', 'E']);
    expect(partRes.removed).toEqual(['U']);
    expect(partRes.reachability.witnessStrings.get('A')).toEqual([]);
    expect(partRes.reachability.witnessStrings.get('B')).toEqual(['0']);
    expect(partRes.reachability.witnessStrings.get('D')).toEqual(['0', '0']);
    expect(partRes.reachability.witnessStrings.get('F')).toEqual(['0', '0', '0']);
    expect(partRes.reachability.witnessStrings.get('C')).toEqual(['0', '0', '0', '1']);
    expect(partRes.reachability.witnessStrings.get('E')).toEqual(['0', '0', '0', '1', '0']);

    // Partition rounds
    const p = partRes.partitionResult!;
    expect(p.initial.groups.map((g) => g.members)).toEqual([['A', 'B', 'C', 'D', 'E'], ['F']]);
    expect(p.rounds).toHaveLength(3);
    expect(p.rounds[0]!.changed).toBe(true);
    expect(p.rounds[0]!.nextPartition.groups.map((g) => g.members)).toEqual([
      ['A', 'B', 'C'],
      ['D', 'E'],
      ['F'],
    ]);
    expect(p.rounds[1]!.changed).toBe(true);
    expect(p.rounds[1]!.nextPartition.groups.map((g) => g.members)).toEqual([
      ['A'],
      ['B', 'C'],
      ['D', 'E'],
      ['F'],
    ]);
    expect(p.rounds[2]!.changed).toBe(false);
    expect(p.rounds[2]!.nextPartition.groups.map((g) => g.members)).toEqual([
      ['A'],
      ['B', 'C'],
      ['D', 'E'],
      ['F'],
    ]);

    // Table-filling rounds (§5.8)
    const tf = pairRes.pairResult!;
    expect(tf.allPairs).toHaveLength(15);
    expect(tf.initialMarked.map((a) => `${a.p}${a.q}`)).toEqual(['AF', 'BF', 'CF', 'DF', 'EF']);
    expect(tf.rounds).toHaveLength(3);
    expect(tf.rounds[0]!.additions.map((a) => `${a.p}${a.q}`)).toEqual([
      'AD',
      'AE',
      'BD',
      'BE',
      'CD',
      'CE',
    ]);
    expect(tf.rounds[1]!.additions.map((a) => `${a.p}${a.q}`)).toEqual(['AB', 'AC']);
    expect(tf.rounds[2]!.changed).toBe(false);
    expect(tf.rounds[2]!.additions).toEqual([]);

    // Agreement between both methods
    expect(normalizeClassSets(partRes.classes)).toBe(normalizeClassSets(pairRes.classes));
    expect(partRes.minimized.states.map((s) => s.label)).toEqual(['M0', 'M1', 'M2', 'M3']);
    expect(partRes.minimized.startStateId).toBe('min-0');
    expect(partRes.minimized.finalStateIds).toEqual(['min-3']);
    expect(partRes.minimized.transitions).toEqual(pairRes.minimized.transitions);

    // Verification & metrics
    expect(partRes.verification).toMatchObject({
      equivalent: true,
      allStatesReachable: true,
      pairwiseDistinguishable: true,
      visitedPairCount: 6,
      counterexample: null,
    });
    expect(pairRes.verification).toMatchObject({
      equivalent: true,
      allStatesReachable: true,
      pairwiseDistinguishable: true,
      visitedPairCount: 6,
      counterexample: null,
    });
    expect(partRes.metrics.originalCount).toBe(7);
    expect(partRes.metrics.reachableCount).toBe(6);
    expect(partRes.metrics.minimalCount).toBe(4);
    expect(partRes.metrics.unreachableRemoved).toBe(1);
    expect(partRes.metrics.equivalentStatesMerged).toBe(2);
    expect(partRes.metrics.totalReduction).toBe(3);
    expect(partRes.metrics.percentageReduction).toBeCloseTo(42.857, 2);

    // Sample strings (§5.9)
    const samples: [string, string, string, boolean][] = [
      ['', 'A', 'min-0', false],
      ['0', 'B', 'min-1', false],
      ['00', 'D', 'min-2', false],
      ['000', 'F', 'min-3', true],
      ['0001', 'C', 'min-1', false],
      ['000100', 'F', 'min-3', true],
      ['111', 'A', 'min-0', false],
      ['0000', 'F', 'min-3', true],
    ];
    for (const [str, origEnd, minEnd, accepted] of samples) {
      const parsed = parseTokenInput(val.dfa, str);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) continue;
      const r1 = runString(val.dfa, parsed.tokens);
      const r2 = runString(partRes.minimized, parsed.tokens);
      expect(r1.finalStateId).toBe(origEnd);
      expect(r2.finalStateId).toBe(minEnd);
      expect(r1.accepted).toBe(accepted);
      expect(r2.accepted).toBe(accepted);
    }

    // Witnesses (§17.2)
    expect(findWitness(partRes.reachable, 'B', 'C')).toBeNull();
    expect(findWitness(partRes.reachable, 'D', 'E')).toBeNull();
    expect(findWitness(partRes.reachable, 'A', 'B')).toEqual(['0', '0']);
    expect(findWitness(partRes.reachable, 'A', 'F')).toEqual([]);
  });
});

describe('DFA Engine — All Mandatory Presets (§17.1)', () => {
  for (const preset of PRESET_FIXTURES) {
    if (preset.isIncompleteExercise) {
      it(`rejects incomplete exercise (${preset.id}) and completes via sink`, () => {
        const res = validateDraft(preset.draft);
        expect(res.ok).toBe(false);
        const comp = completeWithSink(preset.draft);
        expect(comp.ok).toBe(true);
        if (!comp.ok) return;
        expect(comp.sinkState?.label).toBe('Sink');
        const valAfter = validateDraft(comp.draft);
        expect(valAfter.ok).toBe(true);
        if (!valAfter.ok) return;
        const min = minimize(valAfter.dfa, 'partition');
        expect(min.metrics.minimalCount).toBe(2);
        expect(min.verification.equivalent).toBe(true);
      });
      continue;
    }

    it(`solves preset "${preset.id}" identically under partition and table-filling`, () => {
      const res = validateDraft(preset.draft);
      expect(res.ok).toBe(true);
      if (!res.ok) return;

      const part = minimize(res.dfa, 'partition');
      const tf = minimize(res.dfa, 'table-filling');

      expect(part.removed).toEqual(preset.expected!.removedIds);
      expect(tf.removed).toEqual(preset.expected!.removedIds);
      expect(normalizeClassSets(part.classes)).toBe(normalizeClassSets(preset.expected!.classes));
      expect(normalizeClassSets(tf.classes)).toBe(normalizeClassSets(preset.expected!.classes));
      expect(part.metrics.minimalCount).toBe(preset.expected!.minimalCount);
      expect(tf.metrics.minimalCount).toBe(preset.expected!.minimalCount);

      expect(part.verification.equivalent).toBe(true);
      expect(part.verification.allStatesReachable).toBe(true);
      expect(part.verification.pairwiseDistinguishable).toBe(true);
      expect(tf.verification.equivalent).toBe(true);
      expect(tf.verification.allStatesReachable).toBe(true);
      expect(tf.verification.pairwiseDistinguishable).toBe(true);

      // Idempotence: minimizing the minimized DFA yields same count and singleton classes
      const second = minimize(part.minimized, 'partition');
      expect(second.metrics.minimalCount).toBe(part.metrics.minimalCount);
      expect(second.classes.every((c) => c.length === 1)).toBe(true);
    });
  }
});

describe('DFA Engine — Validation, Sink Completion, Prototype Safety, Equivalence & Replay', () => {
  it('handles prototype-pollution hazard names (__proto__, constructor) and case-sensitive labels', () => {
    const draft: DFADraft = {
      schemaVersion: 1,
      name: 'Hazardous names',
      states: [
        { id: '__proto__', label: '__proto__' },
        { id: 'constructor', label: 'Constructor' },
        { id: 'lower', label: 'constructor' },
      ],
      alphabet: ['__proto__', 'constructor'],
      startStateId: '__proto__',
      finalStateIds: ['constructor'],
      transitions: [
        { from: '__proto__', symbol: '__proto__', to: 'constructor' },
        { from: '__proto__', symbol: 'constructor', to: 'lower' },
        { from: 'constructor', symbol: '__proto__', to: 'constructor' },
        { from: 'constructor', symbol: 'constructor', to: 'lower' },
        { from: 'lower', symbol: '__proto__', to: 'constructor' },
        { from: 'lower', symbol: 'constructor', to: 'lower' },
      ],
    };

    const res = validateDraft(draft);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const min = minimize(res.dfa, 'partition');
    expect(min.verification.equivalent).toBe(true);
    expect(min.metrics.minimalCount).toBe(2);
  });

  it('rejects epsilon transitions, duplicate transitions, repeated finals, and unknown targets', () => {
    const badDraft: DFADraft = {
      schemaVersion: 1,
      name: 'Invalid',
      states: [{ id: 's1', label: 'S1' }],
      alphabet: ['0', '1', 'ε'],
      startStateId: 'missing',
      finalStateIds: ['s1', 's1'],
      transitions: [
        { from: 's1', symbol: '0', to: 's1' },
        { from: 's1', symbol: '0', to: 's1' },
        { from: 's1', symbol: '1', to: 'unknown' },
        { from: 's1', symbol: 'ε', to: 's1' },
      ],
    };
    const res = validateDraft(badDraft);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    const codes = new Set(res.issues.map((i) => i.code));
    expect(codes.has('RESERVED_SYMBOL')).toBe(true);
    expect(codes.has('UNKNOWN_START')).toBe(true);
    expect(codes.has('DUPLICATE_FINAL')).toBe(true);
    expect(codes.has('EPSILON_TRANSITION_UNSUPPORTED')).toBe(true);
    expect(codes.has('UNKNOWN_TRANSITION_TARGET')).toBe(true);
    expect(codes.has('NONDETERMINISTIC_TRANSITION')).toBe(true);
  });

  it('prevents sink completion when already at 24 states', () => {
    const states = Array.from({ length: 24 }, (_, i) => ({ id: `q${i}`, label: `Q${i}` }));
    const draft: DFADraft = {
      schemaVersion: 1,
      name: '24 states incomplete',
      states,
      alphabet: ['0'],
      startStateId: 'q0',
      finalStateIds: [],
      transitions: [],
    };
    const comp = completeWithSink(draft);
    expect(comp.ok).toBe(false);
  });

  it('checks equivalence accurately including epsilon mismatch and alphabet mismatch', () => {
    const d1 = validateDraft(GUIDED_PRESET.draft);
    expect(d1.ok).toBe(true);
    if (!d1.ok) return;

    const oneState = validateDraft(PRESET_FIXTURES.find((p) => p.id === 'one-state')!.draft);
    expect(oneState.ok).toBe(true);
    if (!oneState.ok) return;

    const eq = checkEquivalence(d1.dfa, oneState.dfa);
    expect(eq.equivalent).toBe(false);
    expect(eq.counterexample).toEqual([]); // epsilon distinguishes because A is non-final while one-state A is final

    const unary = validateDraft(PRESET_FIXTURES.find((p) => p.id === 'unary-chain')!.draft);
    expect(unary.ok).toBe(true);
    if (!unary.ok) return;
    expect(() => checkEquivalence(d1.dfa, unary.dfa)).toThrow(/Alphabet mismatch/);
  });

  it('rejects inconsistent classes in buildQuotient and validates restrictToReachable invariant', () => {
    const val = validateDraft(GUIDED_PRESET.draft);
    expect(val.ok).toBe(true);
    if (!val.ok) return;
    const reach = findReachable(val.dfa);
    const rDfa = restrictToReachable(val.dfa, reach);
    expect(() => buildQuotient(rDfa, [['A', 'F'], ['B', 'C', 'D', 'E']])).toThrow();
    expect(() => refinePartitions(rDfa)).not.toThrow();
    expect(() => fillDistinguishabilityTable(rDfa)).not.toThrow();
  });

  it('reconstructs identical snapshots regardless of seek order (forward, backward, jump)', () => {
    const val = validateDraft(GUIDED_PRESET.draft);
    expect(val.ok).toBe(true);
    if (!val.ok) return;

    for (const method of ['partition', 'table-filling'] as const) {
      const res = minimize(val.dfa, method);
      const total = res.trace.events.length;
      const forward = Array.from({ length: total }, (_, i) => getStepSnapshot(res.trace, i));
      for (let i = total - 1; i >= 0; i--) {
        expect(getStepSnapshot(res.trace, i)).toEqual(forward[i]);
      }
      // Random jumps
      for (const idx of [total - 1, 0, Math.floor(total / 2), 3, total - 2]) {
        expect(getStepSnapshot(res.trace, idx)).toEqual(forward[idx]);
      }
      // Explanations format without throwing
      for (const ev of res.trace.events) {
        const exp = formatExplanation(ev, {
          original: res.original,
          reachable: res.reachable,
          minimized: res.minimized,
          partitions: res.trace.partitions,
        });
        expect(exp.title.length).toBeGreaterThan(0);
        expect(exp.whatHappened.length).toBeGreaterThan(0);
        expect(exp.why.length).toBeGreaterThan(0);
      }
    }
  });

  it('parses multi-character tokens and rejects ambiguous unseparated input', () => {
    const multi = PRESET_FIXTURES.find((p) => p.id === 'multi-token-alphabet')!;
    const val = validateDraft(multi.draft);
    expect(val.ok).toBe(true);
    if (!val.ok) return;

    const okSingle = parseTokenInput(val.dfa, 'go');
    expect(okSingle).toEqual({ ok: true, tokens: ['go'] });
    const okSeq = parseTokenInput(val.dfa, 'go, stop go');
    expect(okSeq).toEqual({ ok: true, tokens: ['go', 'stop', 'go'] });
    const badUnseparated = parseTokenInput(val.dfa, 'gostop');
    expect(badUnseparated.ok).toBe(false);
    const badEpsilon = parseTokenInput(val.dfa, 'ε');
    expect(badEpsilon.ok).toBe(false);
  });
});
