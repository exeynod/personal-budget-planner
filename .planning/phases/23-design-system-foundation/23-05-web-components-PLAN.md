---
phase: 23-design-system-foundation
plan: 05
type: execute
wave: 4
depends_on: [23-design-system-foundation/01, 23-design-system-foundation/02, 23-design-system-foundation/04]
files_modified:
  - frontend/src/componentsV10/index.ts
  - frontend/src/componentsV10/Eyebrow.tsx
  - frontend/src/componentsV10/Eyebrow.module.css
  - frontend/src/componentsV10/Mass.tsx
  - frontend/src/componentsV10/Mass.module.css
  - frontend/src/componentsV10/BigFig.tsx
  - frontend/src/componentsV10/BigFig.module.css
  - frontend/src/componentsV10/Plate.tsx
  - frontend/src/componentsV10/Plate.module.css
  - frontend/src/componentsV10/PosterButton.tsx
  - frontend/src/componentsV10/PosterButton.module.css
  - frontend/src/componentsV10/Chip.tsx
  - frontend/src/componentsV10/Chip.module.css
  - frontend/src/componentsV10/PosterSlider.tsx
  - frontend/src/componentsV10/PosterSlider.module.css
  - frontend/src/componentsV10/TabBar.tsx
  - frontend/src/componentsV10/TabBar.module.css
  - frontend/src/componentsV10/FAB.tsx
  - frontend/src/componentsV10/FAB.module.css
  - frontend/src/componentsV10/Toast.tsx
  - frontend/src/componentsV10/Toast.module.css
  - frontend/src/hooks/useCountUp.ts
autonomous: true
requirements: [DS-06]
tags: [design-system, components, web, react, css-modules]
must_haves:
  truths:
    - "Web exposes 10 base components with stable props, all consumable via `import { ... } from 'componentsV10'`."
    - "BigFig animates count-up via useCountUp hook (cubicOut easing 900ms) on mount."
    - "TabBar uses 5-column grid (1fr 1fr 64px 1fr 1fr) with sliding indicator transition 350ms sheetEase."
    - "FAB applies scale(0.88) rotate(-90deg) on press."
    - "Toast renders top: 64px center with posterToastIn entry + posterCheck SVG checkmark + 1700ms life."
    - "PosterSlider step=500 default, debounce commit 300ms, tap-by-number switches to keyboard input mode."
    - "All components use CSS Modules + tokens.css custom properties (no hard-coded hex)."
  artifacts:
    - path: "frontend/src/componentsV10/index.ts"
      provides: "Public re-export barrel"
      exports: ["Eyebrow", "Mass", "BigFig", "Plate", "PosterButton", "Chip", "PosterSlider", "TabBar", "FAB", "Toast"]
    - path: "frontend/src/hooks/useCountUp.ts"
      provides: "rAF count-up hook used by BigFig"
      exports: ["useCountUp", "CountUp"]
  key_links:
    - from: "Plan 23.11 PreviewApp"
      to: "frontend/src/componentsV10/index.ts"
      via: "import { Eyebrow, Mass, ... } from '../componentsV10'"
    - from: "TabBar component"
      to: "frontend/src/stylesV10/animations.css .poster-tab-pop"
      via: "className applied to glyph span on active tab"
    - from: "Toast component"
      to: "frontend/src/stylesV10/animations.css .poster-toast-in + .poster-check"
      via: "className applied to root + SVG path"
---

<objective>
Implement 10 base UI components in `frontend/src/componentsV10/` (flat dir layout per CONTEXT decision Area 4) with TypeScript + CSS Modules. Each component MUST consume tokens via `var(--poster-*)` (NOT hard-coded hex/numeric) and apply animations via the utility classes from Plan 23.04. Add `useCountUp` hook (extracted from prototype JSX for BigFig). Add `index.ts` barrel re-exports.

Symmetric API contract with iOS Plan 23.07 — when both plans complete, calling code can swap web↔iOS by changing only the import path; prop names and behavior contracts match.

Purpose: DS-06 web components.
Output: 10 component files + 10 .module.css siblings + 1 useCountUp hook + index.ts (22 files total).
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

<read_first>
- `.planning/v1.0-handoff/handoff/DESIGN-SYSTEM.md` §6 (component recipes — Eyebrow, Mass, BigFig, Plate, Buttons/CTA, Chips, Slider, TabBar, FAB, Toast)
- `.planning/v1.0-handoff/handoff/prototype/poster-screens.jsx`:
  - L75-150 (PosterTabBar — 5-col grid, sliding indicator, FAB integration)
  - L153-200 (Eye, useCountUp, BigFig, Mass — exact prototype implementations)
  - L1144-1253 (PosterAddSheet — chip + button styling reference)
- `.planning/v1.0-handoff/handoff/prototype/poster-screens.jsx` L161-181 (useCountUp full source — copy verbatim)
- `frontend/src/stylesV10/tokens.css` (post-Plan 23.01) — verify --poster-* names used in CSS Modules
- `frontend/src/stylesV10/animations.css` (post-Plan 23.04) — verify utility classes (.poster-row-in, .poster-tab-pop, etc.)
- `frontend/src/components/` (v0.6) — note CSS Modules naming convention (`Foo.module.css` next to `Foo.tsx`); follow same convention
</read_first>

<symmetric_api_contract>
<!-- Both web (this plan) and iOS Plan 23.07 implement components with these exact prop signatures.
     Cross-platform consistency is a DS-06 acceptance criterion. -->

| Component | Web Props | iOS Props (SwiftUI ViewBuilder/init) | Notes |
|-----------|-----------|--------------------------------------|-------|
| Eyebrow | `{ children: ReactNode; opacity?: number; color?: string; className?: string }` | `Eyebrow(_ text: String, opacity: Double = 0.7, color: Color = .paper)` | uppercase mono 11px ls 0.18em |
| Mass | `{ children: ReactNode; italic?: boolean; size?: number }` (default 88) | `Mass(_ text: String, italic: Bool = false, size: CGFloat = 88)` | Archivo 900 / DM Serif italic |
| BigFig | `{ value: number; sup?: string; size?: number; dur?: number; color?: string }` | `BigFig(value: Int, sup: String? = nil, size: CGFloat = 90, dur: TimeInterval = 0.9)` | count-up via useCountUp / withAnimation |
| Plate | `{ children: ReactNode; tone?: 'inverted' \| 'yellow' \| 'red' \| 'paper' }` | `Plate(tone: PlateTone = .inverted) { content }` | radius 0, padding 14px |
| PosterButton | `{ variant: 'primary' \| 'ghost' \| 'destructive'; onClick: () => void; disabled?: boolean; children: ReactNode }` | `PosterButton(variant: PosterButtonVariant, action: () -> Void) { Text(...) }` | Archivo 11-13px ls 0.14-0.18em |
| Chip | `{ active?: boolean; onClick: () => void; children: ReactNode }` | `Chip(active: Bool, action: () -> Void) { Text(...) }` | Archivo 11px, padding 6-8px / 10-11px |
| PosterSlider | `{ value: number; min?: number; max: number; step?: number; onChange: (v: number) => void }` (default step 500) | `PosterSlider(value: Binding<Int>, range: ClosedRange<Int>, step: Int = 500)` | track 2px, thumb 22x22 |
| TabBar | `{ active: TabId; dark?: boolean; onTab: (id: TabId) => void; onFab: () => void }` where `TabId = 'home' \| 'savings' \| 'ai' \| 'mgmt'` | `TabBar(active: Binding<TabId>, dark: Bool = false, onFab: () -> Void)` | 5-col grid, sliding indicator |
| FAB | `{ onClick: () => void; ariaLabel?: string }` | `FAB(action: () -> Void)` | 48x48 yellow square + |
| Toast | `{ message: string; visible: boolean; onDismiss?: () => void }` (auto-dismiss 1700ms) | `Toast(message: String, visible: Binding<Bool>)` | top:64 center, yellow bg, ink text, ✓ checkmark |
</symmetric_api_contract>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Create useCountUp hook + Eyebrow + Mass + BigFig + Plate (5 simple components)</name>
  <files>
    frontend/src/hooks/useCountUp.ts,
    frontend/src/componentsV10/Eyebrow.tsx,
    frontend/src/componentsV10/Eyebrow.module.css,
    frontend/src/componentsV10/Mass.tsx,
    frontend/src/componentsV10/Mass.module.css,
    frontend/src/componentsV10/BigFig.tsx,
    frontend/src/componentsV10/BigFig.module.css,
    frontend/src/componentsV10/Plate.tsx,
    frontend/src/componentsV10/Plate.module.css
  </files>
  <read_first>
    - `.planning/v1.0-handoff/handoff/prototype/poster-screens.jsx` L153-200 (Eye, useCountUp, CountUp, BigFig, Mass — copy logic)
    - `.planning/v1.0-handoff/handoff/DESIGN-SYSTEM.md` §6.1-§6.4
    - `frontend/src/stylesV10/tokens.css` post-codegen for var names
  </read_first>
  <action>
    Create `frontend/src/hooks/useCountUp.ts` (existing `frontend/src/hooks/` may not exist — `mkdir -p` if needed):
    ```typescript
    import { useEffect, useRef, useState } from 'react';

    /** rAF count-up to target with cubicOut easing.
     * Source: prototype/poster-screens.jsx L161-181 (verbatim logic).
     * @param target final integer value
     * @param dur ms (default 900)
     */
    export function useCountUp(target: number, dur = 900): number {
      const [v, setV] = useState(0);
      const targetRef = useRef(target);
      targetRef.current = target;
      useEffect(() => {
        let raf: number | null = null;
        let start: number | null = null;
        const step = (ts: number) => {
          if (start == null) start = ts;
          const p = Math.min(1, (ts - start) / dur);
          const eased = 1 - Math.pow(1 - p, 3);            // cubicOut per DESIGN-SYSTEM §7.1
          setV(Math.round(targetRef.current * eased));
          if (p < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
        return () => { if (raf != null) cancelAnimationFrame(raf); };
      }, [target, dur]);
      return v;
    }

    /** Format integer with U+202F (thin space) thousands separator. */
    export function fmtThousands(n: number): string {
      return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    }
    ```

    Create `frontend/src/componentsV10/Eyebrow.tsx`:
    ```tsx
    import type { CSSProperties, ReactNode } from 'react';
    import styles from './Eyebrow.module.css';

    export interface EyebrowProps {
      children: ReactNode;
      opacity?: number;     // default 0.7
      color?: string;       // CSS color or token var
      className?: string;
      style?: CSSProperties;
    }

    export function Eyebrow({ children, opacity = 0.7, color, className, style }: EyebrowProps) {
      return (
        <div
          className={`${styles.eyebrow}${className ? ' ' + className : ''}`}
          style={{ opacity, color, ...style }}
        >{children}</div>
      );
    }
    ```

    Create `frontend/src/componentsV10/Eyebrow.module.css`:
    ```css
    .eyebrow {
      font-family: 'JetBrains Mono Variable', 'JetBrains Mono', monospace;
      font-size: var(--poster-font-size-eye);
      font-weight: 600;
      letter-spacing: var(--poster-tracking-eye);
      text-transform: uppercase;
    }
    ```

    Create `frontend/src/componentsV10/Mass.tsx` (DESIGN-SYSTEM §6.2 — Archivo Black uppercase OR DM Serif italic):
    ```tsx
    import type { CSSProperties, ReactNode } from 'react';
    import styles from './Mass.module.css';

    export interface MassProps {
      children: ReactNode;
      italic?: boolean;     // false → Archivo Black uppercase; true → DM Serif italic
      size?: number;        // px, default 88
      className?: string;
      style?: CSSProperties;
    }

    export function Mass({ children, italic = false, size = 88, className, style }: MassProps) {
      return (
        <div
          className={`${italic ? styles.massItalic : styles.massBold}${className ? ' ' + className : ''}`}
          style={{ fontSize: size, ...style }}
        >{children}</div>
      );
    }
    ```

    Create `frontend/src/componentsV10/Mass.module.css`:
    ```css
    .massBold {
      font-family: 'Archivo Black', sans-serif;
      font-weight: 900;
      line-height: 0.85;
      letter-spacing: var(--poster-tracking-mass);
      text-transform: uppercase;
    }
    .massItalic {
      font-family: 'PosterSerifItalic', 'DM Serif Display', Georgia, serif;
      font-style: italic;
      font-weight: 400;
      line-height: 0.85;
      letter-spacing: var(--poster-tracking-mass);
    }
    ```

    Create `frontend/src/componentsV10/BigFig.tsx` (DESIGN-SYSTEM §6.3 + count-up animation on mount):
    ```tsx
    import type { CSSProperties, ReactNode } from 'react';
    import { useCountUp, fmtThousands } from '../hooks/useCountUp';
    import styles from './BigFig.module.css';

    export interface BigFigProps {
      value: number;
      sup?: ReactNode;        // suffix e.g. "₽"
      size?: number;          // default 90
      dur?: number;           // default 900ms
      animate?: boolean;      // default true; false → render value directly
      color?: string;
      className?: string;
      style?: CSSProperties;
    }

    export function BigFig({ value, sup, size = 90, dur = 900, animate = true, color, className, style }: BigFigProps) {
      const v = useCountUp(animate ? value : 0, dur);
      const display = animate ? v : value;
      return (
        <div
          className={`${styles.bigFig}${className ? ' ' + className : ''}`}
          style={{ fontSize: size, color, ...style }}
        >
          {fmtThousands(display)}
          {sup != null && (
            <sup className={styles.sup} style={{ fontSize: size * 0.36 }}>{sup}</sup>
          )}
        </div>
      );
    }
    ```

    Create `frontend/src/componentsV10/BigFig.module.css`:
    ```css
    .bigFig {
      font-family: 'JetBrains Mono Variable', 'JetBrains Mono', monospace;
      font-weight: 400;
      line-height: 0.92;
      letter-spacing: var(--poster-tracking-hero);
      white-space: nowrap;
    }
    .sup {
      vertical-align: top;
      opacity: 0.7;
      margin-left: 8px;
    }
    ```

    Create `frontend/src/componentsV10/Plate.tsx`:
    ```tsx
    import type { CSSProperties, ReactNode } from 'react';
    import styles from './Plate.module.css';

    export type PlateTone = 'inverted' | 'yellow' | 'red' | 'paper' | 'dark';

    export interface PlateProps {
      children: ReactNode;
      tone?: PlateTone;       // default 'inverted'
      className?: string;
      style?: CSSProperties;
    }

    export function Plate({ children, tone = 'inverted', className, style }: PlateProps) {
      return (
        <div
          className={`${styles.plate} ${styles['tone-' + tone]}${className ? ' ' + className : ''}`}
          style={style}
        >{children}</div>
      );
    }
    ```

    Create `frontend/src/componentsV10/Plate.module.css`:
    ```css
    .plate {
      padding: 14px;
      border-radius: 0;
    }
    .tone-inverted { background: var(--poster-ink); color: var(--poster-paper); }
    .tone-yellow   { background: var(--poster-yellow); color: var(--poster-ink); }
    .tone-red      { background: var(--poster-red); color: var(--poster-paper); }
    .tone-paper    { background: var(--poster-paper); color: var(--poster-ink); }
    .tone-dark     { background: var(--poster-black); color: var(--poster-paper); }
    ```
  </action>
  <acceptance_criteria>
    - All 9 files created (`ls frontend/src/componentsV10/{Eyebrow,Mass,BigFig,Plate}.{tsx,module.css} | wc -l` = 8; plus `frontend/src/hooks/useCountUp.ts`)
    - `grep -F 'export function useCountUp' frontend/src/hooks/useCountUp.ts` returns 1
    - `grep -F 'export function Eyebrow' frontend/src/componentsV10/Eyebrow.tsx` returns 1
    - `grep -F 'italic?: boolean' frontend/src/componentsV10/Mass.tsx` returns 1
    - `grep -F 'PosterSerifItalic' frontend/src/componentsV10/Mass.module.css` returns 1
    - `grep -F 'animate?: boolean' frontend/src/componentsV10/BigFig.tsx` returns 1
    - `grep -F "'JetBrains Mono Variable'" frontend/src/componentsV10/BigFig.module.css` returns 1
    - `grep -F 'PlateTone' frontend/src/componentsV10/Plate.tsx` returns ≥ 1
    - `grep -c '\.tone-' frontend/src/componentsV10/Plate.module.css` returns ≥ 5
    - `cd frontend && npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -v "node_modules" | grep "error TS"` returns nothing (typecheck passes)
  </acceptance_criteria>
  <verify>
    <automated>cd frontend &amp;&amp; ls src/componentsV10/{Eyebrow,Mass,BigFig,Plate}.tsx | wc -l | grep -q '^[[:space:]]*4$' &amp;&amp; npx tsc --noEmit -p tsconfig.app.json 2&gt;&amp;1 | grep -v node_modules | grep -q 'error TS' &amp;&amp; exit 1 || true</automated>
  </verify>
  <done>
    useCountUp + 4 components (Eyebrow, Mass, BigFig, Plate) compile cleanly; CSS Modules use --poster-* tokens.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Implement PosterButton + Chip + PosterSlider + FAB (4 interactive components)</name>
  <files>
    frontend/src/componentsV10/PosterButton.tsx,
    frontend/src/componentsV10/PosterButton.module.css,
    frontend/src/componentsV10/Chip.tsx,
    frontend/src/componentsV10/Chip.module.css,
    frontend/src/componentsV10/PosterSlider.tsx,
    frontend/src/componentsV10/PosterSlider.module.css,
    frontend/src/componentsV10/FAB.tsx,
    frontend/src/componentsV10/FAB.module.css
  </files>
  <read_first>
    - `.planning/v1.0-handoff/handoff/DESIGN-SYSTEM.md` §6.5 (CTAs), §6.6 (Chips), §6.7 (Slider), §6.9 (FAB)
    - prototype JSX L1187-1206 (chip styling), L109-124 (FAB inline style)
  </read_first>
  <action>
    Create `frontend/src/componentsV10/PosterButton.tsx`:
    ```tsx
    import type { CSSProperties, ReactNode } from 'react';
    import styles from './PosterButton.module.css';

    export type PosterButtonVariant = 'primary' | 'ghost' | 'destructive';

    export interface PosterButtonProps {
      variant: PosterButtonVariant;
      onClick?: () => void;
      disabled?: boolean;
      children: ReactNode;
      className?: string;
      style?: CSSProperties;
      type?: 'button' | 'submit';
    }

    export function PosterButton({
      variant, onClick, disabled = false, children, className, style, type = 'button',
    }: PosterButtonProps) {
      return (
        <button
          type={type}
          onClick={disabled ? undefined : onClick}
          disabled={disabled}
          className={`${styles.btn} ${styles['v-' + variant]}${disabled ? ' ' + styles.disabled : ''}${className ? ' ' + className : ''}`}
          style={style}
        >{children}</button>
      );
    }
    ```

    Create `frontend/src/componentsV10/PosterButton.module.css`:
    ```css
    .btn {
      display: block;
      width: 100%;
      padding: 16px 0;
      text-align: center;
      font-family: 'Archivo Black', sans-serif;
      font-weight: 900;
      font-size: 12px;
      letter-spacing: var(--poster-tracking-eye);
      text-transform: uppercase;
      border: none;
      border-radius: 0;
      cursor: pointer;
      transition: transform 150ms ease, opacity 150ms ease;
    }
    .btn:active:not(.disabled) { transform: scale(0.97); }
    .v-primary {
      background: var(--poster-yellow);
      color: var(--poster-ink);
    }
    .v-ghost {
      background: transparent;
      color: var(--poster-paper);
      border: 1px solid rgba(255, 246, 232, 0.45);
    }
    .v-destructive {
      background: var(--poster-red);
      color: var(--poster-paper);
    }
    .disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
    ```

    Create `frontend/src/componentsV10/Chip.tsx`:
    ```tsx
    import type { ReactNode } from 'react';
    import styles from './Chip.module.css';

    export interface ChipProps {
      active?: boolean;
      onClick?: () => void;
      children: ReactNode;
      className?: string;
    }

    export function Chip({ active = false, onClick, children, className }: ChipProps) {
      return (
        <span
          role="button"
          tabIndex={0}
          onClick={onClick}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick?.(); }}
          className={`${styles.chip}${active ? ' ' + styles.active : ''}${className ? ' ' + className : ''}`}
        >{children}</span>
      );
    }
    ```

    Create `frontend/src/componentsV10/Chip.module.css`:
    ```css
    .chip {
      display: inline-block;
      padding: 8px 11px;
      border: 1px solid rgba(255, 246, 232, 0.35);
      font-family: 'Archivo Black', sans-serif;
      font-size: 11px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      cursor: pointer;
      user-select: none;
      background: transparent;
      color: var(--poster-paper);
    }
    .active {
      background: var(--poster-yellow);
      color: var(--poster-cobalt);
      border-color: transparent;
    }
    ```

    Create `frontend/src/componentsV10/PosterSlider.tsx` (DS-06 spec: step=500 default, 300ms debounce commit, tap-by-number → keyboard mode):
    ```tsx
    import { useEffect, useRef, useState } from 'react';
    import styles from './PosterSlider.module.css';

    export interface PosterSliderProps {
      value: number;
      min?: number;          // default 0
      max: number;
      step?: number;         // default 500
      onChange: (v: number) => void;
      onCommit?: (v: number) => void;
      label?: string;
    }

    export function PosterSlider({
      value, min = 0, max, step = 500, onChange, onCommit, label,
    }: PosterSliderProps) {
      const [local, setLocal] = useState(value);
      const [editing, setEditing] = useState(false);
      const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

      useEffect(() => { setLocal(value); }, [value]);

      const handleSlide = (next: number) => {
        setLocal(next);
        onChange(next);
        if (onCommit) {
          if (commitTimer.current) clearTimeout(commitTimer.current);
          commitTimer.current = setTimeout(() => onCommit(next), 300);
        }
      };

      return (
        <div className={styles.wrapper}>
          {label && <div className={styles.label}>{label}</div>}
          <div className={styles.row}>
            <input
              type="range"
              className={styles.range}
              min={min} max={max} step={step}
              value={local}
              onChange={(e) => handleSlide(Math.round(+e.target.value / step) * step)}
            />
            {editing ? (
              <input
                type="number"
                className={styles.numInput}
                value={local}
                autoFocus
                onChange={(e) => handleSlide(+e.target.value)}
                onBlur={() => setEditing(false)}
                onKeyDown={(e) => { if (e.key === 'Enter') setEditing(false); }}
              />
            ) : (
              <span
                className={styles.num}
                role="button"
                tabIndex={0}
                onClick={() => setEditing(true)}
                onKeyDown={(e) => { if (e.key === 'Enter') setEditing(true); }}
              >{local.toLocaleString('ru-RU').replace(/\s/g, ' ')}</span>
            )}
          </div>
        </div>
      );
    }
    ```

    Create `frontend/src/componentsV10/PosterSlider.module.css`:
    ```css
    .wrapper { width: 100%; }
    .label {
      font-family: 'JetBrains Mono Variable', monospace;
      font-size: 11px;
      letter-spacing: var(--poster-tracking-eye);
      text-transform: uppercase;
      opacity: 0.7;
      margin-bottom: 4px;
    }
    .row { display: flex; align-items: center; gap: 12px; }
    .range {
      flex: 1;
      height: 22px;
      -webkit-appearance: none; appearance: none;
      background: transparent;
      cursor: pointer;
    }
    .range::-webkit-slider-runnable-track {
      height: 2px;
      background: rgba(255, 246, 232, 0.25);
    }
    .range::-moz-range-track {
      height: 2px;
      background: rgba(255, 246, 232, 0.25);
    }
    .range::-webkit-slider-thumb {
      -webkit-appearance: none; appearance: none;
      width: 22px; height: 22px;
      border-radius: 50%;
      background: var(--poster-paper);
      box-shadow: var(--poster-shadow-thumb);
      margin-top: -10px;
      cursor: grab;
      transition: transform 100ms ease;
    }
    .range::-webkit-slider-thumb:active { transform: scale(1.08); cursor: grabbing; }
    .range::-moz-range-thumb {
      width: 22px; height: 22px;
      border-radius: 50%;
      background: var(--poster-paper);
      box-shadow: var(--poster-shadow-thumb);
      cursor: grab;
    }
    .num, .numInput {
      font-family: 'JetBrains Mono Variable', monospace;
      font-size: 14px;
      font-weight: 600;
      min-width: 80px;
      text-align: right;
      cursor: text;
      background: transparent;
      border: none;
      color: inherit;
    }
    .numInput { outline: none; border-bottom: 1px solid currentColor; }
    ```

    Create `frontend/src/componentsV10/FAB.tsx`:
    ```tsx
    import { useState } from 'react';
    import styles from './FAB.module.css';

    export interface FABProps {
      onClick: () => void;
      ariaLabel?: string;
    }

    export function FAB({ onClick, ariaLabel = 'Добавить транзакцию' }: FABProps) {
      const [pressed, setPressed] = useState(false);
      return (
        <button
          type="button"
          aria-label={ariaLabel}
          className={styles.fab}
          onClick={onClick}
          onMouseDown={() => setPressed(true)}
          onMouseUp={() => setPressed(false)}
          onMouseLeave={() => setPressed(false)}
          onTouchStart={() => setPressed(true)}
          onTouchEnd={() => setPressed(false)}
          style={{ transform: pressed ? 'scale(0.88) rotate(-90deg)' : 'scale(1) rotate(0)' }}
        >+</button>
      );
    }
    ```

    Create `frontend/src/componentsV10/FAB.module.css`:
    ```css
    .fab {
      width: 48px;
      height: 48px;
      background: var(--poster-yellow);
      color: var(--poster-ink);
      border: none;
      border-radius: 0;
      font-family: 'Archivo Black', sans-serif;
      font-size: 24px;
      line-height: 1;
      cursor: pointer;
      box-shadow: var(--poster-shadow-fab);
      user-select: none;
      transition: transform 250ms cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    ```
  </action>
  <acceptance_criteria>
    - 8 files created (4 .tsx + 4 .module.css)
    - `grep -F 'PosterButtonVariant' frontend/src/componentsV10/PosterButton.tsx` returns ≥ 1
    - `grep -F 'destructive' frontend/src/componentsV10/PosterButton.tsx` returns ≥ 1
    - `grep -F 'step?: number' frontend/src/componentsV10/PosterSlider.tsx` returns 1 (default 500)
    - `grep -F 'step = 500' frontend/src/componentsV10/PosterSlider.tsx` returns 1
    - `grep -F 'setTimeout' frontend/src/componentsV10/PosterSlider.tsx` returns ≥ 1 (300ms debounce wiring)
    - `grep -F '300' frontend/src/componentsV10/PosterSlider.tsx` returns ≥ 1
    - `grep -F 'scale(0.88) rotate(-90deg)' frontend/src/componentsV10/FAB.tsx` returns 1
    - `grep -F '48px' frontend/src/componentsV10/FAB.module.css` returns ≥ 2
    - `grep -F 'cubic-bezier(0.34, 1.56, 0.64, 1)' frontend/src/componentsV10/FAB.module.css` returns 1
    - typecheck: `cd frontend && npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -v node_modules | grep -E "error TS"` returns nothing
  </acceptance_criteria>
  <verify>
    <automated>cd frontend &amp;&amp; grep -F 'scale(0.88) rotate(-90deg)' src/componentsV10/FAB.tsx &amp;&amp; grep -F 'step = 500' src/componentsV10/PosterSlider.tsx &amp;&amp; npx tsc --noEmit -p tsconfig.app.json 2&gt;&amp;1 | { ! grep -E "error TS" | grep -v node_modules; }</automated>
  </verify>
  <done>
    PosterButton (3 variants), Chip (active toggle), PosterSlider (step 500, 300ms debounce, keyboard-edit-on-tap), FAB (48x48 + press transform) compile cleanly.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Implement TabBar + Toast + index.ts barrel</name>
  <files>
    frontend/src/componentsV10/TabBar.tsx,
    frontend/src/componentsV10/TabBar.module.css,
    frontend/src/componentsV10/Toast.tsx,
    frontend/src/componentsV10/Toast.module.css,
    frontend/src/componentsV10/index.ts
  </files>
  <read_first>
    - prototype JSX L75-150 (PosterTabBar — 5-col grid, sliding indicator, 5 entries home/savings/fab/ai/mgmt, dark/light themes)
    - DESIGN-SYSTEM.md §6.8 (TabBar), §6.10 (Toast)
    - `frontend/src/stylesV10/animations.css` post-Plan 23.04 (.poster-tab-pop, .poster-toast-in, .poster-check class)
  </read_first>
  <action>
    Create `frontend/src/componentsV10/TabBar.tsx`:
    ```tsx
    import { FAB } from './FAB';
    import styles from './TabBar.module.css';

    export type TabId = 'home' | 'savings' | 'ai' | 'mgmt';

    interface TabEntry { id: TabId; label: string; glyph: string; idx: number; }

    const TABS: TabEntry[] = [
      { id: 'home',    label: 'ГЛАВНАЯ', glyph: '■', idx: 0 },
      { id: 'savings', label: 'КОПИЛКА', glyph: '◊', idx: 1 },
      { id: 'ai',      label: 'AI',      glyph: '✦', idx: 3 },
      { id: 'mgmt',    label: 'УПР.',    glyph: '⌘', idx: 4 },
    ];

    export interface TabBarProps {
      active: TabId;
      dark?: boolean;       // dark=true → black bg + paper text + yellow active
      onTab: (id: TabId) => void;
      onFab: () => void;
    }

    export function TabBar({ active, dark = false, onTab, onFab }: TabBarProps) {
      const activeIdx = TABS.find(t => t.id === active)?.idx ?? 0;
      return (
        <nav
          className={`${styles.tabBar}${dark ? ' ' + styles.dark : ' ' + styles.light}`}
          role="tablist"
          aria-label="Bottom navigation"
        >
          <div
            className={styles.indicator}
            style={{ left: `calc(${activeIdx} * (100% / 5))` }}
          />
          {[TABS[0], TABS[1]].map(t => (
            <TabBtn key={t.id} t={t} active={active === t.id} onTab={onTab} />
          ))}
          <div className={styles.fabSlot}>
            <FAB onClick={onFab} />
          </div>
          {[TABS[2], TABS[3]].map(t => (
            <TabBtn key={t.id} t={t} active={active === t.id} onTab={onTab} />
          ))}
        </nav>
      );
    }

    function TabBtn({ t, active, onTab }: { t: TabEntry; active: boolean; onTab: (id: TabId) => void }) {
      return (
        <button
          type="button"
          role="tab"
          aria-selected={active}
          className={`${styles.tab}${active ? ' ' + styles.active : ''}`}
          onClick={() => onTab(t.id)}
        >
          <span className={`${styles.glyph}${active ? ' poster-tab-pop' : ''}`}>{t.glyph}</span>
          <span className={styles.label}>{t.label}</span>
        </button>
      );
    }
    ```

    Create `frontend/src/componentsV10/TabBar.module.css`:
    ```css
    .tabBar {
      position: fixed;
      bottom: 18px;
      left: 14px;
      right: 14px;
      display: grid;
      grid-template-columns: 1fr 1fr 64px 1fr 1fr;
      align-items: center;
      height: 68px;
      box-shadow: var(--poster-shadow-tab-bar);
      z-index: 200;
    }
    .light { background: var(--poster-paper); border: 1px solid rgba(27, 26, 24, 0.12); }
    .dark  { background: var(--poster-black); border: 1px solid rgba(255, 246, 232, 0.15); }

    .indicator {
      position: absolute;
      bottom: 0;
      height: 2px;
      width: 20%;
      background: var(--poster-ink);
      transition: left 350ms cubic-bezier(0.32, 0.72, 0, 1), background 200ms;
    }
    .dark .indicator { background: var(--poster-yellow); }

    .tab {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      background: transparent;
      border: none;
      cursor: pointer;
      padding: 4px 0;
      font-family: 'Archivo Black', sans-serif;
      font-size: 11px;
      letter-spacing: 0.14em;
      transition: color 250ms;
    }
    .light .tab { color: rgba(27, 26, 24, 0.45); }
    .dark .tab  { color: rgba(255, 246, 232, 0.55); }
    .light .tab.active { color: var(--poster-ink); }
    .dark .tab.active  { color: var(--poster-yellow); }

    .glyph {
      font-size: 13px;
      line-height: 1;
      display: inline-block;
    }
    .label { display: block; }

    .fabSlot {
      display: flex;
      justify-content: center;
    }
    ```

    Create `frontend/src/componentsV10/Toast.tsx` (top:64 center, yellow bg, ink text, ✓ checkmark, 1700ms life):
    ```tsx
    import { useEffect } from 'react';
    import styles from './Toast.module.css';

    export interface ToastProps {
      message: string;
      visible: boolean;
      onDismiss?: () => void;
      duration?: number;     // default 1700ms
    }

    export function Toast({ message, visible, onDismiss, duration = 1700 }: ToastProps) {
      useEffect(() => {
        if (!visible || !onDismiss) return;
        const t = setTimeout(onDismiss, duration);
        return () => clearTimeout(t);
      }, [visible, onDismiss, duration]);

      if (!visible) return null;

      return (
        <div className={`${styles.toast} poster-toast-in`} role="status" aria-live="polite">
          <svg className={styles.svg} viewBox="0 0 24 24" width="14" height="14">
            <path
              className="poster-check"
              d="M4 12 L10 18 L20 6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="square"
            />
          </svg>
          <span>{message}</span>
        </div>
      );
    }
    ```

    Create `frontend/src/componentsV10/Toast.module.css`:
    ```css
    .toast {
      position: fixed;
      top: 64px;
      left: 50%;
      transform: translateX(-50%);
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 10px 14px;
      background: var(--poster-yellow);
      color: var(--poster-ink);
      font-family: 'JetBrains Mono Variable', monospace;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: var(--poster-tracking-eye);
      text-transform: uppercase;
      border-radius: 0;
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
      z-index: 300;
      pointer-events: auto;
    }
    .svg { flex-shrink: 0; }
    ```

    Create `frontend/src/componentsV10/index.ts`:
    ```ts
    export { Eyebrow } from './Eyebrow';
    export type { EyebrowProps } from './Eyebrow';
    export { Mass } from './Mass';
    export type { MassProps } from './Mass';
    export { BigFig } from './BigFig';
    export type { BigFigProps } from './BigFig';
    export { Plate } from './Plate';
    export type { PlateProps, PlateTone } from './Plate';
    export { PosterButton } from './PosterButton';
    export type { PosterButtonProps, PosterButtonVariant } from './PosterButton';
    export { Chip } from './Chip';
    export type { ChipProps } from './Chip';
    export { PosterSlider } from './PosterSlider';
    export type { PosterSliderProps } from './PosterSlider';
    export { TabBar } from './TabBar';
    export type { TabBarProps, TabId } from './TabBar';
    export { FAB } from './FAB';
    export type { FABProps } from './FAB';
    export { Toast } from './Toast';
    export type { ToastProps } from './Toast';
    ```
  </action>
  <acceptance_criteria>
    - 5 files created (TabBar.tsx, TabBar.module.css, Toast.tsx, Toast.module.css, index.ts)
    - `grep -c "^export " frontend/src/componentsV10/index.ts` returns ≥ 20 (10 components × 2 — value + type)
    - `grep -F "TabId" frontend/src/componentsV10/index.ts` returns ≥ 1
    - `grep -F "1fr 1fr 64px 1fr 1fr" frontend/src/componentsV10/TabBar.module.css` returns 1
    - `grep -F "350ms cubic-bezier(0.32, 0.72, 0, 1)" frontend/src/componentsV10/TabBar.module.css` returns 1
    - `grep -F "poster-tab-pop" frontend/src/componentsV10/TabBar.tsx` returns 1
    - `grep -F "poster-toast-in" frontend/src/componentsV10/Toast.tsx` returns 1
    - `grep -F "poster-check" frontend/src/componentsV10/Toast.tsx` returns 1
    - `grep -F "duration = 1700" frontend/src/componentsV10/Toast.tsx` returns 1
    - `grep -F "top: 64" frontend/src/componentsV10/Toast.module.css` returns 1
    - typecheck: `cd frontend && npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -v node_modules | grep -E "error TS"` returns nothing
    - All 10 component files exist: `ls frontend/src/componentsV10/*.tsx | wc -l` returns 10
  </acceptance_criteria>
  <verify>
    <automated>cd frontend &amp;&amp; ls src/componentsV10/*.tsx | wc -l | grep -q '^[[:space:]]*10$' &amp;&amp; grep -F 'TabId' src/componentsV10/index.ts &amp;&amp; grep -F 'poster-tab-pop' src/componentsV10/TabBar.tsx &amp;&amp; grep -F 'duration = 1700' src/componentsV10/Toast.tsx &amp;&amp; npx tsc --noEmit -p tsconfig.app.json 2&gt;&amp;1 | { ! grep -E "error TS" | grep -v node_modules; }</automated>
  </verify>
  <done>
    All 10 components live, TypeScript compiles, index.ts barrel exports all 10 + their types.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Component props (children) → DOM | React renders children safely (auto-escapes); no dangerouslySetInnerHTML |
| Toast message | Plain text only, no HTML interpolation |
| PosterSlider numeric input | DOM range input clamped via min/max attributes |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-23-05-01 | Tampering | Toast / Eyebrow children | mitigate | React's default rendering escapes string content; no `dangerouslySetInnerHTML` used anywhere; reviewer gate: search for it in PR |
| T-23-05-02 | Tampering | PosterSlider value | mitigate | `min={min} max={max} step={step}` enforced on `<input type="range">`; numeric-input fallback also clamped via onChange validator |
| T-23-05-03 | DoS | useCountUp rAF loop | mitigate | `cancelAnimationFrame` in cleanup; `dur` parameter bounded by component contract (default 900ms) |
| T-23-05-04 | Information Disclosure | aria-label on FAB | accept | Static label «Добавить транзакцию» — no PII |
</threat_model>

<verification>
1. TypeScript compiles cleanly (no `error TS` in non-node_modules output).
2. `cd frontend && npx vite build --mode development` succeeds.
3. (Manual, in Plan 23.11 PreviewApp) all 10 components render without console errors.
</verification>

<success_criteria>
- DS-06 web: 10 components built with symmetric prop API; CSS uses tokens; animations applied via utility classes from Plan 23.04.
- index.ts barrel exposes all 10 + types.
- TypeScript strict passes.
</success_criteria>

<output>
Create `.planning/phases/23-design-system-foundation/23-05-SUMMARY.md` with: file count, prop signatures finalized for symmetric iOS implementation, any prop-name renames vs CONTEXT spec, typecheck status.
</output>
