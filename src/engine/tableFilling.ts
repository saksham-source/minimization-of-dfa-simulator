import { buildStateIndexMap, buildTransitionMap, canonicalPair, pairKey } from './helpers';
import type {
  DFA,
  PairAddition,
  PairCell,
  PairInspectRecord,
  PairResult,
  PairRoundRecord,
  StateId,
} from './types';

class DisjointSet {
  private parent: number[];
  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, i) => i);
  }
  find(x: number): number {
    let root = x;
    while (this.parent[root] !== root) {
      root = this.parent[root]!;
    }
    let cur = x;
    while (cur !== root) {
      const next = this.parent[cur]!;
      this.parent[cur] = root;
      cur = next;
    }
    return root;
  }
  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) {
      if (ra < rb) {
        this.parent[rb] = ra;
      } else {
        this.parent[ra] = rb;
      }
    }
  }
}

export function fillDistinguishabilityTable(dfa: DFA): PairResult {
  const delta = buildTransitionMap(dfa);
  const stateIndex = buildStateIndexMap(dfa.states);
  const finalSet = new Set(dfa.finalStateIds);

  const allPairs: { key: string; p: StateId; q: StateId }[] = [];
  const cells = new Map<string, PairCell>();
  const initialMarked: PairAddition[] = [];

  for (let i = 0; i < dfa.states.length; i++) {
    for (let j = i + 1; j < dfa.states.length; j++) {
      const p = dfa.states[i]!.id;
      const q = dfa.states[j]!.id;
      const key = pairKey(p, q, stateIndex);
      allPairs.push({ key, p, q });

      const diffFinal = finalSet.has(p) !== finalSet.has(q);
      cells.set(key, {
        key,
        p,
        q,
        marked: diffFinal,
        roundMarked: diffFinal ? 0 : null,
        witness: diffFinal ? [] : null,
        reasonSymbol: null,
        dependsOn: null,
      });

      if (diffFinal) {
        initialMarked.push({
          pairKey: key,
          p,
          q,
          symbol: '',
          destPairKey: '',
          witness: [],
        });
      }
    }
  }

  const rounds: PairRoundRecord[] = [];
  let round = 1;

  while (true) {
    const previousMarked = new Set<string>();
    const previousWitness = new Map<string, string[]>();
    for (const [k, cell] of cells.entries()) {
      if (cell.marked) {
        previousMarked.add(k);
        previousWitness.set(k, cell.witness ?? []);
      }
    }

    const inspections: PairInspectRecord[] = [];
    const additions: PairAddition[] = [];

    for (const pair of allPairs) {
      if (previousMarked.has(pair.key)) continue;

      for (const sym of dfa.alphabet) {
        const u = delta.get(pair.p)!.get(sym)!;
        const v = delta.get(pair.q)!.get(sym)!;
        const sameDestination = u === v;
        const destPairKey = sameDestination ? null : pairKey(u, v, stateIndex);
        const destMarkedInPrevious = destPairKey !== null && previousMarked.has(destPairKey);
        const proposedWitness = destMarkedInPrevious
          ? [sym, ...(previousWitness.get(destPairKey!) ?? [])]
          : null;

        inspections.push({
          round,
          pairKey: pair.key,
          p: pair.p,
          q: pair.q,
          symbol: sym,
          u,
          v,
          sameDestination,
          destPairKey,
          destMarkedInPrevious,
          proposedWitness,
        });

        if (destMarkedInPrevious && destPairKey !== null && proposedWitness !== null) {
          additions.push({
            pairKey: pair.key,
            p: pair.p,
            q: pair.q,
            symbol: sym,
            destPairKey,
            witness: proposedWitness,
          });
          break;
        }
      }
    }

    for (const add of additions) {
      const cell = cells.get(add.pairKey)!;
      cell.marked = true;
      cell.roundMarked = round;
      cell.witness = add.witness;
      cell.reasonSymbol = add.symbol;
      cell.dependsOn = add.destPairKey;
    }

    let totalMarkedAfter = 0;
    for (const cell of cells.values()) {
      if (cell.marked) totalMarkedAfter += 1;
    }

    const changed = additions.length > 0;
    rounds.push({
      round,
      inspections,
      additions,
      totalMarkedAfter,
      changed,
    });

    if (!changed) {
      break;
    }
    round += 1;
  }

  // Form equivalence classes via DSU over unmarked pairs
  const dsu = new DisjointSet(dfa.states.length);
  for (const pair of allPairs) {
    const cell = cells.get(pair.key)!;
    if (!cell.marked) {
      const ip = stateIndex.get(pair.p)!;
      const iq = stateIndex.get(pair.q)!;
      dsu.union(ip, iq);
    }
  }

  const classMap = new Map<number, StateId[]>();
  dfa.states.forEach((s, idx) => {
    const root = dsu.find(idx);
    let list = classMap.get(root);
    if (!list) {
      list = [];
      classMap.set(root, list);
    }
    list.push(s.id);
  });

  const classes = Array.from(classMap.values()).sort(
    (c1, c2) => (stateIndex.get(c1[0]!) ?? 0) - (stateIndex.get(c2[0]!) ?? 0),
  );

  // Verify transitivity and completeness invariant:
  // Every pair inside a class must be unmarked, and every pair across classes must be marked.
  const classOf = new Map<StateId, number>();
  classes.forEach((cls, cIdx) => {
    for (const id of cls) {
      classOf.set(id, cIdx);
    }
  });
  for (const pair of allPairs) {
    const [cp, cq] = canonicalPair(pair.p, pair.q, stateIndex);
    const key = pairKey(cp, cq, stateIndex);
    const isMarked = cells.get(key)!.marked;
    const sameClass = classOf.get(cp) === classOf.get(cq);
    if (sameClass && isMarked) {
      throw new Error(`Table-filling invariant failed: marked pair (${cp}, ${cq}) in same class.`);
    }
    if (!sameClass && !isMarked) {
      throw new Error(
        `Table-filling invariant failed: unmarked pair (${cp}, ${cq}) in different classes.`,
      );
    }
  }

  return {
    allPairs,
    initialMarked,
    rounds,
    finalMarks: cells,
    classes,
  };
}
