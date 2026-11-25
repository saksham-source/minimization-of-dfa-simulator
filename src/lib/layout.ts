import { buildTransitionMap } from '../engine/helpers';
import type { DFA, DFADraft, LayoutNode, StateId } from '../engine/types';

export interface Point {
  x: number;
  y: number;
}

export interface ComputedLayout {
  positions: Map<StateId, Point>;
  width: number;
  height: number;
  unreachableIds: Set<StateId>;
  unreachableBounds: { x: number; y: number; width: number; height: number } | null;
}

const LAYER_X_STEP = 165;
const ROW_Y_STEP = 120;
const PAD_X = 95;
const PAD_Y = 85;

export function computeDeterministicLayout(
  dfaLike: Pick<DFA, 'states' | 'alphabet' | 'startStateId' | 'transitions'> | DFADraft,
  existingLayout?: readonly LayoutNode[],
): ComputedLayout {
  const states = dfaLike.states;
  const positions = new Map<StateId, Point>();
  const existingMap = new Map<StateId, Point>();

  if (existingLayout) {
    for (const node of existingLayout) {
      if (Number.isFinite(node.x) && Number.isFinite(node.y)) {
        existingMap.set(node.stateId, { x: node.x, y: node.y });
      }
    }
  }

  if (states.length === 0) {
    return {
      positions,
      width: 640,
      height: 360,
      unreachableIds: new Set(),
      unreachableBounds: null,
    };
  }

  // BFS from startStateId (or first state if null) to assign layers
  const adj = new Map<StateId, StateId[]>();
  for (const s of states) {
    adj.set(s.id, []);
  }
  for (const t of dfaLike.transitions) {
    const list = adj.get(t.from);
    if (list && !list.includes(t.to)) {
      list.push(t.to);
    }
  }

  const startId = dfaLike.startStateId ?? states[0]!.id;
  const layerOf = new Map<StateId, number>();
  const queue: StateId[] = [];
  if (adj.has(startId)) {
    layerOf.set(startId, 0);
    queue.push(startId);
  }

  let head = 0;
  while (head < queue.length) {
    const u = queue[head++]!;
    const layer = layerOf.get(u)!;
    for (const v of adj.get(u) ?? []) {
      if (!layerOf.has(v)) {
        layerOf.set(v, layer + 1);
        queue.push(v);
      }
    }
  }

  const unreachableIds = new Set<StateId>();
  for (const s of states) {
    if (!layerOf.has(s.id)) {
      unreachableIds.add(s.id);
    }
  }

  // Group reachable states by layer in deterministic order
  const layers = new Map<number, StateId[]>();
  let maxLayer = 0;
  for (const s of states) {
    const layer = layerOf.get(s.id);
    if (layer !== undefined) {
      maxLayer = Math.max(maxLayer, layer);
      let list = layers.get(layer);
      if (!list) {
        list = [];
        layers.set(layer, list);
      }
      list.push(s.id);
    }
  }

  let maxRows = 1;
  for (const list of layers.values()) {
    maxRows = Math.max(maxRows, list.length);
  }

  const reachableHeight = Math.max(220, maxRows * ROW_Y_STEP);
  const centerY = PAD_Y + reachableHeight / 2;

  for (const [layer, ids] of layers.entries()) {
    const x = PAD_X + layer * LAYER_X_STEP;
    const totalH = (ids.length - 1) * ROW_Y_STEP;
    ids.forEach((id, idx) => {
      const y = centerY - totalH / 2 + idx * ROW_Y_STEP;
      positions.set(id, { x, y });
    });
  }

  // Place unreachable component separately below or to the right
  let unreachableBounds: ComputedLayout['unreachableBounds'] = null;
  if (unreachableIds.size > 0) {
    const unreachList = states.filter((s) => unreachableIds.has(s.id));
    const startY = PAD_Y + reachableHeight + 55;
    const startX = PAD_X + 20;
    unreachList.forEach((s, idx) => {
      const col = idx % 4;
      const row = Math.floor(idx / 4);
      positions.set(s.id, {
        x: startX + col * LAYER_X_STEP,
        y: startY + row * ROW_Y_STEP,
      });
    });
    const cols = Math.min(4, unreachList.length);
    const rows = Math.ceil(unreachList.length / 4);
    unreachableBounds = {
      x: startX - 55,
      y: startY - 64,
      width: Math.max(195, (cols - 1) * LAYER_X_STEP + 115),
      height: Math.max(114, (rows - 1) * ROW_Y_STEP + 112),
    };
  }

  // Apply pinned user positions if provided
  if (existingMap.size > 0) {
    for (const s of states) {
      const pinned = existingMap.get(s.id);
      if (pinned) {
        positions.set(s.id, pinned);
      }
    }
  }

  // Simple deterministic collision separation if two computed points are < 64px apart
  const ids = states.map((s) => s.id);
  for (let pass = 0; pass < 4; pass++) {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = positions.get(ids[i]!)!;
        const b = positions.get(ids[j]!)!;
        if (existingMap.has(ids[i]!) && existingMap.has(ids[j]!)) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 68) {
          const push = (68 - dist) / 2 + 4;
          const nx = dist === 0 ? 0 : dx / dist;
          const ny = dist === 0 ? 1 : dy / dist;
          if (!existingMap.has(ids[j]!)) {
            b.x += nx * push;
            b.y += ny * push;
          }
          if (!existingMap.has(ids[i]!)) {
            a.x -= nx * push;
            a.y -= ny * push;
          }
        }
      }
    }
  }

  let maxX = 560;
  let maxY = 320;
  for (const p of positions.values()) {
    maxX = Math.max(maxX, p.x + 110);
    maxY = Math.max(maxY, p.y + 95);
  }
  if (unreachableBounds) {
    maxX = Math.max(maxX, unreachableBounds.x + unreachableBounds.width + 40);
    maxY = Math.max(maxY, unreachableBounds.y + unreachableBounds.height + 30);
  }

  // Keep reference to buildTransitionMap unused warning avoided
  void buildTransitionMap;

  return {
    positions,
    width: Math.max(600, Math.ceil(maxX)),
    height: Math.max(320, Math.ceil(maxY)),
    unreachableIds,
    unreachableBounds,
  };
}
