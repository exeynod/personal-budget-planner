# Phase 56: v06 Native Rebuild — Foundation — Context

**Gathered:** 2026-05-11
**Status:** Shipped (foundation only)
**Mode:** User-direct (autonomous after user-direction).
**Branch:** `v1.0-maximal-poster` (параллельная разработка, см. ниже).

## Milestone

**v1.1.2 — iOS v06 Native Rebuild** (новый milestone, открыт этой фазой).

**Зачем:** user 2026-05-11 явно отверг подход «переутемить V10 в native iOS» (gap-анализ Вариант A). Запрос: «отвязаться от позиционирования и UX нового, сделать старый вид, но с новым функционалом» — то есть **новые экраны с нуля** в нативном iOS-парадигме (Form / List(.insetGrouped) / NavigationStack / .sheet / TabView), использующие актуальные v1.0 DTO/API.

**Сосуществование:** оба шелла (`MainShell` для v06 и `V10MainShell` для V10) живут в одной кодовой базе, переключаются через `@AppStorage("ui.theme")`:

- `"v06"` → `MainShell` (native iOS)
- `"maximal_poster"` / `"liquid_glass"` / `"ios_default"` → `V10MainShell` (poster system + Theme env)

## Phase Boundary (Foundation only)

Phase 56 — это **scaffolding**, не feature work. Закладывает рабочий тумблер, чтобы дальнейшие фичи v06 (Phase 57+) могли разрабатываться без скачка из V10.

**В скоупе Foundation:**

1. Унификация default-значения `@AppStorage("ui.theme")` в `AppRouter` (раньше `"v10"`, теперь `Theme.maximalPoster.rawValue` — согласовано с `BudgetPlannerApp` и `SettingsV10View`).
2. Упрощение route-логики `AppRouter`: `themeRaw == "v06"` → `MainShell`; всё остальное → `V10MainShell`. Удалена self-heal перезапись на `"v10"`.
3. В `Features/Management/SettingsView.swift` (v06): новая секция «Дизайн» с кнопкой «Переключить на V10 → MAXIMAL POSTER».
4. В `FeaturesV10/Management/ThemePickerSheet.swift`: новый ряд «СТАРЫЙ IOS» под тремя V10-темами; пишет `themeRaw = "v06"`.
5. `ScrollView`-обёртка для `ThemePickerSheet`, чтобы четвёртый ряд не отсекался таб-баром.

**ВНЕ скоупа Foundation (планируется в Phase 57-66):**

- Любой реальный новый функционал в `Features/` (Accounts, Plan, Savings, Goals, расширенные Subscriptions, AddSheet с keypad-эквивалентом, Onboarding 4-step, CategoryDetail drill-down).
- Миграция v06 endpoint'ов с legacy (`/subscriptions` v0.x, ActualAPI/PlannedAPI 2-valued kind) на v1.0 surface.
- Визуальный polish v06 — empty states, иконки, цветовые акценты.

## Verified

- v06 → V10 переключение (через v06 Settings «Переключить на V10») — screenshot: oranжевый maximal_poster home сразу после тапа.
- V10 → v06 переключение (через V10 Settings → ТЕМА → СТАРЫЙ IOS) — screenshot: белый native iOS home сразу после тапа.
- Build: `build_run_sim` — 0 errors, 0 new warnings.
- Persistence: `ui.theme` хранится в `com.exeynod.BudgetPlanner.plist`, переживает перезапуск приложения и симулятора.

## Known Issues / Follow-ups

1. **v06 Home empty state** говорит «Завершите onboarding» даже когда user.is_onboarded=true и нет активного периода — баг в условии HomeView (предположительно), вынести в Phase 58 (Home & Period).
2. **Theme environment при `ui.theme="v06"`** — `Theme.resolve("v06")` фолбэкается на `.maximalPoster`, но V10MainShell не рендерится, так что environment unused. Не баг, документировать.
3. **`SettingsView.swift` сейчас вычитывает `Theme.maximalPoster.rawValue`** как default для `@AppStorage`. Если пользователь стартует на v06 (фактически такого пути нет в default flow — default `maximal_poster`), Settings всё равно покажет кнопку «Переключить на V10», что корректно.

## Roadmap forward (Phase 57+ planned)

Из gap-анализа 2026-05-11 — 10 доменов фич, отсутствующих или урезанных в v06. Разбивка на phases в `.planning/ROADMAP.md` под milestone v1.1.2.
