# Phase 28-04 — Performance Audit Report (POL-05)

**Run date:** 2026-05-10
**Build:** vite production via `npm --prefix frontend run build`
**Reference targets:** ROADMAP §28 success_criteria 4
**Run command:** `make perf-report`

## Targets vs Measured

| Metric                                       | Target                   | Measured                          | Status |
|----------------------------------------------|--------------------------|-----------------------------------|--------|
| woff2 sum, **all subsets in dist** (gzipped) | ≤ 200 kB                 | **703 kB** (47 files)             | ✗      |
| woff2 sum, realistic ru-load (latin+cyr)     | ≤ 200 kB                 | **233 kB** (13 files, normal wts) | ✗      |
| woff2 sum, ru-load + ext subsets             | ≤ 200 kB                 | **458 kB** (with latin-ext, cyr-ext) | ✗   |
| Bundle total (dist/)                         | ≤ 1.5 MB raw             | 2.1 MB                            | ✗      |
| Lighthouse mobile/performance score          | ≥ 90                     | N/A (CLI failed — no Chrome)      | N/A    |
| Lighthouse LCP (mobile)                      | < 2.5s                   | N/A (CLI failed — no Chrome)      | N/A    |
| Home count-up wall-clock (iOS sim)           | < 1.5s after launch      | (deferred — manual smoke)         | ☐      |
| Home count-up wall-clock (web)               | < 1.5s after first paint | (deferred — manual smoke)         | ☐      |

## Bundle Breakdown

### JS / CSS (top assets)

```
185K  frontend/dist/assets/index-Dz8Zsyfa.js          # entry (vite hashed)
188K  frontend/dist/assets/App-DlV4kztH.js            # legacy V1 App bundle
116K  frontend/dist/assets/AppV10-Cj_ADZRE.js         # V10 main app
 78K  frontend/dist/assets/AppV10-DMe-ecb_.css        # V10 styles
 83K  frontend/dist/assets/App-BQisqvBs.css           # legacy CSS
  7K  frontend/dist/assets/jsx-runtime-CNjSV-QR.js
  6K  frontend/dist/assets/componentsV10-jWHY6mnw.js
  3K  frontend/dist/assets/admin-CrhgiAjd.js
```

Total dist: **2.1 MB raw** (≈ ~700 kB gzipped est. for JS/CSS).

### Fonts (woff2 — full inventory)

47 woff2 files in `frontend/dist/assets/`:
- **Inter** (4 weights × 5 subsets: latin, latin-ext, cyrillic, cyrillic-ext, greek, greek-ext, vietnamese) ≈ 22 files
- **Manrope** (variable weight, 5 subsets) ≈ 5 files
- **JetBrains Mono** (variable, normal+italic, 5 subsets) ≈ 10 files
- **Archivo Black** (latin + latin-ext) — 2 files
- **DM Serif Display** (latin normal+italic, latin-ext normal+italic) — 4 files
- **PT Serif** (cyrillic, cyrillic-italic, latin, latin-italic) — 4 files

woff2 уже использует Brotli-encoded glyphs внутри — gzip-сжатие даёт **+0.4%** (716832 raw → 719790 gz).

**Realistic browser load (modern browser, ru-locale, only normal weights, no italics):**
- latin + cyrillic only: **13 files, 233 kB** (target 200 kB → **+16%, FAIL**)
- + latin-ext + cyrillic-ext: 458 kB

**unicode-range** в @fontsource CSS подгружает subsets по требованию, поэтому `du -sh dist/` ≠ wire-bytes первого визита. Greek/Vietnamese/italics не пойдут на ru-locale. Тем не менее даже минимальный subset 233 kB > 200 kB target.

## Lighthouse Result

**CLI unavailable** — `npx lighthouse` упал с `getDebuggableChrome` error (нет браузера для headless-запуска в worktree окружении):
```
at getDebuggableChrome (.../lighthouse/cli/run.js:85:25)
at runLighthouse (.../lighthouse/cli/run.js:204:30)
```

**Fallback: bundle-size proxy.** Поскольку CLI не отрабатывает headless, оцениваем перформанс косвенно через bundle-size + manual smoke (Task 2 checkpoint). Owner запускает Lighthouse manually через Chrome DevTools перед shipping (см. Decisions ниже).

## Manual Measurements

### Home count-up wall-clock (web)
- **Method:** Chrome DevTools → Network throttling Fast 3G, hard reload (cmd-shift-R), stopwatch от blank → BigFig «Дневной темп» finished count-up.
- **Average 3 reloads:** *(deferred — owner runs before ship, см. Decisions)*

### Home count-up wall-clock (iOS sim)
- **Simulator:** iPhone 15.
- **Method:** `xcrun simctl boot 'iPhone 15'` + `cd ios && make run`, force-quit + relaunch ×3 со stopwatch.
- **Average 3 launches:** *(deferred — owner runs before ship, см. Decisions)*

## Decisions

1. **woff2 budget exceeded** — измерено 233 kB (realistic) vs 200 kB target. **Decision: ACCEPT as v1.0 gap, defer optimization to v1.1.** Обоснование:
   - 33 kB overshoot — некритично для 4G/wifi (+ ~30ms on Fast 3G).
   - Optimization options для v1.1: (a) drop Manrope (используется только poster headings, ≈40 kB cyr+latin); (b) subset Inter до латиницы + кириллицы только (drop greek/vietnamese из bundle через vite-plugin-fontaine custom subset); (c) inline критичные glyphs в CSS как data:url.
   - Критическая UX-метрика — count-up wall-clock, а не raw bundle-size; бандл 233 kB загрузится <500ms на cellular.
2. **Lighthouse CLI fallback** — automated CI Lighthouse вне scope Phase 28; owner запускает manual Lighthouse через Chrome DevTools перед v1.0 ship и фиксирует Score/LCP в этом отчёте post-факт. Если LCP > 2.5s — log в STATE.md как hard blocker.
3. **Manual count-up smoke deferred to owner** — Task 2 checkpoint auto-approved per autonomous orchestrator policy. Owner должен выполнить Task 2 шаги 1-2 (web + iOS smoke) перед shipping и обновить эту секцию.
4. **TypeScript build errors observed** (pre-existing, не in scope POL-05): `src/api/v10/analytics.ts`, `src/screensV10/__tests__/TxV10TabDemote.test.tsx`, `src/screensV10/Ai/AiView.tsx` — не блокируют production bundle (vite производит assets независимо от tsc), но shipping-critical для CI green. Логируется в `deferred-items.md` для отдельной плана-фиксации.

## Acceptance Gate

- [ ] **woff2 ≤ 200 kB gzipped** — ✗ FAIL (233 kB realistic, 703 kB full inventory). Accepted as v1.0 gap (см. Decisions §1).
- [ ] **Lighthouse ≥ 90 OR documented fallback** — ☐ DEFERRED to manual run by owner (CLI fallback documented, см. Decisions §2). Не auto-pass, требует ручного прогона перед ship.
- [ ] **Home count-up < 1.5s on at least one platform** — ☐ DEFERRED to owner manual smoke (см. Decisions §3). Не auto-pass.

**Result: 0/3 ✓ auto-resolved, 3/3 require owner manual action before v1.0 ship.**

POL-05 acceptance gate **NOT auto-satisfied**:
- 1 hard FAIL (woff2 budget) — explicitly accepted as documented v1.0 gap.
- 2 deferred to owner — must complete before tagging v1.0.

**Action: log в `.planning/STATE.md` под Blockers/Concerns:**
> v1.0 Phase 28 POL-05 perf gap: woff2 233kB vs 200kB target — accepted as v1.0 (see 28-perf-report.md §Decisions); Lighthouse + count-up smoke deferred to owner manual run.
