export interface GlossaryEntry {
  term: string;
  symbol?: string;
  short: string;
  detail: string;
}

export const GLOSSARY: Record<string, GlossaryEntry> = {
  dfa: {
    term: 'DFA',
    symbol: 'M = (Q, Σ, δ, q₀, F)',
    short: 'Deterministic Finite Automaton: every state has exactly one transition per symbol.',
    detail:
      'A machine that reads one input symbol at a time and moves deterministically from one state to the next. A string is accepted if reading all symbols ends in a final state.',
  },
  state: {
    term: 'State',
    symbol: 'q ∈ Q',
    short: 'A memory configuration of the automaton, drawn as a circle.',
    detail: 'States remember only what is needed about the prefix read so far to decide future acceptance.',
  },
  alphabet: {
    term: 'Alphabet',
    symbol: 'Σ',
    short: 'The finite set of allowed input symbols.',
    detail: 'Every symbol token in Σ is atomic. Each state must have exactly one outgoing arrow for each symbol in Σ.',
  },
  transition: {
    term: 'Transition function',
    symbol: 'δ(q, a)',
    short: 'Rule giving the single next state from state q on symbol a.',
    detail: 'Because a DFA is deterministic and complete, δ: Q × Σ → Q is a total single-valued function.',
  },
  epsilon: {
    term: 'Empty string',
    symbol: 'ε',
    short: 'The string with zero symbols (length 0).',
    detail: 'Reading ε keeps the machine in its current state. Thus ε is accepted iff the start state q₀ is a final state.',
  },
  reachable: {
    term: 'Reachable state',
    short: 'A state visited by at least one path starting at q₀.',
    detail: 'Unreachable states cannot affect L(M) and are removed first using breadth-first search (BFS).',
  },
  dead: {
    term: 'Dead / trap state',
    short: 'A non-final state with no path to any final state.',
    detail:
      'A reachable trap state cannot be removed because a complete DFA still needs transitions to reject strings. Equivalent trap states can be merged.',
  },
  equivalent: {
    term: 'Equivalent states',
    symbol: 'p ~ q',
    short: 'Two states that accept/reject the exact same set of future strings w ∈ Σ*.',
    detail:
      'Formally, δ*(p, w) ∈ F ⟺ δ*(q, w) ∈ F for every w ∈ Σ*. Two states can be merged only when they are equivalent.',
  },
  witness: {
    term: 'Distinguishing string (witness)',
    short: 'An input string w that causes one state to accept and the other to reject.',
    detail: 'Finding any witness w proves two states are NOT equivalent.',
  },
  partition: {
    term: 'Partition & signature',
    symbol: 'P_i',
    short: 'A grouping of all reachable states into disjoint non-empty candidate blocks.',
    detail:
      'In each round, a state’s signature records the group IDs of its destinations on each symbol in Σ. States in the same block with different signatures split.',
  },
  quotient: {
    term: 'Quotient DFA',
    symbol: 'M / ~',
    short: 'The minimized DFA whose states are the final equivalence classes.',
    detail: 'Each stable group becomes one state M_i, inheriting start and final status from its members.',
  },
  tableFilling: {
    term: 'Table-filling',
    short: 'Alternative minimization method that marks all distinguishable pairs {p, q}.',
    detail:
      'Pairs mixing final and non-final states are marked on ε, then marks propagate synchronously until stable. Remaining unmarked pairs are equivalent.',
  },
  product: {
    term: 'Product automaton',
    symbol: 'M₁ × M₂',
    short: 'Exact equivalence proof comparing reachable pairs (p, q) from both start states.',
    detail:
      'Explores pairs (δ₁(p, a), δ₂(q, a)) via BFS. If no reachable pair disagrees on acceptance, L(M₁) = L(M₂) is mathematically proved.',
  },
};
