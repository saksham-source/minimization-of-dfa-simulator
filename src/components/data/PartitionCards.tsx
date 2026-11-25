import type { GroupDecisionRecord, Partition, SignatureRecord, State, StateId, SymbolToken } from '../../engine';

interface PartitionCardsProps {
  partition: Partition | null;
  pendingDecisions?: GroupDecisionRecord[] | null;
  states: readonly State[];
  selectedStateIds?: readonly StateId[];
  onSelectGroup?: (members: StateId[]) => void;
  title?: string;
}

export function PartitionCards({
  partition,
  pendingDecisions,
  states,
  selectedStateIds = [],
  onSelectGroup,
  title,
}: PartitionCardsProps) {
  const labelMap = new Map(states.map((s) => [s.id, s.label]));
  const selectedSet = new Set(selectedStateIds);

  if (!partition) {
    return (
      <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0 }}>
        Partition groups appear once reachability removal completes.
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {title && <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)' }}>{title}</div>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {partition.groups.map((g, idx) => {
          const colorIdx = idx % 6;
          const patternClass = idx >= 6 ? `group-pattern-${(Math.floor(idx / 6) % 2) + 1}` : '';
          const anySelected = g.members.some((m) => selectedSet.has(m));
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => onSelectGroup?.(g.members)}
              className={`group-color-${colorIdx} ${patternClass}`}
              style={{
                borderWidth: anySelected ? 2.5 : 1.5,
                borderStyle: 'solid',
                borderRadius: 'var(--radius-panel)',
                padding: '10px 12px',
                textAlign: 'left',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                minWidth: 120,
                transition: 'transform var(--dur-split) var(--ease-standard)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{g.id}</span>
                <span style={{ fontSize: 11, opacity: 0.85 }} className="tabular">
                  {g.members.length} state{g.members.length === 1 ? '' : 's'}
                </span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {g.members.map((m) => (
                  <span
                    key={m}
                    className="chip"
                    style={{
                      background: 'var(--surface)',
                      borderColor: selectedSet.has(m) ? 'var(--accent)' : 'var(--border)',
                      fontSize: 12.5,
                      padding: '1px 8px',
                    }}
                  >
                    {labelMap.get(m) ?? m}
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>

      {pendingDecisions && pendingDecisions.length > 0 && (
        <div
          style={{
            borderTop: '1px dashed var(--border)',
            paddingTop: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--muted)' }}>
            Proposed next groups (pending round commit):
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {pendingDecisions.flatMap((d) =>
              d.buckets.map((b, bIdx) => (
                <div
                  key={`${d.sourceGroupId}-${b.signatureKey}-${bIdx}`}
                  style={{
                    border: '1.5px dashed var(--accent)',
                    borderRadius: 'var(--radius-control)',
                    padding: '6px 10px',
                    background: 'var(--accent-subtle)',
                    fontSize: 13,
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 4 }}>
                    From {d.sourceGroupId} · sig ({b.signatureTuple.join(', ')})
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {b.members.map((m) => (
                      <span key={m} className="chip" style={{ background: 'var(--surface)', fontSize: 12 }}>
                        {labelMap.get(m) ?? m}
                      </span>
                    ))}
                  </div>
                </div>
              )),
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface SignatureTableProps {
  signatures: readonly SignatureRecord[];
  activeSignature: SignatureRecord | null;
  alphabet: readonly SymbolToken[];
  states: readonly State[];
  onSelectState?: (stateId: StateId) => void;
}

export function SignatureTable({
  signatures,
  activeSignature,
  alphabet,
  states,
  onSelectState,
}: SignatureTableProps) {
  const labelMap = new Map(states.map((s) => [s.id, s.label]));

  if (signatures.length === 0) {
    return (
      <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0 }}>
        No signatures computed in the current step yet.
      </p>
    );
  }

  return (
    <div className="data-table-wrap">
      <table className="data-table" aria-label="State signatures for current refinement round">
        <thead>
          <tr>
            <th scope="col">State</th>
            <th scope="col">Source group</th>
            {alphabet.map((sym) => (
              <th key={sym} scope="col" className="mono">
                On {sym}
              </th>
            ))}
            <th scope="col">Signature</th>
          </tr>
        </thead>
        <tbody>
          {signatures.map((sig) => {
            const isActive = activeSignature?.stateId === sig.stateId;
            return (
              <tr
                key={sig.stateId}
                style={{
                  background: isActive ? 'var(--accent-subtle)' : undefined,
                  cursor: onSelectState ? 'pointer' : undefined,
                }}
                onClick={() => onSelectState?.(sig.stateId)}
              >
                <td style={{ fontWeight: 650 }}>{labelMap.get(sig.stateId) ?? sig.stateId}</td>
                <td>
                  <span className="chip">{sig.sourceGroupId}</span>
                </td>
                {sig.entries.map((entry) => (
                  <td key={entry.symbol} className="mono" style={{ fontSize: 13 }}>
                    {labelMap.get(entry.targetStateId) ?? entry.targetStateId} →{' '}
                    <strong>{entry.targetGroupId}</strong>
                  </td>
                ))}
                <td className="mono" style={{ fontWeight: 600 }}>
                  ({sig.signatureTuple.join(', ')})
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
