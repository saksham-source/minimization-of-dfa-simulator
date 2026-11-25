# DFA Studio User Guide

## Quick Walkthrough (First-Time Learner)
1. **Home (`/`):** Click **Run guided example** to load the 7-state → 4-state reference DFA, or inspect the interactive 3D/2D overview switch (`Original (7)` / `Minimized (4)`).
2. **Learn (`/learn`):** Work through the 8 interactive lesson cards starting with the Even-Number-of-Ones machine. Click any dotted underlined term for an inline glossary definition.
3. **Simulator (`/simulator`):**
   - **1. Build & Validate:** Edit states, alphabet symbols, start/final roles, and transitions in either the synchronized table or the interactive SVG graph (drag nodes to reposition; use **Connect** mode to draw transitions). Use **Complete with a sink state** if you have missing transitions.
   - **2. Step-by-step Simulate:** Step through Reachability, Partition Refinement (or Table-Filling), Quotient Construction, and Exact Verification using `Previous`, `Play/Pause`, `Next`, the timeline scrubber, or keyboard arrows (`←` / `→` / `Space`). Toggle **Concept** vs **Every operation** detail anytime without recomputing.
   - **3. Results & Verify:** Inspect the side-by-side Original vs Minimized graphs, state mapping, and independent verification checks. Test custom strings in lockstep in the **String testing lab**, compare state pairs in the **Distinguishing witness inspector**, or export `.md`, `.json`, `.svg`, or print-to-PDF.
4. **Practice (`/practice`):** Choose Beginner, Intermediate, Challenge, or your own DFA, and predict reachability, initial partitions, splits, distinguishing strings, table-filling marks, quotient transitions, and final counts with 3-tier hints.

## Local Development & Deployment
```bash
npm ci
npm run dev       # local dev server
npm run lint      # ESLint
npm run typecheck # strict TypeScript check
npm run test      # Vitest unit + integration tests
npm run build     # production bundle in dist/
npm run preview   # preview built dist/ locally
npm run test:e2e  # Playwright E2E + axe accessibility tests
```

For subpath deployments (e.g., GitHub Pages), build with `VITE_BASE_PATH=/your-repo/ npm run build` and configure your static host to rewrite unknown paths to `index.html`.
