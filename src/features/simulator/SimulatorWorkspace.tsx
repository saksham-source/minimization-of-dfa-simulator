import { useMemo, useState } from 'react';
import { CheckCircle2, Edit3, Eye, ShieldAlert } from 'lucide-react';
import { PairMatrix } from '../../components/data/PairMatrix';
import { PartitionCards, SignatureTable } from '../../components/data/PartitionCards';
import { TransitionTable } from '../../components/data/TransitionTable';
import { DfaGraph } from '../../components/graph/DfaGraph';
import { Dialog } from '../../components/ui/Dialog';
import {
  buildStateLabelMap,
  formatTokens,
  getStepSnapshot,
  type Method,
  type StageId,
  type StateId,
} from '../../engine';
import { useApp } from '../../store/AppContext';
import { ExplanationInspector } from './ExplanationInspector';
import { PlaybackController } from './PlaybackController';

interface StageNavItem {
  id: StageId;
  label: string;
  eventIndex: number;
}

export function SimulatorWorkspace({ onOpenResults }: { onOpenResults: () => void }) {
  const {
    draftState,
    result,
    cursor,
    setCursor,
    visibleEventIndices,
    method,
    setMethod,
    preferences,
    updatePreferences,
    invalidateSolution,
  } = useApp();

  const [showOriginalOverlay, setShowOriginalOverlay] = useState(false);
  const [dataTab, setDataTab] = useState<
    'auto' | 'table' | 'reach' | 'groups' | 'signatures' | 'matrix' | 'quotient'
  >('auto');
  const [highlightedStates, setHighlightedStates] = useState<StateId[]>([]);
  const [confirmEditOpen, setConfirmEditOpen] = useState(false);
  const [pendingMethodSwitch, setPendingMethodSwitch] = useState<Method | null>(null);

  const trace = result?.trace;

  const snapshot = useMemo(() => {
    if (!trace) return null;
    return getStepSnapshot(trace, cursor);
  }, [trace, cursor]);

  const stageNavItems = useMemo<StageNavItem[]>(() => {
    if (!trace) return [];
    const items: StageNavItem[] = [];
    const findIdx = (kind: string) => trace.events.findIndex((e) => e.kind === kind);

    const reachIdx = findIdx('reach.started');
    if (reachIdx >= 0) items.push({ id: 'reachability', label: '1. Reachability', eventIndex: reachIdx });

    if (method === 'partition') {
      const initIdx = findIdx('partition.initial');
      if (initIdx >= 0) items.push({ id: 'initial', label: '2. Initial P0', eventIndex: initIdx });
      const refIdx = findIdx('partition.roundStarted');
      if (refIdx >= 0) items.push({ id: 'refine', label: '3. Refinement', eventIndex: refIdx });
    } else {
      const pairIdx = findIdx('pairs.initial');
      if (pairIdx >= 0) items.push({ id: 'table-filling', label: '2. Table-filling', eventIndex: pairIdx });
    }

    const qIdx = findIdx('quotient.classCreated');
    if (qIdx >= 0) items.push({ id: 'quotient', label: '4. Quotient DFA', eventIndex: qIdx });

    const vIdx = trace.events.findIndex((e) => e.kind === 'verify.productPair' || e.kind === 'verify.finished');
    if (vIdx >= 0) items.push({ id: 'verify', label: '5. Verify', eventIndex: vIdx });

    return items;
  }, [method, trace]);

  if (!result || !trace || !snapshot) return null;

  const currentEvent = trace.events[cursor] ?? trace.events[0]!;
  const origLabelMap = buildStateLabelMap(result.original.states);
  const minLabelMap = buildStateLabelMap(result.minimized.states);
  const L = (id: StateId) => origLabelMap.get(id) ?? minLabelMap.get(id) ?? id;

  // Determine effective tab when 'auto'
  const effectiveTab = (() => {
    if (dataTab !== 'auto') return dataTab;
    if (snapshot.stage === 'reachability') return 'reach';
    if (snapshot.stage === 'initial' || snapshot.stage === 'refine') {
      return snapshot.roundSignatures.length > 0 ? 'signatures' : 'groups';
    }
    if (snapshot.stage === 'table-filling') return 'matrix';
    if (snapshot.stage === 'quotient' || snapshot.stage === 'verify') return 'quotient';
    return 'table';
  })();

  // Determine which DFA and ghosted states to display in the graph
  const graphDfa =
    showOriginalOverlay && (snapshot.graphMode === 'reachable' || snapshot.graphMode === 'original')
      ? result.original
      : snapshot.visibleDfa;

  const ghostIds =
    showOriginalOverlay && snapshot.graphMode === 'reachable' ? result.removed : [];

  const mergedSelectedStates = Array.from(
    new Set([...snapshot.selectedStateIds, ...highlightedStates]),
  );

  const isTableStable =
    currentEvent.kind === 'pairs.stable' ||
    snapshot.stage === 'quotient' ||
    snapshot.stage === 'verify';

  const currentStageIdx = stageNavItems.findIndex((s) => s.id === snapshot.stage);

  return (
    <div className="workspace-shell">
      {/* Subbar */}
      <div className="workspace-subbar no-print">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
          <strong style={{ fontSize: 15 }}>{result.original.name}</strong>
          <span className="chip tabular">
            {result.metrics.originalCount} → {result.metrics.minimalCount} states
          </span>

          <div className="tabs-bar" role="tablist" aria-label="Minimization method">
            <button
              type="button"
              role="tab"
              className="tab-btn"
              aria-selected={method === 'partition'}
              onClick={() => {
                if (method !== 'partition') {
                  if (cursor > 0) setPendingMethodSwitch('partition');
                  else setMethod('partition');
                }
              }}
            >
              Partition refinement
            </button>
            <button
              type="button"
              role="tab"
              className="tab-btn"
              aria-selected={method === 'table-filling'}
              onClick={() => {
                if (method !== 'table-filling') {
                  if (cursor > 0) setPendingMethodSwitch('table-filling');
                  else setMethod('table-filling');
                }
              }}
            >
              Table-filling
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          {result.removed.length > 0 && snapshot.graphMode === 'reachable' && (
            <button
              type="button"
              className={`btn btn-sm ${showOriginalOverlay ? 'btn-primary' : ''}`}
              aria-pressed={showOriginalOverlay}
              onClick={() => setShowOriginalOverlay((v) => !v)}
            >
              <Eye size={14} aria-hidden="true" />
              Show original ({result.removed.map(L).join(', ')})
            </button>
          )}

          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setConfirmEditOpen(true)}
          >
            <Edit3 size={14} aria-hidden="true" />
            Edit original
          </button>

          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={onOpenResults}
          >
            <CheckCircle2 size={14} aria-hidden="true" />
            Results & Exports
          </button>
        </div>
      </div>

      {/* Main 3-column Workspace */}
      <div className="workspace-grid">
        {/* Left Rail */}
        <nav className="workspace-rail panel no-print" aria-label="Minimization stages">
          <div className="panel-header">
            <h2 className="panel-title" style={{ fontSize: 14 }}>
              Stages
            </h2>
          </div>
          <div className="panel-body" style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {stageNavItems.map((item, idx) => {
              const isCurrent = item.id === snapshot.stage;
              const isCompleted = idx < currentStageIdx;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={isCurrent ? 'step' : undefined}
                  onClick={() => {
                    setHighlightedStates([]);
                    setCursor(item.eventIndex);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 6,
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-control)',
                    border: 'none',
                    background: isCurrent ? 'var(--accent-subtle)' : 'transparent',
                    color: isCurrent ? 'var(--accent)' : 'var(--text)',
                    fontWeight: isCurrent ? 650 : 500,
                    fontSize: 13,
                    textAlign: 'left',
                  }}
                >
                  <span>{item.label}</span>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {isCurrent ? 'Current' : isCompleted ? 'Done' : ''}
                  </span>
                </button>
              );
            })}

            {/* Sub-links for partition or table-filling rounds */}
            {method === 'partition' && result.partitionResult && (
              <div style={{ marginTop: 6, paddingLeft: 10, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {result.partitionResult.rounds.map((r) => {
                  const rIdx = trace.events.findIndex(
                    (e) => e.kind === 'partition.roundStarted' && e.round === r.round,
                  );
                  return (
                    <button
                      key={r.round}
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ justifyContent: 'flex-start', minHeight: 28, fontSize: 12 }}
                      onClick={() => rIdx >= 0 && setCursor(rIdx)}
                    >
                      Round {r.round} {r.changed ? '' : '(Stable)'}
                    </button>
                  );
                })}
              </div>
            )}

            {method === 'table-filling' && result.pairResult && (
              <div style={{ marginTop: 6, paddingLeft: 10, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {result.pairResult.rounds.map((r) => {
                  const rIdx = trace.events.findIndex(
                    (e) => e.kind === 'pairs.roundStarted' && e.round === r.round,
                  );
                  return (
                    <button
                      key={r.round}
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ justifyContent: 'flex-start', minHeight: 28, fontSize: 12 }}
                      onClick={() => rIdx >= 0 && setCursor(rIdx)}
                    >
                      Round {r.round} {r.changed ? `(+${r.additions.length})` : '(Stable)'}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </nav>

        {/* Center Canvas + Data Tabs */}
        <div className="workspace-center">
          <div className="mobile-stage-picker no-print">
            <label htmlFor="mobile-stage-select" className="sr-only">
              Jump to stage
            </label>
            <select
              id="mobile-stage-select"
              className="select-input"
              value={snapshot.stage}
              onChange={(e) => {
                const chosen = stageNavItems.find((s) => s.id === e.target.value);
                if (chosen) {
                  setHighlightedStates([]);
                  setCursor(chosen.eventIndex);
                }
              }}
            >
              {stageNavItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          {/* Verification failure guard banner (§6.5) */}
          {snapshot.verificationStatus.done &&
            (!snapshot.verificationStatus.equivalent ||
              !snapshot.verificationStatus.allStatesReachable ||
              !snapshot.verificationStatus.pairwiseDistinguishable) && (
              <div className="status-banner danger" role="alert">
                <ShieldAlert size={18} aria-hidden="true" />
                <div>
                  <strong>Internal verification error:</strong> the output failed equivalence or
                  minimality checks. Your original DFA is preserved.
                </div>
              </div>
            )}

          {/* Interactive SVG Graph */}
          <div className="panel">
            <div className="panel-body">
              <DfaGraph
                dfa={graphDfa}
                layoutNodes={snapshot.graphMode === 'quotient' ? undefined : draftState.draft.layout}
                title={
                  snapshot.graphMode === 'original'
                    ? 'Original DFA'
                    : snapshot.graphMode === 'reachable'
                    ? showOriginalOverlay
                      ? 'Reachable DFA (with removed states shown)'
                      : 'Reachable DFA'
                    : 'Minimized Quotient DFA'
                }
                height={330}
                selectedStateIds={mergedSelectedStates}
                visitedStateIds={snapshot.visitedStateIds}
                removedStateIds={snapshot.graphMode === 'original' ? snapshot.removedStateIds : []}
                ghostRemovedIds={ghostIds}
                activeEdges={snapshot.activeEdges}
                partition={
                  snapshot.graphMode === 'reachable'
                    ? snapshot.committedPartition ?? snapshot.sourcePartition
                    : null
                }
                onSelectState={(id) => setHighlightedStates([id])}
              />
            </div>
          </div>

          {/* Synchronized Tabbed Data Panel */}
          <div className="panel">
            <div className="panel-header" style={{ flexWrap: 'wrap' }}>
              <div className="tabs-bar" role="tablist" aria-label="Simulation data views">
                <button
                  type="button"
                  role="tab"
                  className="tab-btn"
                  aria-selected={effectiveTab === 'reach'}
                  onClick={() => setDataTab('reach')}
                >
                  Reachability
                </button>
                {method === 'partition' ? (
                  <>
                    <button
                      type="button"
                      role="tab"
                      className="tab-btn"
                      aria-selected={effectiveTab === 'groups'}
                      onClick={() => setDataTab('groups')}
                    >
                      Groups
                    </button>
                    <button
                      type="button"
                      role="tab"
                      className="tab-btn"
                      aria-selected={effectiveTab === 'signatures'}
                      onClick={() => setDataTab('signatures')}
                    >
                      Signatures
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    role="tab"
                    className="tab-btn"
                    aria-selected={effectiveTab === 'matrix'}
                    onClick={() => setDataTab('matrix')}
                  >
                    Pair matrix
                  </button>
                )}
                <button
                  type="button"
                  role="tab"
                  className="tab-btn"
                  aria-selected={effectiveTab === 'quotient'}
                  onClick={() => setDataTab('quotient')}
                >
                  Quotient & Verify
                </button>
                <button
                  type="button"
                  role="tab"
                  className="tab-btn"
                  aria-selected={effectiveTab === 'table'}
                  onClick={() => setDataTab('table')}
                >
                  Table
                </button>
              </div>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => setDataTab('auto')}
                title="Automatically switch tab based on current stage"
              >
                {dataTab === 'auto' ? 'Auto-tab active' : 'Reset to auto-tab'}
              </button>
            </div>

            <div className="panel-body">
              {effectiveTab === 'reach' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 13.5 }}>
                    <div>
                      <strong>Visited:</strong>{' '}
                      {snapshot.visitedStateIds.length > 0
                        ? snapshot.visitedStateIds.map((id) => L(id)).join(', ')
                        : '—'}
                    </div>
                    <div>
                      <strong>Queue:</strong>{' '}
                      {snapshot.queue.length > 0
                        ? `[${snapshot.queue.map((id) => L(id)).join(', ')}]`
                        : 'Empty'}
                    </div>
                    <div>
                      <strong>Removed:</strong>{' '}
                      {result.removed.length > 0
                        ? result.removed.map((id) => L(id)).join(', ')
                        : 'None (all states reachable)'}
                    </div>
                  </div>
                  <div className="data-table-wrap">
                    <table className="data-table" aria-label="Discovery strings from start state">
                      <thead>
                        <tr>
                          <th>Reachable state</th>
                          <th>Shortest discovery string</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.reachability.discoveryOrder.map((id) => (
                          <tr key={id}>
                            <td style={{ fontWeight: 600 }}>{L(id)}</td>
                            <td className="mono">
                              {formatTokens(result.reachability.witnessStrings.get(id) ?? [])}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {effectiveTab === 'groups' && (
                <PartitionCards
                  partition={snapshot.committedPartition ?? snapshot.sourcePartition}
                  pendingDecisions={snapshot.pendingBuckets}
                  states={result.reachable.states}
                  selectedStateIds={mergedSelectedStates}
                  onSelectGroup={(members) => setHighlightedStates(members)}
                  title={
                    snapshot.sourcePartition
                      ? `Partition P${(snapshot.committedPartition ?? snapshot.sourcePartition)!.round}`
                      : undefined
                  }
                />
              )}

              {effectiveTab === 'signatures' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <PartitionCards
                    partition={snapshot.sourcePartition}
                    pendingDecisions={snapshot.pendingBuckets}
                    states={result.reachable.states}
                    selectedStateIds={mergedSelectedStates}
                    onSelectGroup={(members) => setHighlightedStates(members)}
                    title={
                      snapshot.sourcePartition
                        ? `Source partition P${snapshot.sourcePartition.round}`
                        : undefined
                    }
                  />
                  <SignatureTable
                    signatures={snapshot.roundSignatures}
                    activeSignature={snapshot.activeSignature}
                    alphabet={result.reachable.alphabet}
                    states={result.reachable.states}
                    onSelectState={(id) => setHighlightedStates([id])}
                  />
                </div>
              )}

              {effectiveTab === 'matrix' && (
                <PairMatrix
                  states={result.reachable.states}
                  allPairs={trace.allPairs}
                  snapshot={snapshot}
                  isStable={isTableStable}
                  onSelectPair={(p, q) => setHighlightedStates([p, q])}
                />
              )}

              {effectiveTab === 'quotient' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div className="data-table-wrap">
                    <table className="data-table" aria-label="Quotient state mapping">
                      <thead>
                        <tr>
                          <th>New state</th>
                          <th>Original members</th>
                          <th>Role</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.quotient.classInfos.map((c) => (
                          <tr key={c.minimizedId}>
                            <td style={{ fontWeight: 650 }}>{c.minimizedLabel}</td>
                            <td>{c.members.map(L).join(', ')}</td>
                            <td>
                              {[c.isStart ? 'Start' : null, c.isFinal ? 'Final' : null]
                                .filter(Boolean)
                                .join(', ') || 'Non-final'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div
                    className={`status-banner ${
                      result.verification.equivalent &&
                      result.verification.allStatesReachable &&
                      result.verification.pairwiseDistinguishable
                        ? 'success'
                        : 'danger'
                    }`}
                  >
                    <CheckCircle2 size={18} aria-hidden="true" />
                    <div style={{ fontSize: 13.5 }}>
                      <strong>
                        {result.verification.equivalent &&
                        result.verification.allStatesReachable &&
                        result.verification.pairwiseDistinguishable
                          ? 'Verified minimal DFA'
                          : 'Verification check failed'}
                      </strong>
                      <div>
                        Equivalence (product BFS): {result.verification.visitedPairCount} reachable pairs
                        checked · Output states reachable:{' '}
                        {result.verification.allStatesReachable ? 'Yes' : 'No'} · Pairwise
                        distinguishable: {result.verification.distinguishedPairsCount}/
                        {result.verification.totalOutputPairsCount}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {effectiveTab === 'table' && (
                <TransitionTable
                  dfa={snapshot.visibleDfa}
                  selectedStateIds={mergedSelectedStates}
                  caption="Current stage transition table"
                />
              )}
            </div>
          </div>
        </div>

        {/* Right Explanation Inspector */}
        <div className="workspace-inspector">
          <ExplanationInspector result={result} event={currentEvent} snapshot={snapshot} />
        </div>
      </div>

      {/* Sticky Playback Bar */}
      <PlaybackController
        trace={trace}
        cursor={cursor}
        visibleEventIndices={visibleEventIndices}
        speed={preferences.speed}
        detailLevel={preferences.detailLevel}
        pauseOnRoundSummaries={preferences.pauseOnRoundSummaries}
        onChangeCursor={(idx) => {
          setHighlightedStates([]);
          setCursor(idx);
        }}
        onChangeSpeed={(speed) => updatePreferences({ speed })}
        onChangeDetailLevel={(detailLevel) => updatePreferences({ detailLevel })}
        onTogglePauseOnRound={() =>
          updatePreferences({ pauseOnRoundSummaries: !preferences.pauseOnRoundSummaries })
        }
        pausedByExternalModal={confirmEditOpen || pendingMethodSwitch !== null}
      />

      {/* Confirm Edit Original */}
      <Dialog
        open={confirmEditOpen}
        onClose={() => setConfirmEditOpen(false)}
        title="Return to DFA builder?"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ margin: 0, fontSize: 14 }}>
            Your original DFA will be preserved in the builder. Editing transitions or states will
            invalidate this simulation trace until you run minimization again.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="btn" onClick={() => setConfirmEditOpen(false)}>
              Stay in simulator
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setConfirmEditOpen(false);
                invalidateSolution();
              }}
            >
              Open builder
            </button>
          </div>
        </div>
      </Dialog>

      {/* Confirm Switch Method */}
      <Dialog
        open={pendingMethodSwitch !== null}
        onClose={() => setPendingMethodSwitch(null)}
        title="Switch minimization algorithm?"
      >
        {pendingMethodSwitch && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ margin: 0, fontSize: 14 }}>
              Switching to{' '}
              <strong>
                {pendingMethodSwitch === 'partition' ? 'Partition refinement' : 'Table-filling'}
              </strong>{' '}
              keeps your original DFA intact, recomputes the trace, and resets playback to step 1.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn" onClick={() => setPendingMethodSwitch(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  const next = pendingMethodSwitch;
                  setPendingMethodSwitch(null);
                  setMethod(next);
                }}
              >
                Switch and restart
              </button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
