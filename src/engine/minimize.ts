import { checkEquivalence } from './equivalence';
import { computeDfaFingerprint } from './helpers';
import { refinePartitions } from './partition';
import { buildQuotient } from './quotient';
import { findReachable, restrictToReachable } from './reachability';
import { fillDistinguishabilityTable } from './tableFilling';
import { buildTrace } from './trace';
import { ENGINE_VERSION, type DFA, type Method, type MinimizationResult } from './types';
import { validateDraft } from './validate';
import { findWitness } from './witnesses';

export function minimize(dfa: DFA, method: Method): MinimizationResult {
  // Enforce preconditions even when invoked directly from tests or external callers
  const check = validateDraft({
    schemaVersion: 1,
    name: dfa.name,
    states: dfa.states.map((s) => ({ ...s })),
    alphabet: [...dfa.alphabet],
    startStateId: dfa.startStateId,
    finalStateIds: [...dfa.finalStateIds],
    transitions: dfa.transitions.map((t) => ({ ...t })),
  });
  if (!check.ok) {
    throw new Error(
      `minimize() requires a valid complete DFA: ${check.issues.map((i) => i.message).join(' ')}`,
    );
  }
  const canonicalDfa = check.dfa;
  const fingerprint = computeDfaFingerprint(canonicalDfa);

  const reachability = findReachable(canonicalDfa);
  const reachable = restrictToReachable(canonicalDfa, reachability);

  const partitionResult = method === 'partition' ? refinePartitions(reachable) : undefined;
  const pairResult = method === 'table-filling' ? fillDistinguishabilityTable(reachable) : undefined;
  const classes =
    method === 'partition' ? partitionResult!.classes : pairResult!.classes;

  const quotient = buildQuotient(reachable, classes);
  const minimized = quotient.minimized;

  // Independent verification (§4.9)
  const equivalence = checkEquivalence(canonicalDfa, minimized);
  const minReach = findReachable(minimized);
  const allStatesReachable = minReach.reachableIds.length === minimized.states.length;

  let distinguishedPairsCount = 0;
  const nMin = minimized.states.length;
  const totalOutputPairsCount = (nMin * (nMin - 1)) / 2;
  let pairwiseDistinguishable = true;

  if (nMin > 1) {
    if (method === 'partition') {
      // Independent verification using table-filling
      const independentPairs = fillDistinguishabilityTable(minimized);
      for (const cell of independentPairs.finalMarks.values()) {
        if (cell.marked) {
          distinguishedPairsCount += 1;
        } else {
          pairwiseDistinguishable = false;
        }
      }
    } else {
      // Independent verification using partition refinement + product BFS witnesses
      const independentPart = refinePartitions(minimized);
      if (independentPart.classes.length !== nMin) {
        pairwiseDistinguishable = false;
      }
      for (let i = 0; i < nMin; i++) {
        for (let j = i + 1; j < nMin; j++) {
          const w = findWitness(minimized, minimized.states[i]!.id, minimized.states[j]!.id);
          if (w !== null) {
            distinguishedPairsCount += 1;
          } else {
            pairwiseDistinguishable = false;
          }
        }
      }
    }
  }

  const verification: MinimizationResult['verification'] = {
    equivalent: equivalence.equivalent,
    allStatesReachable,
    pairwiseDistinguishable,
    visitedPairCount: equivalence.visitedPairCount,
    counterexample: equivalence.counterexample,
    minimizedReachableIds: minReach.reachableIds,
    distinguishedPairsCount,
    totalOutputPairsCount,
  };

  const originalCount = canonicalDfa.states.length;
  const reachableCount = reachable.states.length;
  const minimalCount = minimized.states.length;
  const unreachableRemoved = originalCount - reachableCount;
  const equivalentStatesMerged = reachableCount - minimalCount;
  const totalReduction = originalCount - minimalCount;
  const percentageReduction =
    originalCount > 0 ? (100 * totalReduction) / originalCount : 0;

  const metrics: MinimizationResult['metrics'] = {
    originalCount,
    reachableCount,
    minimalCount,
    unreachableRemoved,
    equivalentStatesMerged,
    totalReduction,
    percentageReduction,
  };

  const trace = buildTrace({
    method,
    fingerprint,
    original: canonicalDfa,
    reachable,
    reachability,
    partitionResult,
    pairResult,
    quotient,
    equivalence,
    verification,
    metrics,
  });

  return {
    engineVersion: ENGINE_VERSION,
    fingerprint,
    original: canonicalDfa,
    reachable,
    removed: reachability.unreachableIds,
    method,
    classes,
    minimized,
    mapping: quotient.mapping,
    reachability,
    partitionResult,
    pairResult,
    quotient,
    verification,
    metrics,
    trace,
  };
}
