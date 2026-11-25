import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp, HelpCircle, Lightbulb } from 'lucide-react';
import { GlossaryTerm } from '../../components/ui/GlossaryPopover';
import {
  buildStateLabelMap,
  findWitness,
  formatExplanation,
  formatTokens,
  type DFA,
  type MinimizationResult,
  type StepSnapshot,
  type TraceEvent,
} from '../../engine';

interface ExplanationInspectorProps {
  result: MinimizationResult;
  event: TraceEvent;
  snapshot: StepSnapshot;
}

export function ExplanationInspector({
  result,
  event,
  snapshot,
}: ExplanationInspectorProps) {
  const [showFormal, setShowFormal] = useState(false);
  const [showSimple, setShowSimple] = useState(false);

  // Pair comparator for Stage B ("test ε from two selected states") & general distinguishing witness probe
  const [probeA, setProbeA] = useState<string>(result.reachable.states[0]?.id ?? '');
  const [probeB, setProbeB] = useState<string>(
    result.reachable.states[result.reachable.states.length - 1]?.id ?? '',
  );

  const explanation = formatExplanation(event, {
    original: result.original,
    reachable: result.reachable,
    minimized: result.minimized,
    partitions: result.trace.partitions,
  });

  const labelMap = buildStateLabelMap(result.reachable.states);
  const probeDfa: DFA = result.reachable;
  const finalSet = new Set(probeDfa.finalStateIds);
  const validProbeA = probeDfa.states.some((s) => s.id === probeA) ? probeA : probeDfa.states[0]?.id ?? '';
  const validProbeB = probeDfa.states.some((s) => s.id === probeB)
    ? probeB
    : probeDfa.states[probeDfa.states.length - 1]?.id ?? '';

  const witness =
    validProbeA && validProbeB ? findWitness(probeDfa, validProbeA, validProbeB) : null;

  return (
    <aside className="panel" aria-label="Step explanation inspector">
      <div className="panel-header">
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            {snapshot.stage === 'reachability'
              ? 'Stage 1 · Reachability'
              : snapshot.stage === 'initial'
              ? 'Stage 2 · Initial Partition'
              : snapshot.stage === 'refine'
              ? 'Stage 3 · Partition Refinement'
              : snapshot.stage === 'table-filling'
              ? 'Stage 3 · Table-Filling'
              : snapshot.stage === 'quotient'
              ? 'Stage 4 · Quotient DFA'
              : 'Stage 5 · Verification'}
          </div>
          <h2 className="panel-title" style={{ marginTop: 2 }}>
            {explanation.title}
          </h2>
        </div>
      </div>

      <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <section>
          <div style={{ fontSize: 12.5, fontWeight: 650, color: 'var(--muted)', marginBottom: 4 }}>
            What happened?
          </div>
          <p style={{ margin: 0, fontSize: 14.5 }}>{explanation.whatHappened}</p>
        </section>

        <section>
          <div style={{ fontSize: 12.5, fontWeight: 650, color: 'var(--muted)', marginBottom: 4 }}>
            Why?
          </div>
          <p style={{ margin: 0, fontSize: 14.5 }}>{explanation.why}</p>
        </section>

        {explanation.expression && (
          <div
            className="mono"
            style={{
              background: 'var(--surface-subtle)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-control)',
              padding: '8px 10px',
              fontSize: 13,
              overflowX: 'auto',
            }}
          >
            {explanation.expression}
          </div>
        )}

        {/* Quick glossary inline links */}
        <div style={{ fontSize: 12.5, color: 'var(--muted)', display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <span>Key terms:</span>
          <GlossaryTerm id="reachable" />
          <GlossaryTerm id="equivalent" />
          <GlossaryTerm id="witness" label="Witness" />
          <GlossaryTerm id="quotient" />
        </div>

        {/* Disclosure controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            type="button"
            className="btn btn-sm"
            style={{ justifyContent: 'space-between' }}
            aria-expanded={showFormal}
            onClick={() => setShowFormal((v) => !v)}
          >
            <span>Show formal detail</span>
            {showFormal ? <ChevronUp size={15} aria-hidden="true" /> : <ChevronDown size={15} aria-hidden="true" />}
          </button>
          {showFormal && (
            <div
              className="mono"
              style={{
                padding: '10px',
                borderRadius: 'var(--radius-control)',
                background: 'var(--surface-subtle)',
                border: '1px solid var(--border)',
                fontSize: 12.5,
              }}
            >
              {explanation.formalDetail}
            </div>
          )}

          <button
            type="button"
            className="btn btn-sm btn-ghost"
            style={{ justifyContent: 'flex-start' }}
            aria-expanded={showSimple}
            onClick={() => setShowSimple((v) => !v)}
          >
            <HelpCircle size={15} aria-hidden="true" />
            I don&apos;t understand this
          </button>
          {showSimple && (
            <div className="status-banner info" style={{ fontSize: 13, flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                <Lightbulb size={15} aria-hidden="true" />
                Simpler explanation
              </div>
              <p style={{ margin: 0 }}>{explanation.simplerExplanation}</p>
              <Link to={`/learn?lesson=${explanation.lessonId}`} style={{ fontSize: 12.5, fontWeight: 600 }}>
                Open Lesson {explanation.lessonId} →
              </Link>
            </div>
          )}
        </div>

        {/* Stage B / C / E: Interactive ε & Distinguishing String Tester for two states */}
        {(snapshot.stage === 'initial' || snapshot.stage === 'refine' || snapshot.stage === 'table-filling') &&
          probeDfa.states.length >= 2 && (
            <div
              style={{
                borderTop: '1px solid var(--border)',
                paddingTop: 12,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div style={{ fontSize: 12.5, fontWeight: 650, color: 'var(--muted)' }}>
                Compare two reachable states (ε & witness check)
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <select
                  aria-label="First state to compare"
                  className="select-input"
                  style={{ minHeight: 32, fontSize: 13 }}
                  value={validProbeA}
                  onChange={(e) => setProbeA(e.target.value)}
                >
                  {probeDfa.states.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>vs</span>
                <select
                  aria-label="Second state to compare"
                  className="select-input"
                  style={{ minHeight: 32, fontSize: 13 }}
                  value={validProbeB}
                  onChange={(e) => setProbeB(e.target.value)}
                >
                  {probeDfa.states.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text)' }}>
                On <strong className="mono">ε</strong>:{' '}
                {labelMap.get(validProbeA)} {finalSet.has(validProbeA) ? 'accepts' : 'rejects'},{' '}
                {labelMap.get(validProbeB)} {finalSet.has(validProbeB) ? 'accepts' : 'rejects'}.
                <br />
                {validProbeA === validProbeB ? (
                  <span style={{ color: 'var(--muted)' }}>Choose two distinct states.</span>
                ) : witness === null ? (
                  <span style={{ color: 'var(--success)', fontWeight: 600 }}>
                    Equivalent: no distinguishing string exists.
                  </span>
                ) : (
                  <span>
                    Shortest distinguishing string:{' '}
                    <code className="mono" style={{ fontWeight: 700 }}>
                      {formatTokens(witness)}
                    </code>
                  </span>
                )}
              </div>
            </div>
          )}
      </div>
    </aside>
  );
}
