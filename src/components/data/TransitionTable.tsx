import { AlertTriangle, ArrowRight, CircleDot } from 'lucide-react';
import type { DFA, DFADraft, StateId, SymbolToken, ValidationIssue } from '../../engine';

interface TransitionTableProps {
  dfa: DFA | DFADraft;
  editable?: boolean;
  issues?: readonly ValidationIssue[];
  highlightedCell?: { from: StateId; symbol: SymbolToken } | null;
  selectedStateIds?: readonly StateId[];
  onFocusCell?: (cell: { from: StateId; symbol: SymbolToken } | null) => void;
  onChangeTransition?: (from: StateId, symbol: SymbolToken, to: StateId | null) => void;
  onToggleFinal?: (stateId: StateId) => void;
  onSetStart?: (stateId: StateId) => void;
  caption?: string;
}

export function TransitionTable({
  dfa,
  editable = false,
  issues = [],
  highlightedCell = null,
  selectedStateIds = [],
  onFocusCell,
  onChangeTransition,
  onToggleFinal,
  onSetStart,
  caption,
}: TransitionTableProps) {
  const finalSet = new Set(dfa.finalStateIds);
  const selectedSet = new Set(selectedStateIds);

  const transMap = new Map<StateId, Map<SymbolToken, StateId>>();
  for (const s of dfa.states) {
    transMap.set(s.id, new Map());
  }
  for (const t of dfa.transitions) {
    transMap.get(t.from)?.set(t.symbol, t.to);
  }

  const labelById = new Map<StateId, string>();
  for (const s of dfa.states) {
    labelById.set(s.id, s.label);
  }

  const missingSet = new Set(
    issues
      .filter((i) => i.code === 'MISSING_TRANSITION' && i.stateId && i.symbol)
      .map((i) => `${JSON.stringify(i.stateId)}|${JSON.stringify(i.symbol)}`),
  );

  return (
    <div className="data-table-wrap">
      <table className="data-table" aria-label={caption ?? 'Transition table'}>
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            <th scope="col">State</th>
            {dfa.alphabet.map((sym) => (
              <th key={sym} scope="col" className="mono">
                δ(·, {sym})
              </th>
            ))}
            <th scope="col">Role</th>
          </tr>
        </thead>
        <tbody>
          {dfa.states.map((s) => {
            const isStart = dfa.startStateId === s.id;
            const isFinal = finalSet.has(s.id);
            const isSelected = selectedSet.has(s.id);
            const row = transMap.get(s.id)!;

            return (
              <tr
                key={s.id}
                style={{
                  background: isSelected ? 'var(--accent-subtle)' : undefined,
                }}
              >
                <th scope="row" style={{ background: 'transparent', fontWeight: 650 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {isStart && (
                      <span title="Start state" style={{ color: 'var(--accent)', display: 'inline-flex' }}>
                        <ArrowRight size={14} aria-hidden="true" />
                        <span className="sr-only"> (Start state)</span>
                      </span>
                    )}
                    {isFinal && (
                      <span title="Final (accepting) state" style={{ color: 'var(--success)', display: 'inline-flex' }}>
                        <CircleDot size={14} aria-hidden="true" />
                        <span className="sr-only"> (Final state)</span>
                      </span>
                    )}
                    <span>{s.label}</span>
                  </span>
                </th>

                {dfa.alphabet.map((sym) => {
                  const target = row.get(sym) ?? null;
                  const cellKey = `${JSON.stringify(s.id)}|${JSON.stringify(sym)}`;
                  const isMissing = target === null || missingSet.has(cellKey);
                  const isHighlighted =
                    highlightedCell?.from === s.id && highlightedCell?.symbol === sym;

                  return (
                    <td
                      key={sym}
                      style={{
                        background: isHighlighted
                          ? 'var(--accent-subtle)'
                          : isMissing
                          ? 'var(--warning-bg)'
                          : undefined,
                      }}
                      onMouseEnter={() => onFocusCell?.({ from: s.id, symbol: sym })}
                      onMouseLeave={() => onFocusCell?.(null)}
                    >
                      {editable ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <select
                            id={`cell-${s.id}-${sym}`}
                            aria-label={`Transition from ${s.label} on symbol ${sym}`}
                            className="select-input"
                            style={{
                              minHeight: 32,
                              padding: '2px 8px',
                              borderColor: isMissing ? 'var(--warning)' : undefined,
                            }}
                            value={target ?? ''}
                            onFocus={() => onFocusCell?.({ from: s.id, symbol: sym })}
                            onBlur={() => onFocusCell?.(null)}
                            onChange={(e) => {
                              const val = e.target.value;
                              onChangeTransition?.(s.id, sym, val === '' ? null : val);
                            }}
                          >
                            <option value="">— Missing</option>
                            {dfa.states.map((opt) => (
                              <option key={opt.id} value={opt.id}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : target ? (
                        <span className="mono">{labelById.get(target) ?? target}</span>
                      ) : (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            color: 'var(--warning)',
                            fontWeight: 600,
                            fontSize: 13,
                          }}
                        >
                          <AlertTriangle size={13} aria-hidden="true" />
                          — Missing
                        </span>
                      )}
                    </td>
                  );
                })}

                <td>
                  {editable ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className={`btn btn-sm ${isStart ? 'btn-primary' : ''}`}
                        style={{ minHeight: 28, padding: '0 8px', fontSize: 12 }}
                        aria-pressed={isStart}
                        onClick={() => onSetStart?.(s.id)}
                      >
                        Start
                      </button>
                      <button
                        type="button"
                        className={`btn btn-sm ${isFinal ? 'btn-primary' : ''}`}
                        style={{ minHeight: 28, padding: '0 8px', fontSize: 12 }}
                        aria-pressed={isFinal}
                        onClick={() => onToggleFinal?.(s.id)}
                      >
                        Final
                      </button>
                    </div>
                  ) : (
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {[isStart ? 'Start' : null, isFinal ? 'Final' : null].filter(Boolean).join(', ') ||
                        'Non-final'}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
