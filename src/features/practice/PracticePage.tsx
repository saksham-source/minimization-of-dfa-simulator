import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Eye, HelpCircle, Lightbulb, RotateCcw, SkipForward } from 'lucide-react';
import { DfaGraph } from '../../components/graph/DfaGraph';
import {
  buildStateLabelMap,
  formatTokens,
  minimize,
  pairKey,
  parseTokenInput,
  runString,
  validateDraft,
  type DFA,
  type DFADraft,
  type Method,
  type MinimizationResult,
} from '../../engine';
import { GUIDED_PRESET, PRESET_FIXTURES } from '../../fixtures/presets';
import { useApp } from '../../store/AppContext';

type Difficulty = 'beginner' | 'intermediate' | 'challenge' | 'custom';

interface PracticePrompt {
  id: string;
  type:
    | 'reachability'
    | 'initial-partition'
    | 'refinement-split'
    | 'distinguishing-string'
    | 'table-filling-round'
    | 'quotient-transition'
    | 'minimality-count';
  title: string;
  question: string;
  lessonId: number;
  hint1: string;
  hint2: string;
  revealText: string;
  expectedSet?: string[];
  expectedGroups?: string[][];
  expectedSplitChoice?: 'split' | 'keep';
  expectedPairKeys?: string[];
  expectedTargetClassId?: string;
  expectedCount?: number;
  witnessPair?: { p: string; q: string };
  roundData?: {
    sourceGroupId: string;
    members: string[];
  };
  quotientData?: {
    classId: string;
    classLabel: string;
    members: string[];
    symbol: string;
  };
}

function setsEqual(a: readonly string[], b: readonly string[]): boolean {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size !== sb.size) return false;
  for (const x of sa) if (!sb.has(x)) return false;
  return true;
}

function groupSetsEqual(g1: string[][], g2: string[][]): boolean {
  const norm = (g: string[][]) =>
    g
      .filter((blk) => blk.length > 0)
      .map((blk) => [...blk].sort().join('\u0000'))
      .sort()
      .join('\u0001');
  return norm(g1) === norm(g2);
}

function buildPromptsForResult(res: MinimizationResult, dfa: DFA, prefix: string): PracticePrompt[] {
  const LMap = buildStateLabelMap(dfa.states);
  const L = (id: string) => LMap.get(id) ?? id;
  const prompts: PracticePrompt[] = [];

  // 1. Reachability
  prompts.push({
    id: `${prefix}-reach`,
    type: 'reachability',
    title: 'Step 1: Predict reachable states',
    question: `Starting from ${L(dfa.startStateId)}, select all states that can be reached by at least one input string.`,
    lessonId: 2,
    hint1: 'Start at q₀ and follow every outgoing transition in BFS order until no new states are found.',
    hint2: `Start state ${L(dfa.startStateId)} reaches ${res.reachability.discoveryOrder.slice(0, 3).map(L).join(' → ')}...`,
    revealText: `Reachable states: {${res.reachability.reachableIds.map(L).join(', ')}}`,
    expectedSet: res.reachability.reachableIds,
  });

  // 2. Initial Partition
  if (res.partitionResult) {
    const p0 = res.partitionResult.initial;
    prompts.push({
      id: `${prefix}-p0`,
      type: 'initial-partition',
      title: 'Step 2: Initial partition P0',
      question: 'Assign each reachable state into Group A or Group B to separate accepting (final) from non-accepting states (leave one group empty if all states share the same status).',
      lessonId: 4,
      hint1: 'States in F accept ε; states not in F reject ε. They can never belong to the same group.',
      hint2: `Final states in reachable DFA: {${res.reachable.finalStateIds.map(L).join(', ') || 'none'}}.`,
      revealText: p0.groups.map((g) => `${g.id} = {${g.members.map(L).join(', ')}}`).join('; '),
      expectedGroups: p0.groups.map((g) => g.members),
    });

    // 3. Refinement split decision
    const firstSplitRound = res.partitionResult.rounds.find((r) => r.changed);
    const splitDecision = firstSplitRound?.decisions.find((d) => d.didSplit);
    if (firstSplitRound && splitDecision) {
      prompts.push({
        id: `${prefix}-split`,
        type: 'refinement-split',
        title: `Step 3: Refinement Round ${firstSplitRound.round}`,
        question: `In Round ${firstSplitRound.round}, does group ${splitDecision.sourceGroupId} = {${splitDecision.sourceMembers.map(L).join(', ')}} split or stay together?`,
        lessonId: 5,
        hint1: 'Compute the destination group in P' + `${firstSplitRound.round - 1}` + ' for each symbol in Σ. If any two members differ, the group splits.',
        hint2: `Compare transitions on symbol "${res.reachable.alphabet[splitDecision.differingPositions[0] ?? 0]}" for states in ${splitDecision.sourceGroupId}.`,
        revealText: `Splits into ${splitDecision.buckets.map((b) => `{${b.members.map(L).join(', ')}}`).join(' and ')}.`,
        expectedSplitChoice: 'split',
        roundData: {
          sourceGroupId: splitDecision.sourceGroupId,
          members: splitDecision.sourceMembers,
        },
      });
    } else if (res.partitionResult.rounds[0]) {
      const dec = res.partitionResult.rounds[0]!.decisions[0]!;
      prompts.push({
        id: `${prefix}-keep`,
        type: 'refinement-split',
        title: 'Step 3: Refinement stability check',
        question: `Does group ${dec.sourceGroupId} = {${dec.sourceMembers.map(L).join(', ')}} split in Round 1 or stay together?`,
        lessonId: 5,
        hint1: 'Check if every member of the group points to the exact same destination group on each symbol.',
        hint2: `All members of ${dec.sourceGroupId} share signature (${dec.buckets[0]?.signatureTuple.join(', ') ?? ''}).`,
        revealText: 'No split — the group stays together and the partition is already stable.',
        expectedSplitChoice: 'keep',
        roundData: {
          sourceGroupId: dec.sourceGroupId,
          members: dec.sourceMembers,
        },
      });
    }
  }

  // 4. Table-filling round (if method === 'table-filling')
  if (res.method === 'table-filling' && res.pairResult && res.pairResult.rounds[0]) {
    const r1 = res.pairResult.rounds[0]!;
    prompts.push({
      id: `${prefix}-tf-r1`,
      type: 'table-filling-round',
      title: 'Table-filling Round 1 marks',
      question: 'Select all pairs that become newly marked in Round 1 (after initial ε marks on final/non-final pairs).',
      lessonId: 5,
      hint1: 'A pair (p, q) is marked in Round 1 if some symbol a sends (p, q) to a pair already marked on ε.',
      hint2: `Initially marked pairs: ${res.pairResult.initialMarked.map((a) => `(${L(a.p)},${L(a.q)})`).join(', ') || 'none'}.`,
      revealText:
        r1.additions.length > 0
          ? `Round 1 marks: ${r1.additions.map((a) => `(${L(a.p)},${L(a.q)}) via ${a.symbol}`).join(', ')}`
          : 'Round 1 marks no additional pairs.',
      expectedPairKeys: r1.additions.map((a) => a.pairKey),
    });
  }

  // 5. Distinguishing string if >= 2 classes
  if (res.classes.length >= 2) {
    const p = res.classes[0]![0]!;
    const q = res.classes[1]![0]!;
    prompts.push({
      id: `${prefix}-witness`,
      type: 'distinguishing-string',
      title: 'Find a distinguishing string',
      question: `Enter any input string over {${dfa.alphabet.join(', ')}} that distinguishes state ${L(p)} from state ${L(q)} (or click "Empty string (ε)" if ε distinguishes them).`,
      lessonId: 3,
      hint1: 'A string w distinguishes p and q if one state ends in F and the other ends outside F after reading w.',
      hint2: `Check whether ${L(p)} and ${L(q)} already differ on ε, or test symbol ${dfa.alphabet[0]}.`,
      revealText: 'Any string leading one state to F and the other outside F is valid.',
      witnessPair: { p, q },
    });
  }

  // 6. Quotient transition
  if (res.quotient.transitionEvidence.length > 0) {
    const ev = res.quotient.transitionEvidence[0]!;
    const cls = res.quotient.classInfos.find((c) => c.minimizedId === ev.fromClassId)!;
    const targetCls = res.quotient.classInfos.find((c) => c.minimizedId === ev.toClassId)!;
    prompts.push({
      id: `${prefix}-quotient`,
      type: 'quotient-transition',
      title: 'Build quotient transition',
      question: `For new state ${cls.minimizedLabel} = {${cls.members.map(L).join(', ')}}, which minimized state does δ'(${cls.minimizedLabel}, ${ev.symbol}) go to?`,
      lessonId: 6,
      hint1: `Pick representative ${L(ev.representativeId)} ∈ ${cls.minimizedLabel}, look up δ(${L(ev.representativeId)}, ${ev.symbol}), and find which quotient state contains it.`,
      hint2: `${L(ev.representativeId)} on "${ev.symbol}" transitions to ${L(ev.representativeTargetId)}.`,
      revealText: `δ'(${cls.minimizedLabel}, ${ev.symbol}) = ${targetCls.minimizedLabel} = {${targetCls.members.map(L).join(', ')}}`,
      expectedTargetClassId: ev.toClassId,
      quotientData: {
        classId: cls.minimizedId,
        classLabel: cls.minimizedLabel,
        members: cls.members,
        symbol: ev.symbol,
      },
    });
  }

  // 7. Minimality count
  prompts.push({
    id: `${prefix}-count`,
    type: 'minimality-count',
    title: 'Final minimal state count',
    question: 'How many states remain in the minimized DFA?',
    lessonId: 8,
    hint1: 'Count the number of stable equivalence classes (excluding any unreachable states).',
    hint2: `Reachable states: ${res.metrics.reachableCount}; classes formed: ${res.classes.length}.`,
    revealText: `The minimized DFA has ${res.metrics.minimalCount} state(s).`,
    expectedCount: res.metrics.minimalCount,
  });

  return prompts;
}

export function PracticePage() {
  const { draftState, practice, recordPracticeAttempt, resetPracticeStats } = useApp();

  const [difficulty, setDifficulty] = useState<Difficulty>('beginner');
  const [practiceMethod, setPracticeMethod] = useState<Method>('partition');
  const [promptIndex, setPromptIndex] = useState(0);

  // Per-prompt interaction state
  const [hintLevel, setHintLevel] = useState<0 | 1 | 2 | 3>(0);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'warning'; text: string } | null>(null);
  const [completedMap, setCompletedMap] = useState<Record<string, 'done' | 'revealed' | 'skipped'>>({});

  // Answer input states
  const [reachSelection, setReachSelection] = useState<string[]>([]);
  const [p0BucketA, setP0BucketA] = useState<string[]>([]);
  const [splitChoice, setSplitChoice] = useState<'split' | 'keep' | null>(null);
  const [witnessInput, setWitnessInput] = useState('');
  const [selectedPairKeys, setSelectedPairKeys] = useState<string[]>([]);
  const [quotientChoice, setQuotientChoice] = useState<string>('');
  const [countInput, setCountInput] = useState<string>('');

  const activeDraft: DFADraft = useMemo(() => {
    if (difficulty === 'beginner') {
      return PRESET_FIXTURES.find((p) => p.id === 'even-ones')!.draft; // Already minimal case
    }
    if (difficulty === 'intermediate') {
      return GUIDED_PRESET.draft;
    }
    if (difficulty === 'challenge') {
      return PRESET_FIXTURES.find((p) => p.id === 'equivalent-dead-states')!.draft;
    }
    return draftState.draft;
  }, [difficulty, draftState.draft]);

  const validated = useMemo(() => validateDraft(activeDraft), [activeDraft]);

  const result = useMemo(() => {
    if (!validated.ok) return null;
    return minimize(validated.dfa, practiceMethod);
  }, [practiceMethod, validated]);

  const prompts = useMemo(() => {
    if (!result || !validated.ok) return [];
    return buildPromptsForResult(result, validated.dfa, `${difficulty}-${practiceMethod}`);
  }, [difficulty, practiceMethod, result, validated]);

  const currentPrompt = prompts[promptIndex];
  const resetInputs = () => {
    setHintLevel(0);
    setFeedback(null);
    setReachSelection([]);
    setP0BucketA([]);
    setSplitChoice(null);
    setWitnessInput('');
    setSelectedPairKeys([]);
    setQuotientChoice('');
    setCountInput('');
  };

  if (!validated.ok || !result || !currentPrompt) {
    return (
      <div className="page-container">
        <h1 style={{ fontSize: 26, fontWeight: 650 }}>Practice Mode</h1>
        <div className="status-banner warning">
          <div>
            Your current custom DFA has validation errors. Fix them in the{' '}
            <Link to="/simulator">Simulator builder</Link>, or switch to Beginner / Intermediate / Challenge above.
          </div>
        </div>
      </div>
    );
  }

  const dfa = validated.dfa;
  const LMap = buildStateLabelMap(dfa.states);
  const L = (id: string) => LMap.get(id) ?? id;
  const isPromptResolved = Boolean(completedMap[currentPrompt.id]);
  const allPromptsResolved = prompts.every((p) => Boolean(completedMap[p.id]));

  const markSolved = (reason: string) => {
    setFeedback({ kind: 'success', text: reason });
    setCompletedMap((prev) => ({ ...prev, [currentPrompt.id]: 'done' }));
    recordPracticeAttempt({
      id: currentPrompt.id,
      promptTitle: currentPrompt.title,
      status: hintLevel > 0 ? 'hinted' : 'independent',
    });
  };

  const markMistake = (reason: string) => {
    setFeedback({ kind: 'warning', text: reason });
    recordPracticeAttempt({
      id: currentPrompt.id,
      promptTitle: currentPrompt.title,
      status: 'hinted',
      mistakeMessage: reason,
      lessonId: currentPrompt.lessonId,
    });
  };

  const handleCheckAnswer = () => {
    switch (currentPrompt.type) {
      case 'reachability': {
        const expected = currentPrompt.expectedSet ?? [];
        if (setsEqual(reachSelection, expected)) {
          markSolved(
            `Correct! Exactly {${expected.map(L).join(', ')}} are reachable from ${L(dfa.startStateId)}.`,
          );
        } else {
          const extra = reachSelection.filter((id) => !expected.includes(id));
          const missing = expected.filter((id) => !reachSelection.includes(id));
          if (extra.length > 0) {
            markMistake(
              `${extra.map(L).join(', ')} cannot be reached from start state ${L(dfa.startStateId)} even if they have outgoing transitions.`,
            );
          } else {
            markMistake(
              `You missed ${missing.length} reachable state(s). Follow transitions starting from ${L(dfa.startStateId)}.`,
            );
          }
        }
        break;
      }

      case 'initial-partition': {
        const reachableIds = result.reachable.states.map((s) => s.id);
        const bucketB = reachableIds.filter((id) => !p0BucketA.includes(id));
        const expected = currentPrompt.expectedGroups ?? [];
        if (groupSetsEqual([p0BucketA, bucketB], expected)) {
          markSolved('Correct! Final and non-final states are cleanly separated on ε.');
        } else {
          markMistake(
            'Remember: every final (double-circle) state must be separated from every non-final state in P0.',
          );
        }
        break;
      }

      case 'refinement-split': {
        if (!splitChoice) {
          setFeedback({ kind: 'warning', text: 'Choose either Split or Stay together first.' });
          return;
        }
        if (splitChoice === currentPrompt.expectedSplitChoice) {
          markSolved(currentPrompt.revealText);
        } else {
          markMistake(
            currentPrompt.expectedSplitChoice === 'split'
              ? 'Not quite — inspect the destination groups on each symbol for this group; at least two states land in different groups.'
              : 'Not quite — every member in this group lands in the exact same destination groups, so they stay together.',
          );
        }
        break;
      }

      case 'table-filling-round': {
        const expected = currentPrompt.expectedPairKeys ?? [];
        if (setsEqual(selectedPairKeys, expected)) {
          markSolved(`Correct! ${currentPrompt.revealText}`);
        } else {
          markMistake(
            'Check which unmarked pairs land on an already-marked pair (final vs non-final) in one step.',
          );
        }
        break;
      }

      case 'distinguishing-string': {
        const pair = currentPrompt.witnessPair!;
        const parsed = parseTokenInput(dfa, witnessInput);
        if (!parsed.ok) {
          setFeedback({ kind: 'warning', text: parsed.message });
          return;
        }
        const rP = runString(dfa, parsed.tokens, pair.p);
        const rQ = runString(dfa, parsed.tokens, pair.q);
        if (rP.accepted !== rQ.accepted) {
          markSolved(
            `Correct! Reading "${formatTokens(parsed.tokens)}" sends ${L(pair.p)} to ${L(rP.finalStateId)} (${
              rP.accepted ? 'accept' : 'reject'
            }) and ${L(pair.q)} to ${L(rQ.finalStateId)} (${rQ.accepted ? 'accept' : 'reject'}).`,
          );
        } else {
          markMistake(
            `String "${formatTokens(parsed.tokens)}" ends in ${
              rP.accepted ? 'accept' : 'reject'
            } for both ${L(pair.p)} and ${L(pair.q)}, so it does not distinguish them.`,
          );
        }
        break;
      }

      case 'quotient-transition': {
        if (!quotientChoice) {
          setFeedback({ kind: 'warning', text: 'Select a target minimized state first.' });
          return;
        }
        if (quotientChoice === currentPrompt.expectedTargetClassId) {
          markSolved(`Correct! ${currentPrompt.revealText}`);
        } else {
          markMistake(
            'Follow the transition from a representative member and choose the quotient state containing that destination.',
          );
        }
        break;
      }

      case 'minimality-count': {
        const parsed = Number(countInput.trim());
        if (!Number.isInteger(parsed) || parsed < 1) {
          setFeedback({ kind: 'warning', text: 'Enter a positive integer state count.' });
          return;
        }
        if (parsed === currentPrompt.expectedCount) {
          markSolved(`Correct! ${currentPrompt.revealText}`);
        } else {
          markMistake(
            `Not ${parsed}. Count the number of distinct equivalence classes formed from the ${result.metrics.reachableCount} reachable states.`,
          );
        }
        break;
      }
    }
  };

  const reachIndexMap = new Map(result.reachable.states.map((s, idx) => [s.id, idx]));

  return (
    <div className="page-container" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h1 style={{ margin: '0 0 4px', fontSize: 28, fontWeight: 650 }}>Practice Mode</h1>
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: 14 }}>
            Predict each step on the live engine before revealing the answer. Future steps stay hidden until solved or skipped.
          </p>
        </div>

        {/* Non-punitive progress counters */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <span className="chip tabular">Attempted: {practice.attempted}</span>
          <span className="chip tabular">Independent: {practice.solvedIndependently}</span>
          <span className="chip tabular">With hints: {practice.solvedWithHints}</span>
          <span className="chip tabular">Revealed: {practice.revealed}</span>
          <button type="button" className="btn btn-sm btn-ghost" onClick={resetPracticeStats}>
            <RotateCcw size={13} aria-hidden="true" />
            Reset stats
          </button>
        </div>
      </div>

      {/* Difficulty & Algorithm selector */}
      <div className="panel">
        <div className="panel-body" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }} role="group" aria-label="Practice difficulty">
            {(
              [
                ['beginner', 'Beginner (Already minimal)'],
                ['intermediate', 'Intermediate (7 → 4 guided)'],
                ['challenge', 'Challenge (Equivalent dead states)'],
                ['custom', 'Practice with my DFA'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`btn btn-sm ${difficulty === key ? 'btn-primary' : ''}`}
                onClick={() => {
                  setDifficulty(key);
                  setPromptIndex(0);
                  setCompletedMap({});
                  resetInputs();
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="tabs-bar" role="tablist" aria-label="Practice algorithm">
            <button
              type="button"
              role="tab"
              className="tab-btn"
              aria-selected={practiceMethod === 'partition'}
              onClick={() => {
                setPracticeMethod('partition');
                setPromptIndex(0);
                resetInputs();
              }}
            >
              Partition refinement
            </button>
            <button
              type="button"
              role="tab"
              className="tab-btn"
              aria-selected={practiceMethod === 'table-filling'}
              onClick={() => {
                setPracticeMethod('table-filling');
                setPromptIndex(0);
                resetInputs();
              }}
            >
              Table-filling
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))', gap: 16 }}>
        {/* Graph Reference */}
        <div className="panel">
          <div className="panel-body">
            <DfaGraph
              dfa={dfa}
              title={dfa.name}
              height={320}
              selectedStateIds={
                currentPrompt.witnessPair
                  ? [currentPrompt.witnessPair.p, currentPrompt.witnessPair.q]
                  : currentPrompt.roundData
                  ? currentPrompt.roundData.members
                  : []
              }
            />
          </div>
        </div>

        {/* Active Prompt Card */}
        <div className="panel">
          <div className="panel-header">
            <div>
              <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }} className="tabular">
                Prompt {promptIndex + 1} of {prompts.length}
              </div>
              <h2 className="panel-title">{currentPrompt.title}</h2>
            </div>

            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                className="btn btn-sm"
                disabled={promptIndex === 0}
                onClick={() => {
                  setPromptIndex((i) => Math.max(0, i - 1));
                  resetInputs();
                }}
              >
                Back
              </button>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                disabled={!isPromptResolved || promptIndex >= prompts.length - 1}
                onClick={() => {
                  setPromptIndex((i) => Math.min(prompts.length - 1, i + 1));
                  resetInputs();
                }}
              >
                Next prompt
              </button>
            </div>
          </div>

          <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ margin: 0, fontSize: 15 }}>{currentPrompt.question}</p>

            {/* Prompt-specific controls */}
            {currentPrompt.type === 'reachability' && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {dfa.states.map((s) => {
                  const picked = reachSelection.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      className={`btn btn-sm ${picked ? 'btn-primary' : ''}`}
                      aria-pressed={picked}
                      onClick={() =>
                        setReachSelection((prev) =>
                          prev.includes(s.id) ? prev.filter((x) => x !== s.id) : [...prev, s.id],
                        )
                      }
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
            )}

            {currentPrompt.type === 'initial-partition' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                  Click states to toggle membership in Group A (the remaining reachable states go into Group B):
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {result.reachable.states.map((s) => {
                    const inA = p0BucketA.includes(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        className={`btn btn-sm ${inA ? 'btn-primary' : ''}`}
                        aria-pressed={inA}
                        onClick={() =>
                          setP0BucketA((prev) =>
                            prev.includes(s.id) ? prev.filter((x) => x !== s.id) : [...prev, s.id],
                          )
                        }
                      >
                        {s.label} ({inA ? 'Group A' : 'Group B'})
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {currentPrompt.type === 'refinement-split' && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className={`btn ${splitChoice === 'split' ? 'btn-primary' : ''}`}
                  aria-pressed={splitChoice === 'split'}
                  onClick={() => setSplitChoice('split')}
                >
                  Splits into smaller groups
                </button>
                <button
                  type="button"
                  className={`btn ${splitChoice === 'keep' ? 'btn-primary' : ''}`}
                  aria-pressed={splitChoice === 'keep'}
                  onClick={() => setSplitChoice('keep')}
                >
                  Stays together
                </button>
              </div>
            )}

            {currentPrompt.type === 'table-filling-round' && result.pairResult && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {result.pairResult.allPairs
                  .filter((p) => !result.pairResult!.initialMarked.some((m) => m.pairKey === p.key))
                  .map((pair) => {
                    const key = pairKey(pair.p, pair.q, reachIndexMap);
                    const picked = selectedPairKeys.includes(key);
                    return (
                      <button
                        key={key}
                        type="button"
                        className={`btn btn-sm mono ${picked ? 'btn-primary' : ''}`}
                        aria-pressed={picked}
                        onClick={() =>
                          setSelectedPairKeys((prev) =>
                            prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key],
                          )
                        }
                      >
                        ({L(pair.p)}, {L(pair.q)})
                      </button>
                    );
                  })}
              </div>
            )}

            {currentPrompt.type === 'distinguishing-string' && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <input
                  type="text"
                  className="text-input mono"
                  style={{ flex: '1 1 180px' }}
                  aria-label="Distinguishing string"
                  placeholder="Enter witness string..."
                  value={witnessInput}
                  onChange={(e) => setWitnessInput(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setWitnessInput('')}
                >
                  Empty string (ε)
                </button>
              </div>
            )}

            {currentPrompt.type === 'quotient-transition' && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {result.quotient.classInfos.map((c) => (
                  <button
                    key={c.minimizedId}
                    type="button"
                    className={`btn btn-sm ${quotientChoice === c.minimizedId ? 'btn-primary' : ''}`}
                    aria-pressed={quotientChoice === c.minimizedId}
                    onClick={() => setQuotientChoice(c.minimizedId)}
                  >
                    {c.minimizedLabel} = {'{'}{c.members.map(L).join(', ')}{'}'}
                  </button>
                ))}
              </div>
            )}

            {currentPrompt.type === 'minimality-count' && (
              <input
                type="number"
                min={1}
                max={24}
                className="text-input"
                style={{ maxWidth: 160 }}
                aria-label="Predicted minimal state count"
                value={countInput}
                onChange={(e) => setCountInput(e.target.value)}
              />
            )}

            {/* Action & Hint Bar */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button type="button" className="btn btn-primary" onClick={handleCheckAnswer}>
                <CheckCircle2 size={15} aria-hidden="true" />
                Check answer
              </button>

              <button
                type="button"
                className="btn"
                disabled={hintLevel >= 2}
                onClick={() => setHintLevel((h) => Math.min(2, h + 1) as 0 | 1 | 2)}
              >
                <Lightbulb size={15} aria-hidden="true" />
                {hintLevel === 0 ? 'Hint 1 (Rule)' : hintLevel === 1 ? 'Hint 2 (Evidence)' : 'All hints shown'}
              </button>

              <button
                type="button"
                className="btn"
                onClick={() => {
                  setHintLevel(3);
                  setCompletedMap((prev) => ({ ...prev, [currentPrompt.id]: 'revealed' }));
                  recordPracticeAttempt({
                    id: currentPrompt.id,
                    promptTitle: currentPrompt.title,
                    status: 'revealed',
                  });
                }}
              >
                <Eye size={15} aria-hidden="true" />
                Reveal answer
              </button>

              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setCompletedMap((prev) => ({ ...prev, [currentPrompt.id]: 'skipped' }));
                  if (promptIndex < prompts.length - 1) {
                    setPromptIndex((i) => i + 1);
                    resetInputs();
                  }
                }}
              >
                <SkipForward size={15} aria-hidden="true" />
                Skip
              </button>
            </div>

            {hintLevel >= 1 && (
              <div className="status-banner info" style={{ fontSize: 13.5, flexDirection: 'column', gap: 4 }}>
                <div>
                  <strong>Hint 1:</strong> {currentPrompt.hint1}
                </div>
                {hintLevel >= 2 && (
                  <div>
                    <strong>Hint 2:</strong> {currentPrompt.hint2}
                  </div>
                )}
                {hintLevel === 3 && (
                  <div>
                    <strong>Answer:</strong> {currentPrompt.revealText}
                  </div>
                )}
              </div>
            )}

            {feedback && (
              <div className={`status-banner ${feedback.kind}`} role="status">
                {feedback.text}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Completion & Mistake Review */}
      {allPromptsResolved && (
        <div className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Practice session complete — review</h2>
            <Link to="/simulator" className="btn btn-sm btn-primary">
              Inspect full trace in Simulator
            </Link>
          </div>
          <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {practice.mistakes.length === 0 ? (
              <p style={{ margin: 0, color: 'var(--success)', fontWeight: 600 }}>
                Zero recorded misconceptions in your current progress!
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>Topics to review:</div>
                {practice.mistakes.map((m) => (
                  <div
                    key={m.id}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-control)',
                      padding: 10,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 10,
                    }}
                  >
                    <div style={{ fontSize: 13.5 }}>
                      <strong>{m.promptTitle}:</strong> {m.message}
                    </div>
                    <Link to={`/learn?lesson=${m.lessonId}`} className="btn btn-sm">
                      <HelpCircle size={14} aria-hidden="true" />
                      Lesson {m.lessonId}
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
