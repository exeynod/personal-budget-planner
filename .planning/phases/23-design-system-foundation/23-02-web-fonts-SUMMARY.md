---
phase: 23-design-system-foundation
plan: 02
subsystem: design-system / web typography
tags: [design-system, fonts, web, cyrillic-fallback, ds-02]
requirements: [DS-02]
dependency_graph:
  requires:
    - 23-design-system-foundation/01 (tokens.css with --poster-font-poster-serif-italic alias)
  provides:
    - "frontend/src/stylesV10/fonts.css — self-hosted woff2 registry + dual-source PosterSerifItalic alias"
    - "<link rel=preload> top-2 Manrope subsets in frontend/index.html"
  affects:
    - "Phase 23/04 (AppV10 + main.tsx wiring) — must @import './stylesV10/fonts.css'"
    - "Phase 28 POL-05 — vite plugin to rewrite /node_modules/... to hashed paths in prod"
tech_stack:
  added:
    - "@fontsource-variable/manrope ^5.2.8"
    - "@fontsource-variable/jetbrains-mono ^5.2.8"
    - "@fontsource/archivo-black ^5.2.8"
    - "@fontsource/dm-serif-display ^5.2.8"
    - "@fontsource/pt-serif ^5.2.8"
  patterns:
    - "CSS @font-face with unicode-range for dual-source font aliases"
    - "font-display: optional for FOUT-after-first-paint elimination"
    - "local() src first to prefer system-installed fonts"
key_files:
  created:
    - frontend/src/stylesV10/fonts.css
  modified:
    - frontend/package.json
    - frontend/package-lock.json
    - frontend/index.html
decisions:
  - "Drop the proposed @fontsource-variable/manrope/wght-italic.css import — package ships only wght axis (no italic axis published). Manrope italic not required by v10 components; PosterSerifItalic alias covers all italic accents."
  - "Preload latin + cyrillic 400 Manrope subsets (instead of latin 400 + 700) — RU-only audience makes cyrillic subset LCP-critical, and variable axis loads all weights from one woff2 per subset, so 700 needs no separate preload."
metrics:
  duration_seconds: ~121
  duration_human: "~2 min"
  tasks_completed: 3
  files_changed: 4
  commits: 3
  completed_date: "2026-05-10"
---

# Phase 23 Plan 02: Web Fonts Summary

DS-02 web typography stack live: 5 self-hosted woff2 families + dual-source `PosterSerifItalic` alias with cyrillic unicode-range fallback per ADR-001. Top-2 Manrope subsets preloaded in `index.html` for FOUT-free LCP.

## What Got Built

**Self-hosted font registry** (`frontend/src/stylesV10/fonts.css`, 65 lines):

- 6 `@import` rules pull woff2 from local `node_modules/@fontsource(-variable)/*`:
  - `@fontsource-variable/manrope/wght.css` — primary body, variable wght 200-800, latin + cyrillic auto-loaded
  - `@fontsource-variable/jetbrains-mono/wght.css` + `wght-italic.css` — numbers + eyebrow
  - `@fontsource/archivo-black/400.css` — uppercase mass headers, CTAs (font-weight 900 baked into the file)
  - `@fontsource/dm-serif-display/latin-400-italic.css` — Latin italic accents
  - `@fontsource/pt-serif/cyrillic-400-italic.css` — cyrillic italic fallback
- 2 `@font-face` rules define `PosterSerifItalic` alias — single name, browser routes glyphs by `unicode-range`:
  - Latin (`U+0000-024F, U+1E00-1EFF, U+2000-206F`) → DM Serif Display Italic
  - Cyrillic (`U+0400-04FF, U+0500-052F`) → PT Serif Italic
- `font-display: optional` on the alias — fallback for ~100ms, then real font on next visit (LCP-friendly)
- `local()` src first — prefers system-installed fonts, no download when available

**Preload tags** (`frontend/index.html`, +17 lines):

- `<link rel="preload" as="font" type="font/woff2" crossorigin>` for `manrope-latin-wght-normal.woff2`
- Same for `manrope-cyrillic-wght-normal.woff2`
- `TODO(Phase 28 POL-05)` comment marks the Vite-plugin debt for production-hashed paths

## Installed Package Versions (resolved from package-lock.json)

| Package | Resolved Version |
|---|---|
| `@fontsource-variable/manrope` | 5.2.8 |
| `@fontsource-variable/jetbrains-mono` | 5.2.8 |
| `@fontsource/archivo-black` | 5.2.8 |
| `@fontsource/dm-serif-display` | 5.2.8 |
| `@fontsource/pt-serif` | 5.2.8 |

`@fontsource/inter@5.2.8` retained (untouched) — used by v0.6 dual-shell main.tsx.

## woff2 Filenames Discovered (and Used)

PosterSerifItalic dual-source rules reference these exact filenames:

- `node_modules/@fontsource/dm-serif-display/files/dm-serif-display-latin-400-italic.woff2` (24.57 kB)
- `node_modules/@fontsource/pt-serif/files/pt-serif-cyrillic-400-italic.woff2` (25.42 kB)

Preload tags reference:

- `node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2`
- `node_modules/@fontsource-variable/manrope/files/manrope-cyrillic-wght-normal.woff2`

No divergence from CONTEXT recommended naming — fontsource ships exactly the canonical filenames.

## Vite Build Verification

Probed twice (build + revert pattern, no permanent main.tsx change committed in this plan):

1. Add `import './stylesV10/fonts.css';` to `main.tsx` → `npx vite build --mode development`
2. Build succeeded (`✓ built in 285-289ms`), all 5 new fontsource packages bundled to `dist/assets/`:
   - `dm-serif-display-latin-400-italic-DpcbibHm.woff2 — 24.57 kB`
   - `pt-serif-cyrillic-400-italic-Bicg0I0x.woff2 — 25.42 kB`
   - `manrope-cyrillic-wght-normal-*.woff2`, `manrope-latin-wght-normal-*.woff2`
   - `jetbrains-mono-{cyrillic,greek,latin,…}-wght-{normal,italic}-*.woff2`
   - `archivo-black-{latin,latin-ext}-400-normal-*.woff(2)`
3. Zero "could not resolve" errors for `@fontsource/...` bare specifiers in `@font-face src: url(...)`. Vite's standard module resolver handles them correctly without needing the relative-path fallback noted in PLAN action.
4. main.tsx restored — no v0.6 import surface modified by this plan (wiring deferred to plan 04).

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 3 - Blocking] Dropped `@fontsource-variable/manrope/wght-italic.css` import**

- **Found during:** Task 2 (post Task 1 install — listing package contents)
- **Issue:** Plan instructed `@import '@fontsource-variable/manrope/wght-italic.css';` but `node_modules/@fontsource-variable/manrope/` ships only `index.css` and `wght.css`. No italic axis published by `@fontsource-variable/manrope@5.2.8`.
- **Fix:** Removed the non-existent import. Manrope italic not required by v10 component spec — `<Mass italic>`, AI accents, and date-eyebrow accents all route through the `PosterSerifItalic` alias (DM Serif / PT Serif). If a future component needs Manrope italic, it can pull a static instance via `@fontsource/manrope/400-italic.css` from the non-variable package.
- **Files modified:** `frontend/src/stylesV10/fonts.css` (the import was never written)
- **Commit:** `fa3f149`

### Documented divergences (intentional, not bugs)

**2. Preload pair: latin + cyrillic 400 instead of latin 400 + latin 700**

- Plan §Area 2 said "Manrope 400 + Manrope 700"; Task 3 action notes recommend latin + cyrillic instead.
- Rationale: project audience is RU-only, cyrillic subset is LCP-critical. Variable axis means weight 700 already streams from the same woff2 per subset, so a separate 700 preload provides no win.
- **Commit:** `5e2fcf0` documents in commit message.

### Out-of-scope items deferred (NOT touched)

- `main.tsx` wiring (`import './stylesV10/fonts.css'`) — deferred to plan 04 (AppV10 entry).
- pyftsubset cyrillic smoke test from `must_haves.truths` — Phase 28 perf optimization, not Phase 23 scope.
- Vite plugin to rewrite `/node_modules/...` preload `href` to hashed asset paths — `TODO(Phase 28 POL-05)` filed in `index.html`.

## Acceptance Criteria Recheck

| Criterion | Status |
|---|---|
| `package.json` lists 5 new @fontsource packages | PASS — all 5 at `^5.2.8` |
| `frontend/src/stylesV10/fonts.css` exists | PASS |
| `grep -c "@font-face" fonts.css` ≥ 2 | PASS — 2 (PosterSerifItalic latin + cyrillic) |
| `grep -c "unicode-range" fonts.css` ≥ 1 | PASS — 2 |
| `index.html` contains `<link rel="preload"` for Manrope | PASS — 2 (latin + cyrillic) |
| `npm install` completes | PASS — `added 5 packages` (5 high-severity npm-audit advisories pre-existing in v0.6 deps, unrelated to this plan) |
| SUMMARY at `23-02-web-fonts-SUMMARY.md` | PASS — this file |
| DS-02 addressed | PASS |

## Commits

- `b5093d4` — chore(23-02): install @fontsource packages for Maximal Poster web typography
- `fa3f149` — feat(23-02): add fonts.css with @font-face + dual-source PosterSerifItalic alias
- `5e2fcf0` — feat(23-02): preload top-2 Manrope variable weights in index.html

## Self-Check: PASSED

- `frontend/src/stylesV10/fonts.css` — FOUND
- `frontend/index.html` (preload tags) — FOUND
- `frontend/package.json` (5 deps) — FOUND
- Commits `b5093d4`, `fa3f149`, `5e2fcf0` — FOUND in `git log --oneline`
