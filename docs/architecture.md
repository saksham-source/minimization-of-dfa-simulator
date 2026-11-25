# DFA Studio Architecture

## 1. Layering & Separation of Concerns

DFA Studio cleanly separates the pure mathematical core from presentation, persistence, and rendering:

- **`src/engine/` (Pure TypeScript, zero DOM/React/Three.js imports)**
  - Enforced by ESLint `no-restricted-imports` rule.
  - Runs in Node (Vitest) and browser identically.
  - Uses `Map` and `Set` keyed by opaque `StateId` / `SymbolToken` strings to prevent prototype-pollution issues (`__proto__`, `constructor`).
- **`src/store/` (Editor & Session State)**
  - `draftReducer.ts`: Immutable reducer with 50-entry semantic undo/redo history. Distinguishes `semanticRevision` (transitions, states, alphabet, start, finals) from `layoutRevision` (dragged node coordinates).
  - `AppContext.tsx`: Holds draft state, active method (`partition` | `table-filling`), deterministic `MinimizationResult`, playback cursor, user preferences, and practice progress. Persists bounded snapshots to `localStorage` under `dfa-studio:v1`.
- **`src/components/` & `src/features/` (UI & Visualizers)**
  - `DfaGraph.tsx`: Deterministic layered BFS layout (`src/lib/layout.ts`) rendered to accessible SVG with unique marker IDs per instance.
  - `StateNetworkExplorer.tsx`: Lazy-loaded Three.js + React Three Fiber scene (`StateNetworkCanvas.tsx`) isolated into its own Vite chunk (`three-vendor`), with WebGL detection, context-loss handling, reduced-motion compliance, and automatic 2D SVG fallback.
  - `DfaBuilder.tsx`, `SimulatorWorkspace.tsx`, `ResultsView.tsx`, `LearnPage.tsx`, `PracticePage.tsx`, `HelpPage.tsx`.

## 2. Routing & Static Deployment Tradeoff

The app uses `BrowserRouter` with `basename={import.meta.env.BASE_URL}` for clean shareable URLs (`/`, `/learn`, `/simulator`, `/practice`, `/help`). When deploying to a static host without SPA fallback rewrites (e.g., GitHub Pages without a `404.html` redirect), deep links on page reload would return 404 from the host; configuring an SPA rewrite rule (Netlify `_redirects`, Vercel `rewrites`, or GitHub Pages `404.html`) resolves this cleanly.
