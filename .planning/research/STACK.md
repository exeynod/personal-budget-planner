# Stack Research — Maximal Poster UI Migration (v1.0)

**Domain:** Cross-platform UI migration (Web TWA + native iOS) с pixel-perfect typographic poster дизайн-системой
**Researched:** 2026-05-09
**Confidence:** HIGH (npm registry verified; Apple docs verified; existing codebase прочитан)

---

## TL;DR — что добавляем поверх существующего стека

Существующее работает и не трогаем: Vite 8.0.10 / React 18.3.1 / TypeScript 5.6 / CSS Modules + `tokens.css` + `glass.css` для web; SwiftUI / iOS 26 deployment target / 0 deps / `glassEffect` для iOS.

**Web v1.0 добавляет (всего 4 npm пакета):**
- `@fontsource-variable/manrope@5.2.8` — body
- `@fontsource-variable/jetbrains-mono@5.2.8` — числа/eyebrow
- `@fontsource/dm-serif-display@5.2.8` — italic-серифные акценты (НЕ variable, грузим только `400-italic`)
- `@fontsource/archivo-black@5.2.8` — display заголовки (НЕ variable, single weight 900)

**Web v1.0 НЕ добавляет:** Framer Motion / Motion, Tailwind, vanilla-extract, Zustand, Percy, BackstopJS — обоснования ниже.

**iOS v1.0 добавляет: 0 npm/SPM пакетов.** Только TTF-файлы в `Resources/Fonts/` + `UIAppFonts` Info.plist. Все 11 keyframes реализуются через нативные `withAnimation`, `Path.trim`, `phaseAnimator`, `keyframeAnimator`, `.transition(.asymmetric(...))`.

---

## 1. Web Font Loading

### Recommended: `@fontsource(-variable)/*` self-host через Vite

| Package | Version | Variable? | Purpose | Размер subset (cyrillic+latin) |
|---------|---------|-----------|---------|--------------------------------|
| `@fontsource-variable/manrope` | 5.2.8 | wght 200–800 + italic | body | ~30 kB woff2 (cyrillic + latin VF) |
| `@fontsource-variable/jetbrains-mono` | 5.2.8 | wght 100–800 + ital | numbers/eyebrow | ~40 kB woff2 (cyrillic + latin VF) |
| `@fontsource/dm-serif-display` | 5.2.8 | static (только 400 + 400-italic) | italic accents | ~16 kB woff2 (italic-cyrillic + latin) |
| `@fontsource/archivo-black` | 5.2.8 | static (single weight 900) | display headlines | ~22 kB woff2 (cyrillic + latin) |

**Total bundle добавка: ~110 kB woff2 (gzip-compressed, all subsets).** Каждый subset загружается lazy через `unicode-range` (cyrillic-ext не подгружается если не встречается в DOM).

**Why fontsource (а не `<link>` к Google CDN):**

1. **Telegram Mini App контекст:** TWA загружается внутри Telegram WebView; добавление третьестороннего origin (`fonts.googleapis.com` + `fonts.gstatic.com`) → 2 дополнительных DNS+TLS handshake поверх Cloudflare Tunnel. Self-host = 0 cross-origin requests.
2. **FOUT prevention:** fontsource генерирует `@font-face` с `font-display: swap` по умолчанию (можно override через `index-font-display.css`). Bundling через Vite позволяет preload critical subset.
3. **Cyrillic subset:** Manrope/JetBrains Mono fontsource включают Cyrillic. Verified: `manrope-cyrillic-wght-normal.woff2` (14.2 kB) auto-loaded по `unicode-range`.
4. **Existing pattern в codebase:** `@fontsource/inter@5.2.8` уже используется (см. `frontend/package.json:14`) — добавляем по той же схеме.
5. **Vite-friendly:** `import "@fontsource-variable/manrope"` в `main.tsx` — Vite сам соберёт `@font-face` declarations и hash woff2 файлы. Нет дополнительного plugin.

**Конкретная схема импорта (для `frontend/src/main.tsx`):**
```ts
// Variable fonts: достаточно одного импорта (default = wght axis)
import "@fontsource-variable/manrope/wght.css";
import "@fontsource-variable/manrope/wght-italic.css"; // если italic нужен в body
import "@fontsource-variable/jetbrains-mono/wght.css";

// Static fonts: импортируем только нужные веса (НЕ index.css — он тянет все веса)
import "@fontsource/dm-serif-display/400-italic.css"; // только italic, regular не нужен
import "@fontsource/archivo-black"; // single weight 900 — index.css ОК
```

**FOUT-избегание (mandatory для acceptance criteria #7 в ТЗ.md):**
- Все `@fontsource/*` ставят `font-display: swap` → текст рендерится system fallback и swap при готовности.
- Чтобы убрать swap-flash на критичных hero (`text-mass`, BigFig) — добавить `<link rel="preload" as="font" type="font/woff2" crossorigin>` в `index.html` для двух критических woff2 (Manrope-cyrillic-wght-normal + JetBrainsMono-cyrillic-wght-normal). Vite manifest даст хешированные пути, но проще — захардкодить путь через `import.meta.glob` + emit в head.
- Альтернатива (проще): `font-display: optional` на critical fonts → если не загрузился за 100ms, использует fallback навсегда; нет swap-flash. Trade-off: первый визит может увидеть system font.

**Подбор fallback chain для CSS variables в `tokens.css`:**
```css
--font-archivo: "Archivo Black", "Helvetica Neue", Arial, sans-serif;
--font-serif: "DM Serif Display", "Times New Roman", serif;
--font-mono: "JetBrains Mono Variable", "JetBrains Mono", "SF Mono", Menlo, monospace;
--font-body: "Manrope Variable", "Manrope", -apple-system, "Segoe UI", sans-serif;
```

### Alternative considered: Google Fonts `<link>` preconnect+swap

Google CDN отдаёт font subsetted по unicode-range нативно (агрессивнее, чем fontsource). `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>` + `<link href="https://fonts.googleapis.com/css2?...">` — стандарт.

**Почему НЕ выбрано:**
- Дополнительный 3rd-party origin внутри Telegram WebView (см. выше).
- Privacy concern: Google видит каждое открытие приложения (IP пользователя). Для single-tenant pet OK, но fontsource убирает этот footprint.
- Плохо матчится с Caddy + Cloudflare Tunnel deployment: один origin — проще CSP.

### Alternative considered: Vite plugin `unplugin-fonts` или `vite-plugin-webfont-dl`

Plugin downloads Google fonts at build time → self-host. Решает то же что fontsource, но без npm-пакета.

**Почему НЕ выбрано:**
- Дополнительная build-time зависимость, требует internet at build (CI cache complications).
- `@fontsource/*` уже в проекте (для Inter) — добавление 4 пакетов = 0 новой инфраструктуры.

---

## 2. iOS Bundled Fonts

### Recommended: TTF в `Resources/Fonts/` + `UIAppFonts` в Info.plist + `Font.custom()`

**Структура файлов:**
```
ios/BudgetPlanner/Resources/Fonts/
├── Manrope-VariableFont_wght.ttf       (variable, ~80 kB; даёт все веса 200–800)
├── Manrope-Italic-VariableFont_wght.ttf (если нужен italic в body)
├── JetBrainsMono-VariableFont_wght.ttf  (variable, ~80 kB)
├── DMSerifDisplay-Italic.ttf            (static, ~50 kB; используем ТОЛЬКО italic — regular не bundle-им)
└── ArchivoBlack-Regular.ttf             (static, single weight 900, ~50 kB)
```

**Total bundle добавка: ~260 kB TTF (TTF не сжимается как woff2; в bundle уйдёт ~150 kB сжатого LZFSE).** Приемлемо: app size impact < 0.3 MB.

**TTF vs OTF выбор:**
- **TTF.** Apple одинаково хорошо рендерит оба формата начиная с iOS 14. TTF предпочтителен потому что Google Fonts отдаёт TTF как primary download (OTF не существует для всех 4-х шрифтов на одной странице) — никакой конвертации.
- **НЕ использовать WOFF/WOFF2 на iOS.** SwiftUI/UIKit не загружают сжатый формат через `UIAppFonts` — только TTF/OTF/TTC.

**Variable fonts на iOS — ВАЖНО:**
- iOS 16+ поддерживает variable fonts через `Font.custom("Manrope", size:).weight(.regular)` — SwiftUI автоматически выбирает соответствующую weight axis instance.
- На iOS 17+ работает стабильно, на iOS 26 (deployment target проекта) — точно работает.
- **Зачем:** Manrope нужен в 5 весах (400/500/600/700/800 — см. DESIGN-SYSTEM.md §2). Один variable TTF (~80 kB) заменяет 5 static TTF (~5 × 50 = 250 kB). Net saving ~170 kB.
- JetBrains Mono — то же самое, нужны 400/600/700.

**Регистрация — через Info.plist (НЕ через `CTFontManagerRegisterFontsForURL`):**

В `ios/project.yml` info-секцию добавить:
```yaml
UIAppFonts:
  - Fonts/Manrope-VariableFont_wght.ttf
  - Fonts/Manrope-Italic-VariableFont_wght.ttf
  - Fonts/JetBrainsMono-VariableFont_wght.ttf
  - Fonts/DMSerifDisplay-Italic.ttf
  - Fonts/ArchivoBlack-Regular.ttf
```

И добавить bundle phase в `ios/project.yml` для папки `Resources/Fonts/`:
```yaml
sources:
  - path: BudgetPlanner
    excludes:
      - "**/.DS_Store"
  - path: BudgetPlanner/Resources/Fonts
    type: folder
    buildPhase: resources
```

**Почему НЕ `CTFontManagerRegisterFontsForURL` runtime registration:**
- Runtime registration нужен только для downloadable fonts (App Store Connect on-demand resources) или для shared font bundles между targets. В нашем случае шрифты static, маленькие, идут в main bundle — `UIAppFonts` декларативный путь.
- Runtime registration дольше (асинхронная регистрация может не успеть к первому View) — это **главная причина FOUT на iOS**. `UIAppFonts` — синхронная регистрация at app launch, до первого `View.body` evaluation.

**SwiftUI API + fallback chain:**

Создать `ios/BudgetPlanner/Design/Typography.swift`:
```swift
extension Font {
    static func archivo(_ size: CGFloat) -> Font {
        .custom("ArchivoBlack-Regular", size: size)
            .weight(.black) // 900 — для самостраховки если custom не загрузился
    }
    static func dmSerifItalic(_ size: CGFloat) -> Font {
        .custom("DMSerifDisplay-Italic", size: size)
    }
    static func mono(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        .custom("JetBrainsMono", size: size).weight(weight)
        // "JetBrainsMono" — PostScript name variable font family
    }
    static func manrope(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        .custom("Manrope", size: size).weight(weight)
    }
}
```

**Точные PostScript names** — нужно проверить через `fc-list` или Font Book на Mac после распаковки TTF; обычно для Google variable fonts — это `Manrope`, `JetBrainsMono`. Phase 23 verification step.

**FOUT на iOS — practically impossible с UIAppFonts:**
- Шрифты в main bundle регистрируются СИНХРОННО до `applicationDidFinishLaunching`.
- Если PostScript name неверный → SwiftUI silently fallback на system font (НЕ FOUT, а wrong-font bug). Detection: запускать в Simulator с Console.app, ловить `CoreText note: Font ... did not match registered fonts` warning. Acceptance criteria для Phase 23.

### Alternatives considered

**Lottie для check-mark / dots animation:** см. §4 (rejected).

**SwiftUI `.fontDesign(.serif)` + system font:** не подходит — semantic typography от Apple не даст специфический look DM Serif Display Italic.

**Hot-reload через `CTFontManagerRegisterFontsForURL` для dev:** не нужно, шрифты не меняются в dev-цикле.

---

## 3. Web Animation Library

### Recommended: Pure CSS keyframes + Web Animations API (НЕ Motion / GSAP / Framer Motion)

Handoff package (`DESIGN-SYSTEM.md §7`) уже даёт **готовые CSS keyframes** для всех 11 анимаций (`posterRowIn`, `posterRiseIn`, `posterBarFill` и т.д.) с явными easing curves и durations. Это означает: 90% работы — copy-paste keyframes в `tokens.css` + применение через CSS classes.

**Почему НЕ нужна animation library:**

1. **Handoff prototype работает на чистых CSS keyframes** (см. README.md §"Технологический стек прототипа" — keyframes + Babel inline). Никакой fancy timeline-orchestration не нужен.
2. **Stagger делается через CSS variable + inline style:**
   ```tsx
   {items.map((item, i) => (
     <Row style={{ "--delay": `${0.08 + i * 0.045}s` } as CSSProperties}
          className={styles.staggered}>
   ))}
   // CSS: .staggered { animation: posterRowIn 420ms easeOut var(--delay) both; }
   ```
   В DESIGN-SYSTEM.md §7.4 уже зафиксированы все stagger formulas — буквально copy-paste.
3. **Count-up чисел** — единственная JS-driven анимация (DESIGN-SYSTEM.md §7.4). Нужен `useCountUp` hook ~30 строк (`requestAnimationFrame` + cubicOut). Motion для этого overkill — даже его утилитарный `animate(count, target)` тянет 4.6 kb.
4. **Bundle size:** Motion 4.6 kb (с LazyMotion + minimum surface) vs CSS keyframes 0 kb runtime. Для TWA внутри Telegram WebView каждый KB критичен.
5. **Web Animations API через `element.animate()`** — для редких case-by-case программных триггеров (FAB rotate on press, например). Native browser, 0 deps.

**Конкретная архитектура:**

```
frontend/src/styles/animations.css       — все 11 keyframes (copy из DESIGN-SYSTEM.md §7.2)
frontend/src/styles/easings.css          — CSS variables --ease-out, --overshoot, --sheet-ease
frontend/src/hooks/useCountUp.ts         — единственная JS hook (~30 LOC)
frontend/src/components/CountUp.tsx      — wrapper component (formatRu)
frontend/src/components/Stagger.tsx      — wrapper, прокидывает --delay через style
```

### Alternative considered: Motion (formerly Framer Motion) v12.38.0

**Pros:** declarative AnimatePresence для exit-animations, layout animations через `layoutId`, gestures.

**Почему НЕ выбрано для этого проекта:**
- Все 11 анимаций — appear/transition, нет complex layout animations или drag gestures, которые требуют JS-orchestration.
- AnimatePresence-style exit нужен ровно в одном месте (Bottom Sheet dismiss). Решается через CSS `transition: transform 350ms var(--sheet-ease)` + state-managed `transform: translateY(100%)`.
- Bundle cost минимум 4.6 kb (LazyMotion) — некритично, но без causa нет.

**Когда переключиться:** если в будущих милестонах появятся drag-to-dismiss bottom sheets, swipe-to-delete с rubber-band physics, shared element transitions между screens — тогда Motion v12 оправдан.

### Alternative considered: GSAP

Профессиональный инструмент для timeline-orchestration. Для нашего use case overkill (никаких scrubbed timelines, scroll-triggered choreography). Bundle 30+ kb.

### What NOT to use
- **`react-spring`**: spring-based, не подходит для cubic-bezier easings из handoff.
- **CSS-in-JS animation libs (`emotion/keyframes`, `styled-components keyframes`)**: project использует CSS Modules (zero-runtime), не CSS-in-JS — добавление сломает архитектурный паттерн.

---

## 4. iOS Animation Primitives

### Mapping CSS keyframe → SwiftUI native

DESIGN-SYSTEM.md §7.5 уже частично содержит этот mapping. Расширяем и зафиксируем версии API:

| CSS Keyframe | SwiftUI primitive | iOS API min | Notes |
|--------------|-------------------|-------------|-------|
| `posterRowIn` | `.transition(.opacity.combined(with: .offset(y: 8)))` + `.animation(.easeOut(duration: 0.42), value: visible)` | iOS 13+ | Stagger через `.delay(0.08 + i*0.045)` в `.animation` |
| `posterRiseIn` | то же, offset 14 | iOS 13+ | |
| `posterBarFill` | `.scaleEffect(x: progress, anchor: .leading)` + `.animation(.easeOut(duration: 0.85), value: progress)` | iOS 13+ | |
| `posterTabPop` | **`phaseAnimator([.normal, .popped])`** или `.scaleEffect(active ? 1.35 : 1.0).animation(.spring(response: 0.45, dampingFraction: 0.55))` | phaseAnimator iOS 17+ | spring аппроксимирует overshoot |
| `posterPopIn` | **`keyframeAnimator(initialValue: PopState())`** + 3 keyframes (0% → 60% → 100%) | iOS 17+ | Точная реализация overshoot |
| `posterCheck` | **`Path { ... }` + `.trim(from: 0, to: drawn).stroke()` + `.animation(.easeOut(duration: 0.35).delay(0.12))`** | iOS 13+ | Native, нет проблем |
| `posterDot` | `phaseAnimator([0, 1, 2], content: { ... }, animation: { _ in .easeInOut(duration: 0.4) })` + 3 dots с `.delay(Double(idx) * 0.18)` | iOS 17+ | Альтернатива: `Timer.publish` + `@State` |
| `posterSlideInFwd` | `.transition(.asymmetric(insertion: .move(edge: .trailing).combined(with: .opacity), removal: .move(edge: .leading)))` | iOS 13+ | Кастомный `PosterNavStack` использует это (см. §7) |
| `posterSlideInBack` | `.transition(.asymmetric(insertion: .move(edge: .leading), removal: .move(edge: .trailing)))` | iOS 13+ | |
| `posterTabSwap` | `.transition(.opacity.combined(with: .offset(y: 8)))` + `.animation(.easeOut(0.35))` | iOS 13+ | |
| `posterToastIn` | `keyframeAnimator` (0% → 60% overshoot → 100%) | iOS 17+ | Custom toast view через `.overlay` |

**Все 11 mappings — vanilla SwiftUI. 0 dependencies.**

**Lottie?** — НЕТ.
- Lottie добавляет ~500 kB SPM dependency (`lottie-ios`).
- Все наши анимации — простые transforms/opacity/path drawing, нативно покрываются SwiftUI primitives с iOS 17+.
- Lottie оправдан только для complex illustration animations (дизайнер-AE-экспорт). У нас нет таких.

### Custom easing curves (важно для accuracy)

CSS easings из handoff:
- `easeOut` = `cubic-bezier(0.22, 0.61, 0.36, 1)` → SwiftUI: `.timingCurve(0.22, 0.61, 0.36, 1, duration: 0.42)`
- `overshoot` = `cubic-bezier(0.34, 1.56, 0.64, 1)` → `.timingCurve(0.34, 1.56, 0.64, 1, duration: 0.5)` или `.spring(response: 0.5, dampingFraction: 0.55)` (визуально аппроксимирует)
- `sheetEase` = `cubic-bezier(0.32, 0.72, 0, 1)` → `.timingCurve(0.32, 0.72, 0, 1, duration: 0.35)`

Создать enum в `Tokens.swift`:
```swift
enum AnimEase {
    static let easeOut = Animation.timingCurve(0.22, 0.61, 0.36, 1, duration: 0.42)
    static let overshoot = Animation.timingCurve(0.34, 1.56, 0.64, 1, duration: 0.5)
    static let sheetEase = Animation.timingCurve(0.32, 0.72, 0, 1, duration: 0.35)
}
```

**Note:** SwiftUI `.timingCurve` ограничивает control points в [0, 1] для x-axis, но y-axis может быть >1 (overshoot). Apple docs подтверждают.

### Count-up чисел на iOS

В DESIGN-SYSTEM.md §7.5: `withAnimation(.easeOut(duration: 0.9)) { value = target } + Text(value, format: ...)`. Это работает только если `Text` рендерит animatable property — для `Double` через `AnimatableModifier` или `.contentTransition(.numericText(value:))` (iOS 17+).

**Recommended:** `.contentTransition(.numericText())` (iOS 17+, native, 0 кода):
```swift
Text("\(displayValue)")
    .contentTransition(.numericText(value: Double(displayValue)))
    .onAppear { withAnimation(.easeOut(duration: 0.9)) { displayValue = target } }
```

Single line анимация count-up без custom hook.

---

## 5. Web Design System Approach

### Recommended: Vanilla CSS variables + CSS Modules (продолжение существующего паттерна)

**Текущее состояние codebase:**
- `frontend/src/styles/tokens.css` — CSS variables (тонкий, ~80 LOC; токены типографики, цветов, spacing)
- `frontend/src/styles/glass.css` — utility classes для glass-эффектов
- `frontend/src/screens/*.module.css` — CSS Modules per-screen (HomeScreen.module.css, AnalyticsScreen.module.css и т.д.)
- `frontend/src/components/*.module.css` — CSS Modules per-component

**Это работает. Не ломаем.** Maximal Poster дизайн-система мапится 1:1:

```css
/* tokens.css — расширяем для v1.0 */
:root {
  /* Palette (overwrite — старая dark-banking palette уходит) */
  --cream:  #F4EAD9;
  --ink:    #1B1A18;
  --paper:  #FFF6E8;
  --black:  #0E0E0E;
  --coral:  #FF5A3C;
  --cobalt: #1B2A6B;
  --yellow: #FFE76E;
  --red:    #C24A2A;

  /* Type scale */
  --text-eye: 11px;
  --text-body: 13px;
  --text-mono-md: 14px;
  --text-display: 64px;
  /* ... */

  /* Easings — из handoff */
  --ease-out: cubic-bezier(0.22, 0.61, 0.36, 1);
  --overshoot: cubic-bezier(0.34, 1.56, 0.64, 1);
  --sheet-ease: cubic-bezier(0.32, 0.72, 0, 1);

  /* Font families */
  --font-archivo: "Archivo Black", "Helvetica Neue", sans-serif;
  --font-serif: "DM Serif Display", "Times New Roman", serif;
  --font-mono: "JetBrains Mono Variable", "JetBrains Mono", monospace;
  --font-body: "Manrope Variable", "Manrope", -apple-system, sans-serif;
}
```

**Why CSS Modules + CSS vars (а не альтернативы):**

1. **Уже паттерн в codebase** (verified: 28 `.module.css` файлов в `screens/` + `components/`). Roadmapper не должен ломать архитектуру при миграции — handoff явно говорит "источник правды по визуалу — prototype + DESIGN-SYSTEM.md", не "перепиши вообще всё".
2. **Type-safe enough:** TypeScript видит `import styles from './X.module.css'` — IDE подсказки работают через `vite-plugin-css-modules` или `@types/css-modules`.
3. **Zero runtime overhead:** CSS Modules компилируется в обычный CSS at build time (как vanilla-extract).
4. **Composability:** keyframes и переменные шарятся через `tokens.css` `@import` или global include в `main.tsx`.

### Alternative considered: vanilla-extract

**Pros:** type-safe styling в TS, zero-runtime, отличная composability через Sprinkles + Recipes. Идеально для multi-theme систем.

**Почему НЕ выбрано:**
- Migration cost: переписать 28 `.module.css` файлов на `.css.ts` без видимой выгоды.
- Single-tenant pet, single-theme (poster) — multi-theme overhead не нужен.
- Добавляет build-time дeps (`@vanilla-extract/css`, `@vanilla-extract/vite-plugin`).

### Alternative considered: Tailwind v4

**Pros:** CSS-first config, DX через автокомплит, design tokens прямо как CSS variables. Маленький bundle через JIT.

**Почему НЕ выбрано:**
- Тоже migration cost — все existing `.module.css` придётся переписать.
- Maximal Poster не "utility-first" дизайн: много custom typography combos, которые будут multi-line строки утилит (`text-[64px] tracking-[-0.04em] leading-[0.92] font-[var(--font-mono)] ...`) — менее читаемо, чем именованный CSS class в `.module.css`.
- Tailwind хорош для прототипа с hundred small components; здесь у нас 16 экранов с уникальными hero-блоками.

### Alternative considered: CSS-in-JS (emotion/styled-components)

**Почему НЕ выбрано:** runtime overhead, hydration concerns в TWA, отказ от существующей CSS Modules архитектуры. `tokens.css` + CSS Modules покрывает всё без runtime cost.

---

## 6. Side-by-Side QA Tooling

### Recommended Web: Playwright `toHaveScreenshot()` (уже в проекте)

**Existing setup verified:** `frontend/playwright.config.ts` существует, `@playwright/test@1.59.1` в devDependencies, e2e тесты работают (см. recent commit `cfdecaa`).

**Расширение для visual regression:**
```ts
// frontend/tests/e2e/visual.spec.ts
test('home screen matches poster prototype', async ({ page }) => {
  await page.goto('/');
  await page.setViewportSize({ width: 390, height: 844 }); // mobile-first из ТЗ
  await expect(page).toHaveScreenshot('home.png', {
    maxDiffPixelRatio: 0.01, // <1% pixel diff допустим (font rendering)
    animations: 'disabled',  // wait for all animations to settle
  });
});
```

**Workflow side-by-side:**
1. Baseline: запустить prototype `index.html` через `python -m http.server`, сделать ручной screenshot 390×844 → положить в `frontend/tests/visual-baseline/poster-{screen}.png`.
2. Implement screen в React.
3. `npx playwright test --update-snapshots` создаёт actual snapshot.
4. Compare через Playwright Report (built-in side-by-side diff с slider).
5. Iterate до `maxDiffPixelRatio < 0.01`.

**Why Playwright (а не Percy / BackstopJS):**
- **Уже установлен.** 0 added dependencies.
- **Local-first, free.** Percy paid после 5000 screenshots/month; для pet-проекта — overkill.
- **Built-in diff viewer** через `npx playwright show-report` — drag slider между expected/actual/diff.
- **Pixelmatch engine:** 1280×720 compare ~50 ms — быстро для 16 экранов.

**Anti-recommendations:**
- ❌ **Percy**: cloud-based, требует API key, создан для CI-team workflows. Single-developer pet — не нужен.
- ❌ **BackstopJS**: отдельный standalone tool с собственным CLI, потребует config + JSON-driven scenarios. Playwright уже умеет всё.
- ❌ **Chromatic**: завязан на Storybook (которого в проекте нет).

### Recommended iOS: XcodeBuildMCP screenshot + manual side-by-side

**Existing setup verified:** XcodeBuildMCP уже доступен (см. memory `ios-tooling.md`). `make run` запускает Simulator.

**Workflow:**
1. **Reference screenshots Web prototype:** Playwright captures 390×844 web screen → `prototype-{screen}.png`.
2. **iOS Simulator screenshot:** через XcodeBuildMCP `screenshot_simulator` → `ios-{screen}.png`. Размер автоматически iPhone 16 (393×852) — близко к 390×844 web.
3. **Manual diff в Preview.app или Pixelmator:** Cmd+click слой top, opacity 50%, ловить misalignments.
4. **Acceptance:** human review (это pet, не enterprise) — нет automated pixel-diff между Web и iOS из-за разных font rendering, status bar, и т.д.

**Почему НЕ XCUITest snapshot testing для visual diff:**
- XCUITest snapshot tests хороши для regression iOS-vs-iOS (catch rendering changes между iOS versions). Но Maximal Poster QA требует Web ↔ iOS comparison, а не iOS ↔ iOS — тут нет automated tool.
- Manual side-by-side — единственный надёжный path для pixel-perfect (см. memory `feedback-pixel-perfect.md`).

**Tooling recommendation:** установить `Pixelmator Pro` или использовать Preview.app слои; никаких новых SPM/npm пакетов.

---

## 7. Swift Custom Navigation Stack

### Recommended: Pure SwiftUI ZStack + `.transition(.asymmetric(...))` (Custom `PosterNavStack`)

ТЗ §2 требует `posterSlideInFwd` (28px translate, 420ms easeOut) на push, `posterSlideInBack` на pop. NavigationStack даёт **системный iOS push transition** который мы НЕ хотим (visual style — Apple HIG, не Maximal Poster).

**Architecture (для `ios/BudgetPlanner/Navigation/PosterNavStack.swift`):**

```swift
@MainActor
final class PosterNavRouter: ObservableObject {
    @Published var stack: [AnyHashable] = []  // route enum cases
    func push(_ route: AnyHashable) { stack.append(route) }
    func pop() { _ = stack.popLast() }
}

struct PosterNavStack<Root: View>: View {
    @StateObject private var router = PosterNavRouter()
    let root: () -> Root
    @ViewBuilder var content: (AnyHashable) -> AnyView

    var body: some View {
        ZStack {
            // Render only top of stack — predecessors mounted offscreen-ish
            if let top = router.stack.last {
                content(top)
                    .id(top)  // crucial: forces .transition trigger
                    .transition(.asymmetric(
                        insertion: .move(edge: .trailing).combined(with: .opacity),
                        removal: .move(edge: .leading).combined(with: .opacity)
                    ))
            } else {
                root()
                    .transition(.asymmetric(
                        insertion: .move(edge: .leading).combined(with: .opacity),
                        removal: .move(edge: .trailing).combined(with: .opacity)
                    ))
            }
        }
        .animation(AnimEase.easeOut, value: router.stack)
        .environmentObject(router)
    }
}
```

**Why pure SwiftUI ZStack:**

1. **Полный контроль над transitions.** `posterSlideInFwd` = 28px translate (не full screen), exact timing 420ms. `NavigationStack` push = system 60% width slide ~350ms, нельзя override.
2. **0 dependencies.** Pet-проект, 0 deps philosophy в memory `project-state.md`.
3. **iOS 26 supported natively.** `.transition(.asymmetric)` стабилен с iOS 13.
4. **Совместим с `glassEffect` tab bar.** Tab bar остаётся — это inverted relative to current screen (см. DESIGN-SYSTEM.md §1). Простой ZStack: tab bar layer + nav stack layer.

### Alternative considered: `NavigationStack` + `.navigationTransition(.zoom(...))` (iOS 18+)

`navigationTransition` (iOS 18+) даёт zoom (matched geometry) или automatic. **Нет custom-cubic-bezier slide.** Только presets.

**Почему НЕ выбрано:**
- Не покрывает требование 28px translate из handoff.
- Привязка к specific source ID для zoom — не наш use case (мы хотим plain slide).

### Alternative considered: `UIViewControllerRepresentable` + `UINavigationController` с custom `UIViewControllerAnimatedTransitioning`

UIKit nav controller с custom animator даёт абсолютный контроль (тот же подход, что react-navigation на iOS). Но:
- ~150 LOC boilerplate для wrap UINavController в SwiftUI.
- Сложнее debug (UIKit vs SwiftUI state sync).
- ZStack approach делает то же самое в 50 LOC.

### Alternative considered: `davdroman/swiftui-navigation-transitions` SPM

SPM package, ~600 GitHub stars, MIT license. Apply `.navigationTransition(.slide)` modifier к существующему `NavigationStack`.

**Почему НЕ выбрано:**
- Pet 0-deps philosophy.
- Library только для preset transitions (slide / fade / push); custom cubic-bezier+offset придётся всё равно вручную дописать.

### Custom Sheet (`PosterSheet`)

ТЗ §12 (Add Sheet): чёрный фон, slide-up из bottom через `sheetEase` cubic-bezier, backdrop fade 280ms linear, confirm dialog при closing-with-changes.

**Recommended:** custom view через `.overlay` + `transform: translateY` animation, НЕ нативный `.sheet { ... }`:

```swift
struct PosterSheet<Content: View>: View {
    @Binding var isPresented: Bool
    let content: () -> Content

    var body: some View {
        ZStack(alignment: .bottom) {
            if isPresented {
                Color.black.opacity(0.55)
                    .ignoresSafeArea()
                    .transition(.opacity)
                    .onTapGesture { isPresented = false }
                content()
                    .background(Color(hex: 0x0E0E0E))  // POSTER.black
                    .transition(.move(edge: .bottom))
            }
        }
        .animation(AnimEase.sheetEase, value: isPresented)
    }
}
```

**Why custom (а не native `.sheet { }`):**
- Native sheet на iOS 26 — system Liquid Glass, rounded corners (24px), specific spring animation. Maximal Poster требует **0 radius, чёрный flat фон, custom cubic-bezier 350ms**. Невозможно достичь через `.presentationDetents` + `.presentationCornerRadius` (которые ограничивают, не override).
- `.transition(.move(edge: .bottom))` + `AnimEase.sheetEase` — exact timing match.

---

## Installation Plan

### Web (frontend/)

```bash
cd frontend
npm install \
  @fontsource-variable/manrope@5.2.8 \
  @fontsource-variable/jetbrains-mono@5.2.8 \
  @fontsource/dm-serif-display@5.2.8 \
  @fontsource/archivo-black@5.2.8
```

**No dev dependencies added.** `@playwright/test` и `vite` уже установлены.

**File changes:**
- `frontend/src/main.tsx` — добавить 5 import statements.
- `frontend/src/styles/tokens.css` — переписать palette + typography variables под Maximal Poster.
- `frontend/src/styles/animations.css` — новый файл, 11 keyframes copy из DESIGN-SYSTEM.md §7.2.
- `frontend/src/index.html` — preload critical font woff2 (после Vite build, через manifest).

### iOS (ios/)

```bash
# Скачать TTF с fonts.google.com:
mkdir -p ios/BudgetPlanner/Resources/Fonts
# (download Manrope, JetBrainsMono, DMSerifDisplay, ArchivoBlack)
# place в Resources/Fonts/

# Update project.yml — добавить UIAppFonts + Resources/Fonts source path
# Regenerate project:
cd ios && xcodegen generate
make run
```

**0 npm/SPM dependencies added.**

**File changes:**
- `ios/project.yml` — UIAppFonts entries + Resources/Fonts path.
- `ios/BudgetPlanner/Resources/Fonts/*.ttf` — 5 файлов (~260 kB total).
- `ios/BudgetPlanner/Design/Typography.swift` — новый файл, `Font.archivo/.dmSerifItalic/.mono/.manrope` extensions.
- `ios/BudgetPlanner/Design/Tokens.swift` — расширить `Tokens.Palette` (coral/cobalt/cream/yellow), добавить `AnimEase`.
- `ios/BudgetPlanner/Navigation/PosterNavStack.swift` — новый файл, `PosterNavStack` + `PosterNavRouter`.
- `ios/BudgetPlanner/Components/PosterSheet.swift` — новый файл.

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `@fontsource/*` self-host | Google Fonts `<link>` preconnect | Если нужны новые шрифты часто (никогда в pet) |
| Pure CSS keyframes + `useCountUp` | Motion v12.38 / framer-motion | Если будут drag gestures, layout animations, complex orchestration |
| Vanilla CSS Modules + `tokens.css` | Tailwind v4 / vanilla-extract | Greenfield project; multi-theme system |
| Custom `PosterNavStack` (ZStack) | `davdroman/swiftui-navigation-transitions` SPM | Если нужна готовая палитра custom transitions без 50 LOC boilerplate |
| Custom `PosterSheet` overlay | Native `.sheet { }` + `.presentationDetents` | Если можем согласиться на system iOS 26 chrome (мы не можем) |
| Variable TTF (Manrope/JetBrains) | Static TTF (5+ файлов на семейство) | На очень старых iOS (<16) — у нас iOS 26 deployment target |
| Playwright `toHaveScreenshot()` | Percy / BackstopJS | Multi-developer team с CI-driven review |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **Framer Motion / Motion** | 4.6+ kb baseline cost; нет complex orchestration use cases в этом миленстоуне; CSS keyframes из handoff покрывают 100% | Pure CSS keyframes + `useCountUp` hook |
| **Tailwind v4** | Migration cost (28 `.module.css` файлов); custom typography combos станут multi-line utility strings | Existing CSS Modules + расширение `tokens.css` |
| **vanilla-extract** | Migration cost; single-theme проект | CSS Modules |
| **Lottie iOS** | 500 kB SPM; все наши анимации native SwiftUI primitives покрывают | `Path.trim`, `phaseAnimator`, `keyframeAnimator`, `withAnimation` |
| **`UINavigationController` через `UIViewControllerRepresentable`** | UIKit↔SwiftUI state sync complexity; ~150 LOC boilerplate | Custom `PosterNavStack` (ZStack + transitions, 50 LOC) |
| **`CTFontManagerRegisterFontsForURL` runtime registration** | Async registration → FOUT race condition; SwiftUI silently fallback на system font если шрифт не готов | `UIAppFonts` Info.plist (синхронная регистрация at app launch) |
| **WOFF/WOFF2 на iOS** | iOS bundle resources не поддерживают сжатые font формaты для UIAppFonts | TTF (Google Fonts download default) |
| **Percy / BackstopJS** | Cloud-paid (Percy) или standalone-tooling-cost (Backstop); Playwright уже в проекте | Playwright `toHaveScreenshot()` |
| **Native `.sheet { }`** для Add Sheet | iOS 26 system Liquid Glass = Apple HIG style, не Maximal Poster | Custom `PosterSheet` overlay |
| **`navigationTransition(.zoom)`** (iOS 18+) | Только presets (zoom / automatic), нет custom cubic-bezier slide | Custom `PosterNavStack` |
| **CSS-in-JS (emotion / styled-components)** | Runtime overhead; ломает existing CSS Modules архитектуру | CSS Modules + tokens.css |
| **Storybook** | Никогда не было в проекте; cost setup > value для 16 экранов | Прямая разработка + Playwright visual snapshot |

---

## Stack Patterns by Variant

**If нужно добавить layout animations / shared element transitions (post-v1.0):**
- Установить `motion@12.x` через `import { motion, LazyMotion, domAnimation } from "motion/react"` (LazyMotion = 4.6 kb baseline)
- Использовать `layoutId` для cross-screen transitions
- НЕ заменять CSS keyframes — добавить sparingly где Motion даёт явное преимущество

**If нужно multi-theme (light/dark/branded):**
- Расширить `tokens.css` через `@media (prefers-color-scheme: dark)` или `[data-theme="..."]` selectors
- НЕ переходить на vanilla-extract без причины — CSS variables покрывают runtime theme switching

**If возникнут performance issues с font loading в TWA:**
- Перейти на `font-display: optional` (drop swap-flash полностью; первый визит без custom font OK для personal app)
- Preload только 2 critical woff2 (Manrope-cyrillic + JetBrainsMono-cyrillic) через `<link rel="preload">`
- Subset вручную через `pyftsubset` если default fontsource subsets слишком большие (unlikely при cyrillic + latin = 30 kB)

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `@fontsource-variable/manrope@5.2.8` | Vite 8.x, React 18.x | Works через standard CSS imports; нет Vite-specific plugin |
| `@fontsource/dm-serif-display@5.2.8` | Vite 8.x | Static font; используем `/400-italic.css` импорт |
| `@playwright/test@1.59.1` | Node 20+, Vite 8.x | Existing in project; visual snapshots stable |
| iOS variable fonts (`Manrope-VariableFont_wght.ttf`) | iOS 16+ (project = 26) | `Font.custom().weight()` mapping автоматический |
| `phaseAnimator` / `keyframeAnimator` SwiftUI | iOS 17+ (project = 26) | Stable API |
| `.contentTransition(.numericText)` | iOS 17+ (project = 26) | Stable; работает без custom Animatable |
| Vite 8.0.10 + React 18.3.1 | Existing | Не трогаем |

---

## Sources

- [@fontsource-variable/manrope on npm](https://www.npmjs.com/package/@fontsource-variable/manrope) — verified version 5.2.8 (2025-09-17), HIGH confidence
- [@fontsource/dm-serif-display on npm](https://www.npmjs.com/package/@fontsource/dm-serif-display) — verified version 5.2.8, HIGH confidence
- [Manrope on Fontsource](https://fontsource.org/fonts/manrope) — verified Cyrillic subset support, wght axis 200–800 + italic, HIGH
- [JetBrains Mono on Fontsource](https://fontsource.org/fonts/jetbrains-mono) — verified Cyrillic, wght 100–800 + ital axis, HIGH
- [Motion (Framer Motion) v12.38.0](https://motion.dev/docs/react-installation) — verified version, MEDIUM (rejected for project)
- [Motion bundle size docs](https://motion.dev/docs/react-reduce-bundle-size) — 4.6 kb LazyMotion baseline, MEDIUM
- [Playwright Visual Comparisons](https://playwright.dev/docs/test-snapshots) — `toHaveScreenshot()` API, HIGH
- [Apple — NavigationTransition (iOS 18+)](https://developer.apple.com/documentation/swiftui/navigationtransition) — verified zoom/automatic only, HIGH (rejected for project)
- [Apple — PhaseAnimator (iOS 17+)](https://developer.apple.com/documentation/swiftui/phaseanimator) — HIGH
- [Apple — phaseAnimator/keyframeAnimator availability](https://developer.apple.com/documentation/swiftui/view/phaseanimator(_:content:animation:)) — iOS 17+ verified, HIGH
- [Custom fonts in SwiftUI guide (Just Do Swift)](https://justdoswift.substack.com/p/custom-fonts-in-swiftui-a-practical) — UIAppFonts vs runtime registration, MEDIUM
- [Apple Developer Forums — SwiftUI Custom Fonts thread](https://developer.apple.com/forums/thread/659219) — FOUT scenarios, MEDIUM
- [Existing project files] `frontend/package.json`, `frontend/vite.config.ts`, `ios/project.yml`, `ios/BudgetPlanner/Design/Tokens.swift`, `ios/BudgetPlanner/Design/Glass.swift`, `frontend/src/styles/{tokens.css,glass.css}` — HIGH (direct read)
- [Handoff package] `.planning/v1.0-handoff/handoff/{ТЗ.md,DESIGN-SYSTEM.md,README.md}` — HIGH (direct read)

---

*Stack research for: Maximal Poster UI migration (Web TWA + iOS native)*
*Researched: 2026-05-09*
*Confidence: HIGH*
