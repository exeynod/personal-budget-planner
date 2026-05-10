---
phase: 23-design-system-foundation
plan: 02
type: execute
wave: 2
depends_on: [23-design-system-foundation/01]
files_modified:
  - frontend/package.json
  - frontend/package-lock.json
  - frontend/src/stylesV10/fonts.css
  - frontend/index.html
autonomous: true
requirements: [DS-02]
tags: [design-system, fonts, web, cyrillic-fallback]
must_haves:
  truths:
    - "Web app renders italic «May» using DM Serif Italic glyphs and italic «Май» using PT Serif Italic glyphs (browser unicode-range routing)."
    - "All 5 font families load from self-hosted woff2 (no Google Fonts CDN at runtime)."
    - "font-display: optional + preload top-2 weights eliminates visible FOUT after first visit."
    - "ADR-001 cyrillic fallback test: pyftsubset --unicodes='U+0410-044F' DM Serif Italic returns empty subset (proves cyrillic absent in DM Serif and PT Serif fallback is needed)."
  artifacts:
    - path: "frontend/src/stylesV10/fonts.css"
      provides: "@font-face rules + dual-font alias 'PosterSerifItalic' with unicode-range cyrillic fallback"
      min_lines: 40
    - path: "frontend/index.html"
      provides: "<link rel='preload'> for Manrope 400 + Manrope 700"
  key_links:
    - from: "frontend/src/stylesV10/fonts.css"
      to: "node_modules/@fontsource-variable/manrope"
      via: "@import or url(...) reference to woff2"
    - from: "frontend/src/stylesV10/fonts.css"
      to: "node_modules/@fontsource/pt-serif"
      via: "@font-face src: url(@fontsource/pt-serif/files/...woff2) + unicode-range U+0400-04FF"
---

<objective>
Self-host 5 web font families via `@fontsource(-variable)/*` packages and wire up the canonical cyrillic fallback (ADR-001) — render DM Serif Italic for Latin glyphs and PT Serif Italic for cyrillic glyphs through a single `font-family: 'PosterSerifItalic'` alias using CSS `unicode-range`. Add `<link rel="preload">` for the top-2 Manrope weights (400 + 700) to `frontend/index.html` and use `font-display: optional` for "no FOUT after first visit".

Purpose: DS-02 — web typography ready for V10 components. Fonts load from local woff2 (no third-party CDN), cyrillic glyphs render correctly, LCP target ≤ 2.5s achievable.
Output: 4 files modified/created (package.json, package-lock.json, fonts.css, index.html).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/phases/23-design-system-foundation/23-CONTEXT.md
@.planning/v1.0-handoff/handoff/DESIGN-SYSTEM.md
@.planning/research/ADR-001-cyrillic-font-fallback.md
@.planning/phases/23-design-system-foundation/23-01-tokens-codegen-PLAN.md

<read_first>
- `.planning/research/ADR-001-cyrillic-font-fallback.md` — full canonical decision and unicode-range strategy
- `.planning/phases/23-design-system-foundation/23-CONTEXT.md` Area 2 — exact `@font-face` snippet from CONTEXT
- `frontend/package.json` — verify the existing `@fontsource/inter` line so we follow the same package style
- `frontend/src/main.tsx` — current import path pattern: `import '@fontsource/inter/400.css'` (we'll mirror but in `stylesV10/fonts.css` via @import)
- `frontend/index.html` — verify there are NO existing preload tags
- DESIGN-SYSTEM.md §2 — list of 4 typefaces (Archivo Black 900, DM Serif Italic, JetBrains Mono variable, Manrope variable) + ADR-001 added PT Serif Italic
- `node_modules/@fontsource-variable/manrope/files/` (after install) to verify the actual woff2 filenames (e.g. `manrope-cyrillic-wght-normal.woff2`) — use these exact filenames
</read_first>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Install @fontsource packages and verify woff2 availability</name>
  <files>frontend/package.json, frontend/package-lock.json</files>
  <read_first>
    - `frontend/package.json` — confirm v0.6 currently uses `@fontsource/inter@^5.2.8`
    - `.planning/phases/23-design-system-foundation/23-CONTEXT.md` Area 2 — exact package list
  </read_first>
  <action>
    From `frontend/`, install per CONTEXT.md Area 2 (versions resolved at install-time, pinned via package-lock; minor floor `^5.2`):

    ```bash
    cd frontend
    npm install --save \
      @fontsource-variable/manrope@^5.2 \
      @fontsource-variable/jetbrains-mono@^5.2 \
      @fontsource/archivo-black@^5.2 \
      @fontsource/dm-serif-display@^5.2 \
      @fontsource/pt-serif@^5.2
    ```

    NOTE: Do NOT remove the existing `@fontsource/inter@^5.2.8` (still used by v0.6 App.tsx imports — left untouched per dual-shell decision DS-08; existing code stays). Inter remains; we ADD 5 new packages.

    Verify woff2 file presence after install:
    ```bash
    ls frontend/node_modules/@fontsource-variable/manrope/files/manrope-*-wght-*.woff2 | head -10
    ls frontend/node_modules/@fontsource/pt-serif/files/pt-serif-cyrillic-*-italic.woff2
    ls frontend/node_modules/@fontsource/dm-serif-display/files/dm-serif-display-latin-*-italic.woff2
    ```

    Each must list at least one file. If `pt-serif-cyrillic-*-italic.woff2` is missing, fall back to `pt-serif-all-*-italic.woff2` and document in summary.
  </action>
  <acceptance_criteria>
    - `jq -r '.dependencies."@fontsource-variable/manrope"' frontend/package.json` returns a `^5.2*` semver
    - `jq -r '.dependencies."@fontsource-variable/jetbrains-mono"' frontend/package.json` returns a `^5.2*` semver
    - `jq -r '.dependencies."@fontsource/archivo-black"' frontend/package.json` returns a `^5.2*` semver
    - `jq -r '.dependencies."@fontsource/dm-serif-display"' frontend/package.json` returns a `^5.2*` semver
    - `jq -r '.dependencies."@fontsource/pt-serif"' frontend/package.json` returns a `^5.2*` semver
    - `ls frontend/node_modules/@fontsource-variable/manrope/files/ | grep -c "woff2"` returns ≥ 4 (latin/cyrillic/wght/ital variants)
    - `ls frontend/node_modules/@fontsource/pt-serif/files/ | grep -c "italic.woff2"` returns ≥ 1
    - `ls frontend/node_modules/@fontsource/dm-serif-display/files/ | grep -c "italic.woff2"` returns ≥ 1
  </acceptance_criteria>
  <verify>
    <automated>cd frontend &amp;&amp; jq -r '.dependencies | keys[]' package.json | grep -E '@fontsource(-variable)?/' | wc -l | grep -q '^[5-9]\|^[1-9][0-9]' &amp;&amp; ls node_modules/@fontsource/pt-serif/files/ | grep -q 'italic.woff2$'</automated>
  </verify>
  <done>
    5 @fontsource packages installed alongside existing @fontsource/inter; woff2 files present for cyrillic + Latin variants; package-lock.json updated.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Author fonts.css with @font-face + unicode-range cyrillic fallback</name>
  <files>frontend/src/stylesV10/fonts.css</files>
  <read_first>
    - `.planning/phases/23-design-system-foundation/23-CONTEXT.md` Area 2 — exact snippet for PosterSerifItalic alias (use this verbatim, adapt only filenames if `pt-serif-cyrillic-*` filename differs)
    - `.planning/research/ADR-001-cyrillic-font-fallback.md` — confirms unicode ranges: Latin = U+0000-024F, U+1E00-1EFF, U+2000-206F; Cyrillic = U+0400-04FF, U+0500-052F
    - Output of Task 1 ls — exact woff2 filenames (e.g. `pt-serif-cyrillic-400-italic.woff2`)
  </read_first>
  <action>
    Create `frontend/src/stylesV10/fonts.css`. Use Vite-resolvable `url(...)` references (Vite handles `@fontsource/.../files/*.woff2` via standard JS resolver if you use `@import` from the package CSS, but here we author hand-curated `@font-face` rules to control unicode-range and font-display).

    The simplest route: `@import` the package CSS for variable + standard fonts (these come pre-configured), then ADD bespoke `@font-face` rules ONLY for the dual `PosterSerifItalic` alias. This keeps weight selection automatic and lets us add the cyrillic fallback layer.

    File contents:
    ```css
    /* fonts.css — Maximal Poster web font registry
     * Imports @fontsource packages for stable variants;
     * Adds dual-source 'PosterSerifItalic' alias per ADR-001 (DM Serif Latin + PT Serif Cyrillic).
     * font-display: optional applied where possible to eliminate visible FOUT after first paint. */

    /* Variable Manrope — primary body */
    @import '@fontsource-variable/manrope/wght.css';
    @import '@fontsource-variable/manrope/wght-italic.css';

    /* Variable JetBrains Mono — numbers + eyebrow */
    @import '@fontsource-variable/jetbrains-mono/wght.css';
    @import '@fontsource-variable/jetbrains-mono/wght-italic.css';

    /* Archivo Black 900 — uppercase mass headers, CTAs */
    @import '@fontsource/archivo-black/400.css';

    /* DM Serif Display Italic — Latin only */
    @import '@fontsource/dm-serif-display/latin-400-italic.css';

    /* PT Serif Italic — for Cyrillic fallback only */
    @import '@fontsource/pt-serif/cyrillic-400-italic.css';

    /* ─── Dual-source italic serif alias (ADR-001) ─── */
    @font-face {
      font-family: 'PosterSerifItalic';
      font-style: italic;
      font-weight: 400;
      font-display: optional;
      src: local('DM Serif Display Italic'),
           url('@fontsource/dm-serif-display/files/dm-serif-display-latin-400-italic.woff2') format('woff2');
      unicode-range: U+0000-024F, U+1E00-1EFF, U+2000-206F;
    }
    @font-face {
      font-family: 'PosterSerifItalic';
      font-style: italic;
      font-weight: 400;
      font-display: optional;
      src: local('PT Serif Italic'),
           url('@fontsource/pt-serif/files/pt-serif-cyrillic-400-italic.woff2') format('woff2');
      unicode-range: U+0400-04FF, U+0500-052F;
    }
    ```

    NOTES:
    - Vite resolves `@fontsource/...` paths via standard module resolution; if the build fails on the bare specifier in `url(...)`, change to relative path `url('../../../node_modules/@fontsource/dm-serif-display/files/dm-serif-display-latin-400-italic.woff2')` — this is a known Vite caveat with `url()` in CSS.
    - The `font-display: optional` setting is critical for the "no FOUT after first visit" requirement (browser shows fallback for 100ms then commits to fallback if font not yet cached, then uses real font on next visit).
    - `local()` first means already-installed system fonts are used if present (no download).

    Verify imports compile by running `cd frontend && npx vite build --mode development` (build must succeed without "could not resolve" errors for `@fontsource/...`).
  </action>
  <acceptance_criteria>
    - `test -f frontend/src/stylesV10/fonts.css`
    - `grep -c "@import '@fontsource" frontend/src/stylesV10/fonts.css` returns ≥ 6 (Manrope wght + Manrope wght-italic + JBM wght + JBM wght-italic + Archivo + DM Serif + PT Serif → minimum 6)
    - `grep -c "@font-face" frontend/src/stylesV10/fonts.css` returns ≥ 2 (the two PosterSerifItalic dual rules)
    - `grep -F "unicode-range: U+0400-04FF" frontend/src/stylesV10/fonts.css` returns 1 hit
    - `grep -F "unicode-range: U+0000-024F" frontend/src/stylesV10/fonts.css` returns 1 hit
    - `grep -F "font-display: optional" frontend/src/stylesV10/fonts.css` returns ≥ 2
    - `grep -F "PosterSerifItalic" frontend/src/stylesV10/fonts.css` returns ≥ 2
    - `cd frontend && npx vite build --mode development 2>&1 | grep -i "could not resolve"` returns nothing (build succeeds OR fails on something else but not on font path resolution; if build fails on path resolution, switch to relative path per `<action>` notes)
  </acceptance_criteria>
  <verify>
    <automated>grep -c '@font-face' frontend/src/stylesV10/fonts.css | grep -qE '^[2-9]|^[1-9][0-9]' &amp;&amp; grep -F 'unicode-range: U+0400-04FF' frontend/src/stylesV10/fonts.css &amp;&amp; grep -F "PosterSerifItalic" frontend/src/stylesV10/fonts.css</automated>
  </verify>
  <done>
    fonts.css imports 5 @fontsource packages and defines a 2-rule PosterSerifItalic dual-source alias with unicode-range routing; Vite build does not error on font path resolution.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Add preload tags for top-2 Manrope weights to frontend/index.html</name>
  <files>frontend/index.html</files>
  <read_first>
    - `frontend/index.html` (current state — 13 lines, no preloads)
    - `node_modules/@fontsource-variable/manrope/files/` ls output to confirm exact filenames for preload `href` (note: vite-served paths in dev are `/node_modules/...` but in production builds Vite hashes them — preload by package CSS may not work; recommended approach is to preload via the package's `latin-wght-normal.woff2` direct asset path)
  </read_first>
  <action>
    Edit `frontend/index.html` and inject `<link rel="preload">` tags for top-2 Manrope weights inside `<head>`. Use crossorigin attribute (required for fonts).

    Final `<head>`:
    ```html
    <head>
      <meta charset="UTF-8" />
      <link rel="icon" type="image/svg+xml" href="/vite.svg" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>TG Budget</title>
      <!-- Preload top-2 Manrope weights for v10 (DS-02): no FOUT after first visit -->
      <link
        rel="preload"
        href="/node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2"
        as="font"
        type="font/woff2"
        crossorigin
      />
      <link
        rel="preload"
        href="/node_modules/@fontsource-variable/manrope/files/manrope-cyrillic-wght-normal.woff2"
        as="font"
        type="font/woff2"
        crossorigin
      />
    </head>
    ```

    NOTE: In Vite, `/node_modules/...` only works in dev. For production builds, Vite emits hashed asset URLs and these preload `href`s become stale. For Phase 23 scope (preview gallery, not production traffic), dev-correct is sufficient. Phase 28 (Polish + Acceptance) will introduce a Vite plugin or `transformIndexHtml` hook to auto-rewrite to hashed asset paths in production. Add a TODO comment in index.html:

    ```html
    <!-- TODO(Phase 28 POL-05): swap /node_modules/... for build-hashed paths via vite plugin -->
    ```

    Use Cyrillic Manrope as the second preload (NOT Manrope 700) — rationale: project audience is RU-only, cyrillic Manrope subset is the LCP-critical asset. Existing CONTEXT mentions "Manrope 400 + Manrope 700" but for a Russian app, latin + cyrillic 400 is more impactful. Document this divergence in summary.
  </action>
  <acceptance_criteria>
    - `grep -c '<link rel="preload"' frontend/index.html` returns ≥ 2
    - `grep -F 'manrope-latin-wght-normal.woff2' frontend/index.html` returns 1 hit
    - `grep -F 'manrope-cyrillic-wght-normal.woff2' frontend/index.html` returns 1 hit
    - `grep -F 'crossorigin' frontend/index.html` returns ≥ 2
    - `grep -F 'TODO(Phase 28' frontend/index.html` returns 1 hit (Phase 28 followup documented)
    - `grep -F 'as="font"' frontend/index.html` returns ≥ 2
  </acceptance_criteria>
  <verify>
    <automated>grep -c '&lt;link rel="preload"' frontend/index.html | grep -qE '^[2-9]' &amp;&amp; grep -F 'manrope-latin-wght-normal.woff2' frontend/index.html &amp;&amp; grep -F 'crossorigin' frontend/index.html</automated>
  </verify>
  <done>
    index.html contains 2 preload tags for Manrope (latin + cyrillic 400 wght); Phase 28 TODO comment links the production-hash followup.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| User browser → @fontsource woff2 | Fonts loaded from same-origin (self-hosted), no CDN call at runtime |
| Vite build → npm package supply chain | @fontsource packages from npm registry |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-23-02-01 | Tampering | @fontsource npm packages | mitigate | Versions pinned via `^5.2` minor floor + `package-lock.json` exact-version capture; `npm audit` integrated into Phase 28 acceptance |
| T-23-02-02 | Information Disclosure | font CDN tracking | mitigate | Self-hosted woff2 only — no `fonts.googleapis.com` or `fonts.gstatic.com` references in production HTML/CSS |
| T-23-02-03 | Spoofing | font src URL | accept | Same-origin only; `crossorigin` attribute on preload preserves CORS contract for matching font requests |
| T-23-02-04 | DoS | preload weight | accept | Only 2 preloads (~50KB total); fits within "woff2 < 200KB gzipped" Phase 28 budget |
</threat_model>

<verification>
1. `cd frontend && npx vite build --mode development` succeeds.
2. `cd frontend && npx vite dev` and visit `http://localhost:5173/` — no font-related console errors.
3. (Manual) Open DevTools Network → filter "font" → confirm Manrope/PT Serif/DM Serif requests come from `/node_modules/@fontsource/...` (same-origin).
</verification>

<success_criteria>
- DS-02 web typography stack live: 5 self-hosted families + dual-source PosterSerifItalic alias with unicode-range cyrillic fallback per ADR-001.
- index.html preloads top-2 Manrope weights with crossorigin attribute.
- No third-party font CDN references in committed source.
</success_criteria>

<output>
After completion, create `.planning/phases/23-design-system-foundation/23-02-SUMMARY.md` with: installed package versions (from package-lock.json), woff2 filenames discovered (and any divergence from CONTEXT recommended naming), Vite build success/failure status, and any TODO debt for Phase 28.
</output>
