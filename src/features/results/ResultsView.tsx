import { useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCopy,
  Download,
  Edit3,
  FileCode2,
  FileText,
  Printer,
  RotateCcw,
} from 'lucide-react';
import { TransitionTable } from '../../components/data/TransitionTable';
import { DfaGraph } from '../../components/graph/DfaGraph';
import { Dialog } from '../../components/ui/Dialog';
import {
  buildStateLabelMap,
  findWitness,
  formatTokens,
  runString,
  type StateId,
} from '../../engine';
import {
  generateDiagramSvg,
  generateSolutionMarkdown,
  sanitizeFilename,
  serializeMinimizedJson,
  triggerDownload,
} from '../../lib/importExport';
import { useApp } from '../../store/AppContext';
import { StringLab } from './StringLab';

interface ResultsViewProps {
  onBackToSteps: () => void;
  solutionGated?: boolean;
  onUnlockRequest?: () => void;
}

export function ResultsView({
  onBackToSteps,
  solutionGated = false,
  onUnlockRequest,
}: ResultsViewProps) {
  const { draftState, result, setCursor, invalidateSolution, showToast } = useApp();

  const [syncZoom, setSyncZoom] = useState(false);
  const [sharedZoom, setSharedZoom] = useState(1);
  const [selectedOrigIds, setSelectedOrigIds] = useState<StateId[]>([]);
  const [selectedMinIds, setSelectedMinIds] = useState<StateId[]>([]);
  const [svgBg, setSvgBg] = useState<'white' | 'transparent'>('white');
  const [clipboardFallback, setClipboardFallback] = useState<string | null>(null);

  // Witness inspector state
  const [witnessA, setWitnessA] = useState<StateId>(result?.reachable.states[0]?.id ?? '');
  const [witnessB, setWitnessB] = useState<StateId>(
    result?.reachable.states[1]?.id ?? result?.reachable.states[0]?.id ?? '',
  );

  const origLabels = useMemo(
    () => (result ? buildStateLabelMap(result.original.states) : new Map()),
    [result],
  );

  if (!result) return null;

  const isVerified =
    result.verification.equivalent &&
    result.verification.allStatesReachable &&
    result.verification.pairwiseDistinguishable;

  const canExportSolution = isVerified && !solutionGated;

  const mappingRows = [
    ...result.quotient.classInfos.map((info) => ({
      key: info.minimizedId,
      minId: info.minimizedId,
      minLabel: info.minimizedLabel,
      origIds: info.members,
      origLabels: info.members.map((id) => origLabels.get(id) ?? id).join(', '),
      role:
        [info.isStart ? 'Start' : null, info.isFinal ? 'Final' : null].filter(Boolean).join(', ') ||
        'Non-final',
      removed: false,
    })),
    ...result.removed.map((id) => ({
      key: `rem-${id}`,
      minId: null,
      minLabel: 'Unreachable — removed',
      origIds: [id],
      origLabels: origLabels.get(id) ?? id,
      role: 'Removed',
      removed: true,
    })),
  ];

  const validWA = result.reachable.states.some((s) => s.id === witnessA)
    ? witnessA
    : result.reachable.states[0]?.id ?? '';
  const validWB = result.reachable.states.some((s) => s.id === witnessB)
    ? witnessB
    : result.reachable.states[0]?.id ?? '';
  const inspectedWitness =
    validWA && validWB ? findWitness(result.reachable, validWA, validWB) : null;
  const witnessRunA =
    inspectedWitness !== null ? runString(result.reachable, inspectedWitness, validWA) : null;
  const witnessRunB =
    inspectedWitness !== null ? runString(result.reachable, inspectedWitness, validWB) : null;

  const handleCopyMarkdown = async () => {
    const md = generateSolutionMarkdown(result);
    try {
      await navigator.clipboard.writeText(md);
      showToast('Solution Markdown copied to clipboard');
    } catch {
      setClipboardFallback(md);
    }
  };

  const jumpToStability = () => {
    const stableIdx = result.trace.events.findIndex(
      (e) => e.kind === 'partition.stable' || e.kind === 'pairs.stable',
    );
    if (stableIdx >= 0) setCursor(stableIdx);
    onBackToSteps();
  };

  return (
    <div className="page-container" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Print-only header */}
      <div className="print-only" style={{ marginBottom: 12 }}>
        <p style={{ margin: '0 0 4px', fontSize: '18pt', fontWeight: 700 }}>
          {result.original.name} — Minimized DFA Solution
        </p>
        <p style={{ margin: 0, fontSize: '10pt', color: '#444' }}>
          Method: {result.method === 'partition' ? 'Synchronous Partition Refinement' : 'Table-Filling'} ·
          Alphabet: {`{${result.original.alphabet.join(', ')}}`} ·{' '}
          {result.metrics.originalCount} → {result.metrics.minimalCount} states (
          {result.metrics.percentageReduction.toFixed(1)}% reduction)
        </p>
      </div>

      {/* Header & Verification Status */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
        className="no-print"
      >
        <div>
          <h1 style={{ margin: '0 0 4px', fontSize: 26, fontWeight: 650 }}>
            {isVerified ? 'Minimized DFA' : 'Verification failed'}
          </h1>
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: 14 }}>
            {result.original.name} ·{' '}
            {result.method === 'partition' ? 'Partition refinement' : 'Table-filling'}
          </p>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button type="button" className="btn btn-sm" onClick={jumpToStability}>
            <RotateCcw size={14} aria-hidden="true" />
            Review steps
          </button>
          <button type="button" className="btn btn-sm" onClick={invalidateSolution}>
            <Edit3 size={14} aria-hidden="true" />
            Edit original
          </button>
        </div>
      </div>

      {/* Verification Banner */}
      <div
        className={`status-banner ${isVerified ? 'success' : 'danger'}`}
        role={isVerified ? 'status' : 'alert'}
      >
        {isVerified ? (
          <CheckCircle2 size={20} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
        ) : (
          <AlertCircle size={20} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <strong>
            {isVerified
              ? 'Verified minimal DFA — language equivalence and minimality mathematically proved'
              : 'Internal consistency error — do not export as a verified minimal DFA'}
          </strong>
          <div style={{ fontSize: 13.5 }}>
            • <strong>Language equivalence (Product BFS):</strong>{' '}
            {result.verification.equivalent
              ? `Passed (${result.verification.visitedPairCount} reachable product pairs checked; no acceptance mismatch)`
              : `Failed (counterexample: ${
                  result.verification.counterexample
                    ? formatTokens(result.verification.counterexample)
                    : 'unknown'
                })`}
            <br />• <strong>All output states reachable:</strong>{' '}
            {result.verification.allStatesReachable ? 'Passed' : 'Failed'}
            <br />• <strong>Pairwise distinguishable:</strong>{' '}
            {result.verification.pairwiseDistinguishable
              ? `Passed (${result.verification.distinguishedPairsCount}/${result.verification.totalOutputPairsCount} pairs distinguished)`
              : 'Failed'}
          </div>
        </div>
      </div>

      {/* Three Metric Tiles (§10.1) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: 12,
        }}
      >
        <div className="panel">
          <div className="panel-body">
            <div style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 600 }}>Original states</div>
            <div style={{ fontSize: 28, fontWeight: 700 }} className="tabular">
              {result.metrics.originalCount}
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>
              {result.metrics.reachableCount} reachable · {result.metrics.unreachableRemoved} unreachable removed
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-body">
            <div style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 600 }}>Minimized states</div>
            <div style={{ fontSize: 28, fontWeight: 700 }} className="tabular">
              {result.metrics.minimalCount}
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>
              {result.metrics.equivalentStatesMerged} equivalent state(s) merged
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-body">
            <div style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 600 }}>Total reduction</div>
            <div style={{ fontSize: 28, fontWeight: 700 }} className="tabular">
              {result.metrics.percentageReduction.toFixed(1)}%
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>
              {result.metrics.originalCount} → {result.metrics.minimalCount} states ({result.metrics.totalReduction} removed)
            </div>
          </div>
        </div>
      </div>

      {/* Side-by-Side Comparison */}
      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Original vs. Minimized DFA</h2>
          <label className="no-print" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={syncZoom}
              onChange={(e) => setSyncZoom(e.target.checked)}
            />
            Synchronize zoom
          </label>
        </div>
        <div
          className="panel-body"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 400px), 1fr))',
            gap: 16,
          }}
        >
          <DfaGraph
            dfa={result.original}
            layoutNodes={draftState.draft.layout}
            title="Original DFA"
            height={300}
            selectedStateIds={selectedOrigIds}
            removedStateIds={result.removed}
            externalZoom={syncZoom ? sharedZoom : undefined}
            onZoomChange={syncZoom ? setSharedZoom : undefined}
          />
          <DfaGraph
            dfa={result.minimized}
            title="Minimized DFA"
            height={300}
            selectedStateIds={selectedMinIds}
            externalZoom={syncZoom ? sharedZoom : undefined}
            onZoomChange={syncZoom ? setSharedZoom : undefined}
          />
        </div>
      </div>

      {/* Mapping Table & Minimized Transition Table */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))',
          gap: 16,
        }}
      >
        <div className="panel">
          <div className="panel-header">
            <h2 className="panel-title">State mapping</h2>
          </div>
          <div className="panel-body">
            <div className="data-table-wrap">
              <table className="data-table" aria-label="Original to minimized state mapping">
                <thead>
                  <tr>
                    <th>Original state(s)</th>
                    <th>Minimized state</th>
                    <th>Role</th>
                  </tr>
                </thead>
                <tbody>
                  {mappingRows.map((row) => (
                    <tr
                      key={row.key}
                      style={{ cursor: 'pointer' }}
                      onClick={() => {
                        setSelectedOrigIds(row.origIds);
                        setSelectedMinIds(row.minId ? [row.minId] : []);
                      }}
                    >
                      <td>{row.origLabels}</td>
                      <td style={{ fontWeight: row.removed ? 500 : 650, color: row.removed ? 'var(--muted)' : 'var(--text)' }}>
                        {row.minLabel}
                      </td>
                      <td>{row.role}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Minimized transition table</h2>
          </div>
          <div className="panel-body">
            <TransitionTable dfa={result.minimized} caption="Minimized quotient transition table" />
          </div>
        </div>
      </div>

      {/* Distinguishing Witness Inspector */}
      {result.reachable.states.length >= 2 && (
        <div className="panel no-print">
          <div className="panel-header">
            <h2 className="panel-title">Distinguishing witness inspector</h2>
          </div>
          <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
              <label htmlFor="witness-state-a" className="field-label" style={{ margin: 0 }}>
                Compare reachable states:
              </label>
              <select
                id="witness-state-a"
                className="select-input"
                style={{ width: 'auto', minHeight: 34 }}
                value={validWA}
                onChange={(e) => setWitnessA(e.target.value)}
              >
                {result.reachable.states.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              <span>and</span>
              <select
                id="witness-state-b"
                aria-label="Second reachable state to compare"
                className="select-input"
                style={{ width: 'auto', minHeight: 34 }}
                value={validWB}
                onChange={(e) => setWitnessB(e.target.value)}
              >
                {result.reachable.states.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            {validWA === validWB ? (
              <p style={{ margin: 0, fontSize: 14, color: 'var(--muted)' }}>
                Choose two different states to inspect a shortest distinguishing string.
              </p>
            ) : inspectedWitness === null ? (
              <div className="status-banner success" style={{ fontSize: 14 }}>
                <strong>{origLabels.get(validWA)}</strong> and <strong>{origLabels.get(validWB)}</strong> are
                equivalent: exact product BFS found no distinguishing string.
              </div>
            ) : (
              <div className="status-banner info" style={{ fontSize: 14, flexDirection: 'column', gap: 4 }}>
                <div>
                  <strong>Shortest distinguishing witness:</strong>{' '}
                  <code className="mono">{formatTokens(inspectedWitness)}</code>
                </div>
                {witnessRunA && witnessRunB && (
                  <div className="mono" style={{ fontSize: 12.5 }}>
                    From {origLabels.get(validWA)}:{' '}
                    {witnessRunA.path.map((id) => origLabels.get(id) ?? id).join(' → ')} (
                    {witnessRunA.accepted ? 'Accept' : 'Reject'})
                    <br />
                    From {origLabels.get(validWB)}:{' '}
                    {witnessRunB.path.map((id) => origLabels.get(id) ?? id).join(' → ')} (
                    {witnessRunB.accepted ? 'Accept' : 'Reject'})
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* String Testing Lab */}
      <div className="no-print">
        <StringLab
          original={result.original}
          minimized={result.minimized}
          onHighlightStates={(oId, mId) => {
            setSelectedOrigIds(oId ? [oId] : []);
            setSelectedMinIds(mId ? [mId] : []);
          }}
        />
      </div>

      {/* Exports & Print */}
      <div className="panel no-print">
        <div className="panel-header">
          <h2 className="panel-title">Export &amp; exam solution</h2>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--muted)' }}>
            SVG background:
            <select
              aria-label="SVG export background"
              className="select-input"
              style={{ width: 'auto', minHeight: 28, fontSize: 12.5 }}
              value={svgBg}
              onChange={(e) => setSvgBg(e.target.value as 'white' | 'transparent')}
            >
              <option value="white">White</option>
              <option value="transparent">Transparent</option>
            </select>
          </label>
        </div>

        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {solutionGated && (
            <div className="status-banner warning">
              <div>
                Solution exports are locked while practice prompts remain unfinished.{' '}
                {onUnlockRequest && (
                  <button type="button" className="btn btn-sm" onClick={onUnlockRequest}>
                    Reveal / unlock exports
                  </button>
                )}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!canExportSolution}
              onClick={() => {
                triggerDownload(
                  sanitizeFilename(result.original.name, 'solution', 'md'),
                  generateSolutionMarkdown(result),
                  'text/markdown;charset=utf-8',
                );
                showToast('Solution Markdown downloaded');
              }}
            >
              <FileText size={15} aria-hidden="true" />
              Download solution (.md)
            </button>

            <button
              type="button"
              className="btn"
              disabled={!canExportSolution}
              onClick={handleCopyMarkdown}
            >
              <ClipboardCopy size={15} aria-hidden="true" />
              Copy solution
            </button>

            <button
              type="button"
              className="btn"
              disabled={!canExportSolution}
              onClick={() => window.print()}
            >
              <Printer size={15} aria-hidden="true" />
              Print / Save as PDF
            </button>

            <button
              type="button"
              className="btn"
              disabled={!canExportSolution}
              onClick={() => {
                triggerDownload(
                  sanitizeFilename(result.original.name, 'minimized', 'json'),
                  serializeMinimizedJson(result),
                  'application/json',
                );
                showToast('Minimized DFA JSON downloaded');
              }}
            >
              <Download size={15} aria-hidden="true" />
              Export minimized DFA (.json)
            </button>

            <button
              type="button"
              className="btn"
              disabled={!canExportSolution}
              onClick={() => {
                triggerDownload(
                  sanitizeFilename(result.original.name, 'minimized-diagram', 'svg'),
                  generateDiagramSvg(result.minimized, { background: svgBg }),
                  'image/svg+xml',
                );
                showToast('Minimized SVG diagram downloaded');
              }}
            >
              <FileCode2 size={15} aria-hidden="true" />
              Export minimal SVG
            </button>

            <button
              type="button"
              className="btn"
              onClick={() => {
                triggerDownload(
                  sanitizeFilename(result.original.name, 'original-diagram', 'svg'),
                  generateDiagramSvg(result.original, { background: svgBg }),
                  'image/svg+xml',
                );
                showToast('Original SVG diagram downloaded');
              }}
            >
              <FileCode2 size={15} aria-hidden="true" />
              Export original SVG
            </button>
          </div>

          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--muted)' }}>
            Exports contain only the state labels and symbols you entered. All files are generated locally in your browser.
          </p>
        </div>
      </div>

      {/* Print-only Full Exam Steps */}
      {canExportSolution && (
        <div className="print-only panel">
          <div className="panel-body">
            <h2 style={{ fontSize: '13pt', marginBottom: 8 }}>Step-by-step Derivation</h2>
            <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono)', fontSize: '9pt' }}>
              {generateSolutionMarkdown(result)}
            </pre>
          </div>
        </div>
      )}

      {/* Clipboard Fallback Modal */}
      <Dialog
        open={clipboardFallback !== null}
        onClose={() => setClipboardFallback(null)}
        title="Copy solution manually"
        wide
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--muted)' }}>
            Clipboard permission was unavailable. Select and copy the Markdown solution below:
          </p>
          <textarea
            className="textarea-input mono"
            style={{ minHeight: 240, fontSize: 12 }}
            readOnly
            value={clipboardFallback ?? ''}
            onFocus={(e) => e.currentTarget.select()}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-primary" onClick={() => setClipboardFallback(null)}>
              Done
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
