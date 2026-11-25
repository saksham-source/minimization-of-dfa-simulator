import { useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Download,
  FolderOpen,
  Link2,
  Play,
  Plus,
  Redo2,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
} from 'lucide-react';
import { TransitionTable } from '../../components/data/TransitionTable';
import { DfaGraph } from '../../components/graph/DfaGraph';
import { Dialog } from '../../components/ui/Dialog';
import {
  completeWithSink,
  MAX_ALPHABET,
  MAX_STATES,
  type DFADraft,
  type Method,
  type StateId,
  type SymbolToken,
  type ValidationIssue,
} from '../../engine';
import { PRESET_FIXTURES } from '../../fixtures/presets';
import { sanitizeFilename, serializeDraftJson, triggerDownload } from '../../lib/importExport';
import { useApp } from '../../store/AppContext';
import { ImportDialog } from './ImportDialog';

export function DfaBuilder() {
  const {
    draftState,
    dispatchDraft,
    validation,
    method,
    setMethod,
    startSolving,
    loadPreset,
    showToast,
  } = useApp();

  const draft = draftState.draft;
  const [selectedStateId, setSelectedStateId] = useState<StateId | null>(draft.states[0]?.id ?? null);
  const [highlightedCell, setHighlightedCell] = useState<{ from: StateId; symbol: SymbolToken } | null>(null);
  const [mobileTab, setMobileTab] = useState<'table' | 'graph'>('table');

  // Symbol chip input
  const [newSymbol, setNewSymbol] = useState('');
  const [symbolError, setSymbolError] = useState<string | null>(null);

  // Connect mode for visual graph
  const [connectSource, setConnectSource] = useState<StateId | null>(null);
  const [connectTarget, setConnectTarget] = useState<StateId | null>(null);
  const [connectSymbols, setConnectSymbols] = useState<SymbolToken[]>([]);

  // Confirmation dialogs
  const [deleteStateTarget, setDeleteStateTarget] = useState<StateId | null>(null);
  const [deleteSymbolTarget, setDeleteSymbolTarget] = useState<SymbolToken | null>(null);
  const [sinkPreviewOpen, setSinkPreviewOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [pendingPreset, setPendingPreset] = useState<DFADraft | null>(null);

  const selectedState = draft.states.find((s) => s.id === selectedStateId) ?? null;
  const [renameValue, setRenameValue] = useState('');

  // Keep rename input synced when selecting a different state
  const handleSelectState = (id: StateId) => {
    if (connectSource) {
      setConnectTarget(id);
      setConnectSymbols([]);
      return;
    }
    setSelectedStateId(id);
    const st = draft.states.find((s) => s.id === id);
    setRenameValue(st?.label ?? '');
  };

  const definedCount = useMemo(() => {
    const seen = new Set<string>();
    const validStates = new Set(draft.states.map((s) => s.id));
    const validSyms = new Set(draft.alphabet);
    for (const t of draft.transitions) {
      if (validStates.has(t.from) && validStates.has(t.to) && validSyms.has(t.symbol)) {
        seen.add(`${JSON.stringify(t.from)}|${JSON.stringify(t.symbol)}`);
      }
    }
    return seen.size;
  }, [draft.alphabet, draft.states, draft.transitions]);

  const totalExpected = draft.states.length * draft.alphabet.length;
  const missingCount = Math.max(0, totalExpected - definedCount);

  const issues = validation.ok ? [] : validation.issues;
  const onlyMissingTransitions =
    !validation.ok &&
    issues.length > 0 &&
    issues.every((i) => i.code === 'MISSING_TRANSITION');

  const sinkCompletionPreview = useMemo(() => {
    if (!sinkPreviewOpen) return null;
    return completeWithSink(draft);
  }, [draft, sinkPreviewOpen]);

  const handleAddSymbol = () => {
    const sym = newSymbol.trim();
    if (!sym) {
      setSymbolError('Enter a symbol token.');
      return;
    }
    if (/[\s,]/.test(sym)) {
      setSymbolError('Symbols cannot contain spaces or commas.');
      return;
    }
    if (sym === 'ε' || sym === 'ϵ' || sym === '∅') {
      setSymbolError(`"${sym}" is reserved notation and cannot be an alphabet token.`);
      return;
    }
    if (draft.alphabet.includes(sym)) {
      setSymbolError(`"${sym}" is already in the alphabet.`);
      return;
    }
    if (draft.alphabet.length >= MAX_ALPHABET) {
      setSymbolError(`Maximum ${MAX_ALPHABET} alphabet symbols allowed.`);
      return;
    }
    setSymbolError(null);
    dispatchDraft({ type: 'addSymbol', symbol: sym });
    setNewSymbol('');
  };

  const focusIssueControl = (issue: ValidationIssue) => {
    if (issue.stateId && issue.symbol) {
      const el = document.getElementById(`cell-${issue.stateId}-${issue.symbol}`);
      el?.focus();
    } else if (issue.field === 'startStateId') {
      document.getElementById('start-state-select')?.focus();
    } else if (issue.field === 'alphabet') {
      document.getElementById('new-symbol-input')?.focus();
    } else if (issue.field === 'states') {
      document.getElementById('add-state-btn')?.focus();
    }
  };

  const affectedIncomingForDelete = useMemo(() => {
    if (!deleteStateTarget) return [];
    return draft.transitions.filter(
      (t) => t.to === deleteStateTarget && t.from !== deleteStateTarget,
    );
  }, [deleteStateTarget, draft.transitions]);

  const stateLabel = (id: StateId) => draft.states.find((s) => s.id === id)?.label ?? id;

  const existingTransitionsForConnect = useMemo(() => {
    if (!connectSource || !connectTarget) return new Map<SymbolToken, StateId>();
    const map = new Map<SymbolToken, StateId>();
    for (const t of draft.transitions) {
      if (t.from === connectSource) map.set(t.symbol, t.to);
    }
    return map;
  }, [connectSource, connectTarget, draft.transitions]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Builder Toolbar */}
      <div className="panel">
        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ flex: '1 1 240px', maxWidth: 360 }}>
              <label htmlFor="dfa-name-input" className="field-label">
                Automaton name
              </label>
              <input
                id="dfa-name-input"
                type="text"
                className="text-input"
                value={draft.name}
                onChange={(e) => dispatchDraft({ type: 'renameDraft', name: e.target.value })}
              />
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setPresetsOpen(true)}
              >
                <FolderOpen size={15} aria-hidden="true" />
                Examples ({PRESET_FIXTURES.length})
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setImportOpen(true)}
              >
                <Upload size={15} aria-hidden="true" />
                Import JSON
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  triggerDownload(
                    sanitizeFilename(draft.name, 'draft', 'json'),
                    serializeDraftJson(draft),
                    'application/json',
                  );
                  showToast('Original draft JSON downloaded');
                }}
              >
                <Download size={15} aria-hidden="true" />
                Export draft
              </button>
              <button
                type="button"
                className="btn btn-sm"
                disabled={draftState.undoStack.length === 0}
                title={
                  draftState.undoStack.length > 0
                    ? `Undo: ${draftState.undoStack[draftState.undoStack.length - 1]!.label}`
                    : 'Nothing to undo'
                }
                onClick={() => dispatchDraft({ type: 'undo' })}
              >
                <Undo2 size={15} aria-hidden="true" />
                Undo
              </button>
              <button
                type="button"
                className="btn btn-sm"
                disabled={draftState.redoStack.length === 0}
                title={
                  draftState.redoStack.length > 0
                    ? `Redo: ${draftState.redoStack[draftState.redoStack.length - 1]!.label}`
                    : 'Nothing to redo'
                }
                onClick={() => dispatchDraft({ type: 'redo' })}
              >
                <Redo2 size={15} aria-hidden="true" />
                Redo
              </button>
            </div>
          </div>

          {/* States, Alphabet, Start & Finals */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 14,
              paddingTop: 12,
              borderTop: '1px solid var(--border)',
            }}
          >
            {/* States */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span className="field-label" style={{ margin: 0 }}>
                  States ({draft.states.length}/{MAX_STATES})
                </span>
                <button
                  id="add-state-btn"
                  type="button"
                  className="btn btn-sm"
                  disabled={draft.states.length >= MAX_STATES}
                  onClick={() => dispatchDraft({ type: 'addState' })}
                >
                  <Plus size={14} aria-hidden="true" />
                  Add state
                </button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {draft.states.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`chip chip-btn`}
                    style={{
                      borderColor: selectedStateId === s.id ? 'var(--accent)' : undefined,
                      background: selectedStateId === s.id ? 'var(--accent-subtle)' : undefined,
                    }}
                    onClick={() => handleSelectState(s.id)}
                  >
                    <span>{s.label}</span>
                    {draft.startStateId === s.id && (
                      <span style={{ fontSize: 11, color: 'var(--accent)' }}>start</span>
                    )}
                    {draft.finalStateIds.includes(s.id) && (
                      <span style={{ fontSize: 11, color: 'var(--success)' }}>final</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Alphabet */}
            <div>
              <span className="field-label">
                Alphabet Σ ({draft.alphabet.length}/{MAX_ALPHABET})
              </span>
              <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                <input
                  id="new-symbol-input"
                  type="text"
                  className="text-input"
                  style={{ minHeight: 34 }}
                  placeholder="Add symbol (e.g. a, go)"
                  aria-label="New alphabet symbol"
                  value={newSymbol}
                  onChange={(e) => {
                    setNewSymbol(e.target.value);
                    setSymbolError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddSymbol();
                    }
                  }}
                />
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={draft.alphabet.length >= MAX_ALPHABET}
                  onClick={handleAddSymbol}
                >
                  Add
                </button>
              </div>
              {symbolError && (
                <div style={{ fontSize: 12, color: 'var(--danger)', marginBottom: 4 }}>{symbolError}</div>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {draft.alphabet.map((sym) => (
                  <span key={sym} className="chip mono">
                    {sym}
                    <button
                      type="button"
                      aria-label={`Remove symbol ${sym}`}
                      disabled={draft.alphabet.length <= 1}
                      onClick={() => {
                        const hasUsed = draft.transitions.some((t) => t.symbol === sym);
                        if (hasUsed) {
                          setDeleteSymbolTarget(sym);
                        } else {
                          dispatchDraft({ type: 'removeSymbol', symbol: sym });
                        }
                      }}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        padding: '0 2px',
                        color: 'var(--muted)',
                        fontWeight: 700,
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>

            {/* Start & Final */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label htmlFor="start-state-select" className="field-label">
                  Start state (q₀)
                </label>
                <select
                  id="start-state-select"
                  className="select-input"
                  style={{ minHeight: 34 }}
                  value={draft.startStateId ?? ''}
                  onChange={(e) => {
                    if (e.target.value) dispatchDraft({ type: 'setStart', stateId: e.target.value });
                  }}
                >
                  <option value="">Choose start state…</option>
                  {draft.states.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <span className="field-label">Final (accepting) states (F)</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {draft.states.map((s) => {
                    const isFinal = draft.finalStateIds.includes(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        className={`btn btn-sm ${isFinal ? 'btn-primary' : ''}`}
                        style={{ minHeight: 28, padding: '0 10px', fontSize: 12.5 }}
                        aria-pressed={isFinal}
                        onClick={() => dispatchDraft({ type: 'toggleFinal', stateId: s.id })}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Validation Status & Solve Bar */}
      <div
        className={`status-banner ${validation.ok ? 'success' : onlyMissingTransitions ? 'warning' : 'danger'}`}
        role="status"
      >
        {validation.ok ? (
          <CheckCircle2 size={18} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
        ) : onlyMissingTransitions ? (
          <AlertTriangle size={18} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
        ) : (
          <AlertCircle size={18} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
        )}

        <div style={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <strong>
              {validation.ok
                ? `Valid complete DFA · ${definedCount}/${totalExpected} transitions defined`
                : `${definedCount}/${totalExpected} transitions defined · ${missingCount} missing · ${issues.length} issue(s)`}
            </strong>

            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
              {onlyMissingTransitions && (
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setSinkPreviewOpen(true)}
                >
                  <Sparkles size={14} aria-hidden="true" />
                  Complete with a sink state
                </button>
              )}

              <label htmlFor="solve-method-select" className="sr-only">
                Minimization method
              </label>
              <select
                id="solve-method-select"
                className="select-input"
                style={{ width: 'auto', minHeight: 36, fontSize: 13 }}
                value={method}
                onChange={(e) => setMethod(e.target.value as Method)}
              >
                <option value="partition">Partition refinement (recommended for beginners)</option>
                <option value="table-filling">Table-filling (often used in written exams)</option>
              </select>

              <button
                type="button"
                className="btn btn-primary"
                disabled={!validation.ok}
                onClick={() => startSolving()}
              >
                <Play size={15} aria-hidden="true" />
                Start minimization
              </button>
            </div>
          </div>

          {!validation.ok && (
            <div style={{ fontSize: 13 }}>
              <span>Minimization is paused until all issues below are resolved:</span>
              <ul style={{ margin: '6px 0 0 18px', padding: 0 }}>
                {issues.slice(0, 6).map((iss, idx) => (
                  <li key={idx}>
                    <button
                      type="button"
                      onClick={() => focusIssueControl(iss)}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        padding: 0,
                        textAlign: 'left',
                        textDecoration: 'underline',
                        color: 'inherit',
                      }}
                    >
                      {iss.message}
                    </button>
                  </li>
                ))}
                {issues.length > 6 && <li>…and {issues.length - 6} more missing or invalid item(s).</li>}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Synchronized Split Editor (Table + Graph) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))',
          gap: 16,
          alignItems: 'start',
        }}
      >
        {/* Mobile switcher */}
        <div className="mobile-only-tabs" style={{ display: 'none' }}>
          <div className="tabs-bar" role="tablist">
            <button
              type="button"
              role="tab"
              className="tab-btn"
              aria-selected={mobileTab === 'table'}
              onClick={() => setMobileTab('table')}
            >
              Transition table
            </button>
            <button
              type="button"
              role="tab"
              className="tab-btn"
              aria-selected={mobileTab === 'graph'}
              onClick={() => setMobileTab('graph')}
            >
              Visual graph
            </button>
          </div>
        </div>

        {/* Left: Transition Table + Selected State Inspector */}
        <div className={`panel${mobileTab === 'graph' ? ' builder-panel-hidden-mobile' : ''}`}>
          <div className="panel-header">
            <h2 className="panel-title">Transition table</h2>
            <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
              Primary complete editor
            </span>
          </div>
          <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <TransitionTable
              dfa={draft}
              editable
              issues={issues}
              highlightedCell={highlightedCell}
              selectedStateIds={selectedStateId ? [selectedStateId] : []}
              onFocusCell={setHighlightedCell}
              onChangeTransition={(from, symbol, to) =>
                dispatchDraft({ type: 'setTransition', from, symbol, to })
              }
              onSetStart={(id) => dispatchDraft({ type: 'setStart', stateId: id })}
              onToggleFinal={(id) => dispatchDraft({ type: 'toggleFinal', stateId: id })}
              caption="Editable DFA transition table"
            />

            {selectedState && (
              <div
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-control)',
                  padding: 12,
                  background: 'var(--surface-subtle)',
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'flex-end',
                  gap: 10,
                }}
              >
                <div style={{ flex: '1 1 160px' }}>
                  <label htmlFor="selected-state-rename" className="field-label">
                    Selected state label ({selectedState.label})
                  </label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      id="selected-state-rename"
                      type="text"
                      className="text-input"
                      style={{ minHeight: 34 }}
                      value={renameValue || selectedState.label}
                      onChange={(e) => setRenameValue(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => {
                        const val = renameValue.trim();
                        if (val) {
                          dispatchDraft({
                            type: 'renameState',
                            stateId: selectedState.id,
                            label: val,
                          });
                        }
                      }}
                    >
                      Rename
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  className="btn btn-sm btn-danger"
                  disabled={draft.states.length <= 1}
                  title={
                    draft.states.length <= 1
                      ? 'Cannot delete the only remaining state'
                      : `Delete state ${selectedState.label}`
                  }
                  onClick={() => setDeleteStateTarget(selectedState.id)}
                >
                  <Trash2 size={14} aria-hidden="true" />
                  Delete state
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right: Visual Graph Editor */}
        <div className={`panel${mobileTab === 'table' ? ' builder-panel-hidden-mobile' : ''}`}>
          <div className="panel-header">
            <h2 className="panel-title">Interactive graph</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                type="button"
                className={`btn btn-sm ${connectSource ? 'btn-primary' : ''}`}
                aria-pressed={Boolean(connectSource)}
                onClick={() => {
                  if (connectSource) {
                    setConnectSource(null);
                    setConnectTarget(null);
                  } else {
                    setConnectSource(selectedStateId ?? draft.states[0]?.id ?? null);
                    setConnectTarget(null);
                  }
                }}
              >
                <Link2 size={14} aria-hidden="true" />
                {connectSource ? 'Cancel connect' : 'Connect'}
              </button>
            </div>
          </div>
          <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {connectSource && (
              <div className="status-banner info" style={{ padding: '8px 12px', fontSize: 13 }}>
                <span>
                  {connectTarget
                    ? `Connect ${stateLabel(connectSource)} → ${stateLabel(connectTarget)}: choose symbol(s) below.`
                    : `Connect mode active: source is ${stateLabel(connectSource)}. Click any target state (or click ${stateLabel(connectSource)} for a self-loop).`}
                </span>
              </div>
            )}

            <DfaGraph
              dfa={draft}
              layoutNodes={draft.layout}
              title="Draft automaton"
              height={340}
              editable
              connectSourceId={connectSource}
              selectedStateIds={selectedStateId ? [selectedStateId] : []}
              highlightedCell={highlightedCell}
              onSelectState={handleSelectState}
              onSelectEdge={(from, symbols) => {
                setSelectedStateId(from);
                if (symbols[0]) setHighlightedCell({ from, symbol: symbols[0] });
              }}
              onMoveState={(layout) => dispatchDraft({ type: 'updateLayout', layout })}
              onResetAutoLayout={() => dispatchDraft({ type: 'clearLayout' })}
            />
          </div>
        </div>
      </div>

      {/* Connect Mode Symbol Picker Dialog */}
      <Dialog
        open={Boolean(connectSource && connectTarget)}
        onClose={() => {
          setConnectTarget(null);
          setConnectSource(null);
        }}
        title={
          connectSource && connectTarget
            ? `Connect ${stateLabel(connectSource)} → ${stateLabel(connectTarget)}`
            : 'Connect states'
        }
      >
        {connectSource && connectTarget && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--muted)' }}>
              Select one or more symbols for this transition. Choosing a symbol that already points
              elsewhere will replace its existing destination.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {draft.alphabet.map((sym) => {
                const checked = connectSymbols.includes(sym);
                const existingTo = existingTransitionsForConnect.get(sym);
                const willReplace = existingTo && existingTo !== connectTarget;
                return (
                  <label
                    key={sym}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 10px',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-control)',
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setConnectSymbols((prev) =>
                            prev.includes(sym) ? prev.filter((s) => s !== sym) : [...prev, sym],
                          )
                        }
                      />
                      <span className="mono" style={{ fontWeight: 650 }}>
                        {sym}
                      </span>
                    </span>
                    <span style={{ fontSize: 12.5, color: willReplace ? 'var(--warning)' : 'var(--muted)' }}>
                      {existingTo
                        ? willReplace
                          ? `Replaces existing → ${stateLabel(existingTo)}`
                          : `Already → ${stateLabel(existingTo)}`
                        : 'Currently missing'}
                    </span>
                  </label>
                );
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setConnectTarget(null);
                  setConnectSource(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={connectSymbols.length === 0}
                onClick={() => {
                  for (const sym of connectSymbols) {
                    dispatchDraft({
                      type: 'setTransition',
                      from: connectSource,
                      symbol: sym,
                      to: connectTarget,
                    });
                  }
                  setConnectTarget(null);
                  setConnectSource(null);
                }}
              >
                Apply transition(s)
              </button>
            </div>
          </div>
        )}
      </Dialog>

      {/* Delete State Confirmation */}
      <Dialog
        open={Boolean(deleteStateTarget)}
        onClose={() => setDeleteStateTarget(null)}
        title={deleteStateTarget ? `Delete state ${stateLabel(deleteStateTarget)}?` : 'Delete state'}
      >
        {deleteStateTarget && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ margin: 0, fontSize: 14 }}>
              Deleting <strong>{stateLabel(deleteStateTarget)}</strong> will remove all of its outgoing
              transitions and clear{' '}
              <strong>{affectedIncomingForDelete.length}</strong> incoming transition(s) to missing values:
            </p>
            {affectedIncomingForDelete.length > 0 && (
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                {affectedIncomingForDelete.map((t) => (
                  <li key={`${t.from}-${t.symbol}`} className="mono">
                    δ({stateLabel(t.from)}, {t.symbol}) → {stateLabel(t.to)}
                  </li>
                ))}
              </ul>
            )}
            {draft.startStateId === deleteStateTarget && (
              <div className="status-banner warning" style={{ fontSize: 13 }}>
                This is the current start state. You will need to choose a new start state afterwards.
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn" onClick={() => setDeleteStateTarget(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  dispatchDraft({ type: 'removeState', stateId: deleteStateTarget });
                  if (selectedStateId === deleteStateTarget) {
                    const remaining = draft.states.filter((s) => s.id !== deleteStateTarget);
                    setSelectedStateId(remaining[0]?.id ?? null);
                  }
                  setDeleteStateTarget(null);
                }}
              >
                Confirm delete
              </button>
            </div>
          </div>
        )}
      </Dialog>

      {/* Delete Symbol Confirmation */}
      <Dialog
        open={Boolean(deleteSymbolTarget)}
        onClose={() => setDeleteSymbolTarget(null)}
        title={deleteSymbolTarget ? `Remove symbol "${deleteSymbolTarget}"?` : 'Remove symbol'}
      >
        {deleteSymbolTarget && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ margin: 0, fontSize: 14 }}>
              Removing symbol <code className="mono">{deleteSymbolTarget}</code> will delete its
              transition column and all transitions labelled <code>{deleteSymbolTarget}</code>.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn" onClick={() => setDeleteSymbolTarget(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  dispatchDraft({ type: 'removeSymbol', symbol: deleteSymbolTarget });
                  setDeleteSymbolTarget(null);
                }}
              >
                Remove symbol
              </button>
            </div>
          </div>
        )}
      </Dialog>

      {/* Explicit Sink Completion Preview Dialog */}
      <Dialog
        open={sinkPreviewOpen}
        onClose={() => setSinkPreviewOpen(false)}
        title="Complete DFA with a sink state"
        wide
      >
        {sinkCompletionPreview && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {sinkCompletionPreview.ok ? (
              <>
                <p style={{ margin: 0, fontSize: 14 }}>
                  A formal DFA must define one transition for every state and symbol. Completing with a
                  non-final sink state assumes any missing transitions were meant to reject immediately.
                </p>
                {sinkCompletionPreview.sinkState && (
                  <div className="status-banner info" style={{ fontSize: 13.5 }}>
                    <div>
                      <strong>New non-final state:</strong> {sinkCompletionPreview.sinkState.label}
                      <br />
                      <strong>Transitions to add ({sinkCompletionPreview.addedTransitions.length}):</strong>
                      <ul style={{ margin: '6px 0 0 18px', padding: 0 }}>
                        {sinkCompletionPreview.addedTransitions.slice(0, 10).map((t) => (
                          <li key={`${t.from}-${t.symbol}`} className="mono">
                            δ(
                            {t.from === sinkCompletionPreview.sinkState!.id
                              ? sinkCompletionPreview.sinkState!.label
                              : stateLabel(t.from)}
                            , {t.symbol}) → {sinkCompletionPreview.sinkState!.label}
                          </li>
                        ))}
                        {sinkCompletionPreview.addedTransitions.length > 10 && (
                          <li>…and {sinkCompletionPreview.addedTransitions.length - 10} more</li>
                        )}
                      </ul>
                    </div>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button type="button" className="btn" onClick={() => setSinkPreviewOpen(false)}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      dispatchDraft({
                        type: 'replaceDraft',
                        draft: sinkCompletionPreview.draft,
                        label: 'Complete with sink state',
                      });
                      setSinkPreviewOpen(false);
                      showToast('Completed DFA with non-final sink state');
                    }}
                  >
                    Confirm sink completion
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="status-banner danger">{sinkCompletionPreview.message}</div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button type="button" className="btn" onClick={() => setSinkPreviewOpen(false)}>
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </Dialog>

      {/* Presets Browser Dialog */}
      <Dialog
        open={presetsOpen}
        onClose={() => {
          setPresetsOpen(false);
          setPendingPreset(null);
        }}
        title="Example DFAs"
        wide
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {pendingPreset ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="status-banner warning">
                Loading <strong>{pendingPreset.name}</strong> will replace your current draft edits.
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="btn" onClick={() => setPendingPreset(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    loadPreset(pendingPreset, false);
                    setSelectedStateId(pendingPreset.states[0]?.id ?? null);
                    setPendingPreset(null);
                    setPresetsOpen(false);
                  }}
                >
                  Load into builder
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
              {PRESET_FIXTURES.map((preset) => (
                <div
                  key={preset.id}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-control)',
                    padding: 12,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 650, fontSize: 14 }}>{preset.title}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--accent)', fontWeight: 550 }}>
                      {preset.subtitle}
                    </div>
                    <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--muted)' }}>
                      {preset.learningGoal}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => {
                        if (draftState.undoStack.length > 0) {
                          setPendingPreset(preset.draft);
                        } else {
                          loadPreset(preset.draft, false);
                          setSelectedStateId(preset.draft.states[0]?.id ?? null);
                          setPresetsOpen(false);
                        }
                      }}
                    >
                      Edit in builder
                    </button>
                    {!preset.isIncompleteExercise && (
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        onClick={() => {
                          loadPreset(preset.draft, true);
                          setPresetsOpen(false);
                        }}
                      >
                        Solve now
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Dialog>

      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onConfirmImport={(imported) => {
          loadPreset(imported, false);
          setSelectedStateId(imported.states[0]?.id ?? null);
          showToast('Imported DFA into builder');
        }}
      />
    </div>
  );
}
