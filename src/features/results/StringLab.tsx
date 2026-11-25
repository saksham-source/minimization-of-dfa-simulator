import { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Play, RotateCcw, StepForward, XCircle } from 'lucide-react';
import {
  buildStateLabelMap,
  formatTokens,
  parseTokenInput,
  runString,
  type DFA,
  type RunResult,
  type SymbolToken,
} from '../../engine';

interface StringLabProps {
  original: DFA;
  minimized: DFA;
  onHighlightStates?: (origId: string | null, minId: string | null) => void;
}

export function StringLab({ original, minimized, onHighlightStates }: StringLabProps) {
  const [inputText, setInputText] = useState('000');
  const [activeTokens, setActiveTokens] = useState<SymbolToken[]>(() => {
    const p = parseTokenInput(original, '000');
    return p.ok ? p.tokens : [];
  });
  const [parseError, setParseError] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState<number | null>(null); // null = finished / show full result

  const origLabels = useMemo(() => buildStateLabelMap(original.states), [original.states]);
  const minLabels = useMemo(() => buildStateLabelMap(minimized.states), [minimized.states]);

  const origRun = useMemo<RunResult>(() => runString(original, activeTokens), [original, activeTokens]);
  const minRun = useMemo<RunResult>(() => runString(minimized, activeTokens), [minimized, activeTokens]);

  const sampleButtons = useMemo(() => {
    const a = original.alphabet[0] ?? '0';
    const b = original.alphabet[1] ?? a;
    const isBinary = original.alphabet.length === 2 && original.alphabet[0] === '0' && original.alphabet[1] === '1';
    if (isBinary) {
      return [
        { label: 'ε', raw: '' },
        { label: '0', raw: '0' },
        { label: '000', raw: '000' },
        { label: '0001', raw: '0001' },
        { label: '000100', raw: '000100' },
        { label: '111', raw: '111' },
      ];
    }
    return [
      { label: 'ε', raw: '' },
      { label: a, raw: a },
      { label: `${a} ${b}`, raw: `${a} ${b}` },
      { label: `${a} ${a} ${a}`, raw: `${a} ${a} ${a}` },
    ];
  }, [original.alphabet]);

  const executeRaw = (raw: string, stepMode = false) => {
    const parsed = parseTokenInput(original, raw);
    if (!parsed.ok) {
      setParseError(parsed.message);
      return;
    }
    setParseError(null);
    setActiveTokens(parsed.tokens);
    const nextStep = stepMode ? 0 : parsed.tokens.length;
    setStepIndex(stepMode ? 0 : null);
    const rOrig = runString(original, parsed.tokens);
    const rMin = runString(minimized, parsed.tokens);
    onHighlightStates?.(rOrig.path[nextStep] ?? null, rMin.path[nextStep] ?? null);
  };

  const currentPos = stepIndex === null ? activeTokens.length : Math.min(stepIndex, activeTokens.length);
  const finished = currentPos >= activeTokens.length;
  const mismatch = finished && origRun.accepted !== minRun.accepted;

  const curOrigState = origRun.path[currentPos] ?? origRun.finalStateId;
  const curMinState = minRun.path[currentPos] ?? minRun.finalStateId;

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">String testing lab</h2>
          <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
            Example check, not a proof — tests one string on both machines in lockstep from their start states.
          </span>
        </div>
      </div>

      <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            executeRaw(inputText, false);
          }}
          style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}
        >
          <div style={{ flex: '1 1 240px' }}>
            <label htmlFor="string-lab-input" className="field-label">
              Input string (alphabet: {original.alphabet.join(', ')})
            </label>
            <input
              id="string-lab-input"
              type="text"
              className="text-input mono"
              placeholder={
                original.alphabet.some((t) => Array.from(t).length > 1)
                  ? `Separate tokens with spaces, e.g. ${original.alphabet.slice(0, 2).join(' ')}`
                  : `Enter symbols (e.g. ${original.alphabet[0] ?? '0'}...) or leave blank for ε`
              }
              value={inputText}
              onChange={(e) => {
                setInputText(e.target.value);
                setParseError(null);
              }}
            />
          </div>

          <button type="submit" className="btn btn-primary">
            <Play size={15} aria-hidden="true" />
            Run both
          </button>

          <button
            type="button"
            className="btn"
            onClick={() => {
              setInputText('');
              executeRaw('', false);
            }}
          >
            Empty string (ε)
          </button>

          <button
            type="button"
            className="btn"
            onClick={() => executeRaw(inputText, true)}
          >
            <StepForward size={15} aria-hidden="true" />
            Step from start
          </button>
        </form>

        {/* Deterministic example chips */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>Quick samples:</span>
          {sampleButtons.map((sb) => (
            <button
              key={sb.label}
              type="button"
              className="chip chip-btn mono"
              onClick={() => {
                setInputText(sb.raw);
                executeRaw(sb.raw, false);
              }}
            >
              {sb.label}
            </button>
          ))}
        </div>

        {parseError && (
          <div className="status-banner danger" role="alert">
            <AlertCircle size={18} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
            <div>{parseError}</div>
          </div>
        )}

        {/* Token chips cursor & step controls */}
        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-control)',
            padding: 12,
            background: 'var(--surface-subtle)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Tokens:</span>
              {activeTokens.length === 0 ? (
                <span className="chip mono">ε (empty string)</span>
              ) : (
                activeTokens.map((tok, idx) => {
                  const consumed = idx < currentPos;
                  const isNext = idx === currentPos;
                  return (
                    <span
                      key={idx}
                      className="chip mono"
                      style={{
                        borderColor: isNext ? 'var(--accent)' : consumed ? 'var(--success)' : 'var(--border)',
                        background: isNext
                          ? 'var(--accent-subtle)'
                          : consumed
                          ? 'var(--success-bg)'
                          : 'var(--surface)',
                      }}
                    >
                      {tok}
                    </span>
                  );
                })
              )}
            </div>

            {activeTokens.length > 0 && (
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={currentPos <= 0}
                  onClick={() => {
                    const next = Math.max(0, currentPos - 1);
                    setStepIndex(next);
                    onHighlightStates?.(origRun.path[next] ?? null, minRun.path[next] ?? null);
                  }}
                >
                  <RotateCcw size={13} aria-hidden="true" />
                  Back
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  disabled={finished}
                  onClick={() => {
                    const next = Math.min(activeTokens.length, currentPos + 1);
                    setStepIndex(next);
                    onHighlightStates?.(origRun.path[next] ?? null, minRun.path[next] ?? null);
                  }}
                >
                  <StepForward size={13} aria-hidden="true" />
                  Next token ({currentPos}/{activeTokens.length})
                </button>
              </div>
            )}
          </div>

          {mismatch && (
            <div className="status-banner danger" role="alert">
              <XCircle size={18} aria-hidden="true" />
              <div>
                <strong>Equivalence mismatch detected!</strong> Input{' '}
                <code>{formatTokens(activeTokens)}</code> was{' '}
                {origRun.accepted ? 'accepted' : 'rejected'} by the original DFA but{' '}
                {minRun.accepted ? 'accepted' : 'rejected'} by the minimized DFA.
              </div>
            </div>
          )}

          {/* Side-by-side path results */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
            <div
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-control)',
                padding: 12,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <strong style={{ fontSize: 13.5 }}>Original DFA</strong>
                {finished ? (
                  <span
                    className="chip"
                    style={{
                      background: origRun.accepted ? 'var(--success-bg)' : 'var(--surface-subtle)',
                      borderColor: origRun.accepted ? 'var(--success)' : 'var(--border)',
                      color: origRun.accepted ? 'var(--success)' : 'var(--muted)',
                    }}
                  >
                    {origRun.accepted ? (
                      <CheckCircle2 size={13} aria-hidden="true" />
                    ) : (
                      <XCircle size={13} aria-hidden="true" />
                    )}
                    {origRun.accepted ? 'Accepted' : 'Rejected'}
                  </span>
                ) : (
                  <span className="chip">In progress · at {origLabels.get(curOrigState)}</span>
                )}
              </div>
              <div className="mono" style={{ fontSize: 12.5, color: 'var(--muted)', wordBreak: 'break-word' }}>
                Path: {origRun.path.slice(0, currentPos + 1).map((id) => origLabels.get(id) ?? id).join(' → ')}
              </div>
            </div>

            <div
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-control)',
                padding: 12,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <strong style={{ fontSize: 13.5 }}>Minimized DFA</strong>
                {finished ? (
                  <span
                    className="chip"
                    style={{
                      background: minRun.accepted ? 'var(--success-bg)' : 'var(--surface-subtle)',
                      borderColor: minRun.accepted ? 'var(--success)' : 'var(--border)',
                      color: minRun.accepted ? 'var(--success)' : 'var(--muted)',
                    }}
                  >
                    {minRun.accepted ? (
                      <CheckCircle2 size={13} aria-hidden="true" />
                    ) : (
                      <XCircle size={13} aria-hidden="true" />
                    )}
                    {minRun.accepted ? 'Accepted' : 'Rejected'}
                  </span>
                ) : (
                  <span className="chip">In progress · at {minLabels.get(curMinState)}</span>
                )}
              </div>
              <div className="mono" style={{ fontSize: 12.5, color: 'var(--muted)', wordBreak: 'break-word' }}>
                Path: {minRun.path.slice(0, currentPos + 1).map((id) => minLabels.get(id) ?? id).join(' → ')}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
