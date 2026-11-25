import { useState } from 'react';
import { formatTokens, pairKey, type PairAddition, type State, type StateId, type StepSnapshot } from '../../engine';

interface PairMatrixProps {
  states: readonly State[];
  allPairs: { key: string; p: StateId; q: StateId }[];
  snapshot: StepSnapshot;
  isStable: boolean;
  onSelectPair?: (p: StateId, q: StateId, pairKey: string) => void;
}

export function PairMatrix({
  states,
  allPairs,
  snapshot,
  isStable,
  onSelectPair,
}: PairMatrixProps) {
  const [viewMode, setViewMode] = useState<'matrix' | 'list'>('matrix');
  const [filter, setFilter] = useState<'all' | 'marked' | 'unmarked' | 'proposed'>('all');
  const [inspectedKey, setInspectedKey] = useState<string | null>(null);

  const labelMap = new Map(states.map((s) => [s.id, s.label]));
  const indexMap = new Map(states.map((s, idx) => [s.id, idx]));
  const L = (id: StateId) => labelMap.get(id) ?? id;

  const proposedMap = new Map<string, PairAddition>();
  for (const prop of snapshot.proposedPairMarks) {
    proposedMap.set(prop.pairKey, prop);
  }

  const activeKey = inspectedKey ?? snapshot.activePairKey;
  const activeMark = activeKey ? snapshot.markedPairs[activeKey] : undefined;
  const activeProp = activeKey ? proposedMap.get(activeKey) : undefined;
  const activePairObj = activeKey ? allPairs.find((p) => p.key === activeKey) : undefined;

  const filteredPairs = allPairs.filter((pair) => {
    const isMarked = Boolean(snapshot.markedPairs[pair.key]);
    const isProp = proposedMap.has(pair.key);
    if (filter === 'marked') return isMarked;
    if (filter === 'unmarked') return !isMarked && !isProp;
    if (filter === 'proposed') return isProp;
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div className="tabs-bar" role="tablist" aria-label="Pair table layout">
          <button
            type="button"
            role="tab"
            className="tab-btn"
            aria-selected={viewMode === 'matrix'}
            onClick={() => setViewMode('matrix')}
          >
            Triangular matrix
          </button>
          <button
            type="button"
            role="tab"
            className="tab-btn"
            aria-selected={viewMode === 'list'}
            onClick={() => setViewMode('list')}
          >
            Linear pair list ({allPairs.length})
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: 'var(--muted)' }}>
          <span>
            <strong className="mono">×</strong> Distinguished
          </span>
          <span>
            <strong className="mono">?</strong> Checking / proposed
          </span>
          <span>
            <strong className="mono">·</strong> {isStable ? 'Equivalent' : 'Not yet distinguished'}
          </span>
        </div>
      </div>

      {viewMode === 'matrix' ? (
        <div className="data-table-wrap">
          <table className="data-table" aria-label="Distinguishability pair matrix">
            <thead>
              <tr>
                <th scope="col">State</th>
                {states.slice(0, -1).map((colState) => (
                  <th key={colState.id} scope="col" style={{ textAlign: 'center' }}>
                    {colState.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {states.slice(1).map((rowState, rIdx) => {
                const realRowIdx = rIdx + 1;
                return (
                  <tr key={rowState.id}>
                    <th scope="row" style={{ background: 'transparent', fontWeight: 650 }}>
                      {rowState.label}
                    </th>
                    {states.slice(0, -1).map((colState, colIdx) => {
                      if (colIdx >= realRowIdx) {
                        return (
                          <td
                            key={colState.id}
                            style={{ background: 'var(--surface-subtle)', opacity: 0.35 }}
                            aria-hidden="true"
                          />
                        );
                      }
                      const key = pairKey(colState.id, rowState.id, indexMap);
                      const mark = snapshot.markedPairs[key];
                      const proposed = proposedMap.get(key);
                      const isInspecting = snapshot.activePairKey === key;
                      const isDepTarget = snapshot.activePairDependency?.destPairKey === key;
                      const isSelected = activeKey === key;

                      const statusText = mark
                        ? `Distinguished (round ${mark.round}, witness ${formatTokens(mark.witness)})`
                        : proposed
                        ? `Proposed mark (witness ${formatTokens(proposed.witness)})`
                        : isInspecting
                        ? 'Currently inspecting'
                        : isStable
                        ? 'Equivalent after final round'
                        : 'Not yet distinguished';

                      return (
                        <td key={colState.id} style={{ padding: 4, textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => {
                              setInspectedKey(key);
                              onSelectPair?.(colState.id, rowState.id, key);
                            }}
                            aria-label={`Pair ${colState.label} and ${rowState.label}: ${statusText}`}
                            title={`${colState.label}, ${rowState.label}: ${statusText}`}
                            style={{
                              width: '100%',
                              minWidth: 42,
                              minHeight: 36,
                              borderRadius: 6,
                              border: isSelected
                                ? '2px solid var(--accent)'
                                : isDepTarget
                                ? '2px dashed var(--warning)'
                                : '1px solid var(--border)',
                              background: mark
                                ? 'var(--danger-bg)'
                                : proposed || isInspecting
                                ? 'var(--accent-subtle)'
                                : isStable
                                ? 'var(--success-bg)'
                                : 'var(--surface)',
                              fontWeight: 700,
                              fontSize: 13,
                              display: 'inline-flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              lineHeight: 1.15,
                            }}
                          >
                            <span className="mono">
                              {mark ? '×' : proposed || isInspecting ? '?' : '·'}
                            </span>
                            {mark && (
                              <span style={{ fontSize: 10, color: 'var(--muted)' }}>
                                {mark.witness.length === 0 ? 'ε' : formatTokens(mark.witness)}
                              </span>
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {(['all', 'marked', 'unmarked', 'proposed'] as const).map((f) => (
              <button
                key={f}
                type="button"
                className={`btn btn-sm ${filter === f ? 'btn-primary' : ''}`}
                onClick={() => setFilter(f)}
              >
                {f === 'all'
                  ? 'All'
                  : f === 'marked'
                  ? 'Marked'
                  : f === 'unmarked'
                  ? 'Unmarked'
                  : 'Newly proposed'}
              </button>
            ))}
          </div>

          <div className="data-table-wrap">
            <table className="data-table" aria-label="Linear pair list">
              <thead>
                <tr>
                  <th>Pair</th>
                  <th>Status</th>
                  <th>Witness</th>
                </tr>
              </thead>
              <tbody>
                {filteredPairs.map((pair) => {
                  const mark = snapshot.markedPairs[pair.key];
                  const prop = proposedMap.get(pair.key);
                  return (
                    <tr
                      key={pair.key}
                      style={{ cursor: 'pointer', background: activeKey === pair.key ? 'var(--accent-subtle)' : undefined }}
                      onClick={() => {
                        setInspectedKey(pair.key);
                        onSelectPair?.(pair.p, pair.q, pair.key);
                      }}
                    >
                      <td className="mono" style={{ fontWeight: 650 }}>
                        ({L(pair.p)}, {L(pair.q)})
                      </td>
                      <td>
                        {mark
                          ? `× Distinguished (Round ${mark.round})`
                          : prop
                          ? `? Proposed via ${prop.symbol}`
                          : isStable
                          ? '· Equivalent after final round'
                          : '· Not yet distinguished'}
                      </td>
                      <td className="mono">
                        {mark
                          ? formatTokens(mark.witness)
                          : prop
                          ? formatTokens(prop.witness)
                          : '—'}
                      </td>
                    </tr>
                  );
                })}
                {filteredPairs.length === 0 && (
                  <tr>
                    <td colSpan={3} style={{ color: 'var(--muted)' }}>
                      No pairs match the selected filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activePairObj && (
        <div className="status-banner info" style={{ fontSize: 13 }}>
          <div>
            <strong>
              Selected pair ({L(activePairObj.p)}, {L(activePairObj.q)}):
            </strong>{' '}
            {activeMark
              ? `Distinguished in round ${activeMark.round} with witness "${formatTokens(activeMark.witness)}"${
                  activeMark.symbol ? ` via symbol "${activeMark.symbol}"` : ' (final vs non-final)'
                }.`
              : activeProp
              ? `Proposed to mark via symbol "${activeProp.symbol}" with witness "${formatTokens(activeProp.witness)}".`
              : isStable
              ? 'Equivalent after the final round — no input string separates these two states.'
              : 'Not yet distinguished in the current snapshot.'}
          </div>
        </div>
      )}
    </div>
  );
}
