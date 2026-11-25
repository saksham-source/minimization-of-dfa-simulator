# DFA Studio Verification Report

**Date:** 2026-11-26  
**Environment:** macOS (Apple Silicon), Node `v26.0.0`, npm `11.12.1`, Playwright `1.65.1` (Chromium `159.0.8154.6` & WebKit `27.2`)

## 1. Automated Command Results

| Check | Command | Outcome | Observed Summary |
|---|---|---|---|
| Lint | `npm run lint` | Passed (0 errors) | 0 errors, 1 fast-refresh hook export warning (`AppContext.tsx`) |
| Type check | `npm run typecheck` | Passed | `tsc --noEmit` exited with code 0 |
| Unit & Integration | `npm run test` | Passed (27/27) | `engine.test.ts` (20 passed), `generated.test.ts` (2 passed incl. 300 seeded DFAs + metamorphic tests), `app.test.tsx` (5 passed) |
| Production build | `npm run build` | Passed | `dist/index.html` 0.59 kB gzip; `index.css` 3.76 kB gzip; core JS (`index` + `router-vendor`) 163.19 kB gzip; lazy 3D chunk `three-vendor` 249.43 kB gzip |
| E2E & Accessibility | `npm run test:e2e` | Passed (10/10) | Chromium + WebKit across E01–E14, 320px/390px/1440px viewports, light & dark themes, `@axe-core/playwright` 0 violations |

## 2. Requirements-to-Tests Matrix

- **Validation & Sink Completion (§4.2, §7.5, §17.1):** `tests/unit/engine.test.ts`, `tests/e2e/app.spec.ts` (E03)
- **Reachability BFS & Removal (§4.3, §5.2):** `tests/unit/engine.test.ts`, `tests/unit/generated.test.ts`
- **Synchronous Partition Refinement (§4.4, §4.5, §5.3–5.6):** `tests/unit/engine.test.ts`, `tests/unit/generated.test.ts` (300 seeded DFAs + unary chain), `tests/e2e/app.spec.ts` (E01, E05)
- **Table-Filling & Witness Propagation (§4.7, §5.8, §9.1):** `tests/unit/engine.test.ts`, `tests/e2e/app.spec.ts` (E04)
- **Quotient Construction & Independent Verification (§4.6, §4.8, §4.9, §5.7):** `tests/unit/engine.test.ts`, `tests/unit/generated.test.ts`
- **String Testing Lab & Token Parsing (§7.4, §5.9, §10.2):** `tests/unit/engine.test.ts`, `tests/e2e/app.spec.ts` (E07)
- **Import / Export Round-Trip & Escaping (§16.2, §16.3):** `tests/integration/app.test.tsx`, `tests/e2e/app.spec.ts` (E08)
- **Persistence & Recovery (§16.1):** `tests/integration/app.test.tsx`, `tests/e2e/app.spec.ts` (E11)
- **Practice Mode (§9.2):** `tests/integration/app.test.tsx`, `tests/e2e/app.spec.ts` (E06)
- **3D Fallback, Reduced Motion, Responsive 320px, Keyboard & Dark Theme (§12.3, §13):** `tests/e2e/app.spec.ts` (E09, E10, E12, E14)

## 3. Known Limitations & Scope Notes

1. **Test environment storage polyfill:** Node v26 emits an `ExperimentalWarning` for `localStorage` without `--localstorage-file`; `tests/setup.ts` provides a standard in-memory `Storage` polyfill during jsdom unit/integration tests.
2. **Core solver execution:** Because DFA inputs are bounded to 1–24 states and 1–8 symbols, `minimize()` completes synchronously in well under 10 ms on desktop hardware without needing a separate Web Worker thread.
3. **Screen reader testing:** Automated `@axe-core/playwright` checks passed with 0 violations on landing (light & dark), simulator, and results views; manual VoiceOver/NVDA screen-reader walkthroughs were not run in this headless CLI environment.
4. **Firefox / 3D optional results view:** Playwright verified Chromium and WebKit; Firefox and the optional 3D results-comparison view were not included in this release.
