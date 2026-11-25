import React, { Component, Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { RotateCcw, RotateCw } from 'lucide-react';
import { DfaGraph } from '../../components/graph/DfaGraph';
import { minimize, validateDraft } from '../../engine';
import { GUIDED_PRESET } from '../../fixtures/presets';
import { useApp } from '../../store/AppContext';

const LazyCanvas = lazy(() => import('./StateNetworkCanvas'));

class WebGLErrorBoundary extends Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { fallback: React.ReactNode; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  override render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

function detectWebGLSupport(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext('webgl2') || canvas.getContext('webgl')),
    );
  } catch {
    return false;
  }
}

export function StateNetworkExplorer() {
  const { preferences, updatePreferences, resolvedTheme, reducedMotionActive } = useApp();
  const [mode, setMode] = useState<'original' | 'minimized'>('original');
  const [yaw, setYaw] = useState(0);
  const [pitch, setPitch] = useState(0);
  const [contextLost, setContextLost] = useState(false);
  const [isMobileNarrow, setIsMobileNarrow] = useState(false);

  const webglAvailable = useMemo(() => detectWebGLSupport(), []);

  useEffect(() => {
    const updateSize = () => setIsMobileNarrow(window.innerWidth < 460);
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  const computedResult = useMemo(() => {
    const val = validateDraft(GUIDED_PRESET.draft);
    if (!val.ok) return null;
    return minimize(val.dfa, 'partition');
  }, []);

  if (!computedResult) return null;

  const activeDfa = mode === 'original' ? computedResult.original : computedResult.minimized;
  const use2DFallback =
    preferences.disable3D || !webglAvailable || contextLost || isMobileNarrow;

  const fallback2D = (
    <div style={{ padding: '8px 0' }}>
      <DfaGraph
        dfa={activeDfa}
        title={mode === 'original' ? 'Original 7-state DFA (2D overview)' : 'Minimized 4-state DFA (2D overview)'}
        height={230}
        removedStateIds={mode === 'original' ? computedResult.removed : []}
        showEdgeListToggle={false}
      />
    </div>
  );

  return (
    <section className="panel" aria-label="State Network Explorer">
      <div className="panel-header" style={{ flexWrap: 'wrap' }}>
        <div>
          <h2 className="panel-title">State network overview</h2>
          <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
            {mode === 'original'
              ? '7 states (note separated unreachable U)'
              : '4 quotient states: M0={A}, M1={B,C}, M2={D,E}, M3={F}'}
          </span>
        </div>

        <div className="tabs-bar" role="tablist" aria-label="Explorer view state">
          <button
            type="button"
            role="tab"
            className="tab-btn"
            aria-selected={mode === 'original'}
            onClick={() => setMode('original')}
          >
            Original (7)
          </button>
          <button
            type="button"
            role="tab"
            className="tab-btn"
            aria-selected={mode === 'minimized'}
            onClick={() => setMode('minimized')}
          >
            Minimized (4)
          </button>
        </div>
      </div>

      <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {use2DFallback ? (
          fallback2D
        ) : (
          <div
            style={{
              height: 'clamp(220px, 28vw, 310px)',
              borderRadius: 'var(--radius-control)',
              border: '1px solid var(--border)',
              background: 'var(--surface-subtle)',
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            <WebGLErrorBoundary fallback={fallback2D}>
              <Suspense fallback={fallback2D}>
                <LazyCanvas
                  mode={mode}
                  result={computedResult}
                  yawAngle={yaw}
                  pitchAngle={pitch}
                  reducedMotion={reducedMotionActive}
                  resolvedTheme={resolvedTheme}
                  onContextLost={() => setContextLost(true)}
                  onDragDelta={(dy, dp) => {
                    setYaw((v) => v + dy);
                    setPitch((v) => Math.max(-0.8, Math.min(0.8, v + dp)));
                  }}
                />
              </Suspense>
            </WebGLErrorBoundary>
          </div>
        )}

        {/* Controls & Accessible Legend */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            fontSize: 12.5,
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, color: 'var(--muted)' }}>
            <span>
              <strong>Start:</strong> {mode === 'original' ? 'A (cone)' : 'M0={A}'}
            </span>
            <span>
              <strong>Final:</strong> {mode === 'original' ? 'F (ring)' : 'M3={F}'}
            </span>
            {mode === 'original' && (
              <span>
                <strong>Unreachable:</strong> U (faded)
              </span>
            )}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {!use2DFallback && (
              <>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => setYaw((v) => v - 0.45)}
                  aria-label="Rotate left"
                >
                  <RotateCcw size={13} aria-hidden="true" />
                  Rotate left
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => setYaw((v) => v + 0.45)}
                  aria-label="Rotate right"
                >
                  <RotateCw size={13} aria-hidden="true" />
                  Rotate right
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => {
                    setYaw(0);
                    setPitch(0);
                  }}
                >
                  Reset view
                </button>
              </>
            )}
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => updatePreferences({ disable3D: !preferences.disable3D })}
            >
              {preferences.disable3D ? 'Enable 3D' : 'Turn off 3D'}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
