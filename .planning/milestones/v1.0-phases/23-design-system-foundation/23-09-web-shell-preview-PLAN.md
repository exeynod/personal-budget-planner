---
phase: 23-design-system-foundation
plan: 09
type: execute
wave: 5
depends_on: [23-design-system-foundation/02, 23-design-system-foundation/04, 23-design-system-foundation/05]
files_modified:
  - frontend/src/main.tsx
  - frontend/src/AppV10.tsx
  - frontend/src/AppV10.module.css
  - frontend/src/preview/PreviewApp.tsx
  - frontend/src/preview/PreviewApp.module.css
autonomous: true
requirements: [DS-08]
tags: [design-system, web, dual-shell, preview, react]
must_haves:
  truths:
    - "main.tsx evaluates `VITE_UI_THEME` env var FIRST, then `localStorage.getItem('ui.theme')`, defaults to 'v10' for new users."
    - "If theme==='v10', main.tsx lazy-imports AppV10 — no AppV10 code in bundle when v06 is active."
    - "AppV10 imports tokens.css + fonts.css + animations.css and exposes `/preview` route gated by import.meta.env.DEV OR `?preview=1`."
    - "PreviewApp renders all 10 components (Eyebrow, Mass, BigFig, Plate, PosterButton×3 variants, Chip, PosterSlider, TabBar, FAB, Toast) AND 11 animation triggers (each animation has a button that re-mounts a target element)."
    - "PreviewApp displays italic «Май» (DM Serif latin → PT Serif cyrillic via PosterSerifItalic alias) — visual proof of ADR-001 routing."
    - "localStorage value validation: only 'v06' or 'v10' accepted; any other value falls back to 'v10' default (security gate)."
  artifacts:
    - path: "frontend/src/main.tsx"
      provides: "Theme dispatcher: lazy-imports AppV10 vs renders App"
    - path: "frontend/src/AppV10.tsx"
      provides: "V10 root — mounts PreviewApp at /preview, otherwise empty placeholder until Phase 24+"
    - path: "frontend/src/preview/PreviewApp.tsx"
      provides: "Component + animation gallery"
  key_links:
    - from: "frontend/src/main.tsx"
      to: "frontend/src/AppV10.tsx"
      via: "import('./AppV10') (lazy)"
    - from: "frontend/src/AppV10.tsx"
      to: "frontend/src/preview/PreviewApp.tsx"
      via: "?preview=1 query param check"
    - from: "frontend/src/AppV10.tsx"
      to: "frontend/src/stylesV10/{tokens,fonts,animations}.css"
      via: "import statements"
    - from: "frontend/src/preview/PreviewApp.tsx"
      to: "frontend/src/componentsV10/index.ts"
      via: "import { Eyebrow, Mass, ... } from '../componentsV10'"
---

<objective>
Implement web dual-shell flag + V10 preview surface (DS-08 web side):
1. Modify `frontend/src/main.tsx` to evaluate theme via `VITE_UI_THEME` env → `localStorage.getItem('ui.theme')` → default `'v10'`. Validate localStorage value (only `'v06'` or `'v10'` allowed). Lazy-import `AppV10` if `'v10'`; render existing `App` if `'v06'` (no changes to v0.6 code path).
2. Create `frontend/src/AppV10.tsx` — imports stylesV10 (tokens/fonts/animations.css) + decides based on `?preview=1` query OR `import.meta.env.DEV` whether to render the PreviewApp gallery; otherwise renders a minimal placeholder («V1.0 ещё в разработке»).
3. Create `frontend/src/preview/PreviewApp.tsx` — gallery of all 10 components in their visual states + 11 animation triggers (each animation has a button that re-mounts a demonstrating element using a key bump trick).
4. Display italic «Май» AND italic «May» side-by-side using `<Mass italic>` to visually verify ADR-001 cyrillic glyph routing.

Purpose: DS-08 web — `localStorage.setItem('ui.theme', 'v10')` reload renders AppV10; `/preview?preview=1` renders gallery accessible in dev or via query param.
Output: 5 files (main.tsx modified, AppV10.tsx new, AppV10.module.css new, PreviewApp.tsx new, PreviewApp.module.css new).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/phases/23-design-system-foundation/23-CONTEXT.md
@.planning/phases/23-design-system-foundation/23-05-web-components-PLAN.md

<read_first>
- `frontend/src/main.tsx` (current state lines 1-37)
- `frontend/src/App.tsx` (existing v0.6 root — DO NOT modify)
- `.planning/phases/23-design-system-foundation/23-CONTEXT.md` Area 4 (theme flag plumbing)
- `.planning/phases/23-design-system-foundation/23-05-web-components-PLAN.md` <symmetric_api_contract> (component prop signatures)
- `frontend/src/componentsV10/index.ts` (post-Plan 23.05) — confirms barrel exports
- `frontend/src/stylesV10/{tokens,fonts,animations}.css` (post-Plans 23.01, 23.02, 23.04)
</read_first>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Modify main.tsx with theme dispatcher and localStorage validation</name>
  <files>frontend/src/main.tsx</files>
  <read_first>
    - `frontend/src/main.tsx` current full state (37 lines)
    - CONTEXT.md Area 4: `themeEnv ?? themeLocal ?? 'v10'`
  </read_first>
  <behavior>
    - Test 1: `VITE_UI_THEME=v10` env wins over localStorage → AppV10 lazy-imported.
    - Test 2: No env, `localStorage.getItem('ui.theme') === 'v10'` → AppV10 lazy-imported.
    - Test 3: No env, no localStorage → default `'v10'` → AppV10 lazy-imported.
    - Test 4: localStorage has invalid value e.g. `'<script>'` or `'foo'` → falls back to `'v10'` (security gate, prevents tampering).
    - Test 5: `localStorage.setItem('ui.theme', 'v06')` → renders existing App (v0.6 untouched).
  </behavior>
  <action>
    Replace `frontend/src/main.tsx` with:
    ```tsx
    import { StrictMode } from 'react';
    import { createRoot } from 'react-dom/client';
    import { init } from '@telegram-apps/sdk-react';
    import { setupSafeArea } from './utils/safeArea';

    // Telegram SDK init (preserved from v0.6)
    try { init(); } catch { /* outside Telegram, fall through */ }
    if (typeof window !== 'undefined' && window.Telegram?.WebApp?.ready) {
      window.Telegram.WebApp.ready();
    }
    setupSafeArea();

    // ─── DS-08: dual-shell theme dispatcher ───
    type Theme = 'v06' | 'v10';
    function readTheme(): Theme {
      // Env wins (CI/QA/prod-config) — typed via vite-env.d.ts
      const envTheme = (import.meta.env.VITE_UI_THEME as string | undefined)?.toLowerCase();
      if (envTheme === 'v06' || envTheme === 'v10') return envTheme;

      // localStorage fallback — VALIDATED to prevent tampering
      try {
        const raw = localStorage.getItem('ui.theme');
        if (raw === 'v06' || raw === 'v10') return raw;
      } catch { /* localStorage may throw in private mode */ }

      // Default for new installs
      return 'v10';
    }

    const root = createRoot(document.getElementById('root')!);
    const theme = readTheme();

    if (theme === 'v10') {
      // Lazy-import V10 shell — keeps v0.6 bundle untouched when theme=v06
      import('./AppV10').then(({ default: AppV10 }) => {
        root.render(
          <StrictMode>
            <AppV10 />
          </StrictMode>,
        );
      }).catch((e) => {
        // Fallback to v06 if AppV10 import fails (e.g. build error during transition)
        console.error('[main] AppV10 import failed, falling back to v06:', e);
        import('./App').then(({ default: App }) => {
          // Inter font preserved here since legacy App imports it
          import('@fontsource/inter/400.css');
          root.render(<StrictMode><App /></StrictMode>);
        });
      });
    } else {
      // v06 path — preserved exactly from previous main.tsx
      Promise.all([
        import('@fontsource/inter/400.css'),
        import('@fontsource/inter/500.css'),
        import('@fontsource/inter/600.css'),
        import('@fontsource/inter/700.css'),
        import('./App'),
        import('./styles/tokens.css'),
        import('./styles/glass.css'),
      ]).then(([_, __, ___, ____, AppMod]) => {
        const App = AppMod.default;
        root.render(
          <StrictMode>
            <App />
          </StrictMode>,
        );
      });
    }
    ```

    Add a typed env declaration to `frontend/src/vite-env.d.ts`:
    ```ts
    /// <reference types="vite/client" />

    interface ImportMetaEnv {
      readonly VITE_UI_THEME?: 'v06' | 'v10';
    }

    interface ImportMeta {
      readonly env: ImportMetaEnv;
    }
    ```
  </action>
  <acceptance_criteria>
    - `grep -F "VITE_UI_THEME" frontend/src/main.tsx` returns ≥ 1
    - `grep -F "localStorage.getItem('ui.theme')" frontend/src/main.tsx` returns 1
    - `grep -F "raw === 'v06' || raw === 'v10'" frontend/src/main.tsx` returns 1 (validation gate)
    - `grep -F "import('./AppV10')" frontend/src/main.tsx` returns ≥ 1
    - `grep -F "type Theme = 'v06' | 'v10'" frontend/src/main.tsx` returns 1
    - `grep -F "VITE_UI_THEME" frontend/src/vite-env.d.ts` returns 1
    - typecheck: `cd frontend && npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -v node_modules | grep "error TS"` returns nothing
  </acceptance_criteria>
  <verify>
    <automated>cd frontend &amp;&amp; grep -F 'VITE_UI_THEME' src/main.tsx &amp;&amp; grep -F "import('./AppV10')" src/main.tsx &amp;&amp; grep -F "raw === 'v06' || raw === 'v10'" src/main.tsx &amp;&amp; npx tsc --noEmit -p tsconfig.app.json 2&gt;&amp;1 | { ! grep -E "error TS" | grep -v node_modules; }</automated>
  </verify>
  <done>
    main.tsx implements env > localStorage > default 'v10' dispatch with tampering-resistant validation; lazy import for AppV10; v06 path untouched.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Create AppV10.tsx + AppV10.module.css with /preview gating</name>
  <files>
    frontend/src/AppV10.tsx,
    frontend/src/AppV10.module.css
  </files>
  <read_first>
    - CONTEXT.md Area 2 — preview surface gated by `import.meta.env.DEV` OR `?preview=1`
    - `frontend/src/stylesV10/*.css` paths
  </read_first>
  <action>
    Create `frontend/src/AppV10.tsx`:
    ```tsx
    import { useMemo } from 'react';
    import './stylesV10/tokens.css';
    import './stylesV10/fonts.css';
    import './stylesV10/animations.css';
    import styles from './AppV10.module.css';

    export default function AppV10() {
      const surface = useMemo<'preview' | 'placeholder'>(() => {
        // Preview surface available in dev OR via ?preview=1 query
        if (import.meta.env.DEV) return 'preview';
        if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('preview') === '1') {
          return 'preview';
        }
        return 'placeholder';
      }, []);

      if (surface === 'preview') {
        // Lazy-import to keep prod bundle slim
        const PreviewApp = require('./preview/PreviewApp').default as React.ComponentType;
        return (
          <div className={styles.shellRoot}>
            <PreviewApp />
          </div>
        );
      }

      return (
        <div className={styles.shellRoot} data-theme="v10">
          <main className={styles.placeholder}>
            <div className={styles.placeholderEyebrow}>VOL.01 / V1.0 BOOT</div>
            <div className={styles.placeholderTitle}>В разработке.</div>
            <div className={styles.placeholderHint}>
              Сетка экранов появится в Phase 24+. Чтобы посмотреть прелью —
              <code> ?preview=1</code> или dev-сборка.
            </div>
          </main>
        </div>
      );
    }
    ```

    NOTE: `require()` is not idiomatic in ESM Vite — replace with React.lazy + Suspense for production-grade. Use this version instead:

    ```tsx
    import { lazy, Suspense, useMemo } from 'react';
    import './stylesV10/tokens.css';
    import './stylesV10/fonts.css';
    import './stylesV10/animations.css';
    import styles from './AppV10.module.css';

    const PreviewApp = lazy(() => import('./preview/PreviewApp'));

    export default function AppV10() {
      const surface = useMemo<'preview' | 'placeholder'>(() => {
        if (import.meta.env.DEV) return 'preview';
        if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('preview') === '1') {
          return 'preview';
        }
        return 'placeholder';
      }, []);

      if (surface === 'preview') {
        return (
          <div className={styles.shellRoot} data-theme="v10">
            <Suspense fallback={<div className={styles.placeholder}>Загрузка превью…</div>}>
              <PreviewApp />
            </Suspense>
          </div>
        );
      }

      return (
        <div className={styles.shellRoot} data-theme="v10">
          <main className={styles.placeholder}>
            <div className={styles.placeholderEyebrow}>VOL.01 / V1.0 BOOT</div>
            <div className={styles.placeholderTitle}>В разработке.</div>
            <div className={styles.placeholderHint}>
              Сетка экранов появится в Phase 24+. Чтобы посмотреть прелью —
              <code> ?preview=1</code> или dev-сборка.
            </div>
          </main>
        </div>
      );
    }
    ```

    Use the second (lazy + Suspense) version. Delete the require() draft.

    Create `frontend/src/AppV10.module.css`:
    ```css
    .shellRoot {
      min-height: 100vh;
      background: var(--poster-coral);
      color: var(--poster-paper);
      font-family: 'Manrope Variable', 'Manrope', sans-serif;
    }
    .placeholder {
      padding: 56px 22px;
    }
    .placeholderEyebrow {
      font-family: 'JetBrains Mono Variable', monospace;
      font-size: 11px;
      letter-spacing: var(--poster-tracking-eye);
      text-transform: uppercase;
      opacity: 0.7;
      margin-bottom: 12px;
    }
    .placeholderTitle {
      font-family: 'PosterSerifItalic', serif;
      font-style: italic;
      font-size: 88px;
      line-height: 0.85;
      letter-spacing: -0.04em;
    }
    .placeholderHint {
      font-size: 13px;
      margin-top: 22px;
      opacity: 0.85;
    }
    .placeholderHint code {
      font-family: 'JetBrains Mono Variable', monospace;
      font-size: 12px;
      background: rgba(0, 0, 0, 0.18);
      padding: 1px 4px;
    }
    ```
  </action>
  <acceptance_criteria>
    - Both files exist
    - `grep -F "lazy(() => import('./preview/PreviewApp'))" frontend/src/AppV10.tsx` returns 1
    - `grep -F "import.meta.env.DEV" frontend/src/AppV10.tsx` returns 1
    - `grep -F "preview') === '1'" frontend/src/AppV10.tsx` returns 1 (?preview=1 query gate)
    - `grep -F "stylesV10/tokens.css" frontend/src/AppV10.tsx` returns 1
    - `grep -F "stylesV10/fonts.css" frontend/src/AppV10.tsx` returns 1
    - `grep -F "stylesV10/animations.css" frontend/src/AppV10.tsx` returns 1
    - `grep -F 'PosterSerifItalic' frontend/src/AppV10.module.css` returns 1
    - `grep -F 'var(--poster-coral)' frontend/src/AppV10.module.css` returns 1
    - typecheck passes
  </acceptance_criteria>
  <verify>
    <automated>cd frontend &amp;&amp; grep -F "lazy(() =&gt; import('./preview/PreviewApp'))" src/AppV10.tsx &amp;&amp; grep -F 'import.meta.env.DEV' src/AppV10.tsx &amp;&amp; grep -F 'PosterSerifItalic' src/AppV10.module.css &amp;&amp; npx tsc --noEmit -p tsconfig.app.json 2&gt;&amp;1 | { ! grep -E "error TS" | grep -v node_modules; }</automated>
  </verify>
  <done>
    AppV10 mounts preview gallery in dev or with ?preview=1; otherwise renders branded placeholder; uses tokens/fonts/animations CSS.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Implement PreviewApp.tsx — gallery of 10 components + 11 animation triggers</name>
  <files>
    frontend/src/preview/PreviewApp.tsx,
    frontend/src/preview/PreviewApp.module.css
  </files>
  <read_first>
    - `frontend/src/componentsV10/index.ts` (barrel exports)
    - All 10 component prop signatures (Plan 23.05)
    - `frontend/src/stylesV10/animations.css` utility class names (.poster-row-in, .poster-rise-in, .poster-bar-fill, .poster-tab-pop, .poster-pop-in, .poster-check, .poster-dot, .poster-slide-in-fwd, .poster-slide-in-back, .poster-tab-swap, .poster-toast-in)
  </read_first>
  <action>
    Create `frontend/src/preview/PreviewApp.tsx`:
    ```tsx
    import { useState } from 'react';
    import {
      Eyebrow, Mass, BigFig, Plate, PosterButton, Chip,
      PosterSlider, TabBar, FAB, Toast,
      type TabId,
    } from '../componentsV10';
    import styles from './PreviewApp.module.css';

    const ANIMATION_NAMES = [
      'poster-row-in', 'poster-rise-in', 'poster-bar-fill', 'poster-tab-pop',
      'poster-pop-in', 'poster-check', 'poster-dot', 'poster-slide-in-fwd',
      'poster-slide-in-back', 'poster-tab-swap', 'poster-toast-in',
    ] as const;

    export default function PreviewApp() {
      const [activeTab, setActiveTab] = useState<TabId>('home');
      const [chipActive, setChipActive] = useState(0);
      const [sliderValue, setSliderValue] = useState(7500);
      const [toastVisible, setToastVisible] = useState(false);
      const [animKey, setAnimKey] = useState<Record<string, number>>({});

      const triggerAnim = (name: string) => {
        setAnimKey((k) => ({ ...k, [name]: (k[name] ?? 0) + 1 }));
      };

      return (
        <div className={styles.app}>
          <header className={styles.head}>
            <Eyebrow>VOL.23 / DESIGN SYSTEM PREVIEW</Eyebrow>
            <Mass italic size={64}>Maximal Poster.</Mass>
          </header>

          {/* ─── Cyrillic glyph routing proof (ADR-001) ─── */}
          <section className={styles.section}>
            <Eyebrow>1. ADR-001 ROUTING</Eyebrow>
            <div className={styles.glyphRow}>
              <Mass italic size={56}>May</Mass>
              <Mass italic size={56}>Май</Mass>
            </div>
            <p className={styles.note}>
              Слева — DM Serif Italic (Latin); справа — PT Serif Italic (Cyrillic).
              Браузер маршрутизирует через unicode-range в `PosterSerifItalic`.
            </p>
          </section>

          {/* ─── BigFig with count-up ─── */}
          <section className={styles.section}>
            <Eyebrow>2. BIGFIG · COUNT-UP</Eyebrow>
            <BigFig value={142380} sup="₽" size={80} color="var(--poster-paper)" />
          </section>

          {/* ─── Plates × 5 tones ─── */}
          <section className={styles.section}>
            <Eyebrow>3. PLATE · 5 TONES</Eyebrow>
            <div className={styles.plateGrid}>
              {(['inverted', 'yellow', 'red', 'paper', 'dark'] as const).map((t) => (
                <Plate key={t} tone={t}><Eyebrow opacity={0.7}>{t.toUpperCase()}</Eyebrow></Plate>
              ))}
            </div>
          </section>

          {/* ─── Buttons × 3 variants ─── */}
          <section className={styles.section}>
            <Eyebrow>4. POSTERBUTTON · 3 VARIANTS</Eyebrow>
            <div className={styles.btnStack}>
              <PosterButton variant="primary"     onClick={() => {}}>СОХРАНИТЬ</PosterButton>
              <PosterButton variant="ghost"        onClick={() => {}}>ОТМЕНА</PosterButton>
              <PosterButton variant="destructive"  onClick={() => {}}>УДАЛИТЬ</PosterButton>
            </div>
          </section>

          {/* ─── Chips ─── */}
          <section className={styles.section}>
            <Eyebrow>5. CHIPS · SINGLE-SELECT</Eyebrow>
            <div className={styles.chipRow}>
              {['ВСЕ', 'КАФЕ', 'ПРОДУКТЫ', 'ТРАНСПОРТ', 'ПОДПИСКИ'].map((label, i) => (
                <Chip key={label} active={i === chipActive} onClick={() => setChipActive(i)}>{label}</Chip>
              ))}
            </div>
          </section>

          {/* ─── Slider ─── */}
          <section className={styles.section}>
            <Eyebrow>6. POSTERSLIDER · STEP 500</Eyebrow>
            <PosterSlider
              value={sliderValue}
              max={30000}
              step={500}
              onChange={setSliderValue}
              label="ПРОДУКТЫ"
            />
          </section>

          {/* ─── 11 Animations gallery ─── */}
          <section className={styles.section}>
            <Eyebrow>7. ANIMATIONS · 11 KEYFRAMES</Eyebrow>
            <div className={styles.animGrid}>
              {ANIMATION_NAMES.map((name) => (
                <div key={name} className={styles.animCell}>
                  <button
                    className={styles.animTrigger}
                    onClick={() => triggerAnim(name)}
                  >▶ {name}</button>
                  <div
                    key={`${name}-${animKey[name] ?? 0}`}
                    className={`${styles.animTarget} ${name}`}
                  />
                </div>
              ))}
            </div>
          </section>

          {/* ─── Toast ─── */}
          <section className={styles.section}>
            <Eyebrow>8. TOAST · 1700ms LIFE</Eyebrow>
            <PosterButton variant="primary" onClick={() => setToastVisible(true)}>
              ПОКАЗАТЬ TOAST
            </PosterButton>
            <Toast message="✓ Сохранено · −480 ₽" visible={toastVisible} onDismiss={() => setToastVisible(false)} />
          </section>

          {/* ─── Spacer for tab bar ─── */}
          <div style={{ height: 100 }} />

          {/* ─── TabBar fixed bottom ─── */}
          <TabBar
            active={activeTab}
            dark
            onTab={setActiveTab}
            onFab={() => setToastVisible(true)}
          />
        </div>
      );
    }
    ```

    NOTE: TabBar already includes FAB internally. The standalone FAB component is also rendered by TabBar. We do NOT render a second FAB elsewhere — the spec says only one FAB on screen.

    Create `frontend/src/preview/PreviewApp.module.css`:
    ```css
    .app {
      min-height: 100vh;
      padding: 56px 22px 90px;
      background: var(--poster-coral);
      color: var(--poster-paper);
      font-family: 'Manrope Variable', 'Manrope', sans-serif;
    }
    .head { margin-bottom: 28px; }

    .section {
      margin-top: 28px;
      padding-top: 18px;
      border-top: 1px solid rgba(255, 246, 232, 0.18);
    }

    .glyphRow {
      display: flex;
      gap: 24px;
      align-items: baseline;
      margin-top: 12px;
    }

    .note {
      font-size: 12px;
      opacity: 0.7;
      margin-top: 10px;
    }

    .plateGrid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-top: 10px;
    }

    .btnStack { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }

    .chipRow { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 10px; }

    .animGrid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-top: 12px;
    }
    .animCell {
      padding: 10px;
      border: 1px solid rgba(255, 246, 232, 0.25);
    }
    .animTrigger {
      background: transparent;
      border: 1px solid var(--poster-paper);
      color: var(--poster-paper);
      padding: 6px 8px;
      font-family: 'JetBrains Mono Variable', monospace;
      font-size: 11px;
      letter-spacing: 0.1em;
      cursor: pointer;
      width: 100%;
      text-align: left;
    }
    .animTarget {
      width: 100%;
      height: 28px;
      background: var(--poster-yellow);
      margin-top: 8px;
    }
    ```
  </action>
  <acceptance_criteria>
    - Both files exist
    - `grep -F "import {" frontend/src/preview/PreviewApp.tsx | head -1` shows imports from '../componentsV10'
    - `grep -c "Eyebrow\|Mass\|BigFig\|Plate\|PosterButton\|Chip\|PosterSlider\|TabBar\|FAB\|Toast" frontend/src/preview/PreviewApp.tsx` returns ≥ 18 (each component referenced ≥ once + as type imports + JSX)
    - `grep -c '<Mass italic' frontend/src/preview/PreviewApp.tsx` returns ≥ 2 (May + Май pair for ADR-001 proof)
    - `grep -F 'May' frontend/src/preview/PreviewApp.tsx` returns ≥ 1
    - `grep -F 'Май' frontend/src/preview/PreviewApp.tsx` returns ≥ 1
    - `grep -F "'poster-row-in'" frontend/src/preview/PreviewApp.tsx` returns 1
    - `grep -F "'poster-toast-in'" frontend/src/preview/PreviewApp.tsx` returns 1
    - `grep -c "'poster-" frontend/src/preview/PreviewApp.tsx` returns ≥ 11 (all 11 animations listed)
    - `cd frontend && npx vite build --mode development 2>&1 | grep -i "error"` returns nothing
    - typecheck passes
  </acceptance_criteria>
  <verify>
    <automated>cd frontend &amp;&amp; grep -F 'May' src/preview/PreviewApp.tsx &amp;&amp; grep -F 'Май' src/preview/PreviewApp.tsx &amp;&amp; grep -c "'poster-" src/preview/PreviewApp.tsx | awk '{ if ($1 &gt;= 11) exit 0; else exit 1; }' &amp;&amp; npx tsc --noEmit -p tsconfig.app.json 2&gt;&amp;1 | { ! grep -E "error TS" | grep -v node_modules; }</automated>
  </verify>
  <done>
    PreviewApp gallery renders all 10 components + 11 animations + ADR-001 May/Май proof; Vite dev build succeeds.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| localStorage `ui.theme` | Browser-stored, user-tamperable |
| URL query string `?preview=1` | User-controllable input |
| VITE_UI_THEME env var | Build-time only, trusted |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-23-09-01 | Tampering | localStorage `ui.theme` | mitigate | Validation: only `'v06'` or `'v10'` accepted; any other value falls through to default `'v10'`; no eval/innerHTML on the value |
| T-23-09-02 | Tampering | `?preview=1` query | accept | URL params are plain strings consumed via `URLSearchParams`; no rendering of param value as HTML; PreviewApp itself is dev/preview surface, not a route to sensitive data |
| T-23-09-03 | XSS | PreviewApp content | mitigate | All children rendered via React (auto-escapes); no `dangerouslySetInnerHTML`; static labels |
| T-23-09-04 | Information Disclosure | preview gallery | accept | Public design content (palette, fonts) — no secrets exposed; PreviewApp may be reachable via `?preview=1` in production but contains no PII |
| T-23-09-05 | DoS | rapid trigger spam | accept | Animation re-mount via key bump is bounded; debouncing not needed for click-trigger pattern |
</threat_model>

<verification>
1. `cd frontend && npx vite build --mode development` exits 0.
2. `cd frontend && npx vite dev` starts; visit `http://localhost:5173/` → preview gallery renders.
3. Set `localStorage.setItem('ui.theme', 'v06')` + reload → existing v0.6 App renders (untouched).
4. Set `localStorage.setItem('ui.theme', '<garbage>')` + reload → falls back to v10 (default).
</verification>

<success_criteria>
- DS-08 web: theme dispatcher works, preview gallery displays all 10 components + 11 animations.
- ADR-001 cyrillic routing visually proven (May + Май side-by-side).
- localStorage tampering resistant.
</success_criteria>

<output>
Create `.planning/phases/23-design-system-foundation/23-09-SUMMARY.md` with: theme dispatch logic, preview gallery component count, manual visual confirmation of ADR-001, Vite build status.
</output>
