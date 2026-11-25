export type StateId = string;
export type SymbolToken = string;
export type Method = 'partition' | 'table-filling';
export type StageId =
  | 'reachability'
  | 'initial'
  | 'refine'
  | 'table-filling'
  | 'quotient'
  | 'verify';
export type DetailLevel = 'concept' | 'operation';

export const ENGINE_VERSION = 1;
export const MAX_STATES = 24;
export const MAX_ALPHABET = 8;
export const MAX_STATE_LABEL_CP = 24;
export const MAX_TOKEN_CP = 12;
export const MAX_TEST_TOKENS = 200;
export const RESERVED_TOKENS = new Set(['ε', 'ϵ', '∅']);

export interface State {
  id: StateId;
  label: string;
}

export interface Transition {
  from: StateId;
  symbol: SymbolToken;
  to: StateId;
}

export interface LayoutNode {
  stateId: StateId;
  x: number;
  y: number;
}

export interface DFADraft {
  schemaVersion: 1;
  name: string;
  states: State[];
  alphabet: SymbolToken[];
  startStateId: StateId | null;
  finalStateIds: StateId[];
  transitions: Transition[];
  layout?: LayoutNode[];
}

export interface DFA {
  name: string;
  states: readonly State[];
  alphabet: readonly SymbolToken[];
  startStateId: StateId;
  finalStateIds: readonly StateId[];
  transitions: readonly Transition[];
}

export interface ValidationIssue {
  code: string;
  message: string;
  severity: 'error' | 'warning';
  stateId?: StateId;
  symbol?: SymbolToken;
  field?: string;
}

export type ValidationResult =
  | { ok: true; dfa: DFA; warnings: ValidationIssue[] }
  | { ok: false; issues: ValidationIssue[] };

export type CompletionResult =
  | {
      ok: true;
      draft: DFADraft;
      sinkState: State | null;
      addedTransitions: Transition[];
    }
  | { ok: false; message: string; issues: ValidationIssue[] };

export interface Group {
  id: string;
  members: StateId[];
}

export interface Partition {
  round: number;
  groups: Group[];
}

export interface ReachabilityStep {
  type: 'dequeue' | 'inspect';
  stateId: StateId;
  symbol?: SymbolToken;
  targetId?: StateId;
  isNew?: boolean;
  visited: StateId[];
  queue: StateId[];
}

export interface ReachabilityResult {
  reachableIds: StateId[];
  discoveryOrder: StateId[];
  unreachableIds: StateId[];
  parent: Map<StateId, { from: StateId; symbol: SymbolToken }>;
  witnessStrings: Map<StateId, SymbolToken[]>;
  steps: ReachabilityStep[];
}

export interface SignatureRecord {
  stateId: StateId;
  sourceGroupId: string;
  entries: {
    symbol: SymbolToken;
    targetStateId: StateId;
    targetGroupId: string;
    targetGroupIndex: number;
  }[];
  signatureKey: string;
  signatureTuple: string[];
}

export interface GroupDecisionRecord {
  sourceGroupId: string;
  sourceMembers: StateId[];
  buckets: {
    signatureKey: string;
    signatureTuple: string[];
    members: StateId[];
  }[];
  didSplit: boolean;
  differingPositions: number[];
}

export interface PartitionRoundRecord {
  round: number;
  oldPartition: Partition;
  nextPartition: Partition;
  signatures: SignatureRecord[];
  decisions: GroupDecisionRecord[];
  changed: boolean;
}

export interface PartitionResult {
  initial: Partition;
  rounds: PartitionRoundRecord[];
  stable: Partition;
  classes: StateId[][];
}

export interface PairCell {
  key: string;
  p: StateId;
  q: StateId;
  marked: boolean;
  roundMarked: number | null;
  witness: SymbolToken[] | null;
  reasonSymbol: SymbolToken | null;
  dependsOn: string | null;
}

export interface PairInspectRecord {
  round: number;
  pairKey: string;
  p: StateId;
  q: StateId;
  symbol: SymbolToken;
  u: StateId;
  v: StateId;
  sameDestination: boolean;
  destPairKey: string | null;
  destMarkedInPrevious: boolean;
  proposedWitness: SymbolToken[] | null;
}

export interface PairAddition {
  pairKey: string;
  p: StateId;
  q: StateId;
  symbol: SymbolToken;
  destPairKey: string;
  witness: SymbolToken[];
}

export interface PairRoundRecord {
  round: number;
  inspections: PairInspectRecord[];
  additions: PairAddition[];
  totalMarkedAfter: number;
  changed: boolean;
}

export interface PairResult {
  allPairs: { key: string; p: StateId; q: StateId }[];
  initialMarked: PairAddition[];
  rounds: PairRoundRecord[];
  finalMarks: Map<string, PairCell>;
  classes: StateId[][];
}

export interface QuotientClassInfo {
  minimizedId: StateId;
  minimizedLabel: string;
  members: StateId[];
  isStart: boolean;
  isFinal: boolean;
}

export interface QuotientTransitionEvidence {
  fromClassId: StateId;
  symbol: SymbolToken;
  toClassId: StateId;
  representativeId: StateId;
  representativeTargetId: StateId;
  memberTargets: { memberId: StateId; targetId: StateId }[];
}

export interface QuotientResult {
  minimized: DFA;
  mapping: { originalId: StateId; minimizedId: StateId }[];
  classInfos: QuotientClassInfo[];
  transitionEvidence: QuotientTransitionEvidence[];
}

export interface EquivalenceResult {
  equivalent: boolean;
  visitedPairCount: number;
  counterexample: SymbolToken[] | null;
  discoveredPairs: {
    p: StateId;
    q: StateId;
    pFinal: boolean;
    qFinal: boolean;
    outgoing: { symbol: SymbolToken; nextP: StateId; nextQ: StateId }[];
  }[];
}

export interface RunResult {
  ok: true;
  accepted: boolean;
  startStateId: StateId;
  finalStateId: StateId;
  tokens: SymbolToken[];
  path: StateId[];
  steps: {
    index: number;
    from: StateId;
    symbol: SymbolToken;
    to: StateId;
  }[];
}

export type RunError = {
  ok: false;
  message: string;
  position?: number;
  token?: string;
};

export interface MinimizationResult {
  engineVersion: number;
  fingerprint: string;
  original: DFA;
  reachable: DFA;
  removed: StateId[];
  method: Method;
  classes: StateId[][];
  minimized: DFA;
  mapping: { originalId: StateId; minimizedId: StateId }[];
  reachability: ReachabilityResult;
  partitionResult?: PartitionResult;
  pairResult?: PairResult;
  quotient: QuotientResult;
  verification: {
    equivalent: boolean;
    allStatesReachable: boolean;
    pairwiseDistinguishable: boolean;
    visitedPairCount: number;
    counterexample: SymbolToken[] | null;
    minimizedReachableIds: StateId[];
    distinguishedPairsCount: number;
    totalOutputPairsCount: number;
  };
  metrics: {
    originalCount: number;
    reachableCount: number;
    minimalCount: number;
    unreachableRemoved: number;
    equivalentStatesMerged: number;
    totalReduction: number;
    percentageReduction: number;
  };
  trace: Trace;
}

export type TraceEvent =
  | {
      id: number;
      kind: 'run.started';
      stage: StageId;
      detailLevel: DetailLevel;
      method: Method;
      fingerprint: string;
    }
  | {
      id: number;
      kind: 'reach.started';
      stage: 'reachability';
      detailLevel: 'concept';
      startStateId: StateId;
      visited: StateId[];
      queue: StateId[];
    }
  | {
      id: number;
      kind: 'reach.dequeue';
      stage: 'reachability';
      detailLevel: 'operation';
      stateId: StateId;
      visited: StateId[];
      queue: StateId[];
    }
  | {
      id: number;
      kind: 'reach.inspect';
      stage: 'reachability';
      detailLevel: 'operation';
      from: StateId;
      symbol: SymbolToken;
      to: StateId;
      isNew: boolean;
      visited: StateId[];
      queue: StateId[];
      witness: SymbolToken[];
    }
  | {
      id: number;
      kind: 'reach.finished';
      stage: 'reachability';
      detailLevel: 'concept';
      discoveryOrder: StateId[];
      reachableIds: StateId[];
      unreachableIds: StateId[];
    }
  | {
      id: number;
      kind: 'reach.removed';
      stage: 'reachability';
      detailLevel: 'concept';
      removedIds: StateId[];
      remainingIds: StateId[];
    }
  | {
      id: number;
      kind: 'partition.initial';
      stage: 'initial';
      detailLevel: 'concept';
      partition: Partition;
    }
  | {
      id: number;
      kind: 'partition.roundStarted';
      stage: 'refine';
      detailLevel: 'concept';
      round: number;
      sourcePartitionIndex: number;
    }
  | {
      id: number;
      kind: 'partition.signature';
      stage: 'refine';
      detailLevel: 'operation';
      round: number;
      sourcePartitionIndex: number;
      signature: SignatureRecord;
    }
  | {
      id: number;
      kind: 'partition.groupDecision';
      stage: 'refine';
      detailLevel: 'concept';
      round: number;
      sourcePartitionIndex: number;
      decision: GroupDecisionRecord;
    }
  | {
      id: number;
      kind: 'partition.roundCommitted';
      stage: 'refine';
      detailLevel: 'concept';
      round: number;
      oldPartitionIndex: number;
      nextPartitionIndex: number;
      changed: boolean;
    }
  | {
      id: number;
      kind: 'partition.stable';
      stage: 'refine';
      detailLevel: 'concept';
      round: number;
      partitionIndex: number;
    }
  | {
      id: number;
      kind: 'pairs.initial';
      stage: 'table-filling';
      detailLevel: 'concept';
      markedKeys: string[];
      initialAdditions: PairAddition[];
    }
  | {
      id: number;
      kind: 'pairs.roundStarted';
      stage: 'table-filling';
      detailLevel: 'concept';
      round: number;
      snapshotIndex: number;
    }
  | {
      id: number;
      kind: 'pairs.inspect';
      stage: 'table-filling';
      detailLevel: 'operation';
      round: number;
      inspection: PairInspectRecord;
    }
  | {
      id: number;
      kind: 'pairs.markProposed';
      stage: 'table-filling';
      detailLevel: 'operation';
      round: number;
      addition: PairAddition;
    }
  | {
      id: number;
      kind: 'pairs.roundCommitted';
      stage: 'table-filling';
      detailLevel: 'concept';
      round: number;
      additions: PairAddition[];
      totalMarked: number;
      changed: boolean;
      snapshotIndex: number;
    }
  | {
      id: number;
      kind: 'pairs.stable';
      stage: 'table-filling';
      detailLevel: 'concept';
      round: number;
      unmarkedKeys: string[];
      classes: StateId[][];
    }
  | {
      id: number;
      kind: 'quotient.classCreated';
      stage: 'quotient';
      detailLevel: 'concept';
      classInfo: QuotientClassInfo;
      classIndex: number;
    }
  | {
      id: number;
      kind: 'quotient.transition';
      stage: 'quotient';
      detailLevel: 'operation';
      evidence: QuotientTransitionEvidence;
      transitionIndex: number;
    }
  | {
      id: number;
      kind: 'quotient.finished';
      stage: 'quotient';
      detailLevel: 'concept';
      minimizedStateCount: number;
    }
  | {
      id: number;
      kind: 'verify.productPair';
      stage: 'verify';
      detailLevel: 'operation';
      pairIndex: number;
      p: StateId;
      q: StateId;
      pFinal: boolean;
      qFinal: boolean;
      outgoing: { symbol: SymbolToken; nextP: StateId; nextQ: StateId }[];
    }
  | {
      id: number;
      kind: 'verify.finished';
      stage: 'verify';
      detailLevel: 'concept';
      equivalent: boolean;
      allStatesReachable: boolean;
      pairwiseDistinguishable: boolean;
      visitedPairCount: number;
      counterexample: SymbolToken[] | null;
    }
  | {
      id: number;
      kind: 'run.finished';
      stage: 'verify';
      detailLevel: 'concept';
      metrics: MinimizationResult['metrics'];
    };

export interface TraceCheckpoint {
  eventIndex: number;
  snapshot: StepSnapshot;
}

export interface Trace {
  engineVersion: number;
  fingerprint: string;
  method: Method;
  original: DFA;
  reachable: DFA;
  minimized: DFA;
  removed: StateId[];
  partitions: Partition[];
  pairSnapshots: Record<string, PairAddition & { round: number }>[];
  allPairs: { key: string; p: StateId; q: StateId }[];
  events: TraceEvent[];
  checkpoints: TraceCheckpoint[];
}

export interface StepSnapshot {
  eventIndex: number;
  eventId: number;
  stage: StageId;
  graphMode: 'original' | 'reachable' | 'quotient';
  visibleDfa: DFA;
  selectedStateIds: StateId[];
  visitedStateIds: StateId[];
  removedStateIds: StateId[];
  activeEdges: { from: StateId; symbol: SymbolToken; to: StateId; kind: 'inspect' | 'visited' | 'quotient' }[];
  queue: StateId[];
  currentStateId: StateId | null;
  sourcePartition: Partition | null;
  pendingBuckets: GroupDecisionRecord[] | null;
  committedPartition: Partition | null;
  activeSignature: SignatureRecord | null;
  roundSignatures: SignatureRecord[];
  activePairKey: string | null;
  activePairDependency: { pairKey: string; destPairKey: string | null; symbol: SymbolToken } | null;
  markedPairs: Record<string, { round: number; witness: SymbolToken[]; symbol: SymbolToken | null; dependsOn: string | null }>;
  proposedPairMarks: PairAddition[];
  quotientClasses: QuotientClassInfo[];
  quotientTransitions: QuotientTransitionEvidence[];
  verificationStatus: {
    done: boolean;
    equivalent: boolean;
    allStatesReachable: boolean;
    pairwiseDistinguishable: boolean;
    visitedPairCount: number;
    counterexample: SymbolToken[] | null;
    currentProductPair: { p: StateId; q: StateId } | null;
    discoveredProductPairs: { p: StateId; q: StateId; pFinal: boolean; qFinal: boolean }[];
  };
}

export interface Explanation {
  title: string;
  whatHappened: string;
  why: string;
  expression?: string;
  formalDetail: string;
  simplerExplanation: string;
  lessonId: number;
}

export interface ExplanationContext {
  original: DFA;
  reachable: DFA;
  minimized: DFA;
  partitions: Partition[];
}
