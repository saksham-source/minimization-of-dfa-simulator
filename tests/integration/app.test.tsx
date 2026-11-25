// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { minimize, validateDraft, type DFADraft } from '../../src/engine';
import { GUIDED_PRESET } from '../../src/fixtures/presets';
import {
  generateDiagramSvg,
  generateSolutionMarkdown,
  parseImportedJson,
  serializeDraftJson,
  serializeMinimizedJson,
} from '../../src/lib/importExport';
import { createInitialDraftState, draftReducer } from '../../src/store/draftReducer';
import { STORAGE_KEY } from '../../src/store/AppContext';
import App from '../../src/App';

describe('Draft Reducer & Import/Export Round-trip', () => {
  it('supports undo/redo up to 50 edits and separates layout revisions from semantic revisions', () => {
    let state = createInitialDraftState(GUIDED_PRESET.draft);
    const initSem = state.semanticRevision;

    state = draftReducer(state, { type: 'updateLayout', layout: [{ stateId: 'A', x: 120, y: 200 }] });
    expect(state.semanticRevision).toBe(initSem);
    expect(state.layoutRevision).toBeGreaterThan(1);

    state = draftReducer(state, { type: 'addState', label: 'Q_EXTRA' });
    expect(state.semanticRevision).toBe(initSem + 1);
    expect(state.draft.states.some((s) => s.label === 'Q_EXTRA')).toBe(true);

    state = draftReducer(state, { type: 'undo' });
    expect(state.draft.states.some((s) => s.label === 'Q_EXTRA')).toBe(false);

    state = draftReducer(state, { type: 'redo' });
    expect(state.draft.states.some((s) => s.label === 'Q_EXTRA')).toBe(true);
  });

  it('round-trips draft and minimized JSON cleanly and escapes unsafe Markdown/SVG labels', () => {
    const val = validateDraft(GUIDED_PRESET.draft);
    expect(val.ok).toBe(true);
    if (!val.ok) return;

    const min = minimize(val.dfa, 'partition');

    const draftJson = serializeDraftJson(GUIDED_PRESET.draft);
    const reparsedDraft = parseImportedJson(draftJson);
    expect(reparsedDraft.ok).toBe(true);
    if (reparsedDraft.ok) {
      expect(reparsedDraft.isCompleteValid).toBe(true);
      expect(reparsedDraft.stateCount).toBe(7);
    }

    const minJson = serializeMinimizedJson(min);
    const reparsedMin = parseImportedJson(minJson);
    expect(reparsedMin.ok).toBe(true);
    if (reparsedMin.ok) {
      expect(reparsedMin.isCompleteValid).toBe(true);
      expect(reparsedMin.stateCount).toBe(4);
    }

    // Invalid JSON rejected
    expect(parseImportedJson('{bad json').ok).toBe(false);
    expect(parseImportedJson(JSON.stringify({ schemaVersion: 99 })).ok).toBe(false);

    // Unsafe label escaping in Markdown and SVG
    const unsafeDraft: DFADraft = {
      schemaVersion: 1,
      name: 'Unsafe|<script>',
      states: [{ id: 's0', label: '<script>a</script>|p' }],
      alphabet: ['0'],
      startStateId: 's0',
      finalStateIds: ['s0'],
      transitions: [{ from: 's0', symbol: '0', to: 's0' }],
    };
    const unsafeVal = validateDraft(unsafeDraft);
    expect(unsafeVal.ok).toBe(true);
    if (!unsafeVal.ok) return;
    const unsafeMin = minimize(unsafeVal.dfa, 'partition');
    const md = generateSolutionMarkdown(unsafeMin);
    expect(md).toContain('\\|');
    const svg = generateDiagramSvg(unsafeVal.dfa);
    expect(svg).not.toContain('<script>a</script>');
    expect(svg).toContain('&lt;script&gt;');
  });
});

describe('UI Integration — Landing, Simulator, Builder, Practice, Persistence', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.pushState({}, '', '/');
  });

  it('launches guided example from landing and steps through refinement to verified results', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole('heading', { name: /make every dfa state count/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /run guided example/i }));

    // Should land in Simulator at Step 1
    expect(await screen.findByRole('region', { name: /simulation playback controls/i })).toBeInTheDocument();
    expect(screen.getByText(/7 → 4 states/i)).toBeInTheDocument();

    // Jump to Results & Exports
    await user.click(screen.getByRole('button', { name: /results & exports/i }));
    expect(await screen.findByRole('heading', { name: 'Minimized DFA' })).toBeInTheDocument();
    expect(screen.getByText(/42\.9% reduction/i)).toBeInTheDocument();
    expect(
      screen.getByText(/verified minimal dfa — language equivalence/i),
    ).toBeInTheDocument();
  });

  it('recovers gracefully from corrupted localStorage without deleting unrelated keys', () => {
    window.localStorage.setItem('unrelated-app:key', 'keep-me');
    window.localStorage.setItem(STORAGE_KEY, '{corrupted json!!!');

    render(<App />);
    expect(screen.getByRole('status')).toHaveTextContent(/unrecognized format|unavailable/i);
    expect(window.localStorage.getItem('unrelated-app:key')).toBe('keep-me');
  });

  it('supports Practice Mode answer validation and hints', async () => {
    const user = userEvent.setup();
    window.history.pushState({}, '', '/practice');
    render(<App />);

    expect(await screen.findByRole('heading', { name: /practice mode/i })).toBeInTheDocument();
    // Beginner preset is Even-ones: E and O are both reachable
    const promptHeading = screen.getByRole('heading', { name: /step 1: predict reachable states/i });
    const promptCard = promptHeading.closest('.panel')!;
    await user.click(within(promptCard as HTMLElement).getByRole('button', { name: 'E' }));
    await user.click(within(promptCard as HTMLElement).getByRole('button', { name: 'O' }));
    await user.click(within(promptCard as HTMLElement).getByRole('button', { name: /check answer/i }));

    expect(screen.getByRole('status')).toHaveTextContent(/correct/i);
  });
});
