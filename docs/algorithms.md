# DFA Studio Algorithms & Correctness Contracts

## 1. Validation & Sink Completion (`validate.ts`, `complete.ts`)
- Validates 1–24 states, unique non-empty IDs and case-sensitive labels (1–24 Unicode code points), 1–8 alphabet tokens (1–12 Unicode code points, rejecting whitespace, commas, control characters, and reserved `ε`, `ϵ`, `∅`).
- Rejects epsilon transitions and nondeterministic duplicate `(from, symbol)` entries.
- Requires totality (`|Q| × |Σ|` transitions). When only missing transitions fail validation, `completeWithSink()` previews and adds one unique non-final `Sink` state with self-loops on every symbol (respecting the 24-state limit).

## 2. Reachability (`reachability.ts`)
- Breadth-first search from `startStateId` iterating alphabet symbols in order (`O(nk)` time).
- Records shortest witness strings from `startStateId` to each discovered state.
- `restrictToReachable()` removes unreachable states and asserts no reachable state transitions into an unreachable state.

## 3. Synchronous Partition Refinement (`partition.ts`)
- Initializes `P0 = { Q_r \ F_r, F_r }` (omitting empty blocks; non-final first when both exist).
- Each round computes every state's signature `(G(δ(q, a)) for a ∈ Σ)` against the **fixed** previous partition `P(i-1)` using collision-proof `JSON.stringify` index tuples.
- Splits blocks by signature, canonicalizes next partition by earliest original member index, and commits synchronously.
- Explicitly runs and records the final stability round (`changed = false`) before halting (`O(r²k)` time).

## 4. Table-Filling (`tableFilling.ts`)
- Creates all `r(r-1)/2` unordered pairs `(p, q)` in canonical original index order.
- Marks pairs differing in final status with witness `ε` at initialization.
- In synchronous rounds, inspects unmarked pairs against the previous round snapshot, marking `(p, q)` via the first symbol `a` in alphabet order whose target pair `(δ(p, a), δ(q, a))` was already marked, recording witness `[a, ...destWitness]`.
- Halts after a round with zero new marks, constructs equivalence classes via Disjoint-Set Union, and asserts transitivity/completeness across all pairs.

## 5. Quotient Construction & Independent Verification (`quotient.ts`, `equivalence.ts`, `witnesses.ts`, `minimize.ts`)
- `buildQuotient()` maps each canonical class to `M_i` (`min-i`), verifies final-status and transition consistency across all members, and generates the original-to-minimized mapping.
- `checkEquivalence()` runs exact product-automaton BFS (`O(n₁n₂k)`) from `(q₀, q₀')` to prove `L(M) = L(M')` (returning `null` on equivalence or shortest counterexample on mismatch).
- Minimality is verified independently: `findReachable(minimized)` confirms all output states are reachable, and pairwise distinguishability is checked by the opposite algorithm (`fillDistinguishabilityTable` when `partition` was used; `refinePartitions` + `findWitness` per pair when `table-filling` was used).
