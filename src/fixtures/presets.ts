import type { DFADraft, Transition } from '../engine/types';

export interface PresetFixture {
  id: string;
  title: string;
  subtitle: string;
  learningGoal: string;
  isIncompleteExercise?: boolean;
  draft: DFADraft;
  expected?: {
    removedIds: string[];
    classes: string[][];
    minimalCount: number;
  };
}

function makeTransitions(
  alphabet: string[],
  rows: Record<string, (string | null)[]>,
): Transition[] {
  const result: Transition[] = [];
  for (const [from, targets] of Object.entries(rows)) {
    targets.forEach((to, idx) => {
      const sym = alphabet[idx];
      if (to !== null && sym !== undefined) {
        result.push({ from, symbol: sym, to });
      }
    });
  }
  return result;
}

export const GUIDED_PRESET: PresetFixture = {
  id: 'guided-7-to-4',
  title: 'Guided example — 7 states to 4',
  subtitle: 'Full walkthrough: 1 unreachable state removed, 2 pairs merged',
  learningGoal: 'See reachability removal, 2 splitting rounds, a stability check, and quotient construction.',
  draft: {
    schemaVersion: 1,
    name: 'Guided example — 7 states to 4',
    states: [
      { id: 'A', label: 'A' },
      { id: 'B', label: 'B' },
      { id: 'C', label: 'C' },
      { id: 'D', label: 'D' },
      { id: 'E', label: 'E' },
      { id: 'F', label: 'F' },
      { id: 'U', label: 'U' },
    ],
    alphabet: ['0', '1'],
    startStateId: 'A',
    finalStateIds: ['F'],
    transitions: makeTransitions(['0', '1'], {
      A: ['B', 'A'],
      B: ['D', 'A'],
      C: ['E', 'A'],
      D: ['F', 'A'],
      E: ['F', 'A'],
      F: ['F', 'C'],
      U: ['U', 'F'],
    }),
  },
  expected: {
    removedIds: ['U'],
    classes: [['A'], ['B', 'C'], ['D', 'E'], ['F']],
    minimalCount: 4,
  },
};

export const PRESET_FIXTURES: PresetFixture[] = [
  GUIDED_PRESET,
  {
    id: 'even-ones',
    title: 'Even number of ones (already minimal)',
    subtitle: '2 states · 0% reduction',
    learningGoal: 'Learn what a DFA is and see why already-minimal machines stop without merging.',
    draft: {
      schemaVersion: 1,
      name: 'Even number of ones',
      states: [
        { id: 'e', label: 'E' },
        { id: 'o', label: 'O' },
      ],
      alphabet: ['0', '1'],
      startStateId: 'e',
      finalStateIds: ['e'],
      transitions: makeTransitions(['0', '1'], {
        e: ['e', 'o'],
        o: ['o', 'e'],
      }),
    },
    expected: {
      removedIds: [],
      classes: [['e'], ['o']],
      minimalCount: 2,
    },
  },
  {
    id: 'one-state',
    title: 'Single accepting state',
    subtitle: '1 state · Σ* language',
    learningGoal: 'Observe a degenerate 1-state DFA where every string (including ε) is accepted.',
    draft: {
      schemaVersion: 1,
      name: 'One state',
      states: [{ id: 'A', label: 'A' }],
      alphabet: ['0', '1'],
      startStateId: 'A',
      finalStateIds: ['A'],
      transitions: makeTransitions(['0', '1'], {
        A: ['A', 'A'],
      }),
    },
    expected: {
      removedIds: [],
      classes: [['A']],
      minimalCount: 1,
    },
  },
  {
    id: 'unreachable-accepting',
    title: 'Unreachable accepting state',
    subtitle: '2 → 1 state (empty language)',
    learningGoal: 'See that an accepting state with no path from start is removed, leaving the empty language.',
    draft: {
      schemaVersion: 1,
      name: 'Unreachable accepting state',
      states: [
        { id: 'A', label: 'A' },
        { id: 'U', label: 'U' },
      ],
      alphabet: ['0', '1'],
      startStateId: 'A',
      finalStateIds: ['U'],
      transitions: makeTransitions(['0', '1'], {
        A: ['A', 'A'],
        U: ['U', 'U'],
      }),
    },
    expected: {
      removedIds: ['U'],
      classes: [['A']],
      minimalCount: 1,
    },
  },
  {
    id: 'no-final-states',
    title: 'No final states (F = ∅)',
    subtitle: '2 → 1 rejecting state',
    learningGoal: 'Verify that initial partition omits the empty final block and merges all reachable states.',
    draft: {
      schemaVersion: 1,
      name: 'No final states',
      states: [
        { id: 'A', label: 'A' },
        { id: 'B', label: 'B' },
      ],
      alphabet: ['0', '1'],
      startStateId: 'A',
      finalStateIds: [],
      transitions: makeTransitions(['0', '1'], {
        A: ['B', 'A'],
        B: ['B', 'A'],
      }),
    },
    expected: {
      removedIds: [],
      classes: [['A', 'B']],
      minimalCount: 1,
    },
  },
  {
    id: 'all-final-states',
    title: 'Every state final (F = Q)',
    subtitle: '2 → 1 accepting state',
    learningGoal: 'Verify that initial partition omits the empty non-final block when all states accept.',
    draft: {
      schemaVersion: 1,
      name: 'All final states',
      states: [
        { id: 'A', label: 'A' },
        { id: 'B', label: 'B' },
      ],
      alphabet: ['0', '1'],
      startStateId: 'A',
      finalStateIds: ['A', 'B'],
      transitions: makeTransitions(['0', '1'], {
        A: ['B', 'A'],
        B: ['B', 'A'],
      }),
    },
    expected: {
      removedIds: [],
      classes: [['A', 'B']],
      minimalCount: 1,
    },
  },
  {
    id: 'reachable-trap',
    title: 'Reachable dead/trap state',
    subtitle: '3 states · trap retained',
    learningGoal: 'Distinguish a reachable dead state (which must be kept in a complete DFA) from an unreachable state.',
    draft: {
      schemaVersion: 1,
      name: 'Reachable trap state',
      states: [
        { id: 'A', label: 'A' },
        { id: 'F', label: 'F' },
        { id: 'D', label: 'D' },
      ],
      alphabet: ['0', '1'],
      startStateId: 'A',
      finalStateIds: ['F'],
      transitions: makeTransitions(['0', '1'], {
        A: ['F', 'D'],
        F: ['F', 'D'],
        D: ['D', 'D'],
      }),
    },
    expected: {
      removedIds: [],
      classes: [['A'], ['F'], ['D']],
      minimalCount: 3,
    },
  },
  {
    id: 'equivalent-dead-states',
    title: 'Equivalent dead states',
    subtitle: '4 → 3 states',
    learningGoal: 'Observe two reachable non-final dead states merging into a single trap state.',
    draft: {
      schemaVersion: 1,
      name: 'Equivalent dead states',
      states: [
        { id: 'A', label: 'A' },
        { id: 'F', label: 'F' },
        { id: 'D', label: 'D' },
        { id: 'E', label: 'E' },
      ],
      alphabet: ['0', '1'],
      startStateId: 'A',
      finalStateIds: ['F'],
      transitions: makeTransitions(['0', '1'], {
        A: ['F', 'D'],
        F: ['F', 'E'],
        D: ['D', 'E'],
        E: ['D', 'E'],
      }),
    },
    expected: {
      removedIds: [],
      classes: [['A'], ['F'], ['D', 'E']],
      minimalCount: 3,
    },
  },
  {
    id: 'multi-token-alphabet',
    title: 'Multi-character token alphabet',
    subtitle: 'Alphabet [go, stop] · 2 states',
    learningGoal: 'Practice using multi-character atomic tokens separated by spaces or commas in string testing.',
    draft: {
      schemaVersion: 1,
      name: 'Multi-token alphabet',
      states: [
        { id: 'A', label: 'A' },
        { id: 'B', label: 'B' },
      ],
      alphabet: ['go', 'stop'],
      startStateId: 'A',
      finalStateIds: ['B'],
      transitions: makeTransitions(['go', 'stop'], {
        A: ['B', 'A'],
        B: ['B', 'A'],
      }),
    },
    expected: {
      removedIds: [],
      classes: [['A'], ['B']],
      minimalCount: 2,
    },
  },
  {
    id: 'unary-chain',
    title: 'Unary chain (multi-round split)',
    subtitle: 'Alphabet [a] · 4 states',
    learningGoal: 'Catch premature termination: requires two splitting rounds before stability.',
    draft: {
      schemaVersion: 1,
      name: 'Unary chain',
      states: [
        { id: 'A', label: 'A' },
        { id: 'B', label: 'B' },
        { id: 'C', label: 'C' },
        { id: 'D', label: 'D' },
      ],
      alphabet: ['a'],
      startStateId: 'A',
      finalStateIds: ['D'],
      transitions: makeTransitions(['a'], {
        A: ['B'],
        B: ['C'],
        C: ['D'],
        D: ['D'],
      }),
    },
    expected: {
      removedIds: [],
      classes: [['A'], ['B'], ['C'], ['D']],
      minimalCount: 4,
    },
  },
  {
    id: 'unreachable-duplicate',
    title: 'Unreachable duplicate state',
    subtitle: '3 → 2 states',
    learningGoal: 'See why unreachable duplicates are removed before partitioning.',
    draft: {
      schemaVersion: 1,
      name: 'Unreachable duplicate',
      states: [
        { id: 'A', label: 'A' },
        { id: 'B', label: 'B' },
        { id: 'U', label: 'U' },
      ],
      alphabet: ['0', '1'],
      startStateId: 'A',
      finalStateIds: ['B'],
      transitions: makeTransitions(['0', '1'], {
        A: ['B', 'A'],
        B: ['B', 'A'],
        U: ['B', 'A'],
      }),
    },
    expected: {
      removedIds: ['U'],
      classes: [['A'], ['B']],
      minimalCount: 2,
    },
  },
  {
    id: 'incomplete-exercise',
    title: 'Incomplete DFA (validation exercise)',
    subtitle: 'Missing transition · requires sink or manual fix',
    learningGoal: 'Practice fixing a missing transition manually or completing explicitly with a sink state.',
    isIncompleteExercise: true,
    draft: {
      schemaVersion: 1,
      name: 'Incomplete DFA exercise',
      states: [{ id: 'A', label: 'A' }],
      alphabet: ['0', '1'],
      startStateId: 'A',
      finalStateIds: ['A'],
      transitions: makeTransitions(['0', '1'], {
        A: ['A', null],
      }),
    },
  },
];
