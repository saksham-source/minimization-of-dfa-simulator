import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, BookOpen, Clock, Hammer, Play } from 'lucide-react';
import { Dialog } from '../../components/ui/Dialog';
import { StateNetworkExplorer } from '../../features/explorer3d/StateNetworkExplorer';
import { GUIDED_PRESET } from '../../fixtures/presets';
import { useApp } from '../../store/AppContext';

export function LandingPage() {
  const navigate = useNavigate();
  const { draftState, hasSavedDraft, lastSavedAt, loadPreset, invalidateSolution, result } = useApp();
  const [confirmOverwriteOpen, setConfirmOverwriteOpen] = useState(false);

  const hasUnsavedCustomWork =
    draftState.undoStack.length > 0 && draftState.draft.name !== GUIDED_PRESET.draft.name;

  const launchGuided = () => {
    loadPreset(GUIDED_PRESET.draft, true);
    navigate('/simulator');
  };

  const handleRunGuidedClick = () => {
    if (hasUnsavedCustomWork) {
      setConfirmOverwriteOpen(true);
    } else {
      launchGuided();
    }
  };

  return (
    <div className="page-container" style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      <section className="landing-hero">
        <div>
          <h1 className="landing-headline">Make every DFA state count.</h1>
          <p className="landing-lead">
            Learn deterministic finite automata from scratch, step through reachability removal,
            partition refinement, and table-filling, and verify the minimal machine with an exact
            equivalence proof.
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 18 }}>
            <button type="button" className="btn btn-primary" onClick={handleRunGuidedClick}>
              <Play size={16} aria-hidden="true" />
              Run guided example
            </button>

            <button
              type="button"
              className="btn"
              onClick={() => {
                invalidateSolution();
                navigate('/simulator');
              }}
            >
              <Hammer size={16} aria-hidden="true" />
              Build my DFA
            </button>

            <Link to="/learn" className="btn btn-ghost">
              <BookOpen size={16} aria-hidden="true" />
              Learn from scratch
            </Link>
          </div>

          {hasSavedDraft && (
            <div
              className="panel"
              style={{
                maxWidth: 480,
                background: 'var(--surface-subtle)',
              }}
            >
              <div
                className="panel-body"
                style={{
                  padding: '12px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <div style={{ fontSize: 13.5 }}>
                  <div style={{ fontWeight: 650 }}>Saved draft: {draftState.draft.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Clock size={12} aria-hidden="true" />
                    {lastSavedAt
                      ? `Last updated ${new Date(lastSavedAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}`
                      : 'Saved locally'}
                    {result ? ' · trace ready' : ''}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => navigate('/simulator')}
                >
                  Resume draft
                  <ArrowRight size={14} aria-hidden="true" />
                </button>
              </div>
            </div>
          )}

          {/* Compact Transformation Preview */}
          <div
            style={{
              marginTop: 20,
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: 10,
              maxWidth: 480,
            }}
          >
            <div className="panel">
              <div className="panel-body" style={{ padding: '10px 12px' }}>
                <div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600 }}>1. Reachability</div>
                <div style={{ fontSize: 16, fontWeight: 700 }} className="tabular">
                  7 → 6 states
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>Unreachable U removed</div>
              </div>
            </div>
            <div className="panel">
              <div className="panel-body" style={{ padding: '10px 12px' }}>
                <div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600 }}>2. Equivalence</div>
                <div style={{ fontSize: 16, fontWeight: 700 }} className="tabular">
                  {'{B,C} {D,E}'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>2 rounds + stability</div>
              </div>
            </div>
            <div className="panel">
              <div className="panel-body" style={{ padding: '10px 12px' }}>
                <div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600 }}>3. Quotient</div>
                <div style={{ fontSize: 16, fontWeight: 700 }} className="tabular">
                  4 minimal
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>42.9% reduction</div>
              </div>
            </div>
          </div>
        </div>

        {/* Functional 3D / SVG State Network Explorer */}
        <div>
          <StateNetworkExplorer />
        </div>
      </section>

      <Dialog
        open={confirmOverwriteOpen}
        onClose={() => setConfirmOverwriteOpen(false)}
        title="Replace current draft with guided example?"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ margin: 0, fontSize: 14 }}>
            Loading the 7-state guided example will overwrite your unsaved edits to{' '}
            <strong>{draftState.draft.name}</strong>.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="btn" onClick={() => setConfirmOverwriteOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setConfirmOverwriteOpen(false);
                launchGuided();
              }}
            >
              Load guided example
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
