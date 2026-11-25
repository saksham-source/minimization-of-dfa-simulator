import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, BookOpen, CheckCircle2, RotateCcw } from 'lucide-react';
import { TransitionTable } from '../../components/data/TransitionTable';
import { DfaGraph } from '../../components/graph/DfaGraph';
import { GlossaryTerm } from '../../components/ui/GlossaryPopover';
import { GLOSSARY } from '../../components/ui/glossaryData';
import { minimize, runString, validateDraft, type SymbolToken } from '../../engine';
import { GUIDED_PRESET, PRESET_FIXTURES } from '../../fixtures/presets';
import { useApp } from '../../store/AppContext';

interface LessonMeta {
  id: number;
  title: string;
  takeaway: string;
  question: string;
  options: string[];
  correctIndex: number;
  feedbackCorrect: string;
  feedbackWrong: string;
  targetEventKind: string;
}

const LESSONS: LessonMeta[] = [
  {
    id: 1,
    title: '1. What is a DFA?',
    takeaway: 'Every state has exactly one next state for each input symbol.',
    question: 'In the Even-Ones DFA (start state E is also final), is the empty string ε accepted?',
    options: [
      'Yes, because reading ε stays at E, which is a final state.',
      'No, because no symbols were read.',
      'Only if E has a self-loop on 1.',
    ],
    correctIndex: 0,
    feedbackCorrect: 'Correct! Reading ε leaves the machine in its start state E, and E is a final (double-circle) state.',
    feedbackWrong: 'Check what happens with 0 symbols: the machine starts at E and never leaves E. Since E is final, ε is accepted.',
    targetEventKind: 'run.started',
  },
  {
    id: 2,
    title: '2. Reachability',
    takeaway: 'Only states reachable from the start state can influence the accepted language.',
    question: 'In the 7-state guided example, U has a transition to final state F. Is U reachable?',
    options: [
      'Yes, because it connects to F.',
      'No, because no path starts at A and enters U.',
    ],
    correctIndex: 1,
    feedbackCorrect: 'Exactly right! Reachability is directed from the start state A. Arrows leaving U cannot help paths from A enter U.',
    feedbackWrong: 'Reachability asks whether you can walk FROM the start state A TO state U. No arrow enters U from A, B, C, D, E, or F.',
    targetEventKind: 'reach.finished',
  },
  {
    id: 3,
    title: '3. Equivalent states',
    takeaway: 'Equivalent means identical future acceptance on every string, not identical target state names.',
    question: 'State B goes to D on 0, while C goes to E on 0. Can B and C still be equivalent?',
    options: [
      'No, because D and E are different state names.',
      'Yes, if D and E themselves turn out to be equivalent!',
    ],
    correctIndex: 1,
    feedbackCorrect: 'Correct! Equivalence depends on future acceptance, not raw state names. Here D and E are equivalent, so B and C stay equivalent too.',
    feedbackWrong: 'Two states do not need arrows to the exact same state name—only to equivalent destination states.',
    targetEventKind: 'partition.roundCommitted',
  },
  {
    id: 4,
    title: '4. Initial groups',
    takeaway: 'Final and non-final states disagree on ε, so they can never be merged.',
    question: 'Why do we separate states into final and non-final groups in P0?',
    options: [
      'Because ε distinguishes any final state from any non-final state.',
      'Because final states cannot have outgoing arrows.',
    ],
    correctIndex: 0,
    feedbackCorrect: 'Correct! Final states accept ε while non-final states reject ε. Remember: final states can still have outgoing arrows!',
    feedbackWrong: 'Final states can have outgoing transitions! The real reason is that ε immediately separates accepting states from non-accepting states.',
    targetEventKind: 'partition.initial',
  },
  {
    id: 5,
    title: '5. Refine groups',
    takeaway: 'Split a group only when its members land in different destination groups on some symbol.',
    question: 'When does synchronous partition refinement stop?',
    options: [
      'As soon as the number of final groups stays the same.',
      'When an entire round produces zero splits (P_i = P_{i-1}).',
    ],
    correctIndex: 1,
    feedbackCorrect: 'Correct! Stopping early can miss indirect splits like A separating from {B, C} in Round 2. We stop only when a full round causes zero splits.',
    feedbackWrong: 'You must run rounds until an entire round causes no split at all.',
    targetEventKind: 'partition.stable',
  },
  {
    id: 6,
    title: '6. Build the result',
    takeaway: 'Each stable equivalence class becomes one quotient state M_i.',
    question: 'How is a quotient transition δ\'(M1, 0) chosen when M1 = {B, C}?',
    options: [
      'Follow 0 from any member (e.g. B → D) and pick the new state containing D (M2).',
      'Pick whichever target state has the smaller label alphabetically.',
    ],
    correctIndex: 0,
    feedbackCorrect: 'Correct! Because M1 is stable, every member of M1 lands in the exact same class M2 on symbol 0.',
    feedbackWrong: 'Every member of a stable class agrees on the destination class, so following any representative gives the unique target class.',
    targetEventKind: 'quotient.finished',
  },
  {
    id: 7,
    title: '7. Verify the solution',
    takeaway: 'Testing sample strings helps build intuition, while product BFS proves language equality.',
    question: 'Why does testing 8 sample strings not prove two DFAs accept the exact same language?',
    options: [
      'Because infinitely many strings exist; only product BFS checks all reachable state pairs.',
      'Because DFAs only accept finite languages.',
    ],
    correctIndex: 0,
    feedbackCorrect: 'Exactly! Product-automaton BFS checks every reachable (p, q) pair finitely and exhaustively.',
    feedbackWrong: 'A DFA language can be infinite! Product BFS checks all reachable pairs of states to prove equality for every string in Σ*.',
    targetEventKind: 'verify.finished',
  },
  {
    id: 8,
    title: '8. Exam recap',
    takeaway: 'Write reachability, P0, each round\'s signatures, stability, state mapping, and the quotient table.',
    question: 'In a written exam, what proves you did not stop refinement too early?',
    options: [
      'Writing out the final no-split stability round explicitly.',
      'Skipping straight from P1 to the final graph.',
    ],
    correctIndex: 0,
    feedbackCorrect: 'Spot on! Showing the final stability check proves every group has consistent signatures.',
    feedbackWrong: 'Always write the stability check round explicitly so graders can verify no further split exists.',
    targetEventKind: 'run.finished',
  },
];

export function LearnPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { loadPreset, setCursor } = useApp();

  const initialLessonId = Number(searchParams.get('lesson') ?? '1');
  const [activeId, setActiveId] = useState<number>(
    initialLessonId >= 1 && initialLessonId <= 8 ? initialLessonId : 1,
  );
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [showGlossary, setShowGlossary] = useState(false);

  // Interactive Lesson 1 machine: Even number of ones
  const evenOnesDfa = useMemo(() => {
    const val = validateDraft(PRESET_FIXTURES.find((p) => p.id === 'even-ones')!.draft);
    return val.ok ? val.dfa : null;
  }, []);
  const [lessonTokens, setLessonTokens] = useState<SymbolToken[]>([]);

  // Interactive Lesson 2 reachability selector
  const [pickedReachable, setPickedReachable] = useState<string[]>(['A']);

  const lessonRun = useMemo(() => {
    if (!evenOnesDfa) return null;
    return runString(evenOnesDfa, lessonTokens);
  }, [evenOnesDfa, lessonTokens]);

  const activeLesson = LESSONS.find((l) => l.id === activeId) ?? LESSONS[0]!;
  const chosenOption = answers[activeLesson.id];

  const openInSimulator = (eventKind: string) => {
    loadPreset(GUIDED_PRESET.draft, true);
    const val = validateDraft(GUIDED_PRESET.draft);
    if (val.ok) {
      const res = minimize(val.dfa, 'partition');
      const idx = res.trace.events.findIndex((e) => e.kind === eventKind);
      if (idx >= 0) setCursor(idx);
    }
    navigate('/simulator');
  };

  return (
    <div className="page-container" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h1 style={{ margin: '0 0 4px', fontSize: 28, fontWeight: 650 }}>Learn DFA Minimization</h1>
          <p style={{ margin: 0, color: 'var(--muted)', maxWidth: '64ch' }}>
            Short interactive cards from prerequisites to exam-ready proofs. Click any underlined term for a quick glossary definition.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-sm"
          aria-expanded={showGlossary}
          onClick={() => setShowGlossary((v) => !v)}
        >
          <BookOpen size={15} aria-hidden="true" />
          {showGlossary ? 'Hide full glossary' : 'Open full glossary'}
        </button>
      </div>

      {/* Lesson Navigation Strip */}
      <nav aria-label="Lessons" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {LESSONS.map((l) => {
          const isCurrent = l.id === activeId;
          const isDone = answers[l.id] === l.correctIndex;
          return (
            <button
              key={l.id}
              type="button"
              aria-current={isCurrent ? 'step' : undefined}
              className={`btn btn-sm ${isCurrent ? 'btn-primary' : ''}`}
              onClick={() => {
                setActiveId(l.id);
                setSearchParams({ lesson: String(l.id) });
              }}
            >
              {isDone && <CheckCircle2 size={14} aria-hidden="true" />}
              {l.title}
            </button>
          );
        })}
      </nav>

      {/* Active Lesson Card */}
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">{activeLesson.title}</h2>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>
              Key takeaway: {activeLesson.takeaway}
            </span>
          </div>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => openInSimulator(activeLesson.targetEventKind)}
          >
            Open in simulator
            <ArrowRight size={14} aria-hidden="true" />
          </button>
        </div>

        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Lesson-specific interactive content */}
          {activeLesson.id === 1 && evenOnesDfa && lessonRun && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <p style={{ margin: 0, maxWidth: '68ch' }}>
                A <GlossaryTerm id="dfa" /> reads an input string one symbol at a time from its{' '}
                <GlossaryTerm id="alphabet" />. Click <code>0</code> or <code>1</code> below to step
                through the Even-Number-of-Ones machine and watch both the graph and transition table:
              </p>

              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => setLessonTokens((t) => [...t, '0'])}
                >
                  Read 0
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => setLessonTokens((t) => [...t, '1'])}
                >
                  Read 1
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setLessonTokens([])}
                >
                  <RotateCcw size={14} aria-hidden="true" />
                  Reset to ε
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setLessonTokens(['1', '0', '1'])}
                >
                  Try &quot;101&quot; (Accepted)
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setLessonTokens(['1'])}
                >
                  Try &quot;1&quot; (Rejected)
                </button>
              </div>

              <div className={`status-banner ${lessonRun.accepted ? 'success' : 'info'}`}>
                <div>
                  <strong>
                    String read: <code className="mono">{lessonTokens.length === 0 ? 'ε' : lessonTokens.join('')}</code>
                  </strong>{' '}
                  · Current state: <strong>{lessonRun.finalStateId === 'e' ? 'E' : 'O'}</strong> ·{' '}
                  <strong>{lessonRun.accepted ? 'Accepted (final state)' : 'Rejected (non-final state)'}</strong>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 14 }}>
                <DfaGraph
                  dfa={evenOnesDfa}
                  title="Even-ones DFA"
                  height={240}
                  selectedStateIds={[lessonRun.finalStateId]}
                  showEdgeListToggle={false}
                />
                <TransitionTable
                  dfa={evenOnesDfa}
                  selectedStateIds={[lessonRun.finalStateId]}
                  caption="Even-ones transition table"
                />
              </div>
            </div>
          )}

          {activeLesson.id === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ margin: 0, maxWidth: '68ch' }}>
                In the 7-state guided example, start at <strong>A</strong> and select which states can be reached by some path of transitions (note that <code>U --1--&gt; F</code> and <code>U --0--&gt; U</code>):
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {['A', 'B', 'C', 'D', 'E', 'F', 'U'].map((id) => {
                  const picked = pickedReachable.includes(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      className={`btn btn-sm ${picked ? 'btn-primary' : ''}`}
                      aria-pressed={picked}
                      onClick={() =>
                        setPickedReachable((prev) =>
                          prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
                        )
                      }
                    >
                      {id}
                    </button>
                  );
                })}
              </div>
              <div className="status-banner info" style={{ fontSize: 13.5 }}>
                {pickedReachable.length === 6 && !pickedReachable.includes('U') ? (
                  <span>
                    Exact match! <strong>{'{A, B, C, D, E, F}'}</strong> are reachable from A, while{' '}
                    <strong>U</strong> has no incoming path from A.
                  </span>
                ) : (
                  <span>
                    Selected: {'{'}{pickedReachable.join(', ')}{'}'}. Hint: trace from A using 0 and 1—can any arrow ever enter U?
                  </span>
                )}
              </div>
            </div>
          )}

          {activeLesson.id >= 3 && (
            <div style={{ maxWidth: '68ch', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {activeLesson.id === 3 && (
                <p style={{ margin: 0 }}>
                  Two states <code>p</code> and <code>q</code> are <GlossaryTerm id="equivalent" /> when
                  every remaining string <code>w ∈ Σ*</code> ends in a final state from <code>p</code>{' '}
                  exactly when it ends in a final state from <code>q</code>. If they ever disagree on some string{' '}
                  <code>w</code>, that string is a <GlossaryTerm id="witness" />. Remember: a reachable{' '}
                  <GlossaryTerm id="dead" /> is NOT unreachable; it is kept in a complete DFA.
                </p>
              )}
              {activeLesson.id === 4 && (
                <p style={{ margin: 0 }}>
                  After removing unreachable states, we form the initial <GlossaryTerm id="partition" />{' '}
                  <code>P0 = {'{Q_r − F_r, F_r}'}</code> (omitting any empty group). In the 7-to-4 example,{' '}
                  <code>G0 = {'{A, B, C, D, E}'}</code> and <code>G1 = {'{F}'}</code>.
                </p>
              )}
              {activeLesson.id === 5 && (
                <p style={{ margin: 0 }}>
                  In each synchronous round, we compute every state&apos;s destination-group signature against
                  the <strong>fixed</strong> previous partition. In Round 1 of the guided example, D and E
                  split from A, B, C because reading <code>0</code> takes D/E to <code>G1</code> while A/B/C
                  stay in <code>G0</code>. In Round 2, A splits from B and C because reading <code>0</code>{' '}
                  takes A to <code>G0</code> while B/C go to <code>G1</code>. Round 3 produces zero splits,
                  confirming stability!
                </p>
              )}
              {activeLesson.id === 6 && (
                <p style={{ margin: 0 }}>
                  Each stable equivalence class becomes one state <code>M_i</code> in the{' '}
                  <GlossaryTerm id="quotient" />. In the guided example: <code>M0 = {'{A}'}</code> (start),{' '}
                  <code>M1 = {'{B, C}'}</code>, <code>M2 = {'{D, E}'}</code>, <code>M3 = {'{F}'}</code> (final).
                </p>
              )}
              {activeLesson.id === 7 && (
                <p style={{ margin: 0 }}>
                  Running sample strings like <code>000</code> (accepted) or <code>0001</code> (rejected)
                  builds intuition, but only the <GlossaryTerm id="product" /> equivalence check proves{' '}
                  <code>L(M) = L(M&apos;)</code> for all infinitely many strings.
                </p>
              )}
              {activeLesson.id === 8 && (
                <p style={{ margin: 0 }}>
                  <strong>Exam Checklist:</strong> (1) Write original table &amp; roles. (2) Run BFS from start
                  and list removed unreachable states. (3) Write P0. (4) Show signatures for each round and
                  new groups. (5) Explicitly show the final no-split stability round. (6) Write state mapping
                  and final minimized transition table.
                </p>
              )}
            </div>
          )}

          {/* Quick Check Question */}
          <div
            style={{
              borderTop: '1px solid var(--border)',
              paddingTop: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div style={{ fontWeight: 650, fontSize: 14.5 }}>Quick check: {activeLesson.question}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {activeLesson.options.map((opt, idx) => {
                const isSelected = chosenOption === idx;
                return (
                  <button
                    key={idx}
                    type="button"
                    className={`btn ${isSelected ? 'btn-primary' : ''}`}
                    style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '10px 14px', height: 'auto' }}
                    aria-pressed={isSelected}
                    onClick={() => setAnswers((prev) => ({ ...prev, [activeLesson.id]: idx }))}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>

            {chosenOption !== undefined && (
              <div
                className={`status-banner ${
                  chosenOption === activeLesson.correctIndex ? 'success' : 'warning'
                }`}
              >
                {chosenOption === activeLesson.correctIndex
                  ? activeLesson.feedbackCorrect
                  : activeLesson.feedbackWrong}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Glossary Section */}
      {showGlossary && (
        <div className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Theory of Computation Glossary</h2>
          </div>
          <div
            className="panel-body"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: 12,
            }}
          >
            {Object.values(GLOSSARY).map((entry) => (
              <div
                key={entry.term}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-control)',
                  padding: 12,
                }}
              >
                <div style={{ fontWeight: 650, fontSize: 14 }}>
                  {entry.term}{' '}
                  {entry.symbol && <code style={{ fontSize: 12, color: 'var(--muted)' }}>{entry.symbol}</code>}
                </div>
                <p style={{ margin: '4px 0', fontSize: 13 }}>{entry.short}</p>
                <p style={{ margin: 0, fontSize: 12.5, color: 'var(--muted)' }}>{entry.detail}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
