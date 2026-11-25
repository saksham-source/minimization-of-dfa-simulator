import { DfaBuilder } from '../builder/DfaBuilder';
import { ResultsView } from '../results/ResultsView';
import { SimulatorWorkspace } from './SimulatorWorkspace';
import { useApp } from '../../store/AppContext';

export function SimulatorRoute() {
  const { phase, setPhase, result, startSolving, validation } = useApp();

  const activePhase = !result ? 'build' : phase;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 auto' }}>
      {/* Phase Breadcrumb Bar */}
      <div
        className="no-print"
        style={{
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface-subtle)',
          padding: '6px 16px',
        }}
      >
        <div
          style={{
            maxWidth: 1520,
            margin: '0 auto',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 8,
            fontSize: 13,
          }}
        >
          <button
            type="button"
            className={`btn btn-sm ${activePhase === 'build' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setPhase('build')}
          >
            1. Build &amp; Validate
          </button>
          <span aria-hidden="true" style={{ color: 'var(--muted)' }}>
            →
          </span>
          <button
            type="button"
            className={`btn btn-sm ${activePhase === 'simulate' ? 'btn-primary' : 'btn-ghost'}`}
            disabled={!validation.ok}
            onClick={() => {
              if (!result) {
                startSolving();
              } else {
                setPhase('simulate');
              }
            }}
          >
            2. Step-by-step Simulate
          </button>
          <span aria-hidden="true" style={{ color: 'var(--muted)' }}>
            →
          </span>
          <button
            type="button"
            className={`btn btn-sm ${activePhase === 'results' ? 'btn-primary' : 'btn-ghost'}`}
            disabled={!result}
            onClick={() => setPhase('results')}
          >
            3. Results &amp; Verify
          </button>
        </div>
      </div>

      {activePhase === 'build' && (
        <div className="page-container">
          <h1 className="sr-only">DFA Builder and Validator</h1>
          <DfaBuilder />
        </div>
      )}

      {activePhase === 'simulate' && result && (
        <SimulatorWorkspace onOpenResults={() => setPhase('results')} />
      )}

      {activePhase === 'results' && result && (
        <ResultsView onBackToSteps={() => setPhase('simulate')} />
      )}
    </div>
  );
}
