import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from 'lucide-react';
import type { DetailLevel, Trace, TraceEvent } from '../../engine';
import type { PlaybackSpeed } from '../../store/AppContext';

interface PlaybackControllerProps {
  trace: Trace;
  cursor: number;
  visibleEventIndices: number[];
  speed: PlaybackSpeed;
  detailLevel: DetailLevel;
  pauseOnRoundSummaries: boolean;
  onChangeCursor: (nextIndex: number) => void;
  onChangeSpeed: (speed: PlaybackSpeed) => void;
  onChangeDetailLevel: (detail: DetailLevel) => void;
  onTogglePauseOnRound: () => void;
  pausedByExternalModal?: boolean;
}

function describeEventBrief(ev: TraceEvent, index: number, total: number): string {
  const stepNum = `${index + 1} of ${total}`;
  switch (ev.kind) {
    case 'reach.started':
      return `Reachability started, step ${stepNum}`;
    case 'reach.inspect':
      return `Reachability edge ${ev.symbol} to ${ev.to}, step ${stepNum}`;
    case 'reach.removed':
      return `Unreachable states removed, step ${stepNum}`;
    case 'partition.initial':
      return `Initial partition P0, step ${stepNum}`;
    case 'partition.signature':
      return `Round ${ev.round}, signature for ${ev.signature.stateId}, step ${stepNum}`;
    case 'partition.roundCommitted':
      return `Round ${ev.round} committed, step ${stepNum}`;
    case 'partition.stable':
      return `Partition stable at round ${ev.round}, step ${stepNum}`;
    case 'pairs.initial':
      return `Table-filling initialized, step ${stepNum}`;
    case 'pairs.roundCommitted':
      return `Table-filling round ${ev.round} committed, step ${stepNum}`;
    case 'pairs.stable':
      return `Distinguishability table stable, step ${stepNum}`;
    case 'quotient.finished':
      return `Quotient DFA built, step ${stepNum}`;
    case 'verify.finished':
      return `Verification ${ev.equivalent ? 'passed' : 'failed'}, step ${stepNum}`;
    default:
      return `${ev.kind}, step ${stepNum}`;
  }
}

export function PlaybackController({
  trace,
  cursor,
  visibleEventIndices,
  speed,
  detailLevel,
  pauseOnRoundSummaries,
  onChangeCursor,
  onChangeSpeed,
  onChangeDetailLevel,
  onTogglePauseOnRound,
  pausedByExternalModal = false,
}: PlaybackControllerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const timerRef = useRef<number | null>(null);

  // Map raw cursor to nearest index in visibleEventIndices
  const visiblePos = (() => {
    if (visibleEventIndices.length === 0) return 0;
    let bestPos = 0;
    for (let i = 0; i < visibleEventIndices.length; i++) {
      if (visibleEventIndices[i]! <= cursor) bestPos = i;
      else break;
    }
    return bestPos;
  })();

  const totalVisible = visibleEventIndices.length;
  const isAtStart = visiblePos <= 0;
  const isAtEnd = visiblePos >= totalVisible - 1;

  const stopPlayback = useCallback(() => {
    setIsPlaying(false);
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stepToVisiblePos = useCallback(
    (pos: number, announce = true) => {
      if (visibleEventIndices.length === 0) return;
      const clamped = Math.max(0, Math.min(pos, visibleEventIndices.length - 1));
      const nextRawIdx = visibleEventIndices[clamped]!;
      onChangeCursor(nextRawIdx);
      if (announce) {
        const ev = trace.events[nextRawIdx];
        if (ev) setAnnouncement(describeEventBrief(ev, clamped, visibleEventIndices.length));
      }
    },
    [onChangeCursor, trace.events, visibleEventIndices],
  );

  // Pause on modal/practice prompt or tab hidden
  useEffect(() => {
    if (pausedByExternalModal) stopPlayback();
  }, [pausedByExternalModal, stopPlayback]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') stopPlayback();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [stopPlayback]);

  // Single playback timer
  useEffect(() => {
    if (!isPlaying) {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    if (isAtEnd) {
      setIsPlaying(false);
      return;
    }

    const baseMs = detailLevel === 'concept' ? 1600 : 850;
    const delayMs = Math.max(250, Math.round(baseMs / speed));

    timerRef.current = window.setTimeout(() => {
      const nextPos = visiblePos + 1;
      const nextRawIdx = visibleEventIndices[nextPos];
      if (nextRawIdx === undefined) {
        setIsPlaying(false);
        return;
      }
      onChangeCursor(nextRawIdx);
      const ev = trace.events[nextRawIdx];
      if (
        pauseOnRoundSummaries &&
        ev &&
        (ev.kind === 'partition.roundCommitted' ||
          ev.kind === 'pairs.roundCommitted' ||
          ev.kind === 'partition.stable' ||
          ev.kind === 'pairs.stable')
      ) {
        setIsPlaying(false);
      }
    }, delayMs);

    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [
    detailLevel,
    isAtEnd,
    isPlaying,
    onChangeCursor,
    pauseOnRoundSummaries,
    speed,
    trace.events,
    visibleEventIndices,
    visiblePos,
  ]);

  // Keyboard shortcuts (§8.6)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isTextControl =
        tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable;
      if (isTextControl) return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        stopPlayback();
        stepToVisiblePos(visiblePos - 1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        stopPlayback();
        stepToVisiblePos(visiblePos + 1);
      } else if (e.key === 'Home') {
        e.preventDefault();
        stopPlayback();
        stepToVisiblePos(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        stopPlayback();
        stepToVisiblePos(totalVisible - 1);
      } else if (e.key === ' ') {
        const isInteractive = tag === 'button' || tag === 'a';
        if (isInteractive) return;
        e.preventDefault();
        if (isAtEnd) {
          stepToVisiblePos(0, false);
          setIsPlaying(true);
        } else {
          setIsPlaying((p) => !p);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isAtEnd, stepToVisiblePos, stopPlayback, totalVisible, visiblePos]);

  const currentEvent = trace.events[cursor] ?? trace.events[0]!;
  const valueText = describeEventBrief(currentEvent, visiblePos, totalVisible);

  return (
    <div className="playback-bar no-print" role="region" aria-label="Simulation playback controls">
      <div className="sr-only" aria-live="polite">
        {announcement}
      </div>

      <div className="playback-bar-inner">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            type="button"
            className="btn btn-sm btn-touch"
            disabled={isAtStart}
            onClick={() => {
              stopPlayback();
              stepToVisiblePos(0);
            }}
            aria-label="Restart simulation"
            title="Restart (Home)"
          >
            <RotateCcw size={15} aria-hidden="true" />
          </button>

          <button
            type="button"
            className="btn btn-sm btn-touch"
            disabled={isAtStart}
            onClick={() => {
              stopPlayback();
              stepToVisiblePos(visiblePos - 1);
            }}
            aria-label="Previous step"
          >
            <ChevronLeft size={16} aria-hidden="true" />
            Previous
          </button>

          <button
            type="button"
            className="btn btn-sm btn-primary btn-touch"
            onClick={() => {
              if (isPlaying) {
                stopPlayback();
              } else if (isAtEnd) {
                stepToVisiblePos(0, false);
                setIsPlaying(true);
              } else {
                setIsPlaying(true);
              }
            }}
            aria-label={isPlaying ? 'Pause playback' : 'Play simulation'}
          >
            {isPlaying ? <Pause size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}
            {isPlaying ? 'Pause' : 'Play'}
          </button>

          <button
            type="button"
            className="btn btn-sm btn-touch"
            disabled={isAtEnd}
            onClick={() => {
              stopPlayback();
              stepToVisiblePos(visiblePos + 1);
            }}
            aria-label="Next step"
          >
            Next
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>

        <input
          type="range"
          className="playback-scrubber"
          min={0}
          max={Math.max(0, totalVisible - 1)}
          value={visiblePos}
          aria-label="Simulation timeline"
          aria-valuetext={valueText}
          onChange={(e) => {
            stopPlayback();
            stepToVisiblePos(Number(e.target.value));
          }}
        />

        <span className="tabular" style={{ fontSize: 13, fontWeight: 600, minWidth: 84 }}>
          Step {visiblePos + 1}/{totalVisible}
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <label htmlFor="playback-speed-select" className="sr-only">
            Playback speed
          </label>
          <select
            id="playback-speed-select"
            className="select-input"
            style={{ width: 'auto', minHeight: 32, padding: '2px 8px', fontSize: 12.5 }}
            value={speed}
            onChange={(e) => onChangeSpeed(Number(e.target.value) as PlaybackSpeed)}
          >
            <option value={0.5}>0.5×</option>
            <option value={1}>1×</option>
            <option value={1.5}>1.5×</option>
            <option value={2}>2×</option>
          </select>

          <div className="tabs-bar" role="tablist" aria-label="Step detail level">
            <button
              type="button"
              role="tab"
              className="tab-btn"
              style={{ minHeight: 28, padding: '0 10px', fontSize: 12 }}
              aria-selected={detailLevel === 'concept'}
              onClick={() => onChangeDetailLevel('concept')}
            >
              Concept
            </button>
            <button
              type="button"
              role="tab"
              className="tab-btn"
              style={{ minHeight: 28, padding: '0 10px', fontSize: 12 }}
              aria-selected={detailLevel === 'operation'}
              onClick={() => onChangeDetailLevel('operation')}
            >
              Every operation
            </button>
          </div>

          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
            <input
              type="checkbox"
              checked={pauseOnRoundSummaries}
              onChange={onTogglePauseOnRound}
            />
            Pause on rounds
          </label>
        </div>
      </div>
    </div>
  );
}
