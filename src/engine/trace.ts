import { buildStateLabelMap, formatTokens } from './helpers';
import type {
  DFA,
  Explanation,
  ExplanationContext,
  Method,
  MinimizationResult,
  PairAddition,
  PairResult,
  Partition,
  PartitionResult,
  QuotientResult,
  ReachabilityResult,
  StateId,
  StepSnapshot,
  Trace,
  TraceCheckpoint,
  TraceEvent,
} from './types';

type TraceEventPayload = TraceEvent extends infer E ? (E extends TraceEvent ? Omit<E, 'id'> : never) : never;
import { ENGINE_VERSION } from './types';
import type { EquivalenceResult } from './types';

function createInitialSnapshot(trace: Pick<Trace, 'original' | 'reachable' | 'minimized' | 'removed'>): StepSnapshot {
  return {
    eventIndex: 0,
    eventId: 0,
    stage: 'reachability',
    graphMode: 'original',
    visibleDfa: trace.original,
    selectedStateIds: [],
    visitedStateIds: [],
    removedStateIds: [],
    activeEdges: [],
    queue: [],
    currentStateId: null,
    sourcePartition: null,
    pendingBuckets: null,
    committedPartition: null,
    activeSignature: null,
    roundSignatures: [],
    activePairKey: null,
    activePairDependency: null,
    markedPairs: {},
    proposedPairMarks: [],
    quotientClasses: [],
    quotientTransitions: [],
    verificationStatus: {
      done: false,
      equivalent: false,
      allStatesReachable: false,
      pairwiseDistinguishable: false,
      visitedPairCount: 0,
      counterexample: null,
      currentProductPair: null,
      discoveredProductPairs: [],
    },
  };
}

function cloneSnapshot(s: StepSnapshot): StepSnapshot {
  return {
    ...s,
    selectedStateIds: [...s.selectedStateIds],
    visitedStateIds: [...s.visitedStateIds],
    removedStateIds: [...s.removedStateIds],
    activeEdges: s.activeEdges.map((e) => ({ ...e })),
    queue: [...s.queue],
    pendingBuckets: s.pendingBuckets ? [...s.pendingBuckets] : null,
    roundSignatures: [...s.roundSignatures],
    markedPairs: { ...s.markedPairs },
    proposedPairMarks: [...s.proposedPairMarks],
    quotientClasses: [...s.quotientClasses],
    quotientTransitions: [...s.quotientTransitions],
    verificationStatus: {
      ...s.verificationStatus,
      discoveredProductPairs: [...s.verificationStatus.discoveredProductPairs],
    },
  };
}

function applyEvent(
  snap: StepSnapshot,
  ev: TraceEvent,
  eventIndex: number,
  trace: Pick<Trace, 'original' | 'reachable' | 'minimized' | 'partitions' | 'pairSnapshots'>,
): void {
  snap.eventIndex = eventIndex;
  snap.eventId = ev.id;
  snap.stage = ev.stage;

  switch (ev.kind) {
    case 'run.started': {
      snap.graphMode = 'original';
      snap.visibleDfa = trace.original;
      break;
    }
    case 'reach.started': {
      snap.graphMode = 'original';
      snap.visibleDfa = trace.original;
      snap.currentStateId = ev.startStateId;
      snap.selectedStateIds = [ev.startStateId];
      snap.visitedStateIds = [...ev.visited];
      snap.queue = [...ev.queue];
      snap.activeEdges = [];
      break;
    }
    case 'reach.dequeue': {
      snap.currentStateId = ev.stateId;
      snap.selectedStateIds = [ev.stateId];
      snap.visitedStateIds = [...ev.visited];
      snap.queue = [...ev.queue];
      snap.activeEdges = [];
      break;
    }
    case 'reach.inspect': {
      snap.currentStateId = ev.from;
      snap.selectedStateIds = [ev.from, ev.to];
      snap.visitedStateIds = [...ev.visited];
      snap.queue = [...ev.queue];
      snap.activeEdges = [{ from: ev.from, symbol: ev.symbol, to: ev.to, kind: 'inspect' }];
      break;
    }
    case 'reach.finished': {
      snap.currentStateId = null;
      snap.selectedStateIds = [...ev.unreachableIds];
      snap.visitedStateIds = [...ev.reachableIds];
      snap.removedStateIds = [...ev.unreachableIds];
      snap.queue = [];
      snap.activeEdges = [];
      break;
    }
    case 'reach.removed': {
      snap.graphMode = 'reachable';
      snap.visibleDfa = trace.reachable;
      snap.removedStateIds = [...ev.removedIds];
      snap.visitedStateIds = [...ev.remainingIds];
      snap.selectedStateIds = [];
      snap.activeEdges = [];
      break;
    }
    case 'partition.initial': {
      snap.graphMode = 'reachable';
      snap.visibleDfa = trace.reachable;
      snap.sourcePartition = ev.partition;
      snap.committedPartition = ev.partition;
      snap.pendingBuckets = null;
      snap.activeSignature = null;
      snap.roundSignatures = [];
      snap.selectedStateIds = [];
      snap.activeEdges = [];
      break;
    }
    case 'partition.roundStarted': {
      snap.sourcePartition = trace.partitions[ev.sourcePartitionIndex] ?? null;
      snap.pendingBuckets = [];
      snap.activeSignature = null;
      snap.roundSignatures = [];
      snap.selectedStateIds = [];
      snap.activeEdges = [];
      break;
    }
    case 'partition.signature': {
      snap.sourcePartition = trace.partitions[ev.sourcePartitionIndex] ?? null;
      snap.activeSignature = ev.signature;
      snap.roundSignatures = [...snap.roundSignatures, ev.signature];
      snap.currentStateId = ev.signature.stateId;
      snap.selectedStateIds = [ev.signature.stateId];
      snap.activeEdges = ev.signature.entries.map((entry) => ({
        from: ev.signature.stateId,
        symbol: entry.symbol,
        to: entry.targetStateId,
        kind: 'inspect',
      }));
      break;
    }
    case 'partition.groupDecision': {
      snap.sourcePartition = trace.partitions[ev.sourcePartitionIndex] ?? null;
      snap.pendingBuckets = [...(snap.pendingBuckets ?? []), ev.decision];
      snap.activeSignature = null;
      snap.currentStateId = null;
      snap.selectedStateIds = [...ev.decision.sourceMembers];
      snap.activeEdges = [];
      break;
    }
    case 'partition.roundCommitted': {
      snap.sourcePartition = trace.partitions[ev.oldPartitionIndex] ?? null;
      snap.committedPartition = trace.partitions[ev.nextPartitionIndex] ?? null;
      snap.pendingBuckets = null;
      snap.activeSignature = null;
      snap.selectedStateIds = [];
      snap.activeEdges = [];
      break;
    }
    case 'partition.stable': {
      const stable = trace.partitions[ev.partitionIndex] ?? null;
      snap.sourcePartition = stable;
      snap.committedPartition = stable;
      snap.pendingBuckets = null;
      snap.activeSignature = null;
      snap.selectedStateIds = [];
      snap.activeEdges = [];
      break;
    }
    case 'pairs.initial': {
      snap.graphMode = 'reachable';
      snap.visibleDfa = trace.reachable;
      const nextMarks: StepSnapshot['markedPairs'] = {};
      for (const add of ev.initialAdditions) {
        nextMarks[add.pairKey] = {
          round: 0,
          witness: add.witness,
          symbol: null,
          dependsOn: null,
        };
      }
      snap.markedPairs = nextMarks;
      snap.proposedPairMarks = [];
      snap.activePairKey = null;
      snap.activePairDependency = null;
      snap.selectedStateIds = [];
      snap.activeEdges = [];
      break;
    }
    case 'pairs.roundStarted': {
      snap.proposedPairMarks = [];
      snap.activePairKey = null;
      snap.activePairDependency = null;
      snap.selectedStateIds = [];
      snap.activeEdges = [];
      break;
    }
    case 'pairs.inspect': {
      snap.activePairKey = ev.inspection.pairKey;
      snap.activePairDependency = {
        pairKey: ev.inspection.pairKey,
        destPairKey: ev.inspection.destPairKey,
        symbol: ev.inspection.symbol,
      };
      snap.selectedStateIds = [ev.inspection.p, ev.inspection.q];
      snap.activeEdges = [
        { from: ev.inspection.p, symbol: ev.inspection.symbol, to: ev.inspection.u, kind: 'inspect' },
        { from: ev.inspection.q, symbol: ev.inspection.symbol, to: ev.inspection.v, kind: 'inspect' },
      ];
      break;
    }
    case 'pairs.markProposed': {
      snap.activePairKey = ev.addition.pairKey;
      snap.activePairDependency = {
        pairKey: ev.addition.pairKey,
        destPairKey: ev.addition.destPairKey,
        symbol: ev.addition.symbol,
      };
      snap.proposedPairMarks = [...snap.proposedPairMarks, ev.addition];
      snap.selectedStateIds = [ev.addition.p, ev.addition.q];
      break;
    }
    case 'pairs.roundCommitted': {
      const nextMarks = { ...snap.markedPairs };
      for (const add of ev.additions) {
        nextMarks[add.pairKey] = {
          round: ev.round,
          witness: add.witness,
          symbol: add.symbol,
          dependsOn: add.destPairKey,
        };
      }
      snap.markedPairs = nextMarks;
      snap.proposedPairMarks = [];
      snap.activePairKey = null;
      snap.activePairDependency = null;
      snap.selectedStateIds = [];
      snap.activeEdges = [];
      break;
    }
    case 'pairs.stable': {
      snap.activePairKey = null;
      snap.activePairDependency = null;
      snap.proposedPairMarks = [];
      snap.selectedStateIds = [];
      snap.activeEdges = [];
      break;
    }
    case 'quotient.classCreated': {
      snap.graphMode = 'quotient';
      snap.visibleDfa = trace.minimized;
      snap.quotientClasses = [...snap.quotientClasses, ev.classInfo];
      snap.selectedStateIds = [ev.classInfo.minimizedId];
      snap.activeEdges = [];
      break;
    }
    case 'quotient.transition': {
      snap.graphMode = 'quotient';
      snap.visibleDfa = trace.minimized;
      snap.quotientTransitions = [...snap.quotientTransitions, ev.evidence];
      snap.selectedStateIds = [ev.evidence.fromClassId, ev.evidence.toClassId];
      snap.activeEdges = [
        {
          from: ev.evidence.fromClassId,
          symbol: ev.evidence.symbol,
          to: ev.evidence.toClassId,
          kind: 'quotient',
        },
      ];
      break;
    }
    case 'quotient.finished': {
      snap.graphMode = 'quotient';
      snap.visibleDfa = trace.minimized;
      snap.selectedStateIds = [];
      snap.activeEdges = [];
      break;
    }
    case 'verify.productPair': {
      snap.graphMode = 'quotient';
      snap.visibleDfa = trace.minimized;
      snap.verificationStatus = {
        ...snap.verificationStatus,
        currentProductPair: { p: ev.p, q: ev.q },
        discoveredProductPairs: [
          ...snap.verificationStatus.discoveredProductPairs,
          { p: ev.p, q: ev.q, pFinal: ev.pFinal, qFinal: ev.qFinal },
        ],
      };
      snap.selectedStateIds = [ev.q];
      snap.activeEdges = [];
      break;
    }
    case 'verify.finished': {
      snap.graphMode = 'quotient';
      snap.visibleDfa = trace.minimized;
      snap.verificationStatus = {
        ...snap.verificationStatus,
        done: true,
        equivalent: ev.equivalent,
        allStatesReachable: ev.allStatesReachable,
        pairwiseDistinguishable: ev.pairwiseDistinguishable,
        visitedPairCount: ev.visitedPairCount,
        counterexample: ev.counterexample,
        currentProductPair: null,
      };
      snap.selectedStateIds = [];
      snap.activeEdges = [];
      break;
    }
    case 'run.finished': {
      snap.graphMode = 'quotient';
      snap.visibleDfa = trace.minimized;
      snap.selectedStateIds = [];
      snap.activeEdges = [];
      break;
    }
  }
}

export function buildTrace(params: {
  method: Method;
  fingerprint: string;
  original: DFA;
  reachable: DFA;
  reachability: ReachabilityResult;
  partitionResult?: PartitionResult;
  pairResult?: PairResult;
  quotient: QuotientResult;
  equivalence: EquivalenceResult;
  verification: MinimizationResult['verification'];
  metrics: MinimizationResult['metrics'];
}): Trace {
  const {
    method,
    fingerprint,
    original,
    reachable,
    reachability,
    partitionResult,
    pairResult,
    quotient,
    equivalence,
    verification,
    metrics,
  } = params;

  const events: TraceEvent[] = [];
  let nextId = 1;
  const push = (ev: TraceEventPayload): void => {
    events.push({ ...ev, id: nextId++ } as TraceEvent);
  };

  const partitions: Partition[] = [];
  const pairSnapshots: Record<string, PairAddition & { round: number }>[] = [];
  const allPairs = pairResult ? pairResult.allPairs : [];

  push({
    kind: 'run.started',
    stage: 'reachability',
    detailLevel: 'concept',
    method,
    fingerprint,
  });

  // Stage A: Reachability
  push({
    kind: 'reach.started',
    stage: 'reachability',
    detailLevel: 'concept',
    startStateId: original.startStateId,
    visited: [original.startStateId],
    queue: [original.startStateId],
  });

  for (const step of reachability.steps) {
    if (step.type === 'dequeue') {
      push({
        kind: 'reach.dequeue',
        stage: 'reachability',
        detailLevel: 'operation',
        stateId: step.stateId,
        visited: step.visited,
        queue: step.queue,
      });
    } else {
      push({
        kind: 'reach.inspect',
        stage: 'reachability',
        detailLevel: 'operation',
        from: step.stateId,
        symbol: step.symbol!,
        to: step.targetId!,
        isNew: Boolean(step.isNew),
        visited: step.visited,
        queue: step.queue,
        witness: reachability.witnessStrings.get(step.targetId!) ?? [],
      });
    }
  }

  push({
    kind: 'reach.finished',
    stage: 'reachability',
    detailLevel: 'concept',
    discoveryOrder: reachability.discoveryOrder,
    reachableIds: reachability.reachableIds,
    unreachableIds: reachability.unreachableIds,
  });

  push({
    kind: 'reach.removed',
    stage: 'reachability',
    detailLevel: 'concept',
    removedIds: reachability.unreachableIds,
    remainingIds: reachability.reachableIds,
  });

  // Stage B & C: Partition refinement or Table-filling
  if (method === 'partition' && partitionResult) {
    partitions.push(partitionResult.initial);
    push({
      kind: 'partition.initial',
      stage: 'initial',
      detailLevel: 'concept',
      partition: partitionResult.initial,
    });

    for (const r of partitionResult.rounds) {
      const oldIdx = partitions.length - 1;
      push({
        kind: 'partition.roundStarted',
        stage: 'refine',
        detailLevel: 'concept',
        round: r.round,
        sourcePartitionIndex: oldIdx,
      });

      for (const sig of r.signatures) {
        push({
          kind: 'partition.signature',
          stage: 'refine',
          detailLevel: 'operation',
          round: r.round,
          sourcePartitionIndex: oldIdx,
          signature: sig,
        });
      }

      for (const dec of r.decisions) {
        push({
          kind: 'partition.groupDecision',
          stage: 'refine',
          detailLevel: 'concept',
          round: r.round,
          sourcePartitionIndex: oldIdx,
          decision: dec,
        });
      }

      partitions.push(r.nextPartition);
      const nextIdx = partitions.length - 1;

      push({
        kind: 'partition.roundCommitted',
        stage: 'refine',
        detailLevel: 'concept',
        round: r.round,
        oldPartitionIndex: oldIdx,
        nextPartitionIndex: nextIdx,
        changed: r.changed,
      });

      if (!r.changed) {
        push({
          kind: 'partition.stable',
          stage: 'refine',
          detailLevel: 'concept',
          round: r.round,
          partitionIndex: nextIdx,
        });
      }
    }
  } else if (method === 'table-filling' && pairResult) {
    const initSnapshot: Record<string, PairAddition & { round: number }> = {};
    for (const add of pairResult.initialMarked) {
      initSnapshot[add.pairKey] = { ...add, round: 0 };
    }
    pairSnapshots.push(initSnapshot);

    push({
      kind: 'pairs.initial',
      stage: 'table-filling',
      detailLevel: 'concept',
      markedKeys: pairResult.initialMarked.map((a) => a.pairKey),
      initialAdditions: pairResult.initialMarked,
    });

    for (const r of pairResult.rounds) {
      const snapIdx = pairSnapshots.length - 1;
      push({
        kind: 'pairs.roundStarted',
        stage: 'table-filling',
        detailLevel: 'concept',
        round: r.round,
        snapshotIndex: snapIdx,
      });

      const addByPairKey = new Map<string, PairAddition>();
      for (const a of r.additions) {
        addByPairKey.set(a.pairKey, a);
      }

      for (const insp of r.inspections) {
        push({
          kind: 'pairs.inspect',
          stage: 'table-filling',
          detailLevel: 'operation',
          round: r.round,
          inspection: insp,
        });
        if (insp.destMarkedInPrevious) {
          const add = addByPairKey.get(insp.pairKey);
          if (add && add.symbol === insp.symbol) {
            push({
              kind: 'pairs.markProposed',
              stage: 'table-filling',
              detailLevel: 'operation',
              round: r.round,
              addition: add,
            });
          }
        }
      }

      const nextSnapshot = { ...pairSnapshots[snapIdx]! };
      for (const a of r.additions) {
        nextSnapshot[a.pairKey] = { ...a, round: r.round };
      }
      pairSnapshots.push(nextSnapshot);

      push({
        kind: 'pairs.roundCommitted',
        stage: 'table-filling',
        detailLevel: 'concept',
        round: r.round,
        additions: r.additions,
        totalMarked: r.totalMarkedAfter,
        changed: r.changed,
        snapshotIndex: pairSnapshots.length - 1,
      });

      if (!r.changed) {
        const unmarkedKeys: string[] = [];
        for (const p of pairResult.allPairs) {
          if (!nextSnapshot[p.key]) unmarkedKeys.push(p.key);
        }
        push({
          kind: 'pairs.stable',
          stage: 'table-filling',
          detailLevel: 'concept',
          round: r.round,
          unmarkedKeys,
          classes: pairResult.classes,
        });
      }
    }
  }

  // Stage D: Quotient construction
  quotient.classInfos.forEach((info, idx) => {
    push({
      kind: 'quotient.classCreated',
      stage: 'quotient',
      detailLevel: 'concept',
      classInfo: info,
      classIndex: idx,
    });
  });

  quotient.transitionEvidence.forEach((evidence, idx) => {
    push({
      kind: 'quotient.transition',
      stage: 'quotient',
      detailLevel: 'operation',
      evidence,
      transitionIndex: idx,
    });
  });

  push({
    kind: 'quotient.finished',
    stage: 'quotient',
    detailLevel: 'concept',
    minimizedStateCount: quotient.minimized.states.length,
  });

  // Stage E: Verification
  equivalence.discoveredPairs.forEach((pair, idx) => {
    push({
      kind: 'verify.productPair',
      stage: 'verify',
      detailLevel: 'operation',
      pairIndex: idx,
      p: pair.p,
      q: pair.q,
      pFinal: pair.pFinal,
      qFinal: pair.qFinal,
      outgoing: pair.outgoing,
    });
  });

  push({
    kind: 'verify.finished',
    stage: 'verify',
    detailLevel: 'concept',
    equivalent: verification.equivalent,
    allStatesReachable: verification.allStatesReachable,
    pairwiseDistinguishable: verification.pairwiseDistinguishable,
    visitedPairCount: verification.visitedPairCount,
    counterexample: verification.counterexample,
  });

  push({
    kind: 'run.finished',
    stage: 'verify',
    detailLevel: 'concept',
    metrics,
  });

  // Build checkpoints at stage transitions, round commits, and every 25 events
  const traceShell = {
    original,
    reachable,
    minimized: quotient.minimized,
    removed: reachability.unreachableIds,
    partitions,
    pairSnapshots,
  };

  const checkpoints: TraceCheckpoint[] = [];
  const runningSnap = createInitialSnapshot(traceShell);

  for (let i = 0; i < events.length; i++) {
    const ev = events[i]!;
    applyEvent(runningSnap, ev, i, traceShell);

    const isBoundary =
      i === 0 ||
      ev.kind === 'reach.removed' ||
      ev.kind === 'partition.initial' ||
      ev.kind === 'partition.roundCommitted' ||
      ev.kind === 'pairs.initial' ||
      ev.kind === 'pairs.roundCommitted' ||
      ev.kind === 'quotient.finished' ||
      ev.kind === 'verify.finished' ||
      i % 25 === 0;

    if (isBoundary) {
      checkpoints.push({
        eventIndex: i,
        snapshot: cloneSnapshot(runningSnap),
      });
    }
  }

  return {
    engineVersion: ENGINE_VERSION,
    fingerprint,
    method,
    original,
    reachable,
    minimized: quotient.minimized,
    removed: reachability.unreachableIds,
    partitions,
    pairSnapshots,
    allPairs,
    events,
    checkpoints,
  };
}

export function getStepSnapshot(trace: Trace, eventIndex: number): StepSnapshot {
  if (trace.events.length === 0) {
    return createInitialSnapshot(trace);
  }
  const clamped = Math.max(0, Math.min(eventIndex, trace.events.length - 1));

  // Binary search for latest checkpoint <= clamped
  let lo = 0;
  let hi = trace.checkpoints.length - 1;
  let best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (trace.checkpoints[mid]!.eventIndex <= clamped) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  const cp = trace.checkpoints[best];
  const snap = cp ? cloneSnapshot(cp.snapshot) : createInitialSnapshot(trace);
  const startIdx = cp ? cp.eventIndex + 1 : 0;

  for (let i = startIdx; i <= clamped; i++) {
    applyEvent(snap, trace.events[i]!, i, trace);
  }

  return snap;
}

export function formatExplanation(event: TraceEvent, context: ExplanationContext): Explanation {
  const origLabels = buildStateLabelMap(context.original.states);
  const minLabels = buildStateLabelMap(context.minimized.states);
  const L = (id: StateId) => origLabels.get(id) ?? minLabels.get(id) ?? id;
  const listLabels = (ids: readonly StateId[]) => ids.map(L).join(', ');

  switch (event.kind) {
    case 'run.started':
      return {
        title: 'Minimization started',
        whatHappened: `Validated "${context.original.name}" (${context.original.states.length} states, alphabet {${context.original.alphabet.join(', ')}}) and prepared ${event.method === 'partition' ? 'partition refinement' : 'table-filling'}.`,
        why: 'Every state and symbol must have a single deterministic transition before minimization can begin.',
        formalDetail: `M = (Q, Σ, δ, q₀, F) with |Q| = ${context.original.states.length}, |Σ| = ${context.original.alphabet.length}, q₀ = ${L(context.original.startStateId)}.`,
        simplerExplanation: 'We checked that every state has one outgoing arrow for every symbol. Now we are ready to simplify the machine.',
        lessonId: 1,
      };

    case 'reach.started':
      return {
        title: 'Start reachability search',
        whatHappened: `Initialized breadth-first search at start state ${L(event.startStateId)}.`,
        why: 'Only states reachable from the start state by some input string can ever affect whether strings are accepted or rejected.',
        expression: `Visited = {${L(event.startStateId)}}, Queue = [${L(event.startStateId)}]`,
        formalDetail: `Base case: δ*(${L(event.startStateId)}, ε) = ${L(event.startStateId)}, so ${L(event.startStateId)} is reachable.`,
        simplerExplanation: 'Think of dropping a pin on the start state. We will follow every outgoing arrow to see which states we can actually visit.',
        lessonId: 2,
      };

    case 'reach.dequeue':
      return {
        title: `Explore from ${L(event.stateId)}`,
        whatHappened: `Dequeued state ${L(event.stateId)} to inspect all of its outgoing transitions.`,
        why: 'Checking every alphabet symbol from each discovered state ensures no reachable state is missed.',
        expression: `Current = ${L(event.stateId)}, Remaining queue = [${event.queue.map(L).join(', ')}]`,
        formalDetail: `Expanding q = ${L(event.stateId)} over Σ = {${context.original.alphabet.join(', ')}}.`,
        simplerExplanation: `We are standing at state ${L(event.stateId)} and checking every arrow leaving it.`,
        lessonId: 2,
      };

    case 'reach.inspect':
      return {
        title: event.isNew ? `Discovered ${L(event.to)}` : `${L(event.to)} already visited`,
        whatHappened: event.isNew
          ? `Reading ${event.symbol} from ${L(event.from)} reaches ${L(event.to)} for the first time, so ${L(event.to)} is added to the queue.`
          : `Reading ${event.symbol} from ${L(event.from)} goes to ${L(event.to)}, which was already discovered.`,
        why: event.isNew
          ? `The string "${formatTokens(event.witness)}" reaches ${L(event.to)} from ${L(context.original.startStateId)}.`
          : 'Re-enqueueing an already visited state is unnecessary because all of its outgoing paths are already scheduled for exploration.',
        expression: `δ(${L(event.from)}, ${event.symbol}) = ${L(event.to)} · witness: ${formatTokens(event.witness)}`,
        formalDetail: `δ*(${L(context.original.startStateId)}, ${formatTokens(event.witness)}) = ${L(event.to)}.`,
        simplerExplanation: event.isNew
          ? `Arrow "${event.symbol}" leads from ${L(event.from)} to a new state ${L(event.to)}.`
          : `Arrow "${event.symbol}" leads back to ${L(event.to)}, which we already found earlier.`,
        lessonId: 2,
      };

    case 'reach.finished':
      return {
        title: 'Reachability scan complete',
        whatHappened:
          event.unreachableIds.length > 0
            ? `Found ${event.reachableIds.length} reachable states (${listLabels(event.reachableIds)}) and ${event.unreachableIds.length} unreachable state(s) (${listLabels(event.unreachableIds)}).`
            : `All ${event.reachableIds.length} states are reachable from ${L(context.original.startStateId)}.`,
        why:
          event.unreachableIds.length > 0
            ? `No path from ${L(context.original.startStateId)} ever enters ${listLabels(event.unreachableIds)}. Even if an unreachable state has self-loops or outgoing arrows to reachable states, nothing can enter it from start.`
            : 'Every state can be reached by at least one input string starting from the start state.',
        expression: `Reachable = {${listLabels(event.reachableIds)}}`,
        formalDetail: `Q_r = { q ∈ Q | ∃ w ∈ Σ*, δ*(q₀, w) = q }. Unreachable = {${listLabels(event.unreachableIds)}}.`,
        simplerExplanation:
          event.unreachableIds.length > 0
            ? `States ${listLabels(event.unreachableIds)} have no path leading into them from start, so the machine can never enter them.`
            : 'Every state is reachable from the start state, so none are discarded here.',
        lessonId: 2,
      };

    case 'reach.removed':
      return {
        title:
          event.removedIds.length > 0
            ? `Removed ${event.removedIds.length} unreachable state(s)`
            : 'No unreachable states to remove',
        whatHappened:
          event.removedIds.length > 0
            ? `Removed ${listLabels(event.removedIds)} and its incident transitions. ${event.remainingIds.length} reachable states remain.`
            : `Kept all ${event.remainingIds.length} states for equivalence analysis.`,
        why:
          event.removedIds.length > 0
            ? 'Removing unreachable states cannot change the accepted language L(M), because no computation starting at q₀ ever visits them.'
            : 'Since zero states were unreachable, the working DFA matches the original DFA.',
        expression: `Q_r = {${listLabels(event.remainingIds)}}`,
        formalDetail: `L(M_r) = L(M) because for all w ∈ Σ*, δ*(q₀, w) ∈ Q_r.`,
        simplerExplanation:
          event.removedIds.length > 0
            ? `We crossed out ${listLabels(event.removedIds)} so we only focus on states the machine can actually use.`
            : 'Nothing needed to be crossed out in this step.',
        lessonId: 2,
      };

    case 'partition.initial': {
      const desc = event.partition.groups
        .map((g) => `${g.id} = {${listLabels(g.members)}}`)
        .join('; ');
      return {
        title: 'Initial partition P0',
        whatHappened: `Separated states by acceptance status into ${event.partition.groups.length} group(s): ${desc}.`,
        why: 'A final state accepts ε while a non-final state rejects ε, so they cannot be equivalent. States inside each group are only tentative candidates until checked with longer inputs.',
        expression: `P0 = { ${event.partition.groups.map((g) => `{${listLabels(g.members)}}`).join(', ')} }`,
        formalDetail: 'P0 = { Q_r \\ F_r, F_r } excluding empty sets; separates states distinguishable by w = ε.',
        simplerExplanation: 'First, put accepting (double-circle) states in one group and non-accepting states in another. They disagree immediately on an empty string.',
        lessonId: 4,
      };
    }

    case 'partition.roundStarted': {
      const src = context.partitions[event.sourcePartitionIndex];
      const desc = src ? src.groups.map((g) => `${g.id}={${listLabels(g.members)}}`).join(', ') : '';
      return {
        title: `Refinement round ${event.round}`,
        whatHappened: `Started round ${event.round} using fixed source partition P${event.round - 1}: ${desc}.`,
        why: 'Every transition target is mapped to its group in P' + `${event.round - 1}` + ' before any splits are committed.',
        formalDetail: `Evaluating signatures σ(q) = (G(δ(q, a)) for a ∈ Σ) with respect to P${event.round - 1}.`,
        simplerExplanation: `In round ${event.round}, we test whether states inside the same group go to the same destination groups on every symbol.`,
        lessonId: 5,
      };
    }

    case 'partition.signature': {
      const sig = event.signature;
      const parts = sig.entries.map(
        (e) => `${e.symbol}: ${L(e.targetStateId)} → ${e.targetGroupId}`,
      );
      return {
        title: `Signature of ${L(sig.stateId)} (Round ${event.round})`,
        whatHappened: `State ${L(sig.stateId)} in ${sig.sourceGroupId} has signature (${sig.signatureTuple.join(', ')}): ${parts.join('; ')}.`,
        why: 'Instead of comparing exact target state names, we compare which current group each symbol lands in.',
        expression: `sig(${L(sig.stateId)}) = (${sig.signatureTuple.join(', ')})`,
        formalDetail: `∀ a ∈ Σ, δ(${L(sig.stateId)}, a) ∈ ${sig.signatureTuple.join(', ')}.`,
        simplerExplanation: `From ${L(sig.stateId)}, follow each input arrow and note which group it lands in: (${sig.signatureTuple.join(', ')}).`,
        lessonId: 5,
      };
    }

    case 'partition.groupDecision': {
      const d = event.decision;
      const bucketSummary = d.buckets
        .map((b) => `{${listLabels(b.members)}} → (${b.signatureTuple.join(', ')})`)
        .join('; ');
      const diffSyms = d.differingPositions.map((idx) => context.reachable.alphabet[idx]).join(', ');
      return {
        title: d.didSplit
          ? `Split ${d.sourceGroupId} into ${d.buckets.length} groups`
          : `Keep ${d.sourceGroupId} together`,
        whatHappened: d.didSplit
          ? `Group ${d.sourceGroupId} ({${listLabels(d.sourceMembers)}}) splits: ${bucketSummary}.`
          : `All states in ${d.sourceGroupId} ({${listLabels(d.sourceMembers)}}) share signature (${d.buckets[0]?.signatureTuple.join(', ') ?? ''}).`,
        why: d.didSplit
          ? `States in different buckets land in already-distinguished groups on symbol(s) ${diffSyms}, proving they behave differently on future inputs.`
          : 'Matching target groups on every symbol means no suffix of length ' + `${event.round}` + ' separates these states.',
        expression: bucketSummary,
        formalDetail: d.didSplit
          ? `Partitioned ${d.sourceGroupId} by equivalence of σ(q) over Σ.`
          : `All q ∈ ${d.sourceGroupId} share identical σ(q).`,
        simplerExplanation: d.didSplit
          ? `States in ${d.sourceGroupId} did not all point to the same groups on symbol ${diffSyms}, so we separate them.`
          : `Every state in ${d.sourceGroupId} points to the exact same groups, so they stay together this round.`,
        lessonId: 5,
      };
    }

    case 'partition.roundCommitted': {
      const nextP = context.partitions[event.nextPartitionIndex];
      const summary = nextP
        ? nextP.groups.map((g) => `${g.id}={${listLabels(g.members)}}`).join(', ')
        : '';
      return {
        title: `Committed P${event.round}`,
        whatHappened: event.changed
          ? `Committed P${event.round}: ${summary}.`
          : `Committed P${event.round}: ${summary} — no group changed.`,
        why: event.changed
          ? 'At least one group split, so another round is required to check whether the new groups separate earlier states.'
          : 'Every group kept the exact same members, meaning all transitions are consistent at the group level.',
        expression: `P${event.round} = { ${nextP ? nextP.groups.map((g) => `{${listLabels(g.members)}}`).join(', ') : ''} }`,
        formalDetail: event.changed
          ? `|P${event.round}| = ${nextP?.groups.length ?? 0} > |P${event.round - 1}|.`
          : `P${event.round} = P${event.round - 1} (fixed point reached).`,
        simplerExplanation: event.changed
          ? `We updated the groups for the next round. Now we check if these new splits cause any other groups to split.`
          : `Nothing split in this round, so we know our groups are final!`,
        lessonId: 5,
      };
    }

    case 'partition.stable': {
      const finalP = context.partitions[event.partitionIndex];
      return {
        title: 'Partition is stable',
        whatHappened: `Every state in each group of P${event.round} has the same destination-group signature. Another round will not split these groups.`,
        why: 'By induction on string length, states in the same stable group agree on acceptance for all strings of any length.',
        expression: finalP
          ? finalP.groups.map((g) => `${g.id}={${listLabels(g.members)}}`).join(' · ')
          : undefined,
        formalDetail: `Fixed point P${event.round} = P${event.round - 1} defines the Myhill-Nerode equivalence classes on Q_r.`,
        simplerExplanation: 'Done splitting! States still sharing a group behave identically on every possible future input string.',
        lessonId: 5,
      };
    }

    case 'pairs.initial':
      return {
        title: 'Initialize pair table',
        whatHappened: `Marked ${event.initialAdditions.length} pair(s) that mix a final and a non-final state with witness ε.`,
        why: 'One state in the pair accepts ε and the other rejects ε, so they are immediately distinguishable.',
        expression:
          event.initialAdditions.length > 0
            ? `Marked: ${event.initialAdditions.map((a) => `(${L(a.p)},${L(a.q)})`).join(', ')}`
            : 'No pairs marked at initialization (all reachable states share final status).',
        formalDetail: 'Mark {p, q} if (p ∈ F_r) ≠ (q ∈ F_r), witness w = ε.',
        simplerExplanation: 'We put an × on every pair where one state is accepting and the other is not.',
        lessonId: 4,
      };

    case 'pairs.roundStarted':
      return {
        title: `Table-filling round ${event.round}`,
        whatHappened: `Scanning unmarked pairs against the marks committed before round ${event.round}.`,
        why: 'Using only the previous round snapshot keeps updates synchronous and deterministic.',
        formalDetail: `Round ${event.round}: check if ∃ a ∈ Σ such that {δ(p,a), δ(q,a)} is already marked.`,
        simplerExplanation: `For every unmarked pair, we follow each symbol to see if it lands on a pair we already marked earlier.`,
        lessonId: 5,
      };

    case 'pairs.inspect': {
      const ins = event.inspection;
      return {
        title: `Check (${L(ins.p)}, ${L(ins.q)}) on ${ins.symbol}`,
        whatHappened: ins.sameDestination
          ? `On ${ins.symbol}, both ${L(ins.p)} and ${L(ins.q)} go to ${L(ins.u)}, which cannot distinguish them on ${ins.symbol}.`
          : `On ${ins.symbol}, (${L(ins.p)}, ${L(ins.q)}) transitions to (${L(ins.u)}, ${L(ins.v)}), which is ${
              ins.destMarkedInPrevious ? 'already marked!' : 'not yet marked.'
            }`,
        why: ins.destMarkedInPrevious
          ? `Because (${L(ins.u)}, ${L(ins.v)}) is distinguishable, prepending ${ins.symbol} distinguishes (${L(ins.p)}, ${L(ins.q)}).`
          : 'This symbol alone does not prove distinguishability from the previous snapshot.',
        expression: `(${L(ins.p)}, ${L(ins.q)}) --${ins.symbol}--> (${L(ins.u)}, ${L(ins.v)})`,
        formalDetail: ins.proposedWitness
          ? `Witness: ${formatTokens(ins.proposedWitness)}`
          : `No mark from symbol ${ins.symbol} in round ${event.round}.`,
        simplerExplanation: ins.destMarkedInPrevious
          ? `Reading ${ins.symbol} takes ${L(ins.p)} and ${L(ins.q)} to states we already know are different!`
          : `Reading ${ins.symbol} does not yet separate ${L(ins.p)} and ${L(ins.q)}.`,
        lessonId: 5,
      };
    }

    case 'pairs.markProposed': {
      const add = event.addition;
      return {
        title: `Propose mark for (${L(add.p)}, ${L(add.q)})`,
        whatHappened: `Proposed marking (${L(add.p)}, ${L(add.q)}) via symbol ${add.symbol} with witness "${formatTokens(add.witness)}".`,
        why: `The destination pair reached on ${add.symbol} was marked before round ${event.round}, and marks are committed together at the end of the round.`,
        expression: `(${L(add.p)}, ${L(add.q)}) × · witness: ${formatTokens(add.witness)}`,
        formalDetail: `δ*(${L(add.p)}, ${formatTokens(add.witness)}) and δ*(${L(add.q)}, ${formatTokens(add.witness)}) disagree on acceptance.`,
        simplerExplanation: `We found a string "${formatTokens(add.witness)}" that makes ${L(add.p)} and ${L(add.q)} give opposite answers.`,
        lessonId: 5,
      };
    }

    case 'pairs.roundCommitted':
      return {
        title: `Committed table round ${event.round}`,
        whatHappened: event.changed
          ? `Committed ${event.additions.length} newly marked pair(s): ${event.additions.map((a) => `(${L(a.p)},${L(a.q)})`).join(', ')}.`
          : `No new pairs were marked in round ${event.round}.`,
        why: event.changed
          ? 'Newly marked pairs may distinguish additional pairs in the next scan.'
          : 'When a full scan adds zero marks, all remaining unmarked pairs are genuinely equivalent.',
        expression: `Total marked pairs: ${event.totalMarked}`,
        formalDetail: event.changed
          ? `Round ${event.round} added ${event.additions.length} marks.`
          : 'Fixed point reached; unmarked relation is an equivalence relation.',
        simplerExplanation: event.changed
          ? `Marked ${event.additions.length} new pair(s) at the end of round ${event.round}.`
          : 'No new pairs could be marked, so the table is finished!',
        lessonId: 5,
      };

    case 'pairs.stable':
      return {
        title: 'Distinguishability table stable',
        whatHappened: `Finished with ${event.unmarkedKeys.length} equivalent pair(s), forming ${event.classes.length} equivalence class(es).`,
        why: 'Unmarked pairs after stability cannot be separated by any string in Σ*.',
        expression: event.classes.map((c) => `{${listLabels(c)}}`).join(', '),
        formalDetail: 'Equivalence classes formed via transitive closure over unmarked pairs and verified against all marks.',
        simplerExplanation: 'Any pair still blank in the table is equivalent and can be merged into one state.',
        lessonId: 5,
      };

    case 'quotient.classCreated': {
      const c = event.classInfo;
      const roleText = c.isStart && c.isFinal ? 'start and final' : c.isStart ? 'start' : c.isFinal ? 'final' : 'non-final';
      return {
        title: `Create state ${c.minimizedLabel}`,
        whatHappened:
          c.members.length > 1
            ? `Merged {${listLabels(c.members)}} into ${c.minimizedLabel} (${roleText}).`
            : `Relabelled singleton {${listLabels(c.members)}} as ${c.minimizedLabel} (${roleText}).`,
        why:
          c.members.length > 1
            ? 'All states in this equivalence class share identical acceptance behavior and transition destinations.'
            : 'This state is distinguishable from every other reachable state, so it becomes its own quotient state.',
        expression: `${c.minimizedLabel} = {${listLabels(c.members)}}`,
        formalDetail: `${c.minimizedLabel} ∈ Q', start = ${String(c.isStart)}, final = ${String(c.isFinal)}.`,
        simplerExplanation:
          c.members.length > 1
            ? `States ${listLabels(c.members)} always behave the same, so they become a single state ${c.minimizedLabel}.`
            : `State ${listLabels(c.members)} stays by itself as ${c.minimizedLabel}.`,
        lessonId: 6,
      };
    }

    case 'quotient.transition': {
      const evd = event.evidence;
      const fromLabel = minLabels.get(evd.fromClassId) ?? evd.fromClassId;
      const toLabel = minLabels.get(evd.toClassId) ?? evd.toClassId;
      const details = evd.memberTargets.map((m) => `δ(${L(m.memberId)}, ${evd.symbol})=${L(m.targetId)}`).join(', ');
      return {
        title: `Set δ'(${fromLabel}, ${evd.symbol}) = ${toLabel}`,
        whatHappened: `Reading ${evd.symbol} in ${fromLabel} goes to ${toLabel} (via representative ${L(evd.representativeId)} → ${L(evd.representativeTargetId)}).`,
        why: `Every member of ${fromLabel} transitions into the class ${toLabel} on ${evd.symbol}: ${details}.`,
        expression: `δ'(${fromLabel}, ${evd.symbol}) = ${toLabel}`,
        formalDetail: `Well-defined quotient transition: ∀ q ∈ ${fromLabel}, [δ(q, ${evd.symbol})] = ${toLabel}.`,
        simplerExplanation: `Whenever any original state in ${fromLabel} reads ${evd.symbol}, it lands in ${toLabel}.`,
        lessonId: 6,
      };
    }

    case 'quotient.finished':
      return {
        title: 'Quotient DFA constructed',
        whatHappened: `Built the minimized DFA with ${event.minimizedStateCount} state(s) and complete deterministic transitions.`,
        why: 'Every quotient state represents one equivalence class, inheriting start and final status consistently.',
        formalDetail: `M' = (Q', Σ, δ', q₀', F') with |Q'| = ${event.minimizedStateCount}.`,
        simplerExplanation: 'All new states and arrows are now wired up. Next we mathematically verify the result.',
        lessonId: 6,
      };

    case 'verify.productPair':
      return {
        title: `Check product pair (${L(event.p)}, ${L(event.q)})`,
        whatHappened: `Visited pair (${L(event.p)}, ${L(event.q)}): acceptance status ${event.pFinal ? 'final' : 'non-final'} vs ${event.qFinal ? 'final' : 'non-final'}.`,
        why: 'Product BFS explores all simultaneously reachable state pairs between original and minimized DFAs.',
        expression: `(${L(event.p)}, ${L(event.q)}) · final match: ${event.pFinal === event.qFinal ? 'yes' : 'MISMATCH'}`,
        formalDetail: `Checking (p ∈ F) ⟺ (q ∈ F') across product automaton M × M'.`,
        simplerExplanation: `Testing whether the original state ${L(event.p)} and new state ${L(event.q)} agree on accepting or rejecting.`,
        lessonId: 7,
      };

    case 'verify.finished':
      return {
        title:
          event.equivalent && event.allStatesReachable && event.pairwiseDistinguishable
            ? 'Verified minimal DFA'
            : 'Verification failed',
        whatHappened:
          event.equivalent && event.allStatesReachable && event.pairwiseDistinguishable
            ? `No reachable state pair disagrees on acceptance across ${event.visitedPairCount} visited pair(s); all output states are reachable and pairwise distinguishable.`
            : `Verification check failed (equivalent=${event.equivalent}, reachable=${event.allStatesReachable}, distinguishable=${event.pairwiseDistinguishable}).`,
        why: 'Language equality is proved by exhaustive product BFS, and minimality is proved by verifying reachability and pairwise distinguishability of the quotient states.',
        formalDetail: `Product BFS visited ${event.visitedPairCount} reachable pairs; counterexample = ${event.counterexample ? formatTokens(event.counterexample) : 'null'}.`,
        simplerExplanation:
          event.equivalent
            ? 'We mathematically proved that both machines accept the exact same strings, and no two states in the new machine can be merged further.'
            : 'A discrepancy was detected between the original and minimized machines.',
        lessonId: 7,
      };

    case 'run.finished': {
      const m = event.metrics;
      return {
        title: 'Minimization complete',
        whatHappened: `${m.minimalCount} state(s) remain; the language is unchanged (${m.originalCount} → ${m.minimalCount}, ${m.unreachableRemoved} unreachable removed, ${m.equivalentStatesMerged} merged, ${m.percentageReduction.toFixed(1)}% reduction).`,
        why: 'The resulting machine is the unique minimal complete DFA up to state renaming for this language.',
        formalDetail: `|Q|=${m.originalCount}, |Q_r|=${m.reachableCount}, |Q'|=${m.minimalCount}.`,
        simplerExplanation: `You started with ${m.originalCount} states and ended with ${m.minimalCount} states without changing which strings are accepted.`,
        lessonId: 8,
      };
    }
  }
}
