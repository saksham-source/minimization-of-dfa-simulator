import React, { useId, useMemo, useRef, useState } from 'react';
import { Maximize2, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import type { DFA, DFADraft, LayoutNode, Partition, StateId, SymbolToken } from '../../engine';
import { computeDeterministicLayout } from '../../lib/layout';

export interface ActiveGraphEdge {
  from: StateId;
  symbol: SymbolToken;
  to: StateId;
  kind?: 'inspect' | 'visited' | 'quotient';
}

interface DfaGraphProps {
  dfa: DFA | DFADraft;
  layoutNodes?: readonly LayoutNode[];
  title: string;
  height?: number;
  selectedStateIds?: readonly StateId[];
  visitedStateIds?: readonly StateId[];
  removedStateIds?: readonly StateId[];
  ghostRemovedIds?: readonly StateId[];
  activeEdges?: readonly ActiveGraphEdge[];
  highlightedCell?: { from: StateId; symbol: SymbolToken } | null;
  partition?: Partition | null;
  editable?: boolean;
  connectSourceId?: StateId | null;
  onSelectState?: (stateId: StateId) => void;
  onSelectEdge?: (from: StateId, symbols: SymbolToken[], to: StateId) => void;
  onMoveState?: (layout: LayoutNode[]) => void;
  onResetAutoLayout?: () => void;
  externalZoom?: number;
  onZoomChange?: (zoom: number) => void;
  showEdgeListToggle?: boolean;
}

const NODE_RADIUS = 25;

export function DfaGraph({
  dfa,
  layoutNodes,
  title,
  height = 360,
  selectedStateIds = [],
  visitedStateIds = [],
  removedStateIds = [],
  ghostRemovedIds = [],
  activeEdges = [],
  highlightedCell = null,
  partition = null,
  editable = false,
  connectSourceId = null,
  onSelectState,
  onSelectEdge,
  onMoveState,
  onResetAutoLayout,
  externalZoom,
  onZoomChange,
  showEdgeListToggle = true,
}: DfaGraphProps) {
  const uid = useId().replace(/:/g, '');
  const arrowNormalId = `arr-norm-${uid}`;
  const arrowActiveId = `arr-act-${uid}`;
  const arrowStartId = `arr-start-${uid}`;

  const [internalZoom, setInternalZoom] = useState(1);
  const zoom = externalZoom ?? internalZoom;
  const setZoom = (next: number) => {
    const clamped = Math.max(0.45, Math.min(2.2, Number(next.toFixed(2))));
    if (onZoomChange) onZoomChange(clamped);
    else setInternalZoom(clamped);
  };

  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [showEdgeList, setShowEdgeList] = useState(false);

  const computed = useMemo(
    () => computeDeterministicLayout(dfa, layoutNodes),
    [dfa, layoutNodes],
  );

  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<
    | { type: 'node'; stateId: StateId; startX: number; startY: number; origX: number; origY: number }
    | { type: 'pan'; startX: number; startY: number; origPanX: number; origPanY: number }
    | null
  >(null);

  const selectedSet = useMemo(() => new Set(selectedStateIds), [selectedStateIds]);
  const visitedSet = useMemo(() => new Set(visitedStateIds), [visitedStateIds]);
  const removedSet = useMemo(() => new Set(removedStateIds), [removedStateIds]);
  const ghostSet = useMemo(() => new Set(ghostRemovedIds), [ghostRemovedIds]);
  const finalSet = useMemo(() => new Set(dfa.finalStateIds), [dfa.finalStateIds]);

  const groupIndexOf = useMemo(() => {
    const map = new Map<StateId, { index: number; id: string }>();
    if (partition) {
      partition.groups.forEach((g, idx) => {
        for (const m of g.members) {
          map.set(m, { index: idx, id: g.id });
        }
      });
    }
    return map;
  }, [partition]);

  // Group edges by (from, to)
  const groupedEdges = useMemo(() => {
    const map = new Map<string, { from: StateId; to: StateId; symbols: SymbolToken[] }>();
    for (const t of dfa.transitions) {
      const k = `${JSON.stringify(t.from)}|${JSON.stringify(t.to)}`;
      let entry = map.get(k);
      if (!entry) {
        entry = { from: t.from, to: t.to, symbols: [] };
        map.set(k, entry);
      }
      if (!entry.symbols.includes(t.symbol)) {
        entry.symbols.push(t.symbol);
      }
    }
    return map;
  }, [dfa.transitions]);

  const activeEdgeSet = useMemo(() => {
    const set = new Set<string>();
    for (const ae of activeEdges) {
      set.add(`${JSON.stringify(ae.from)}|${JSON.stringify(ae.to)}`);
    }
    if (highlightedCell) {
      for (const edge of groupedEdges.values()) {
        if (edge.from === highlightedCell.from && edge.symbols.includes(highlightedCell.symbol)) {
          set.add(`${JSON.stringify(edge.from)}|${JSON.stringify(edge.to)}`);
        }
      }
    }
    return set;
  }, [activeEdges, groupedEdges, highlightedCell]);

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = dragRef.current;
    if (!d || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = computed.width / Math.max(1, rect.width) / zoom;
    const scaleY = computed.height / Math.max(1, rect.height) / zoom;
    const dx = (e.clientX - d.startX) * scaleX;
    const dy = (e.clientY - d.startY) * scaleY;

    if (d.type === 'node' && onMoveState) {
      const nextLayout: LayoutNode[] = dfa.states.map((s) => {
        if (s.id === d.stateId) {
          return {
            stateId: s.id,
            x: Math.max(-9500, Math.min(9500, Math.round(d.origX + dx))),
            y: Math.max(-9500, Math.min(9500, Math.round(d.origY + dy))),
          };
        }
        const pos = computed.positions.get(s.id) ?? { x: 100, y: 100 };
        return { stateId: s.id, x: Math.round(pos.x), y: Math.round(pos.y) };
      });
      onMoveState(nextLayout);
    } else if (d.type === 'pan') {
      setPan({ x: d.origPanX + (e.clientX - d.startX) * scaleX, y: d.origPanY + (e.clientY - d.startY) * scaleY });
    }
  };

  const handlePointerUp = () => {
    dragRef.current = null;
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const stateLabelById = useMemo(() => {
    const m = new Map<StateId, string>();
    for (const s of dfa.states) m.set(s.id, s.label);
    return m;
  }, [dfa.states]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 600, fontSize: '14px' }}>{title}</span>
          <span style={{ fontSize: '12px', color: 'var(--muted)' }} className="tabular">
            {dfa.states.length} state{dfa.states.length === 1 ? '' : 's'} · {dfa.transitions.length} transition
            {dfa.transitions.length === 1 ? '' : 's'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }} role="toolbar" aria-label="Graph zoom and view controls">
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={resetView}
            title="Fit graph to view"
          >
            <Maximize2 size={14} aria-hidden="true" />
            Fit
          </button>
          <button
            type="button"
            className="btn btn-sm btn-icon btn-ghost"
            onClick={() => setZoom(zoom + 0.15)}
            aria-label="Zoom in graph"
            title="Zoom in"
          >
            <ZoomIn size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="btn btn-sm btn-icon btn-ghost"
            onClick={() => setZoom(zoom - 0.15)}
            aria-label="Zoom out graph"
            title="Zoom out"
          >
            <ZoomOut size={15} aria-hidden="true" />
          </button>
          {editable && onResetAutoLayout && (
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={onResetAutoLayout}
              title="Reset nodes to automatic layout"
            >
              <RotateCcw size={14} aria-hidden="true" />
              Auto-layout
            </button>
          )}
          {showEdgeListToggle && (
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              aria-expanded={showEdgeList}
              onClick={() => setShowEdgeList((v) => !v)}
            >
              {showEdgeList ? 'Hide edge list' : 'Edge list'}
            </button>
          )}
        </div>
      </div>

      <div
        style={{
          position: 'relative',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-panel)',
          background: 'var(--surface)',
          overflow: 'hidden',
          touchAction: 'pan-y',
        }}
      >
        <svg
          ref={svgRef}
          viewBox={`${-pan.x} ${-pan.y} ${computed.width / zoom} ${computed.height / zoom}`}
          style={{
            width: '100%',
            height: `${height}px`,
            display: 'block',
            userSelect: 'none',
            cursor: editable && connectSourceId ? 'crosshair' : 'grab',
          }}
          role="img"
          aria-label={`${title}: ${dfa.states.length} states, start state ${
            dfa.startStateId ? stateLabelById.get(dfa.startStateId) ?? dfa.startStateId : 'none'
          }`}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerDown={(e) => {
            if (e.target === svgRef.current) {
              dragRef.current = {
                type: 'pan',
                startX: e.clientX,
                startY: e.clientY,
                origPanX: pan.x,
                origPanY: pan.y,
              };
            }
          }}
        >
          <defs>
            <marker
              id={arrowNormalId}
              viewBox="0 0 10 10"
              refX="8.5"
              refY="5"
              markerWidth="6.5"
              markerHeight="6.5"
              orient="auto-start-reverse"
            >
              <path d="M 1 1.5 L 9 5 L 1 8.5 z" fill="var(--muted)" />
            </marker>
            <marker
              id={arrowActiveId}
              viewBox="0 0 10 10"
              refX="8.5"
              refY="5"
              markerWidth="7.5"
              markerHeight="7.5"
              orient="auto-start-reverse"
            >
              <path d="M 1 1.5 L 9 5 L 1 8.5 z" fill="var(--accent)" />
            </marker>
            <marker
              id={arrowStartId}
              viewBox="0 0 10 10"
              refX="8.5"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 1 1.5 L 9 5 L 1 8.5 z" fill="var(--accent)" />
            </marker>
          </defs>

          {/* Optional unreachable band label */}
          {computed.unreachableBounds && (
            <g>
              <rect
                x={computed.unreachableBounds.x}
                y={computed.unreachableBounds.y}
                width={computed.unreachableBounds.width}
                height={computed.unreachableBounds.height}
                rx={10}
                fill="var(--surface-subtle)"
                fillOpacity={0.55}
                stroke="var(--border)"
                strokeDasharray="5 4"
              />
              <text
                x={computed.unreachableBounds.x + 10}
                y={computed.unreachableBounds.y + 16}
                fontSize={11}
                fontWeight={600}
                fill="var(--muted)"
              >
                Unreachable from start
              </text>
            </g>
          )}

          {/* Edges */}
          {Array.from(groupedEdges.values()).map((edge) => {
            const p1 = computed.positions.get(edge.from);
            const p2 = computed.positions.get(edge.to);
            if (!p1 || !p2) return null;

            const edgeKey = `${JSON.stringify(edge.from)}|${JSON.stringify(edge.to)}`;
            const isActive = activeEdgeSet.has(edgeKey);
            const isGhost = ghostSet.has(edge.from) || ghostSet.has(edge.to) || removedSet.has(edge.from) || removedSet.has(edge.to);
            const label = edge.symbols.join(', ');
            const stroke = isActive ? 'var(--accent)' : 'var(--muted)';
            const marker = isActive ? arrowActiveId : arrowNormalId;
            const labelW = Math.max(20, label.length * 8 + 10);

            if (edge.from === edge.to) {
              const pathD = `M ${p1.x - 10} ${p1.y - NODE_RADIUS + 2} C ${p1.x - 28} ${p1.y - NODE_RADIUS - 44}, ${p1.x + 28} ${p1.y - NODE_RADIUS - 44}, ${p1.x + 10} ${p1.y - NODE_RADIUS + 2}`;
              const lx = p1.x;
              const ly = p1.y - NODE_RADIUS - 34;
              return (
                <g
                  key={edgeKey}
                  style={{ opacity: isGhost ? 0.35 : 1, cursor: onSelectEdge ? 'pointer' : 'default' }}
                  onClick={() => onSelectEdge?.(edge.from, edge.symbols, edge.to)}
                >
                  <path
                    d={pathD}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={isActive ? 2.6 : 1.7}
                    markerEnd={`url(#${marker})`}
                    style={{ transition: 'stroke var(--dur-fast) var(--ease-standard)' }}
                  />
                  <rect
                    x={lx - labelW / 2}
                    y={ly - 10}
                    width={labelW}
                    height={18}
                    rx={4}
                    fill="var(--surface)"
                    stroke={isActive ? 'var(--accent)' : 'var(--border)'}
                    strokeWidth={1}
                  />
                  <text
                    x={lx}
                    y={ly + 3}
                    textAnchor="middle"
                    fontSize={12}
                    fontFamily="var(--font-mono)"
                    fontWeight={isActive ? 700 : 500}
                    fill={isActive ? 'var(--accent)' : 'var(--text)'}
                  >
                    {label}
                  </text>
                </g>
              );
            }

            const reverseKey = `${JSON.stringify(edge.to)}|${JSON.stringify(edge.from)}`;
            const hasReverse = groupedEdges.has(reverseKey);
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const dist = Math.hypot(dx, dy) || 1;
            const nx = -dy / dist;
            const ny = dx / dist;

            const passesThroughOtherNode = Array.from(computed.positions.entries()).some(
              ([otherId, op]) => {
                if (otherId === edge.from || otherId === edge.to) return false;
                const t = ((op.x - p1.x) * dx + (op.y - p1.y) * dy) / (dist * dist);
                if (t <= 0.05 || t >= 0.95) return false;
                const projX = p1.x + t * dx;
                const projY = p1.y + t * dy;
                return Math.hypot(op.x - projX, op.y - projY) < NODE_RADIUS + 14;
              },
            );

            const skipArc = Math.min(115, Math.max(52, dist * 0.16));
            const offset = passesThroughOtherNode
              ? dx < 0
                ? -skipArc
                : skipArc
              : hasReverse
              ? 28
              : 0;

            const ctrlX = (p1.x + p2.x) / 2 + nx * offset * 1.55;
            const ctrlY = (p1.y + p2.y) / 2 + ny * offset * 1.55;
            const startAngle = Math.atan2(ctrlY - p1.y, ctrlX - p1.x);
            const endAngle = Math.atan2(ctrlY - p2.y, ctrlX - p2.x);
            const sx = p1.x + Math.cos(startAngle) * NODE_RADIUS;
            const sy = p1.y + Math.sin(startAngle) * NODE_RADIUS;
            const ex = p2.x + Math.cos(endAngle) * (NODE_RADIUS + 3);
            const ey = p2.y + Math.sin(endAngle) * (NODE_RADIUS + 3);

            const pathD =
              offset === 0
                ? `M ${sx.toFixed(1)} ${sy.toFixed(1)} L ${ex.toFixed(1)} ${ey.toFixed(1)}`
                : `M ${sx.toFixed(1)} ${sy.toFixed(1)} Q ${ctrlX.toFixed(1)} ${ctrlY.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`;

            const lx = offset === 0 ? (sx + ex) / 2 + nx * 13 : 0.25 * sx + 0.5 * ctrlX + 0.25 * ex;
            const ly = offset === 0 ? (sy + ey) / 2 + ny * 13 : 0.25 * sy + 0.5 * ctrlY + 0.25 * ey;

            return (
              <g
                key={edgeKey}
                style={{ opacity: isGhost ? 0.35 : 1, cursor: onSelectEdge ? 'pointer' : 'default' }}
                onClick={() => onSelectEdge?.(edge.from, edge.symbols, edge.to)}
              >
                <path
                  d={pathD}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={isActive ? 2.6 : 1.7}
                  markerEnd={`url(#${marker})`}
                  style={{ transition: 'stroke var(--dur-fast) var(--ease-standard)' }}
                />
                <rect
                  x={lx - labelW / 2}
                  y={ly - 10}
                  width={labelW}
                  height={18}
                  rx={4}
                  fill="var(--surface)"
                  fillOpacity={0.94}
                  stroke={isActive ? 'var(--accent)' : 'none'}
                  strokeWidth={1}
                />
                <text
                  x={lx}
                  y={ly + 3}
                  textAnchor="middle"
                  fontSize={12}
                  fontFamily="var(--font-mono)"
                  fontWeight={isActive ? 700 : 500}
                  fill={isActive ? 'var(--accent)' : 'var(--text)'}
                >
                  {label}
                </text>
              </g>
            );
          })}

          {/* State nodes */}
          {dfa.states.map((s) => {
            const pos = computed.positions.get(s.id);
            if (!pos) return null;

            const isStart = dfa.startStateId === s.id;
            const isFinal = finalSet.has(s.id);
            const isSelected = selectedSet.has(s.id);
            const isVisited = visitedSet.has(s.id);
            const isRemoved = removedSet.has(s.id) || ghostSet.has(s.id);
            const isConnectSource = connectSourceId === s.id;
            const groupInfo = groupIndexOf.get(s.id);

            const fillColor = groupInfo
              ? `var(--group-${groupInfo.index % 6}-bg)`
              : isRemoved
              ? 'var(--surface-subtle)'
              : 'var(--surface)';

            const strokeColor = isSelected || isConnectSource
              ? 'var(--accent)'
              : groupInfo
              ? `var(--group-${groupInfo.index % 6}-border)`
              : isVisited
              ? 'var(--success)'
              : 'var(--text)';

            const displayLabel = s.label.length > 7 ? `${s.label.slice(0, 6)}…` : s.label;

            return (
              <g
                key={s.id}
                transform={`translate(${pos.x}, ${pos.y})`}
                style={{
                  opacity: isRemoved ? 0.45 : 1,
                  cursor: editable && onMoveState ? 'grab' : onSelectState ? 'pointer' : 'default',
                }}
                tabIndex={onSelectState ? 0 : undefined}
                role={onSelectState ? 'button' : undefined}
                aria-label={`State ${s.label}${isStart ? ', start state' : ''}${isFinal ? ', final state' : ''}${
                  groupInfo ? `, group ${groupInfo.id}` : ''
                }${isRemoved ? ', unreachable' : ''}`}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  if (editable && onMoveState && !connectSourceId) {
                    dragRef.current = {
                      type: 'node',
                      stateId: s.id,
                      startX: e.clientX,
                      startY: e.clientY,
                      origX: pos.x,
                      origY: pos.y,
                    };
                  }
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectState?.(s.id);
                }}
                onKeyDown={(e) => {
                  if (onSelectState && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    onSelectState(s.id);
                  }
                }}
              >
                {/* Start incoming arrow */}
                {isStart && (
                  <line
                    x1={-NODE_RADIUS - 32}
                    y1={0}
                    x2={-NODE_RADIUS - 4}
                    y2={0}
                    stroke="var(--accent)"
                    strokeWidth={2.2}
                    markerEnd={`url(#${arrowStartId})`}
                  />
                )}

                {/* Selection focus ring */}
                {(isSelected || isConnectSource) && (
                  <circle
                    r={NODE_RADIUS + 5}
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth={2}
                    strokeDasharray={isConnectSource ? '4 3' : undefined}
                  />
                )}

                {/* Outer state circle */}
                <circle
                  r={NODE_RADIUS}
                  fill={fillColor}
                  stroke={strokeColor}
                  strokeWidth={isSelected ? 2.5 : 2}
                  strokeDasharray={isRemoved ? '4 3' : undefined}
                />

                {/* Double circle for final state */}
                {isFinal && (
                  <circle
                    r={NODE_RADIUS - 5}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={1.6}
                  />
                )}

                {/* Label */}
                <text
                  y={4.5}
                  textAnchor="middle"
                  fontSize={13.5}
                  fontWeight={650}
                  fill="var(--text)"
                >
                  {displayLabel}
                </text>

                {/* Group badge */}
                {groupInfo && (
                  <g transform={`translate(0, ${NODE_RADIUS + 14})`}>
                    <rect
                      x={-16}
                      y={-9}
                      width={32}
                      height={16}
                      rx={8}
                      fill={`var(--group-${groupInfo.index % 6}-bg)`}
                      stroke={`var(--group-${groupInfo.index % 6}-border)`}
                      strokeWidth={1}
                    />
                    <text
                      y={3}
                      textAnchor="middle"
                      fontSize={10.5}
                      fontWeight={700}
                      fill={`var(--group-${groupInfo.index % 6}-text)`}
                    >
                      {groupInfo.id}
                    </text>
                  </g>
                )}

                {/* Visited badge (when no group badge) */}
                {!groupInfo && isVisited && !isRemoved && (
                  <text
                    y={NODE_RADIUS + 15}
                    textAnchor="middle"
                    fontSize={10.5}
                    fontWeight={600}
                    fill="var(--success)"
                  >
                    visited
                  </text>
                )}

                {isRemoved && (
                  <text
                    y={NODE_RADIUS + 15}
                    textAnchor="middle"
                    fontSize={10.5}
                    fontWeight={600}
                    fill="var(--muted)"
                  >
                    removed
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {showEdgeList && (
        <div className="data-table-wrap" aria-label="Graph edge list">
          <table className="data-table">
            <thead>
              <tr>
                <th>From</th>
                <th>Symbol(s)</th>
                <th>To</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(groupedEdges.values()).map((e) => (
                <tr key={`${e.from}->${e.to}`}>
                  <td>{stateLabelById.get(e.from) ?? e.from}</td>
                  <td className="mono">{e.symbols.join(', ')}</td>
                  <td>{stateLabelById.get(e.to) ?? e.to}</td>
                </tr>
              ))}
              {groupedEdges.size === 0 && (
                <tr>
                  <td colSpan={3} style={{ color: 'var(--muted)' }}>
                    No transitions defined yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
