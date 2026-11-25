import { buildStateIndexMap, buildTransitionMap } from './helpers';
import type {
  DFA,
  Group,
  GroupDecisionRecord,
  Partition,
  PartitionResult,
  PartitionRoundRecord,
  SignatureRecord,
  StateId,
} from './types';

function canonicalizePartition(
  blocks: StateId[][],
  round: number,
  stateIndex: Map<StateId, number>,
): Partition {
  const sortedBlocks = blocks
    .filter((b) => b.length > 0)
    .map((b) => [...b].sort((a, z) => (stateIndex.get(a) ?? 0) - (stateIndex.get(z) ?? 0)))
    .sort((b1, b2) => (stateIndex.get(b1[0]!) ?? 0) - (stateIndex.get(b2[0]!) ?? 0));

  const groups: Group[] = sortedBlocks.map((members, idx) => ({
    id: `G${idx}`,
    members,
  }));

  return { round, groups };
}

export function initialPartition(dfa: DFA): Partition {
  const finalSet = new Set(dfa.finalStateIds);
  const nonFinal: StateId[] = [];
  const finalStates: StateId[] = [];

  for (const s of dfa.states) {
    if (finalSet.has(s.id)) {
      finalStates.push(s.id);
    } else {
      nonFinal.push(s.id);
    }
  }

  const groups: Group[] = [];
  if (nonFinal.length > 0) {
    groups.push({ id: `G${groups.length}`, members: nonFinal });
  }
  if (finalStates.length > 0) {
    groups.push({ id: `G${groups.length}`, members: finalStates });
  }

  return { round: 0, groups };
}

export function refinePartitions(dfa: DFA): PartitionResult {
  const delta = buildTransitionMap(dfa);
  const stateIndex = buildStateIndexMap(dfa.states);
  const initial = initialPartition(dfa);

  let current = initial;
  const rounds: PartitionRoundRecord[] = [];
  let round = 1;

  while (true) {
    const old = current;
    const groupIdxOf = new Map<StateId, number>();
    old.groups.forEach((g, idx) => {
      for (const m of g.members) {
        groupIdxOf.set(m, idx);
      }
    });

    const signatures: SignatureRecord[] = [];
    const decisions: GroupDecisionRecord[] = [];
    const nextBlocks: StateId[][] = [];

    for (const block of old.groups) {
      const buckets = new Map<string, { signatureTuple: string[]; members: StateId[] }>();

      for (const q of block.members) {
        const row = delta.get(q)!;
        const entries = dfa.alphabet.map((sym) => {
          const targetStateId = row.get(sym)!;
          const targetGroupIndex = groupIdxOf.get(targetStateId);
          if (targetGroupIndex === undefined) {
            throw new Error(`Invariant violation: target state ${targetStateId} not in any group.`);
          }
          const targetGroupId = old.groups[targetGroupIndex]!.id;
          return {
            symbol: sym,
            targetStateId,
            targetGroupId,
            targetGroupIndex,
          };
        });

        const signatureKey = JSON.stringify(entries.map((e) => e.targetGroupIndex));
        const signatureTuple = entries.map((e) => e.targetGroupId);

        signatures.push({
          stateId: q,
          sourceGroupId: block.id,
          entries,
          signatureKey,
          signatureTuple,
        });

        let bucket = buckets.get(signatureKey);
        if (!bucket) {
          bucket = { signatureTuple, members: [] };
          buckets.set(signatureKey, bucket);
        }
        bucket.members.push(q);
      }

      const bucketList = Array.from(buckets.entries()).map(([signatureKey, val]) => ({
        signatureKey,
        signatureTuple: val.signatureTuple,
        members: val.members,
      }));

      const differingPositions: number[] = [];
      if (bucketList.length > 1) {
        for (let symIdx = 0; symIdx < dfa.alphabet.length; symIdx++) {
          const vals = new Set(bucketList.map((b) => b.signatureTuple[symIdx]));
          if (vals.size > 1) {
            differingPositions.push(symIdx);
          }
        }
      }

      decisions.push({
        sourceGroupId: block.id,
        sourceMembers: [...block.members],
        buckets: bucketList,
        didSplit: bucketList.length > 1,
        differingPositions,
      });

      for (const b of bucketList) {
        nextBlocks.push(b.members);
      }
    }

    const changed = decisions.some((d) => d.didSplit);
    const nextPartition = canonicalizePartition(nextBlocks, round, stateIndex);

    rounds.push({
      round,
      oldPartition: old,
      nextPartition,
      signatures,
      decisions,
      changed,
    });

    current = nextPartition;
    if (!changed) {
      break;
    }
    round += 1;
  }

  return {
    initial,
    rounds,
    stable: current,
    classes: current.groups.map((g) => [...g.members]),
  };
}
