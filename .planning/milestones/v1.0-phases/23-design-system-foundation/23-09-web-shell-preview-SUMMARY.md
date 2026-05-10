---
phase: 23-design-system-foundation
plan: 09
subsystem: web/dual-shell
tags: [design-system, web, dual-shell, preview, react, vite]
requirements_completed: [DS-08]
dependency_graph:
  requires:
    - 23-design-system-foundation/02 (web fonts: stylesV10/fonts.css with PosterSerifItalic)
    - 23-design-system-foundation/04 (web animations: stylesV10/animations.css with 11 keyframes)
    - 23-design-system-foundation/05 (web components: componentsV10 barrel)
  provides:
    - Dual-shell theme dispatcher in main.tsx (env > localStorage > default 'v10')
    - AppV10 root with /preview gating (DEV or ?preview=1)
    - PreviewApp gallery: 10 components + 11 animation triggers + ADR-001 proof
  affects:
    - frontend/src/main.tsx (was 37 lines, now 99; v0.6 path preserved exactly)
    - frontend/src/vite-env.d.ts (added ImportMetaEnv.VITE_UI_THEME typing)
tech-stack:
  added: []
  patterns:
    - "React.lazy + Suspense for code-splitting V10 surface from v0.6 bundle"
    - "URLSearchParams gate (?preview=1) for prod-reachable preview gallery"
    - "Whitelist-only localStorage validation (only literal 'v06'/'v10' accepted)"
    - "Animation re-trigger via key-bump (re-mount target element)"
key-files:
  created:
    - frontend/src/AppV10.tsx
    - frontend/src/AppV10.module.css
    - frontend/src/preview/PreviewApp.tsx
    - frontend/src/preview/PreviewApp.module.css
  modified:
    - frontend/src/main.tsx
    - frontend/src/vite-env.d.ts
decisions:
  - "lazy() + Suspense over require() — proper ESM-Vite idiom; 1.47kB AppV10 chunk + 9.27kB PreviewApp chunk emit separately from 195kB v0.6 App chunk"
  - "Defensive AppV10-import-failure fallback to v06 path (prevents white-screen during transition builds)"
  - "Single FAB on screen: TabBar embeds FAB internally; preview does NOT render second standalone FAB (per spec)"
  - "ADR-001 routing proof: side-by-side <Mass italic>May</Mass> + <Mass italic>Май</Mass> — visual diff between DM Serif Latin and PT Serif Cyrillic glyphs"
metrics:
  tasks_completed: 3
  files_created: 4
  files_modified: 2
  duration_minutes: ~15
  completed_at: 2026-05-10
---

# Phase 23 Plan 09: Web Dual-Shell + Preview Gallery Summary

Web dual-shell theme dispatcher (`VITE_UI_THEME` env → validated `localStorage['ui.theme']` → default `'v10'`) with lazy-imported `AppV10` root, gated `/preview` gallery rendering all 10 V10 components and 11 animation triggers, plus side-by-side ADR-001 cyrillic-routing proof.

## Theme Dispatch Logic (Task 1)

`frontend/src/main.tsx` resolution order:

1. **`import.meta.env.VITE_UI_THEME`** — build-time, trusted; controlled by CI/QA/prod config. Lower-cased and matched against literal `'v06'` / `'v10'`.
2. **`localStorage.getItem('ui.theme')`** — runtime, validated. **Only the exact strings `'v06'` or `'v10'` are accepted**; any other value (including injected XSS-style payloads, missing values, or empty strings) falls through to step 3. Wrapped in `try/catch` to tolerate private-mode storage exceptions.
3. **Default `'v10'`** — new installs land on the V10 poster shell.

**Branching:**

- `theme === 'v10'` → `import('./AppV10').then(...)` (lazy code-split). On import failure (e.g. transient build error), defensive fallback re-imports the v06 stack and renders `<App />` — prevents white-screen during transitional deploys.
- `theme === 'v06'` → original v0.6 path preserved byte-for-byte: `@fontsource/inter/{400,500,600,700}.css` + `./styles/tokens.css` + `./styles/glass.css` + `<App />` inside `<StrictMode>`.

`frontend/src/vite-env.d.ts` extended with `ImportMetaEnv.VITE_UI_THEME?: 'v06' | 'v10'` for typed env access.

## AppV10 Root + /preview Gating (Task 2)

`frontend/src/AppV10.tsx` decides surface in a single `useMemo`:

| Condition | Surface |
|-----------|---------|
| `import.meta.env.DEV === true` | preview (always available in dev) |
| `?preview=1` URL query (parsed via `URLSearchParams`) | preview (prod-reachable opt-in) |
| Otherwise | branded placeholder ("В разработке") |

The preview path wraps `PreviewApp` (`React.lazy(() => import('./preview/PreviewApp'))`) in `<Suspense>` with a Russian fallback ("Загрузка превью…").

The placeholder displays:
- Eyebrow `VOL.01 / V1.0 BOOT` in JetBrains Mono
- Title "В разработке." in `PosterSerifItalic` italic 88px (proves cyrillic routing works on placeholder too)
- Hint with `<code>?preview=1</code>` mono badge

`AppV10.module.css` uses `var(--poster-coral)` background + `var(--poster-paper)` foreground + `var(--poster-tracking-eye)` letter-spacing — all sourced from `stylesV10/tokens.css`.

## Preview Gallery (Task 3)

`frontend/src/preview/PreviewApp.tsx` renders 8 sections separated by hairline dividers:

| § | Content | Components used |
|---|---------|-----------------|
| 1 | ADR-001 cyrillic routing proof | `Mass italic` × 2 ("May" + "Май") |
| 2 | BigFig with count-up animation | `BigFig` (value 142380, sup ₽) |
| 3 | Plate × 5 tones | `Plate` × 5 (inverted, yellow, red, paper, dark) |
| 4 | PosterButton × 3 variants | `PosterButton` (primary, ghost, destructive) |
| 5 | Chip single-select group | `Chip` × 5 (ВСЕ, КАФЕ, ПРОДУКТЫ, ТРАНСПОРТ, ПОДПИСКИ) |
| 6 | PosterSlider (step=500, max=30000) | `PosterSlider` |
| 7 | 11 animation triggers | re-mount via key-bump for each keyframe |
| 8 | Toast (1700ms life) | `PosterButton` triggers `Toast` overlay |
| Fixed bottom | TabBar (dark mode) — embeds FAB internally | `TabBar` |

**11 animations covered** (each gets a clickable mono-styled trigger that re-mounts a yellow rectangle target via the `${name}-${animKey[name]}` key bump):
`poster-row-in`, `poster-rise-in`, `poster-bar-fill`, `poster-tab-pop`, `poster-pop-in`, `poster-check`, `poster-dot`, `poster-slide-in-fwd`, `poster-slide-in-back`, `poster-tab-swap`, `poster-toast-in`.

**Single FAB rule honored:** `TabBar` embeds its own FAB; the preview does **not** render a second standalone `FAB` instance.

**Eyebrow component** also imported (numbered section headers) — all 10 V10 components are exercised.

## ADR-001 Visual Confirmation (Manual)

Side-by-side `<Mass italic size={56}>May</Mass>` + `<Mass italic size={56}>Май</Mass>` in section 1. The browser uses `unicode-range` rules in the `PosterSerifItalic` `@font-face` declarations (from `stylesV10/fonts.css`):
- U+0000–024F (Latin) → DM Serif Display Italic
- U+0400–04FF (Cyrillic) → PT Serif Italic

Glyph routing must show distinct typeface metrics between "May" (DM Serif's high-contrast didone) and "Май" (PT Serif's transitional cyrillic). Manual verification deferred to dev surface (`vite dev` → `localhost:5173` with default v10 theme).

## Vite Build Status

`npx vite build --mode development` exited 0 (243 ms). Bundle output:

| Chunk | Size (gzip) | Notes |
|-------|-------------|-------|
| `index-*.js` | 197.26 kB (63.77 kB) | shared bootstrap (main.tsx + react + tg-sdk) |
| `App-*.js` | 195.03 kB (52.45 kB) | v0.6 chunk — only loaded when theme=v06 |
| `AppV10-*.js` | 1.47 kB (0.74 kB) | V10 root — lazy-loaded when theme=v10 |
| `PreviewApp-*.js` | 9.27 kB (3.66 kB) | gallery — lazy-loaded only when surface=preview |
| `AppV10-*.css` | 21.52 kB (9.42 kB) | tokens + fonts + animations + AppV10.module |
| `PreviewApp-*.css` | 6.55 kB (1.82 kB) | preview gallery styles |

The lazy-import design isolates the 195 kB v0.6 chunk from the V10 path completely — V10 users never download `App-*.js`.

## TypeScript Strict Check

`npx tsc --noEmit -p tsconfig.app.json` → exit 0, zero errors across all 5 modified/created files.

## Acceptance Criteria

- [x] `frontend/src/main.tsx` modified with `VITE_UI_THEME` + `localStorage` + default-`'v10'` dispatch (4 occurrences of `VITE_UI_THEME|ui.theme`)
- [x] `frontend/src/AppV10.tsx` exists with `lazy(() => import('./preview/PreviewApp'))`, `import.meta.env.DEV` check, and `?preview=1` query gate
- [x] `frontend/src/preview/PreviewApp.tsx` exists rendering all 10 components + 11 animation triggers
- [x] `<Mass italic>May</Mass>` and `<Mass italic>Май</Mass>` both present (ADR-001 proof — 3 `<Mass italic` occurrences total)
- [x] All 11 animation names string-literal-referenced (`grep -c "'poster-"` returns 11)
- [x] `vite build --mode development` succeeds (243 ms, 0 errors)
- [x] `tsc --noEmit -p tsconfig.app.json` passes (0 errors)
- [x] Validation gate present: `raw === 'v06' || raw === 'v10'` (T-23-09-01 mitigation)
- [x] V0.6 path preserved exactly (Inter fonts + tokens.css + glass.css + StrictMode)
- [x] DS-08 web side complete

## Threat Model Compliance

| Threat ID | Disposition | Implementation |
|-----------|-------------|----------------|
| T-23-09-01 (localStorage tampering) | mitigated | Whitelist comparison `raw === 'v06' || raw === 'v10'`; no `eval`/`innerHTML`/`new Function` on the value; try/catch on read |
| T-23-09-02 (?preview=1 query) | accepted | Consumed via `URLSearchParams.get()`; never rendered; gates only React component selection |
| T-23-09-03 (PreviewApp XSS) | mitigated | All children via React (auto-escaped); no `dangerouslySetInnerHTML`; static literal strings |
| T-23-09-04 (info disclosure) | accepted | Public design content (palette, fonts, sample categories); no PII or secrets |
| T-23-09-05 (animation spam DoS) | accepted | Key-bump re-mount is bounded; React batches state updates |

No new threat surface introduced beyond the registered items.

## Deviations from Plan

None. The plan's "use the second (lazy + Suspense) version" instruction was followed — the `require()` draft was discarded as instructed.

The orchestrator-level acceptance criterion `grep -c "VITE_UI_THEME\|ui.theme" frontend/src/main.tsx ≥ 2` resolves to 4, exceeding both individual plan-task counts (env mention + ui.theme literal storage-key in two contexts).

## Commits

| Task | Hash | Description |
|------|------|-------------|
| Task 1 | `36f7958` | feat(23-09): add VITE_UI_THEME dispatcher to main.tsx |
| Task 2 | `adb42cc` | feat(23-09): add AppV10 root with /preview gating |
| Task 3 | `2d8f951` | feat(23-09): add PreviewApp gallery (10 components + 11 animations) |

## Self-Check: PASSED

- Files exist (verified via Write tool success):
  - frontend/src/main.tsx (modified)
  - frontend/src/vite-env.d.ts (modified)
  - frontend/src/AppV10.tsx (created)
  - frontend/src/AppV10.module.css (created)
  - frontend/src/preview/PreviewApp.tsx (created)
  - frontend/src/preview/PreviewApp.module.css (created)
- All 3 commits present on branch v1.0-maximal-poster (36f7958, adb42cc, 2d8f951)
- Vite build exit 0; tsc strict exit 0
- All grep acceptance criteria pass with margin
