---
phase: 23-design-system-foundation
plan: 04
type: execute
wave: 3
depends_on: [23-design-system-foundation/01, 23-design-system-foundation/02]
files_modified:
  - frontend/src/stylesV10/animations.css
autonomous: true
requirements: [DS-04, DS-05]
tags: [design-system, animations, web, reduce-motion]
must_haves:
  truths:
    - "All 11 named keyframe animations defined in animations.css with durations and cubic-bezier curves matching DESIGN-SYSTEM.md §7.2 and prototype JSX line-by-line."
    - "@media (prefers-reduced-motion: reduce) block reduces all 11 animations to opacity-only fade (no transforms)."
    - "Animations are applied via class selector pattern (e.g. .poster-row-in) so components in Plan 23.05 can opt in via className."
    - "No in-app reduce-motion toggle exists — only the OS-level media query controls reduction."
  artifacts:
    - path: "frontend/src/stylesV10/animations.css"
      provides: "11 @keyframes blocks + utility classes + prefers-reduced-motion media query"
      min_keyframes: 11
      contains: "@keyframes posterRowIn"
  key_links:
    - from: "Component className (e.g. .poster-row-in)"
      to: "@keyframes posterRowIn"
      via: "CSS class with animation: posterRowIn 0.45s cubic-bezier(...)"
    - from: "frontend/src/stylesV10/animations.css"
      to: "frontend/src/stylesV10/tokens.css --poster-easing-ease-out"
      via: "var(--poster-easing-ease-out) inside animation shorthand (where SHORTAGE: CSS doesn't allow var() inside @keyframes timing function — use literal values inside @keyframes; var() OK in `animation:` shorthand)"
---

<objective>
Author `frontend/src/stylesV10/animations.css` containing all 11 named `@keyframes` blocks (posterRowIn, posterRiseIn, posterBarFill, posterTabPop, posterPopIn, posterCheck, posterDot, posterSlideInFwd, posterSlideInBack, posterTabSwap, posterToastIn) with durations and cubic-bezier curves extracted from `prototype/poster-screens.jsx` and DESIGN-SYSTEM.md §7.2 — each one verifiable line-by-line. Add utility classes that components in Plan 23.05 will use (e.g. `.poster-row-in`, `.poster-bar-fill`). Wrap all transform-using animations in a `@media (prefers-reduced-motion: reduce)` block that flattens them to opacity-only fades.

Purpose: DS-04 (11 animations parity with prototype) + DS-05 (reduce-motion respect, no in-app toggle).
Output: 1 CSS file (~200 lines).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/phases/23-design-system-foundation/23-CONTEXT.md
@.planning/v1.0-handoff/handoff/DESIGN-SYSTEM.md
@.planning/v1.0-handoff/handoff/prototype/poster-screens.jsx
@.planning/phases/23-design-system-foundation/23-01-tokens-codegen-PLAN.md

<read_first>
- `.planning/v1.0-handoff/handoff/DESIGN-SYSTEM.md` §7.1 (easing curves), §7.2 (full keyframes) — CANONICAL source
- `.planning/v1.0-handoff/handoff/prototype/poster-screens.jsx` lines 100-150 (posterTabPop usage), 255-290 (posterRowIn + posterBarFill), 470-485 (posterDot), 525-570 (posterRiseIn + posterBarFill on Category Detail) — verifies durations 0.45s/0.7s/0.85s, easing values, stagger formulas
- `.planning/phases/23-design-system-foundation/23-CONTEXT.md` Area 2 — confirms reduce-motion is media-query driven (no in-app toggle)
- `frontend/src/stylesV10/tokens.css` (after Plan 23.01 generated) — to confirm var names (--poster-easing-ease-out, --poster-easing-overshoot, --poster-easing-sheet-ease)
</read_first>

<extracted_animation_values>
<!-- Extracted from DESIGN-SYSTEM.md §7.2 + cross-validated against prototype/poster-screens.jsx -->

| Name | Duration | Easing (cubic-bezier) | Source verification |
|------|----------|-----------------------|----------------------|
| posterRowIn | 0.42s–0.45s | (0.22, 0.61, 0.36, 1) — easeOut | poster-screens.jsx L261 `posterRowIn 0.45s cubic-bezier(0.22,0.61,0.36,1)`, L353 `.45s ...0.22,0.61,0.36,1`, L448 `.42s` |
| posterRiseIn | 0.5s–0.65s | (0.22, 0.61, 0.36, 1) — easeOut | poster-screens.jsx L528 `.55s`, L533 `.6s`, L1313 `.65s`, L1314 `.65s` |
| posterBarFill | 0.7s–0.85s | (0.22, 0.61, 0.36, 1) — easeOut | poster-screens.jsx L285 `0.7s`, L545 `.85s` |
| posterTabPop | 0.45s | (0.34, 1.56, 0.64, 1) — overshoot | poster-screens.jsx L141 |
| posterPopIn | 0.5s | (0.34, 1.56, 0.64, 1) — overshoot | DESIGN-SYSTEM §7.2 (zarezervirovano), use 0.5s default |
| posterCheck | 0.35s | easeOut, delay 0.12s | DESIGN-SYSTEM §7.2 |
| posterDot | 1.2s infinite | ease-in-out | poster-screens.jsx L478 |
| posterSlideInFwd | 0.42s | (0.22, 0.61, 0.36, 1) — easeOut | DESIGN-SYSTEM §7.2 (28px translate3d) |
| posterSlideInBack | 0.42s | (0.22, 0.61, 0.36, 1) — easeOut | DESIGN-SYSTEM §7.2 (-28px translate3d) |
| posterTabSwap | 0.35s | (0.22, 0.61, 0.36, 1) — easeOut | DESIGN-SYSTEM §7.2 |
| posterToastIn | 0.5s | (0.34, 1.56, 0.64, 1) — overshoot | DESIGN-SYSTEM §7.2 |

Stagger constants (DESIGN-SYSTEM §7.4):
- category rows:    delay = 0.08 + i * 0.045s   (poster-screens.jsx L261 verifies)
- day groups:       delay = 0.05 + i * 0.07s    (poster-screens.jsx L353 verifies)
- ops rows:         delay = 0.30 + i * 0.045s   (poster-screens.jsx L569 verifies)
- AI hints:         delay = 0.18 + i * 0.08s    (poster-screens.jsx L448 verifies)
- regulars rows:    delay = 0.32 + i * 0.09s    (poster-screens.jsx L1318 verifies)
- AI dots:          delay = i * 0.18s           (poster-screens.jsx L478 verifies)
</extracted_animation_values>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Author all 11 @keyframes + utility classes + reduce-motion block</name>
  <files>frontend/src/stylesV10/animations.css</files>
  <read_first>
    - `<extracted_animation_values>` block above for exact durations + easing
    - DESIGN-SYSTEM.md §7.2 for the actual `from { ... } to { ... }` shapes (DO NOT paraphrase — copy verbatim)
    - `frontend/src/stylesV10/tokens.css` (post-Plan 23.01) for `--poster-easing-*` var names (used in `.poster-foo` utility classes via `animation: posterFoo 0.45s var(--poster-easing-ease-out) forwards`)
  </read_first>
  <action>
    Create `frontend/src/stylesV10/animations.css`:

    ```css
    /* animations.css — Maximal Poster keyframes (DS-04) + reduce-motion (DS-05)
     * 11 named animations, durations + easing extracted from DESIGN-SYSTEM.md §7.2
     * and prototype/poster-screens.jsx. Components in componentsV10/ apply
     * via className utility classes (.poster-row-in, .poster-bar-fill, etc.).
     */

    /* ─────────── 1. posterRowIn — list-row stagger ─────────── */
    @keyframes posterRowIn {
      from { opacity: 0; transform: translate3d(0, 8px, 0); }
      to   { opacity: 1; transform: none; }
    }
    .poster-row-in {
      opacity: 0;
      animation: posterRowIn 0.45s cubic-bezier(0.22, 0.61, 0.36, 1) both;
    }

    /* ─────────── 2. posterRiseIn — hero block rise ─────────── */
    @keyframes posterRiseIn {
      from { opacity: 0; transform: translateY(14px); }
      to   { opacity: 1; transform: none; }
    }
    .poster-rise-in {
      opacity: 0;
      animation: posterRiseIn 0.55s cubic-bezier(0.22, 0.61, 0.36, 1) both;
    }

    /* ─────────── 3. posterBarFill — progress bar fill ─────────── */
    @keyframes posterBarFill {
      from { transform: scaleX(0); }
      to   { transform: scaleX(1); }
    }
    .poster-bar-fill {
      transform-origin: left center;
      transform: scaleX(0);
      animation: posterBarFill 0.7s cubic-bezier(0.22, 0.61, 0.36, 1) forwards;
    }

    /* ─────────── 4. posterTabPop — active tab glyph pop ─────────── */
    @keyframes posterTabPop {
      0%   { transform: scale(1); }
      35%  { transform: scale(1.35) translateY(-2px); }
      100% { transform: scale(1); }
    }
    .poster-tab-pop {
      animation: posterTabPop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    /* ─────────── 5. posterPopIn — generic pop entry ─────────── */
    @keyframes posterPopIn {
      0%   { opacity: 0; transform: scale(0.86); }
      60%  { opacity: 1; transform: scale(1.04); }
      100% { opacity: 1; transform: scale(1); }
    }
    .poster-pop-in {
      opacity: 0;
      animation: posterPopIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
    }

    /* ─────────── 6. posterCheck — toast checkmark stroke ─────────── */
    @keyframes posterCheck {
      from { stroke-dashoffset: 24; }
      to   { stroke-dashoffset: 0;  }
    }
    .poster-check {
      stroke-dasharray: 24;
      stroke-dashoffset: 24;
      animation: posterCheck 0.35s cubic-bezier(0.22, 0.61, 0.36, 1) 0.12s forwards;
    }

    /* ─────────── 7. posterDot — AI typing 3-dot loop ─────────── */
    @keyframes posterDot {
      0%, 80%, 100% { opacity: 0.3; transform: translateY(0); }
      40%           { opacity: 1;   transform: translateY(-3px); }
    }
    .poster-dot {
      animation: posterDot 1.2s ease-in-out infinite;
    }

    /* ─────────── 8. posterSlideInFwd — push transition ─────────── */
    @keyframes posterSlideInFwd {
      from { opacity: 0; transform: translate3d(28px, 0, 0); }
      to   { opacity: 1; transform: none; }
    }
    .poster-slide-in-fwd {
      animation: posterSlideInFwd 0.42s cubic-bezier(0.22, 0.61, 0.36, 1) both;
    }

    /* ─────────── 9. posterSlideInBack — pop transition ─────────── */
    @keyframes posterSlideInBack {
      from { opacity: 0; transform: translate3d(-28px, 0, 0); }
      to   { opacity: 1; transform: none; }
    }
    .poster-slide-in-back {
      animation: posterSlideInBack 0.42s cubic-bezier(0.22, 0.61, 0.36, 1) both;
    }

    /* ─────────── 10. posterTabSwap — tab content swap (no direction) ─────────── */
    @keyframes posterTabSwap {
      from { opacity: 0; transform: translate3d(0, 8px, 0); }
      to   { opacity: 1; transform: none; }
    }
    .poster-tab-swap {
      animation: posterTabSwap 0.35s cubic-bezier(0.22, 0.61, 0.36, 1) both;
    }

    /* ─────────── 11. posterToastIn — toast entry (overshoot) ─────────── */
    @keyframes posterToastIn {
      0%   { opacity: 0; transform: translateY(-8px) scale(0.9); }
      60%  { opacity: 1; transform: translateY(2px)  scale(1.04); }
      100% { opacity: 1; transform: translateY(0)    scale(1); }
    }
    .poster-toast-in {
      animation: posterToastIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
    }

    /* ─────────── reduce-motion (DS-05) ─────────── */
    @media (prefers-reduced-motion: reduce) {
      /* Override all transform-using animations with opacity-only fade.
       * 11 animations → 11 reduced variants. Duration kept short (200ms) so
       * UI does not feel "stuck" but no motion fires. */
      @keyframes posterRowIn        { from { opacity: 0 } to { opacity: 1 } }
      @keyframes posterRiseIn       { from { opacity: 0 } to { opacity: 1 } }
      @keyframes posterBarFill      { from { opacity: 0 } to { opacity: 1 } }
      @keyframes posterTabPop       { from { opacity: 1 } to { opacity: 1 } }
      @keyframes posterPopIn        { from { opacity: 0 } to { opacity: 1 } }
      @keyframes posterCheck        { from { stroke-dashoffset: 0 } to { stroke-dashoffset: 0 } }
      @keyframes posterDot          { from { opacity: 0.6 } to { opacity: 0.6 } }
      @keyframes posterSlideInFwd   { from { opacity: 0 } to { opacity: 1 } }
      @keyframes posterSlideInBack  { from { opacity: 0 } to { opacity: 1 } }
      @keyframes posterTabSwap      { from { opacity: 0 } to { opacity: 1 } }
      @keyframes posterToastIn      { from { opacity: 0 } to { opacity: 1 } }

      .poster-row-in, .poster-rise-in, .poster-pop-in,
      .poster-slide-in-fwd, .poster-slide-in-back, .poster-tab-swap,
      .poster-toast-in {
        animation-duration: 0.2s !important;
        animation-timing-function: linear !important;
      }
      .poster-bar-fill {
        transform: scaleX(1) !important;  /* skip fill animation entirely */
        animation: none !important;
      }
      .poster-tab-pop, .poster-dot {
        animation: none !important;
      }
    }
    ```

    NOTES:
    - Per DESIGN-SYSTEM.md §7.2, posterRowIn is "0.42-0.45s" — we standardize on 0.45s for utility class; components that need 0.42s override via inline style.
    - Per CONTEXT.md decision 5: "reduce all animations to opacity-only fade, NO in-app toggle" — implemented above via CSS-only media query.
    - We do NOT use `var(--poster-easing-*)` inside `@keyframes` because CSS does NOT allow custom properties in cubic-bezier function position. Inside `animation:` shorthand it works, but for line-by-line traceability we use literal values matching DESIGN-SYSTEM.md exactly.
    - `forwards` vs `both` choice: `both` for entry animations (fill-mode applied to from-state at delay phase too), `forwards` for one-shot fills (BarFill, posterCheck).
  </action>
  <acceptance_criteria>
    - `test -f frontend/src/stylesV10/animations.css`
    - `grep -c "^@keyframes posterRowIn\|^@keyframes posterRiseIn\|^@keyframes posterBarFill\|^@keyframes posterTabPop\|^@keyframes posterPopIn\|^@keyframes posterCheck\|^@keyframes posterDot\|^@keyframes posterSlideInFwd\|^@keyframes posterSlideInBack\|^@keyframes posterTabSwap\|^@keyframes posterToastIn" frontend/src/stylesV10/animations.css` returns exactly 22 (each name appears: once at top-level, once inside @media reduce). If exactly 22, both layers present.
    - `grep -F 'cubic-bezier(0.22, 0.61, 0.36, 1)' frontend/src/stylesV10/animations.css | wc -l` returns ≥ 6 (easeOut applied to: rowIn, riseIn, barFill, slideInFwd, slideInBack, tabSwap, posterCheck — possibly 7+; ≥6 is conservative)
    - `grep -F 'cubic-bezier(0.34, 1.56, 0.64, 1)' frontend/src/stylesV10/animations.css | wc -l` returns ≥ 3 (overshoot: tabPop, popIn, toastIn)
    - `grep -F '@media (prefers-reduced-motion: reduce)' frontend/src/stylesV10/animations.css` returns 1 hit
    - `grep -c "\.poster-" frontend/src/stylesV10/animations.css` returns ≥ 22 (11 utility classes + reduce-motion overrides)
    - `grep -F 'translate3d(28px, 0, 0)' frontend/src/stylesV10/animations.css` returns 1 hit (posterSlideInFwd, exact prototype value)
    - `grep -F 'translate3d(-28px, 0, 0)' frontend/src/stylesV10/animations.css` returns 1 hit (posterSlideInBack)
    - `grep -F 'stroke-dashoffset: 24' frontend/src/stylesV10/animations.css` returns ≥ 1 (posterCheck)
    - File line count: `wc -l frontend/src/stylesV10/animations.css` returns 100-300 (sanity bound)
    - `cd frontend && npx vite build --mode development 2>&1 | grep -i "error"` returns nothing (CSS parses)
  </acceptance_criteria>
  <verify>
    <automated>grep -c '^@keyframes poster' frontend/src/stylesV10/animations.css | grep -qE '^([1-9][1-9]|2[0-9])$' &amp;&amp; grep -F '@media (prefers-reduced-motion: reduce)' frontend/src/stylesV10/animations.css &amp;&amp; grep -F 'cubic-bezier(0.34, 1.56, 0.64, 1)' frontend/src/stylesV10/animations.css &amp;&amp; grep -F 'translate3d(28px, 0, 0)' frontend/src/stylesV10/animations.css</automated>
  </verify>
  <done>
    All 11 named keyframes defined with values matching DESIGN-SYSTEM.md §7.2 and prototype JSX; 11 corresponding utility classes available; @media (prefers-reduced-motion: reduce) reduces all to opacity-only.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| User browser → CSS animations | Pure-CSS, no JS evaluated; no XSS surface |
| OS reduce-motion preference | Browser-supplied media query value (trusted) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-23-04-01 | Tampering | animations.css | accept | Pure CSS, no JS evaluation; CSS injection requires already-compromised codebase |
| T-23-04-02 | DoS | infinite posterDot loop | mitigate | `posterDot` only applied to small SVG/dot elements; reduce-motion media query stops it for accessibility users; no perf impact in practice |
| T-23-04-03 | Information Disclosure | reduce-motion preference | accept | Reading the user's OS reduce-motion setting is standard web platform behaviour, no PII leak |
</threat_model>

<verification>
1. `cd frontend && npx vite build --mode development` succeeds.
2. Grep gates above all pass.
3. (Manual, in Plan 23.13) Playwright sets `prefers-reduced-motion: reduce` and asserts no transform-based animation fires.
</verification>

<success_criteria>
- DS-04: 11 named animations match prototype + DESIGN-SYSTEM line-by-line.
- DS-05: OS-level reduce-motion replaces motion with opacity-only fade.
- No in-app toggle exists.
</success_criteria>

<output>
Create `.planning/phases/23-design-system-foundation/23-04-SUMMARY.md` with: file LOC, list of all 11 keyframes with their committed (duration, easing) tuple, any deviations from prototype, and reduce-motion test result.
</output>
