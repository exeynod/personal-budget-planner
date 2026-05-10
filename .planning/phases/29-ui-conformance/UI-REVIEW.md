# UI Conformance Review — Phase 29

**Generated:** 2026-05-11
**Method (Web):** Playwright snapshots → side-by-side vs `prototype/index.html` (plan 29-01 + 29-02).
**Method (iOS):** XcodeBuildMCP screenshots → audit vs `DESIGN-SYSTEM.md` + `SCREENS.md` (plan 29-03).
**Reference:** `.planning/v1.0-handoff/handoff/prototype/index.html`, `.planning/v1.0-handoff/handoff/DESIGN-SYSTEM.md`, `.planning/v1.0-handoff/handoff/SCREENS.md`.

Pre-known divergences in `.planning/v1.0-handoff/DIVERGENCES.md` (W-01..W-05, I-01..I-05, X-01..X-02) are excluded from re-flagging.

---

## Web

> Web section produced by plan 29-02 (parallel agent). If this file was created
> by plan 29-03 first (before 29-02 finished), the web side fills in below; if
> 29-02 ran first, this header is preserved untouched and the iOS section appends.

_Awaiting plan 29-02 output. The plan 29-03 audit on iOS appended below is
self-contained._

---

## iOS

Per-screen deviation report against `DESIGN-SYSTEM.md` + `SCREENS.md`.
Screenshots via XcodeBuildMCP on iPhone 17 Pro Simulator (UDID
`B4EFC6AF-874A-4B09-AB3B-B9D94230DD3F`, iOS 26.4, `BudgetPlanner.app`
bundle `com.exeynod.BudgetPlanner`). Snapshots committed at
`.planning/phases/29-ui-conformance/ios-screenshots/`.

### Excluded — known iOS DIVERGENCES.md

- **I-01** (DM Serif Cyrillic → PT Serif fallback for italic Mass) — accepted ADR-001.
- **I-02** (custom `PosterNavStack` vs SwiftUI `NavigationStack`) — accepted ADR-002.
- **I-03** (`.spring(0.45, 0.55)` SwiftUI primitive ≈ CSS `cubic-bezier(0.34, 1.56, 0.64, 1)` overshoot for `posterTabPop`) — accepted.
- **I-04** (safe-area top/bottom insets per device; web prototype is flat) — accepted (Apple HIG).
- **I-05** (bare `.animation()` callsites flagged by Plan 28-02 audit, including `PosterStyle.swift:44`, `KeypadView.swift:72`) — deferred to v1.1 backlog (DEBT-06).

These rows are NOT re-opened by this audit.

---

### iOS-1. Home

**Screenshot:** `ios-screenshots/home.png`
**Reference:** DESIGN-SYSTEM §1 (coral palette), §2 (typography), §6.1/6.2/6.3 (Eyebrow / Mass-italic / BigFig), SCREENS §01 (layout).
**Source:** `ios/BudgetPlanner/FeaturesV10/Home/HomeV10View.swift`

**Status:** PASS

**Findings:**

- _No deviations._ Coral background (PosterTokens.Color.coral = `#FF5A3C` matches §1), eyebrow `VOL.17 / MAY 2026 · 21 ДЕНЬ` (Manrope/JetBrains Mono per §6.1), italic Mass «Дневной темп —» rendered via PosterSerifItalic (I-01 fallback acceptable), BigFig «1 428₽» (PosterTokens.FontSize.display = 88pt per §6.3), PLAN МЕСЯЦА badge with surplus chevron, КАТЕГОРИИ section header + «ВСЕ ОПЕРАЦИИ →» link, two category rows (02 ТРАНСПОРТ, 01 ПРОДУКТЫ) with 0% bar — all consistent with prototype.
- Right-side «МЕНЮ ↗» is rendered (line 111 `HomeV10View.swift`) but documented as no-op until Phase 26+; **not a deviation** for v1.0 — prototype shows same text-only chrome.

---

### iOS-2. Transactions (Реестр)

**Screenshot:** `ios-screenshots/transactions.png`
**Reference:** DESIGN-SYSTEM §1 (cobalt + paper text), §6.2 (Mass-italic), §6.6 (chips), SCREENS §02.
**Source:** `ios/BudgetPlanner/FeaturesV10/Transactions/TransactionsV10View.swift`

**Status:** WARNING

**Findings:**

- **[WARNING] Eyebrow `← НАЗАД SECTION II` shown but spec eyebrow is just `SECTION II`.**
  - File: `TransactionsV10View.swift` (header row composition; back button is V10 nav, eyebrow text matches).
  - Expected (SCREENS §02): `Eyebrow: «SECTION II»` standalone.
  - Actual: `← НАЗАД` + `SECTION II` rendered inline (back chevron is per `I-02`/PosterNavStack contract — acceptable). The eyebrow part itself matches spec.
  - Severity downgrade: WARNING because the back button is a navigation affordance (acceptable per I-02), not extra eyebrow text.

- **[INFO] Mass-italic «Реестр.» rendered at ~70pt** matches SCREENS §02 → PASS.

- **[INFO] Filter chips order:** screenshot shows `ВСЕ | КАФЕ | ПРОДУКТЫ | ТРАНСПОРТ | П<...>` (last chip truncated past viewport). SCREENS §02 lists `Все / Кафе / Продукты / Транспорт / Подписки / Копилка`. Truncation is a chip-row scroll affordance — **not a deviation**, chips are horizontally scrollable per §6.6.

- **[INFO] Empty state DM Serif italic «Реестр пуст —»** matches §02 («Ничего не найдено …») pattern — **PASS** (empty-state copy is contextual: «пуст» when there are no records at all; «не найдено в фильтре» when filter excludes results).

---

### iOS-3. AddSheet

**Screenshot:** `ios-screenshots/add-sheet.png`
**Reference:** DESIGN-SYSTEM §1 (black + paper), §6.3 (BigFig), §6.5 (CTA), §6.6 (chips), SCREENS §10.
**Source:** `ios/BudgetPlanner/FeaturesV10/AddSheet/AddSheetView.swift`

**Status:** PASS

**Findings:**

- _No deviations._ Black background (PosterTokens.Color.black = `#0E0E0E` per §1). BigFig «0₽» rendered in yellow (PosterTokens.Color.yellow = `#FFE76E`) at ~86pt with «₽» suffix at 36% indicator size and opacity 0.7 — matches §6.3. Eyebrow `NEW ENTRY · 11 МАЯ · 01:33` in JetBrains Mono — §6.1. Close button `×` top-right. Custom 3×4 keypad rendered with paper-tinted plates and ink digits — matches SCREENS §10 ASCII layout exactly. Description placeholder italic «кафе / продукты / …» — matches §10. Date chips («СЕГОДНЯ» active yellow, «ВЧЕРА» / «СВОЯ ДАТА» ghost) per §6.6 active/inactive rule. Category chips «ПРОДУКТЫ» / «ТРАНСПОРТ» rendered (matches available categories). Ghost CTA «ВВЕДИТЕ СУММУ» (disabled state per §10 amount=0 rule) — correct.
- System keyboard suppressed per HIG; numeric input only via custom keypad — matches SCREENS §10 footnote ("system kb suppressed").

---

### iOS-4. CategoryDetail (ПРОДУКТЫ, in-plan / cobalt variant)

**Screenshot:** `ios-screenshots/category-detail.png`
**Reference:** DESIGN-SYSTEM §1 (cobalt OR red per isOver), §6.2 (Mass UPPER), §6.3 (BigFig), SCREENS §04.
**Source:** `ios/BudgetPlanner/FeaturesV10/CategoryDetail/CategoryDetailView.swift`

**Status:** PASS

**Findings:**

- _No deviations for cobalt variant captured._ Cobalt background (PosterTokens.Color.cobalt = `#1B2A6B`). Eyebrow `← НАЗАД CATEGORY · 01` per §6.1 + I-02. Mass UPPER «ПРОДУКТЫ» (Archivo Black 88pt per §6.2 numeric variant) renders correctly. Tweak phrase italic «— на 0% плана» beneath Mass — matches SCREENS §04 («— превышено на 24%» pattern, here rendered for in-plan as «на N% плана»).
- BigFig «0₽» yellow + suffix — §6.3.
- Out-of-plan progress bar at 0% (paper @ 0.18 opacity track, no fill) — correct for empty category.
- Eyebrow «из 10 000 ₽» under bar — matches §04 «… ₽» pattern.
- Plate rows «ОСТАТОК → ПРОЧЕЕ ›» and CTA «+ ПОДНЯТЬ ЛИМИТ» (paper) / «ПАУЗА» (ghost) — matches §04 + §6.4/§6.5.
- Operations section header «ОПЕРАЦИИ ПО КАТЕГОРИИ» + italic empty state «Операций пока нет» — PASS.

**NOT CAPTURED:** isOver / `red` variant. Test data has no category in OVER state. To cover red variant, plan 29-04 should seed a category with `actual > plan`, then plan 29-05 re-snapshot can include `category-detail-over.png`. **This is not a BLOCKER** for v1.0 — the cobalt code-path is fully audited; red-path uses identical layout with PosterTokens.Color.red swap (CategoryDetailView.swift conditional).

---

### iOS-5. PLAN мая (PLAN МЕСЯЦА.)

**Screenshot:** `ios-screenshots/plan-month.png`
**Reference:** DESIGN-SYSTEM §1 (cobalt + paper), §6.2 (Mass Archivo Black UPPER), §6.7 (Slider), SCREENS §07.
**Source:** `ios/BudgetPlanner/FeaturesV10/Plan/PlanView.swift`

**Status:** PASS

**Findings:**

- _No deviations._ Cobalt bg. Eyebrow `← НАЗАД MGMT / LIMITS` matches §07 «MGMT / LIMITS» (with I-02 back chevron).
- Mass «PLAN / МЕСЯЦА.» rendered in two-line Archivo Black UPPER at ~88pt per §6.2. The trailing period `.` matches prototype `PLAN МАЯ.`-style branding.
- Surplus plate «ОСТАЛОСЬ РАСПРЕДЕЛИТЬ −30 000 ₽» rendered as black-on-paper plate per §6.4. Negative value in red matches §1 «red = warning / OVER» semantics.
- Two rollover plates «→ ПРОЧЕЕ 30 000 ₽» and «→ НАКОПЛЕНИЯ 0 ₽» per §07 layout — PASS.
- Regulars header «РЕГУЛЯРНЫЕ · ПРОВЕСТИ В ФАКТ» + italic empty state «Нет регулярных платежей в этом месяце.» — matches §07 «N ждут проведения» empty-state pattern.
- Category count eyebrow «КАТЕГОРИИ · 2» + per-category sliders: ПРОДУКТЫ (1 000 000), ТРАНСПОРТ (2 000 000) with rollover chip groups «ПРОЧЕЕ» (active yellow) / «НАКОПЛЕНИЯ» (ghost) — matches §07 + §6.6 + §6.7. Slider track 2px paper @0.25 opacity, fill paper — matches §6.7.

**Note:** Limit values «1 000 000 / 2 000 000» reflect test fixture state (Plan budgets seeded for dev). Production values would be smaller.

---

### iOS-6. Subscriptions (Подписки.)

**Screenshot:** `ios-screenshots/subscriptions.png`
**Reference:** DESIGN-SYSTEM §1 (**coral bg → paper text per palette rule**), §6.2 (Mass italic), §6.3 (BigFig), SCREENS §09.
**Source:** `ios/BudgetPlanner/FeaturesV10/Subscriptions/SubscriptionsV10View.swift`

**Status:** BLOCKER

**Findings:**

- **[BLOCKER] Text rendered in `ink` (dark) on coral bg instead of `paper` (light).**
  - **Spec (DESIGN-SYSTEM §1, palette rule table row «Подписки»):** background `coral`, text `paper`, accent `yellow`.
  - **Implementation:** `SubscriptionsV10View.swift:111, 120, 122-123, 147, 152, 157, 177, 192, 199, 214-215, 218-219, ...` — Mass, BigFig, Eyebrow, Subscription rows, back button, divider all use `PosterTokens.Color.ink` (`#1B1A18` — dark) on coral bg.
  - **Visual impact:** All Subscriptions content is **dark-on-coral**, not light-on-coral. The screenshot confirms «Подписки.» italic, «0 ₽/мес», «0 АКТИВНЫХ · 0 ₽ В ГОД», «Нет подписок» — all rendered in dark ink. Web prototype `prototype/index.html` PosterSubs uses paper text on coral.
  - **Fix:** Replace `PosterTokens.Color.ink` → `PosterTokens.Color.paper` across SubscriptionsV10View (all `color:` parameters). Roughly 12–15 callsites — confirm with `grep -n "Color.ink" ios/BudgetPlanner/FeaturesV10/Subscriptions/`.
  - **Severity:** BLOCKER per CONTEXT §Severity classification — «wrong color (≥3 digit hex difference)»: ink `#1B1A18` vs paper `#FFF6E8` differs in all 6 hex digits.
- **[INFO] «← НАЗАД» + «SUBSCRIPTIONS» eyebrow** layout matches §09 header pattern (back is I-02 affordance).

---

### iOS-7. Savings (Копилка.)

**Screenshot:** `ios-screenshots/savings.png`
**Reference:** DESIGN-SYSTEM §1 (black + paper), §6.2 (Mass italic), §6.4 (Plate inverted), §6.5 (CTA), §6.6 (chips), SCREENS §11.
**Source:** `ios/BudgetPlanner/FeaturesV10/Savings/SavingsV10View.swift`

**Status:** PASS

**Findings:**

- _No layout deviations._ Black background. Eyebrow `← НАЗАД SAVINGS / КОПИЛКА` matches §11 + I-02. Mass-italic «Копилка.» at ~70pt PosterSerifItalic (I-01 fallback) — matches §11.
- Jaune plate «НАКОПЛЕНО ВСЕГО / 0 ₽» — yellow plate (PosterTokens.Color.yellow `#FFE76E`) on black bg with ink text matches §6.4 inverted-plate rule. BigFig «0₽» yellow style on plate — matches SCREENS §11.
- Subline mono «В MAY + 0 ₽» — matches §11 «В МАЕ + X ₽» pattern (May 2026 → «MAY» — see INFO below).
- Eyebrow «ОКРУГЛЕНИЕ ТРАТ» + toggle «ВЫКЛ» rendered as paper-tinted segmented control per §11.
- Three chip group `10 ₽` (ghost) / `50 ₽` (active yellow) / `100 ₽` (ghost) — matches §6.6 active rule.
- Eyebrow «ЦЕЛИ» + italic empty state «Нет целей — добавьте первую» — matches §11.
- CTAs `+ НОВАЯ ЦЕЛЬ` (primary yellow per §6.5) + `ПОПОЛНИТЬ` (ghost per §6.5) — PASS.

- **[INFO] Eyebrow «В MAY + 0 ₽» uses English month abbreviation «MAY».**
  - File: `SavingsV10View.swift` (subline binding).
  - Expected (SCREENS §11): «В МАЕ + X ₽» (Cyrillic locale).
  - Actual: «В MAY + 0 ₽» (default `DateFormatter` short Latin abbreviation).
  - Severity: **INFO** — locale formatting micro-issue; one-line fix (`DateFormatter.locale = Locale(identifier: "ru_RU")` or hardcoded month-in-Russian map). Logged for v1.1 (or fix inline in plan 29-04 if cheap).

---

### iOS-8. AI initial-state

**Screenshot:** `ios-screenshots/ai-initial.png`
**Reference:** DESIGN-SYSTEM §1 (**cream bg + ink text per palette rule**), §6.1 (Eyebrow), SCREENS §03.
**Source:** `ios/BudgetPlanner/FeaturesV10/Ai/AiV10View.swift`

**Status:** BLOCKER

**Findings:**

- **[BLOCKER] Background is black (`PosterTokens.Color.black`), spec is cream.**
  - **Spec (DESIGN-SYSTEM §1, palette rule row «AI»):** background `cream` (`#F4EAD9`), text `ink` (`#1B1A18`), accent `red` (italic accent).
  - **SCREENS §03:** «Фон: cream, текст ink.»
  - **Implementation:** `AiV10View.swift` — background fill is `PosterTokens.Color.black`.
  - **Visual impact:** Entire AI screen is dark theme instead of light cream. Eyebrow `ASSISTANT / ONLINE`, italic observation, hint chips all rendered light-on-dark instead of dark-on-cream. Screenshot confirms full black canvas.
  - **Fix:** Replace background fill `PosterTokens.Color.black` → `PosterTokens.Color.cream` in `AiV10View.swift` body's `ZStack` background; flip foreground colors paper → ink across the view.
  - **Severity:** BLOCKER — wrong background palette token (hex difference in all 6 digits between `#0E0E0E` and `#F4EAD9`).

- **[INFO] Initial observation: error-state captured (offline backend).**
  - Screenshot shows red-tinted error line «Не удалось загрузить наблюдение» instead of the spec hero phrase «Май в плюсе на 21 170 ₽.» (DM Serif italic 36px).
  - Rationale: docker stack not running during capture → AI observation endpoint failed → fallback error UI rendered. This is a captured-state artifact, not a layout deviation. Source review of `AiV10View.swift` confirms the success branch renders the DM Serif italic 36px hero per SCREENS §03.
  - Recommended: plan 29-05 re-snapshot with docker stack running + seeded observation.

- **[INFO] Hint chips** «Сколько я потратил на кафе в мае?» / «Покажи топ-3 категории за неделю» / «Создай регулярный платёж 1490 ₽ Wildberries 5 числа» / «Куда уходят деньги в этом месяце?» rendered in DM Serif italic with `→` arrows — matches §03 «4 строки-чипа (DM Serif italic 18px) с →». PASS.
- **[INFO] Eyebrow `ASSISTANT / ONLINE` is partially obscured by the device Dynamic Island in screenshot** — purely a screenshot-capture artifact (status bar overlap), not an app bug. The on-device layout offsets via safe-area inset (I-04).
- **[INFO] Eyebrow «— ИЗ ВАШИХ ДАННЫХ, 11 МАЯ»** matches §03 «— из ваших данных, 9 мая» pattern (date variable).
- **[INFO] Eyebrow «ПОДСКАЗКИ · ТАПНИ» + 4 chips** — PASS.

**Summary for iOS-8:** 1 BLOCKER (bg color), several INFO notes (error-state capture and layout chrome).

---

## Summary

| Platform | Severity | Count | Screens affected |
|----------|----------|-------|------------------|
| Web      | BLOCKER  | TBD   | _(plan 29-02 output)_ |
| Web      | WARNING  | TBD   | _(plan 29-02 output)_ |
| Web      | INFO     | TBD   | _(plan 29-02 output)_ |
| Web      | PASS     | TBD   | _(plan 29-02 output)_ |
| iOS      | BLOCKER  | 2     | iOS-6 Subscriptions, iOS-8 AI |
| iOS      | WARNING  | 1     | iOS-2 Transactions |
| iOS      | INFO     | 2     | iOS-7 Savings (locale), iOS-8 AI (error-state capture) |
| iOS      | PASS     | 5     | iOS-1 Home, iOS-3 AddSheet, iOS-4 CategoryDetail, iOS-5 PLAN мая, iOS-7 Savings (apart from locale INFO) |

**Total iOS BLOCKER:** 2
- iOS-6 Subscriptions — wrong text palette (ink instead of paper on coral)
- iOS-8 AI — wrong background palette (black instead of cream)

**Next:** Plan 29-04 spawns one fix-plan per BLOCKER-flagged screen. Web BLOCKER list to be merged here once plan 29-02 lands.
