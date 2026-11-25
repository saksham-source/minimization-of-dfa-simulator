import { Link } from 'react-router-dom';
import { GLOSSARY } from '../../components/ui/glossaryData';

export function HelpPage() {
  return (
    <div className="page-container" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h1 style={{ margin: '0 0 6px', fontSize: 28, fontWeight: 650 }}>Help, Conventions &amp; Theory</h1>
        <p style={{ margin: 0, color: 'var(--muted)', maxWidth: '64ch' }}>
          Reference guide for DFA Studio input rules, keyboard navigation, minimization algorithms, and local privacy.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', gap: 16 }}>
        <section className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Input conventions &amp; limits</h2>
          </div>
          <div className="panel-body" style={{ fontSize: 14 }}>
            <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <li>
                <strong>DFA only:</strong> Every state must have exactly one outgoing transition per symbol.
                Epsilon (<code>ε</code>) transitions, NFAs, and wildcards are not accepted.
              </li>
              <li>
                <strong>Limits:</strong> 1–24 states and 1–8 alphabet symbols (a completion sink state counts toward the 24-state limit).
              </li>
              <li>
                <strong>State labels:</strong> 1–24 Unicode characters, unique and case-sensitive.
              </li>
              <li>
                <strong>Alphabet tokens:</strong> 1–12 Unicode characters, no spaces, commas, or reserved symbols (<code>ε</code>, <code>ϵ</code>, <code>∅</code>).
              </li>
              <li>
                <strong>String tester:</strong> If every symbol in Σ is a single character, you may type unseparated strings like <code>0001</code>. When any token has 2+ characters (e.g. <code>go</code>, <code>stop</code>), separate tokens with spaces or commas. Use the <strong>Empty string (ε)</strong> button to test ε explicitly.
              </li>
            </ul>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Keyboard shortcuts (Simulator)</h2>
          </div>
          <div className="panel-body">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Key</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><kbd>←</kbd> / <kbd>→</kbd></td>
                  <td>Previous / Next trace step</td>
                </tr>
                <tr>
                  <td><kbd>Space</kbd></td>
                  <td>Play / Pause simulation (outside inputs)</td>
                </tr>
                <tr>
                  <td><kbd>Home</kbd> / <kbd>End</kbd></td>
                  <td>Jump to first / last trace step</td>
                </tr>
                <tr>
                  <td><kbd>Esc</kbd></td>
                  <td>Close dialogs, popovers, or cancel connect mode</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Algorithms &amp; verification</h2>
          </div>
          <div className="panel-body" style={{ fontSize: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={{ margin: 0 }}>
              <strong>Partition refinement (default):</strong> Uses synchronous Moore-style round refinement:
              compute destination-group signatures against the fixed previous partition, split inconsistent blocks, and repeat until a full round causes zero splits.
            </p>
            <p style={{ margin: 0 }}>
              <strong>Table-filling (alternative):</strong> Marks final/non-final pairs on <code>ε</code>, then propagates distinguishable pairs synchronously until stable, tracking shortest witness strings.
            </p>
            <p style={{ margin: 0 }}>
              <strong>Exact verification:</strong> After building the quotient DFA, product-automaton BFS checks every reachable <code>(p, q)</code> pair between original and minimal DFAs, plus independent reachability and pairwise distinguishability checks.
            </p>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Privacy &amp; troubleshooting</h2>
          </div>
          <div className="panel-body" style={{ fontSize: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={{ margin: 0 }}>
              All computation runs 100% locally in your browser. No data, telemetry, or automaton definitions are sent to any server.
            </p>
            <p style={{ margin: 0 }}>
              Drafts, preferences, and practice stats persist in <code>localStorage</code> under{' '}
              <code>dfa-studio:v1</code> and do not sync across devices. Use JSON export to back up important automata, or open Settings in the header to clear local data.
            </p>
            <Link to="/simulator" className="btn btn-sm" style={{ alignSelf: 'flex-start', marginTop: 4 }}>
              Back to Simulator
            </Link>
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Glossary</h2>
        </div>
        <div
          className="panel-body"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 12,
          }}
        >
          {Object.values(GLOSSARY).map((g) => (
            <div key={g.term} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
              <div style={{ fontWeight: 650, fontSize: 14 }}>
                {g.term} {g.symbol && <code style={{ fontSize: 12, color: 'var(--muted)' }}>{g.symbol}</code>}
              </div>
              <p style={{ margin: '4px 0', fontSize: 13 }}>{g.short}</p>
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--muted)' }}>{g.detail}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
