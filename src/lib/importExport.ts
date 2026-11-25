import { z } from 'zod';
import {
  buildStateLabelMap,
  buildTransitionMap,
  formatTokens,
  validateDraft,
  validateLayout,
  type DFA,
  type DFADraft,
  type MinimizationResult,
  type ValidationIssue,
} from '../engine';
import { computeDeterministicLayout } from './layout';

export const MAX_IMPORT_BYTES = 256 * 1024;

const StateSchema = z.object({
  id: z.string(),
  label: z.string(),
});

const TransitionSchema = z.object({
  from: z.string(),
  symbol: z.string(),
  to: z.string(),
});

const LayoutNodeSchema = z.object({
  stateId: z.string(),
  x: z.number(),
  y: z.number(),
});

const DraftSchema = z.object({
  schemaVersion: z.literal(1),
  name: z.string().optional().default('Imported DFA'),
  states: z.array(StateSchema),
  alphabet: z.array(z.string()),
  startStateId: z.string().nullable(),
  finalStateIds: z.array(z.string()),
  transitions: z.array(TransitionSchema),
  layout: z.array(LayoutNodeSchema).optional(),
});

export type ImportPreviewResult =
  | {
      ok: true;
      draft: DFADraft;
      isCompleteValid: boolean;
      issues: ValidationIssue[];
      warnings: ValidationIssue[];
      stateCount: number;
      symbolCount: number;
      transitionCount: number;
    }
  | {
      ok: false;
      error: string;
    };

export function parseImportedJson(rawText: string): ImportPreviewResult {
  const bytes = new TextEncoder().encode(rawText).length;
  if (bytes > MAX_IMPORT_BYTES) {
    return {
      ok: false,
      error: `Import file is ${(bytes / 1024).toFixed(1)} KiB, which exceeds the 256 KiB limit.`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return {
      ok: false,
      error: 'Invalid JSON syntax. Please check braces, quotes, and trailing commas.',
    };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      ok: false,
      error: 'Imported JSON must be an object containing schemaVersion, states, alphabet, and transitions.',
    };
  }

  const record = parsed as Record<string, unknown>;
  if (record.schemaVersion !== 1) {
    return {
      ok: false,
      error: `Unsupported schemaVersion (${String(record.schemaVersion)}). Expected schemaVersion: 1.`,
    };
  }

  const zodResult = DraftSchema.safeParse(parsed);
  if (!zodResult.success) {
    const firstIssue = zodResult.error.issues[0];
    return {
      ok: false,
      error: `Schema validation error at ${firstIssue?.path.join('.') || 'root'}: ${firstIssue?.message ?? 'Invalid shape.'}`,
    };
  }

  const rawDraft: DFADraft = {
    schemaVersion: 1,
    name: zodResult.data.name.trim() || 'Imported DFA',
    states: zodResult.data.states.map((s) => ({ id: s.id.trim(), label: s.label.trim() })),
    alphabet: zodResult.data.alphabet.map((a) => a.trim()),
    startStateId: zodResult.data.startStateId,
    finalStateIds: [...zodResult.data.finalStateIds],
    transitions: zodResult.data.transitions.map((t) => ({
      from: t.from.trim(),
      symbol: t.symbol.trim(),
      to: t.to.trim(),
    })),
    ...(zodResult.data.layout ? { layout: zodResult.data.layout } : {}),
  };

  const layoutCheck = validateLayout(rawDraft);
  if (rawDraft.layout && layoutCheck.warnings.length > 0) {
    rawDraft.layout = layoutCheck.layout.length > 0 ? layoutCheck.layout : undefined;
  }

  const semanticCheck = validateDraft(rawDraft);
  return {
    ok: true,
    draft: rawDraft,
    isCompleteValid: semanticCheck.ok,
    issues: semanticCheck.ok ? [] : semanticCheck.issues,
    warnings: semanticCheck.ok ? semanticCheck.warnings : layoutCheck.warnings,
    stateCount: rawDraft.states.length,
    symbolCount: rawDraft.alphabet.length,
    transitionCount: rawDraft.transitions.length,
  };
}

export function sanitizeFilename(name: string, suffix: string, ext: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `${base || 'dfa'}-${suffix}.${ext}`;
}

export function serializeDraftJson(draft: DFADraft): string {
  return JSON.stringify(draft, null, 2);
}

export function serializeMinimizedJson(result: MinimizationResult): string {
  const layout = computeDeterministicLayout(result.minimized);
  const draft: DFADraft = {
    schemaVersion: 1,
    name: result.minimized.name,
    states: result.minimized.states.map((s) => ({ id: s.id, label: s.label })),
    alphabet: [...result.minimized.alphabet],
    startStateId: result.minimized.startStateId,
    finalStateIds: [...result.minimized.finalStateIds],
    transitions: result.minimized.transitions.map((t) => ({ ...t })),
    layout: result.minimized.states.map((s) => {
      const p = layout.positions.get(s.id) ?? { x: 100, y: 100 };
      return { stateId: s.id, x: Math.round(p.x), y: Math.round(p.y) };
    }),
  };
  return JSON.stringify(draft, null, 2);
}

function escapeMd(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

export function generateSolutionMarkdown(result: MinimizationResult): string {
  const origLabels = buildStateLabelMap(result.original.states);
  const minLabels = buildStateLabelMap(result.minimized.states);
  const L = (id: string) => escapeMd(origLabels.get(id) ?? id);
  const M = (id: string) => escapeMd(minLabels.get(id) ?? id);

  const lines: string[] = [];
  lines.push(`# ${escapeMd(result.original.name)} — Minimization Solution`);
  lines.push('');
  lines.push(`- **Method:** ${result.method === 'partition' ? 'Synchronous Partition Refinement' : 'Table-Filling (Myhill-Nerode Pair Marking)'}`);
  lines.push(`- **Alphabet (Σ):** \`{${result.original.alphabet.map(escapeMd).join(', ')}}\``);
  lines.push(`- **States:** ${result.metrics.originalCount} original → ${result.metrics.reachableCount} reachable → ${result.metrics.minimalCount} minimal`);
  lines.push(`- **Reduction:** ${result.metrics.unreachableRemoved} unreachable removed, ${result.metrics.equivalentStatesMerged} equivalent merged (${result.metrics.percentageReduction.toFixed(1)}%)`);
  lines.push(`- **Verification:** ${result.verification.equivalent && result.verification.allStatesReachable && result.verification.pairwiseDistinguishable ? 'Verified minimal DFA' : 'Verification failed'}`);
  lines.push('');

  // 1. Input table
  lines.push('## 1. Original Transition Table');
  lines.push('');
  const origDelta = buildTransitionMap(result.original);
  const origFinal = new Set(result.original.finalStateIds);
  lines.push(`| State | ${result.original.alphabet.map(escapeMd).join(' | ')} | Role |`);
  lines.push(`|---|${result.original.alphabet.map(() => '---').join('|')}|---|`);
  for (const s of result.original.states) {
    const row = origDelta.get(s.id)!;
    const roleParts: string[] = [];
    if (s.id === result.original.startStateId) roleParts.push('Start');
    if (origFinal.has(s.id)) roleParts.push('Final');
    if (roleParts.length === 0) roleParts.push('Non-final');
    const cells = result.original.alphabet.map((sym) => L(row.get(sym)!));
    lines.push(`| ${L(s.id)} | ${cells.join(' | ')} | ${roleParts.join(', ')} |`);
  }
  lines.push('');

  // 2. Reachability
  lines.push(`## 2. Reachability Analysis (from ${L(result.original.startStateId)})`);
  lines.push('');
  lines.push(`- **BFS Discovery Order:** ${result.reachability.discoveryOrder.map(L).join(' → ')}`);
  lines.push(`- **Reachable States:** \`{${result.reachability.reachableIds.map(L).join(', ')}}\``);
  lines.push(
    `- **Unreachable States Removed:** ${
      result.removed.length > 0 ? `\`{${result.removed.map(L).join(', ')}}\`` : 'None'
    }`,
  );
  lines.push('');
  lines.push('| Reachable State | Shortest Discovery String |');
  lines.push('|---|---|');
  for (const id of result.reachability.discoveryOrder) {
    const w = result.reachability.witnessStrings.get(id) ?? [];
    lines.push(`| ${L(id)} | \`${escapeMd(formatTokens(w))}\` |`);
  }
  lines.push('');

  // 3. Method Steps
  if (result.method === 'partition' && result.partitionResult) {
    const pr = result.partitionResult;
    lines.push('## 3. Synchronous Partition Refinement');
    lines.push('');
    lines.push(
      `**Initial Partition P0:** ${pr.initial.groups
        .map((g) => `${g.id} = {${g.members.map(L).join(', ')}}`)
        .join('; ')}`,
    );
    lines.push('');
    for (const r of pr.rounds) {
      lines.push(`### Round ${r.round} (against P${r.round - 1})`);
      lines.push('');
      lines.push(
        `| State | Group | ${result.reachable.alphabet.map((a) => `δ(q, ${escapeMd(a)})`).join(' | ')} | Signature |`,
      );
      lines.push(`|---|---|${result.reachable.alphabet.map(() => '---').join('|')}|---|`);
      for (const sig of r.signatures) {
        const dests = sig.entries.map((e) => `${L(e.targetStateId)} → ${e.targetGroupId}`);
        lines.push(
          `| ${L(sig.stateId)} | ${sig.sourceGroupId} | ${dests.join(' | ')} | (${sig.signatureTuple.join(', ')}) |`,
        );
      }
      lines.push('');
      lines.push(
        r.changed
          ? `**Result P${r.round}:** ${r.nextPartition.groups.map((g) => `${g.id} = {${g.members.map(L).join(', ')}}`).join('; ')}`
          : `**Result P${r.round}:** No group split. Partition is **stable**.`,
      );
      lines.push('');
    }
  } else if (result.method === 'table-filling' && result.pairResult) {
    const tf = result.pairResult;
    lines.push('## 3. Table-Filling (Distinguishable Pairs)');
    lines.push('');
    lines.push(
      `**Initialization (ε):** ${
        tf.initialMarked.length > 0
          ? tf.initialMarked.map((a) => `(${L(a.p)}, ${L(a.q)})`).join(', ')
          : 'None'
      }`,
    );
    lines.push('');
    lines.push('| Round | Newly Marked Pairs | Symbol | Witness |');
    lines.push('|---|---|---|---|');
    for (const r of tf.rounds) {
      if (r.additions.length === 0) {
        lines.push(`| ${r.round} | None (Stable) | — | — |`);
      } else {
        for (const add of r.additions) {
          lines.push(
            `| ${r.round} | (${L(add.p)}, ${L(add.q)}) | \`${escapeMd(add.symbol)}\` | \`${escapeMd(formatTokens(add.witness))}\` |`,
          );
        }
      }
    }
    lines.push('');
    lines.push(
      `**Equivalence Classes:** ${tf.classes.map((c) => `{${c.map(L).join(', ')}}`).join(', ')}`,
    );
    lines.push('');
  }

  // 4. State Mapping & Quotient Table
  lines.push('## 4. State Mapping & Minimized Quotient DFA');
  lines.push('');
  lines.push('| New State | Original Members | Role |');
  lines.push('|---|---|---|');
  for (const info of result.quotient.classInfos) {
    const roleParts: string[] = [];
    if (info.isStart) roleParts.push('Start');
    if (info.isFinal) roleParts.push('Final');
    if (roleParts.length === 0) roleParts.push('Non-final');
    lines.push(
      `| ${escapeMd(info.minimizedLabel)} | {${info.members.map(L).join(', ')}} | ${roleParts.join(', ')} |`,
    );
  }
  lines.push('');
  const minDelta = buildTransitionMap(result.minimized);
  const minFinal = new Set(result.minimized.finalStateIds);
  lines.push(`| State | ${result.minimized.alphabet.map(escapeMd).join(' | ')} | Role |`);
  lines.push(`|---|${result.minimized.alphabet.map(() => '---').join('|')}|---|`);
  for (const s of result.minimized.states) {
    const row = minDelta.get(s.id)!;
    const roleParts: string[] = [];
    if (s.id === result.minimized.startStateId) roleParts.push('Start');
    if (minFinal.has(s.id)) roleParts.push('Final');
    if (roleParts.length === 0) roleParts.push('Non-final');
    const cells = result.minimized.alphabet.map((sym) => M(row.get(sym)!));
    lines.push(`| ${M(s.id)} | ${cells.join(' | ')} | ${roleParts.join(', ')} |`);
  }
  lines.push('');

  // 5. Verification
  lines.push('## 5. Exact Verification');
  lines.push('');
  lines.push(`- **Language Equivalence (Product BFS):** ${result.verification.equivalent ? 'Passed' : 'Failed'} (${result.verification.visitedPairCount} reachable product pairs checked)`);
  lines.push(`- **All Output States Reachable:** ${result.verification.allStatesReachable ? 'Passed' : 'Failed'}`);
  lines.push(`- **Pairwise Distinguishable:** ${result.verification.pairwiseDistinguishable ? 'Passed' : 'Failed'} (${result.verification.distinguishedPairsCount}/${result.verification.totalOutputPairsCount} pairs distinguished)`);
  lines.push('');

  return lines.join('\n');
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function generateDiagramSvg(
  dfa: DFA,
  options: { background?: 'white' | 'transparent'; title?: string } = {},
): string {
  const layout = computeDeterministicLayout(dfa);
  const bg = options.background ?? 'white';
  const finalSet = new Set(dfa.finalStateIds);
  const markerId = 'dfa-export-arrow';

  // Group edges by (from, to)
  const grouped = new Map<string, { from: string; to: string; symbols: string[] }>();
  for (const t of dfa.transitions) {
    const key = `${JSON.stringify(t.from)}|${JSON.stringify(t.to)}`;
    let g = grouped.get(key);
    if (!g) {
      g = { from: t.from, to: t.to, symbols: [] };
      grouped.set(key, g);
    }
    g.symbols.push(t.symbol);
  }

  const edgePaths: string[] = [];
  const R = 26;

  for (const edge of grouped.values()) {
    const p1 = layout.positions.get(edge.from);
    const p2 = layout.positions.get(edge.to);
    if (!p1 || !p2) continue;
    const label = escapeXml(edge.symbols.join(', '));

    if (edge.from === edge.to) {
      const lx = p1.x;
      const ly = p1.y - R - 34;
      const pathD = `M ${p1.x - 10} ${p1.y - R + 2} C ${p1.x - 28} ${p1.y - R - 46}, ${p1.x + 28} ${p1.y - R - 46}, ${p1.x + 10} ${p1.y - R + 2}`;
      edgePaths.push(
        `<path d="${pathD}" fill="none" stroke="#344BC6" stroke-width="1.75" marker-end="url(#${markerId})" />`,
        `<rect x="${lx - label.length * 4 - 6}" y="${ly - 11}" width="${label.length * 8 + 12}" height="18" rx="4" fill="#FFFFFF" stroke="#DCE1E8" stroke-width="1" />`,
        `<text x="${lx}" y="${ly + 2}" text-anchor="middle" font-family="ui-monospace, monospace" font-size="12" fill="#171C27">${label}</text>`,
      );
      continue;
    }

    const reverseKey = `${JSON.stringify(edge.to)}|${JSON.stringify(edge.from)}`;
    const hasReverse = grouped.has(reverseKey);
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dist = Math.hypot(dx, dy) || 1;
    const ux = dx / dist;
    const uy = dy / dist;
    const nx = -uy;
    const ny = ux;
    const passesThroughOtherNode = Array.from(layout.positions.entries()).some(
      ([otherId, op]) => {
        if (otherId === edge.from || otherId === edge.to) return false;
        const t = ((op.x - p1.x) * dx + (op.y - p1.y) * dy) / (dist * dist);
        if (t <= 0.05 || t >= 0.95) return false;
        const projX = p1.x + t * dx;
        const projY = p1.y + t * dy;
        return Math.hypot(op.x - projX, op.y - projY) < R + 14;
      },
    );
    const skipArc = Math.min(115, Math.max(52, dist * 0.16));
    const curveOffset = passesThroughOtherNode ? (dx < 0 ? -skipArc : skipArc) : hasReverse ? 28 : 0;

    const midX = (p1.x + p2.x) / 2 + nx * curveOffset;
    const midY = (p1.y + p2.y) / 2 + ny * curveOffset;

    const startAngle = Math.atan2(midY - p1.y, midX - p1.x);
    const endAngle = Math.atan2(midY - p2.y, midX - p2.x);
    const sx = p1.x + Math.cos(startAngle) * R;
    const sy = p1.y + Math.sin(startAngle) * R;
    const ex = p2.x + Math.cos(endAngle) * (R + 3);
    const ey = p2.y + Math.sin(endAngle) * (R + 3);

    const ctrlX = (p1.x + p2.x) / 2 + nx * curveOffset * 1.6;
    const ctrlY = (p1.y + p2.y) / 2 + ny * curveOffset * 1.6;
    const pathD =
      curveOffset === 0
        ? `M ${sx.toFixed(1)} ${sy.toFixed(1)} L ${ex.toFixed(1)} ${ey.toFixed(1)}`
        : `M ${sx.toFixed(1)} ${sy.toFixed(1)} Q ${ctrlX.toFixed(1)} ${ctrlY.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`;

    const lx = curveOffset === 0 ? (sx + ex) / 2 + nx * 12 : 0.25 * sx + 0.5 * ctrlX + 0.25 * ex;
    const ly = curveOffset === 0 ? (sy + ey) / 2 + ny * 12 : 0.25 * sy + 0.5 * ctrlY + 0.25 * ey;

    edgePaths.push(
      `<path d="${pathD}" fill="none" stroke="#505B6B" stroke-width="1.75" marker-end="url(#${markerId})" />`,
      `<rect x="${(lx - label.length * 4 - 5).toFixed(1)}" y="${(ly - 10).toFixed(1)}" width="${label.length * 8 + 10}" height="18" rx="4" fill="#FFFFFF" fill-opacity="0.92" />`,
      `<text x="${lx.toFixed(1)}" y="${(ly + 3).toFixed(1)}" text-anchor="middle" font-family="ui-monospace, monospace" font-size="12" fill="#171C27">${label}</text>`,
    );
  }

  const nodeMarkup: string[] = [];
  for (const s of dfa.states) {
    const pos = layout.positions.get(s.id);
    if (!pos) continue;
    const isStart = s.id === dfa.startStateId;
    const isFinal = finalSet.has(s.id);
    if (isStart) {
      nodeMarkup.push(
        `<line x1="${pos.x - R - 34}" y1="${pos.y}" x2="${pos.x - R - 4}" y2="${pos.y}" stroke="#344BC6" stroke-width="2" marker-end="url(#${markerId})" />`,
      );
    }
    nodeMarkup.push(
      `<circle cx="${pos.x}" cy="${pos.y}" r="${R}" fill="#FFFFFF" stroke="#171C27" stroke-width="2" />`,
    );
    if (isFinal) {
      nodeMarkup.push(
        `<circle cx="${pos.x}" cy="${pos.y}" r="${R - 5}" fill="none" stroke="#171C27" stroke-width="1.6" />`,
      );
    }
    nodeMarkup.push(
      `<text x="${pos.x}" y="${pos.y + 5}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="14" font-weight="600" fill="#171C27">${escapeXml(s.label)}</text>`,
    );
  }

  const titleText = escapeXml(options.title ?? dfa.name);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${layout.width} ${layout.height}" width="${layout.width}" height="${layout.height}" role="img" aria-label="${titleText}">
  <title>${titleText}</title>
  <defs>
    <marker id="${markerId}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 1 1.5 L 9 5 L 1 8.5 z" fill="#505B6B" />
    </marker>
  </defs>
  ${bg === 'white' ? `<rect width="100%" height="100%" fill="#FFFFFF" />` : ''}
  ${edgePaths.join('\n  ')}
  ${nodeMarkup.join('\n  ')}
</svg>`;
}

export function triggerDownload(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
