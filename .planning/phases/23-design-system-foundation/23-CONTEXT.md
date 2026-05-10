# Phase 23: Design System Foundation - Context

**Gathered:** 2026-05-10
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous) — 4 grey areas accepted en bloc

<domain>
## Phase Boundary

Web и iOS получают общий design-system foundation:
- single-source `design/tokens.json` → codegen в `frontend/src/stylesV10/tokens.css` + `ios/BudgetPlanner/FeaturesV10/Common/PosterTokens.swift`
- 4 self-hosted Google-шрифта (Manrope variable, JetBrains Mono variable, Archivo Black 900, DM Serif Display Italic) + PT Serif Italic как cyrillic fallback per ADR-001
- 11 keyframe-анимаций (posterRowIn, posterRiseIn, posterBarFill, posterTabPop, posterPopIn, posterCheck, posterDot, posterSlideInFwd/Back, posterTabSwap, posterToastIn) — pure CSS на web, withAnimation+phaseAnimator на iOS 17+
- `prefers-reduced-motion` / `accessibilityReduceMotion` редуцирует все анимации до opacity-only без in-app toggle
- 10 базовых компонентов (Eyebrow, Mass, BigFig, Plate, PosterButton, Chip, PosterSlider step=500, TabBar, FAB, Toast) — symmetric web `componentsV10/` + iOS `FeaturesV10/Common/`
- iOS custom `PosterNavStack` (50 LOC, ZStack + asymmetric transitions + `@Observable` router) + `PosterSheet` (slide-up + sheetEase + backdrop) + ручной edge-swipe-back via `UIScreenEdgePanGestureRecognizer` per ADR-002
- Dual-shell coexistence: `AppRouter` switch на `@AppStorage("ui.theme")` (iOS) / `VITE_UI_THEME=v10 || localStorage.getItem('ui.theme')==='v10'` (web) между V06 (untouched legacy) и V10 (new poster shell)

Phase 23 НЕ содержит финальных экранов — только foundation (tokens, fonts, animations, components, nav, dual-shell). Реальные экраны строятся в Phases 24-27.

</domain>

<decisions>
## Implementation Decisions

### Area 1: Codegen toolchain

- **Generator** = custom TypeScript Node script `scripts/gen-tokens.ts` (~80 LOC, no external deps). Reads `design/tokens.json`, emits CSS + Swift through pure string templating. Avoids version churn from `style-dictionary`. Lint via project's existing tsc + eslint config.
- **`tokens.json` location** = `design/tokens.json` (repo-root, не привязан к web/iOS, позволяет дизайнеру коммитить без понимания фронтенд-структуры).
- **Output paths:**
  - `frontend/src/stylesV10/tokens.css` (CSS custom properties: `--poster-coral`, `--poster-cobalt`, …)
  - `ios/BudgetPlanner/FeaturesV10/Common/PosterTokens.swift` (struct PosterTokens with static let; SwiftUI Color + Font extensions)
- **CI check** = `make tokens-check` Makefile target → `npm run gen:tokens && git diff --exit-code design/ frontend/src/stylesV10/tokens.css ios/BudgetPlanner/FeaturesV10/Common/PosterTokens.swift`. Falls билд если committed ≠ generated.
- **npm scripts:** `gen:tokens` (run script), `gen:tokens:watch` (chokidar), `tokens-check` (run + diff).

### Area 2: Web fonts + dev surface

- **Font packages (self-hosted, woff2 only):**
  - `@fontsource-variable/manrope@^5.2` (variable wght 200-800 + ital)
  - `@fontsource-variable/jetbrains-mono@^5.2` (variable wght + ital)
  - `@fontsource/archivo-black@^5.2/900.css`
  - `@fontsource/dm-serif-display@^5.2/400-italic.css`
  - `@fontsource/pt-serif@^5.2/400-italic.css` (cyrillic fallback)
- **Cyrillic fallback (DS-02 / ADR-001)** = single `@font-face` rule в `frontend/src/stylesV10/fonts.css`:
  ```css
  @font-face {
    font-family: 'PosterSerifItalic';
    src: local('DM Serif Display Italic'), url('@fontsource/dm-serif-display/files/dm-serif-display-latin-400-italic.woff2') format('woff2');
    unicode-range: U+0000-024F, U+1E00-1EFF, U+2000-206F;
    font-style: italic;
  }
  @font-face {
    font-family: 'PosterSerifItalic';
    src: url('@fontsource/pt-serif/files/pt-serif-cyrillic-400-italic.woff2') format('woff2');
    unicode-range: U+0400-04FF, U+0500-052F;
    font-style: italic;
  }
  ```
  Component `<Mass italic>` → `font-family: 'PosterSerifItalic', serif`. Browser routes glyph by Unicode range automatically.
- **font-display strategy** = `font-display: optional` (better LCP than `swap`) + `<link rel="preload">` для top-2 weights (Manrope 400 normal + Manrope 700 normal) — added in `index.html` head.
- **Component dev surface** = in-Vite `/preview` route, mounted только при `import.meta.env.DEV` или query `?preview=1`. Render gallery всех компонентов с пропсами + 11 анимаций. Avoids Storybook build complexity. File: `frontend/src/preview/PreviewApp.tsx`.

### Area 3: iOS bundling + custom nav

- **Font bundling** = TTF (5 файлов) в `ios/BudgetPlanner/Resources/Fonts/`:
  - `Manrope-VariableFont_wght.ttf` (variable, supports italic via separate file or fontDescriptor)
  - `JetBrainsMono-VariableFont_wght.ttf`
  - `ArchivoBlack-Regular.ttf`
  - `DMSerifDisplay-Italic.ttf`
  - `PTSerif-Italic.ttf` (cyrillic fallback)
  Add to `UIAppFonts` array в `Info.plist` — синхронная регистрация at launch, нет FOUT race per DS-03.
- **`PosterNavStack` (DS-07 / ADR-002)** = ~50 LOC SwiftUI ZStack:
  ```swift
  struct PosterNavStack<Content: View>: View {
      @State private var router = PosterRouter()
      let content: () -> Content
      var body: some View {
          ZStack {
              ForEach(router.stack, id: \.id) { entry in
                  entry.view
                      .transition(.asymmetric(
                          insertion: .move(edge: .trailing).combined(with: .opacity),
                          removal: .move(edge: .trailing).combined(with: .opacity)
                      ))
              }
          }
          .environment(\.posterRouter, router)
          .gesture(edgeSwipeGesture)
      }
  }
  @Observable final class PosterRouter { var stack: [PosterNavEntry] = [] }
  ```
- **Edge-swipe back** = `UIScreenEdgePanGestureRecognizer` (minimumDistance=24px, threshold=80px) wrapped в `UIViewControllerRepresentable` adapter; accessibility:
  ```swift
  .accessibilityLabel("Назад")
  .accessibilityAddTraits(.isButton)
  ```
  on the swipe target view.
- **`PosterSheet`** = slide-up animation (`sheetEase` cubic-bezier matching DESIGN-SYSTEM §7) + backdrop с `.opacity(0.45)` + `onTap → dismiss` + drag-to-close gesture (translation > 100pt OR velocity > 800).

### Area 4: Dual-shell + flag plumbing

- **Web theme flag (DS-08)** = both env + localStorage:
  ```ts
  const themeEnv = import.meta.env.VITE_UI_THEME;
  const themeLocal = localStorage.getItem('ui.theme');
  const theme = themeEnv ?? themeLocal ?? 'v10'; // env wins for CI/QA, fallback localStorage, default 'v10' для new users
  ```
  В `frontend/src/main.tsx`: `if (theme === 'v10') { import('./AppV10').then(({ default: AppV10 }) => render(<AppV10 />)); } else { render(<App />); }`. Lazy-imports prevent bundle bloat.
- **iOS theme flag** = `@AppStorage("ui.theme") private var theme: String = "v10"`; `AppRouter` switch:
  ```swift
  if theme == "v10" {
      V10MainShell()
  } else {
      V06MainShell()  // existing untouched code
  }
  ```
  Default `"v10"` для new installs, `"v06"` сохранён для existing iPhone Denis (smooth migration test перед полным flip в acceptance Phase 28).
- **`V10MainShell` initial scope** = minimal placeholder с:
  - `PosterNavStack { PreviewGallery() }` — single test-route рендерит component gallery
  - All 11 анимаций triggered by buttons in gallery
  - No production screens — Phases 24-27 add Onboarding/Home/Transactions/etc.
- **Component dir layout (flat)**:
  - Web: `frontend/src/componentsV10/{Eyebrow,Mass,BigFig,Plate,PosterButton,Chip,PosterSlider,TabBar,FAB,Toast}.tsx` + соответствующие `.module.css` рядом + `index.ts` re-exports
  - iOS: `ios/BudgetPlanner/FeaturesV10/Common/{Eyebrow,Mass,BigFig,Plate,PosterButton,Chip,PosterSlider,TabBar,FAB,Toast}.swift` (+ shared `PosterStyle.swift` для shared modifiers)

### Claude's Discretion

- Точные cubic-bezier curves for `sheetEase` (interpolated from prototype/poster-screens.jsx — agent should read prototype during plan-phase to extract exact values)
- Animation duration values (DESIGN-SYSTEM §7 spec — agent extracts)
- npm package versions (latest stable as of 2026-05-10)
- Test fixtures для `/preview` route (which sample data shows БigFig в наиболее интересном состоянии)
- iOS `phaseAnimator` vs `withAnimation` choice per анимация (iOS 17+ available)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`frontend/src/`** — existing v0.6 React app: `App.tsx`, `main.tsx`, `components/`, `screens/`, `styles/`. Phase 23 ADDS `componentsV10/`, `stylesV10/`, `AppV10.tsx`, `preview/PreviewApp.tsx` без модификации существующего.
- **`ios/BudgetPlanner/`** — existing v0.6 SwiftUI app: `App/`, `Auth/`, `Design/`, `Domain/`, `Features/`, `Networking/`, `Resources/`. Phase 23 ADDS:
  - `FeaturesV10/Common/` (10 components + PosterRouter + PosterNavStack)
  - `Resources/Fonts/` (5 TTF + Info.plist UIAppFonts entry)
  - V10MainShell.swift в App/
- **`scripts/`** — existing scripts dir for backend tests + deploy. Phase 23 ADDS `gen-tokens.ts` (Node TS, runnable via `node --import tsx scripts/gen-tokens.ts` или existing tsc setup).
- **`Makefile`** — existing root Makefile с тарget'ами для backend tests/lint. Phase 23 ADDS `tokens`, `tokens-check`.
- **`design/`** — NEW directory. Single file `tokens.json` (canonical source).

### Established Patterns

- **TypeScript strict** in frontend (see `frontend/tsconfig.json`)
- **Vite** dev server + build (see `frontend/vite.config.ts`)
- **CSS Modules** for component styles in v0.6 (`*.module.css`); maintain same convention для V10
- **SwiftUI** на iOS, no UIKit-only screens (see `ios/BudgetPlanner/Features/`)
- **XcodeGen** workflow (see `ios/Makefile`); changes to Resources require `make` to regenerate project file и refresh bundle
- **No external CSS frameworks** — only project tokens + CSS Modules; respect this for V10

### Integration Points

- **Backend (Phase 22)** publishes API contract — V10 components display Account/Goal/Recurrent DTOs. Schemas already in OpenAPI.
- **Bot** не зависит от Phase 23 (text-only commands).
- **AI tools** не зависят от Phase 23.
- **Phase 24 (Onboarding)** consumes Slider + PosterButton + Eyebrow + Mass.
- **Phase 25 (Home)** consumes BigFig (count-up), TabBar, FAB.
- **Phase 26 (PLAN)** consumes Slider, Plate, PosterRowIn animation.
- **Phase 27 (AI/Savings/etc.)** consumes Plate, Chip, Toast, PosterDot animation.
- **Phase 28 (Acceptance)** flips iOS default `@AppStorage("ui.theme")` from `"v06"` to `"v10"` для existing user, runs Lighthouse + Playwright `toHaveScreenshot()` against prototype.

</code_context>

<specifics>
## Specific Ideas

- **`.planning/v1.0-handoff/handoff/DESIGN-SYSTEM.md`** — canonical visual reference: палитра §1, типографика §2, spacing §3, радиусы/тени §4, иконография §5 (нет, eyebrow заменяет), components §6, animations §7. Phase 23 implements §1-§7.
- **`.planning/v1.0-handoff/handoff/prototype/`** — reference HTML+JSX prototype. `prototype/poster-screens.jsx` содержит exact CSS keyframes + cubic-bezier curves для всех 11 анимаций; agent должен прочитать его в plan-phase для извлечения precise duration/easing values.
- **`.planning/sketches/MANIFEST.md`** — sketch winners: 001-B (dashboard tabs), 002-B (bottom-sheet), 003 (4 edge-states), 004-A (timeline), 005-B (grouped+inline), 006-B (scrollable onboarding). Phase 23 components должны support эти patterns в Phase 24-27.
- **ADR-001** — DM Serif Display Italic не имеет cyrillic subset на Google Fonts; Phase 23 использует unicode-range fallback для PT Serif Italic (web) или единый PT Serif Italic (iOS pragmatic fallback).
- **ADR-002** — iOS NavigationStack не поддерживает `posterSlideInFwd/Back` keyframes; Phase 23 строит custom `PosterNavStack` (50 LOC ZStack + asymmetric transitions + ручной edge-swipe).

</specifics>

<deferred>
## Deferred Ideas

- **Web design tokens to dark mode** — out of scope (poster дизайн использует фон-per-screen, нет dark/light toggle).
- **iOS Liquid Glass / iOS 26 native effects** — explicit reject per `.planning/PROJECT.md` v0.6 retrospective (poster style overrides Apple HIG).
- **Animation runtime config** (slow-mo for QA) — defer R6.
- **Custom font subsetting (pyftsubset)** — only smoke-test in DS-02 acceptance, full subsetting в Phase 28 perf optimization.
- **Storybook migration** — rejected (in-Vite preview достаточно для single-team review).
- **Token theming variants** (alt brand colors) — out of scope (single brand).

</deferred>
