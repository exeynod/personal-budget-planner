# Phase 66: Settings + AI + Management Polish (v06) - Context

**Gathered:** 2026-05-20
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous — grey areas auto-decided + scope correction from scout)

<domain>
## Phase Boundary

Финальная polish-фаза v1.1.2 (v06 native shell). Цель ROADMAP перечисляет 3 области, но scout показал, что **две из трёх уже реализованы**. Реальный net-new — ОДИН deliverable:

- **Theme picker parity в v06 Settings** — заменить единственную кнопку «Переключить на V10» (→ только maximal_poster) на полноценный выбор темы: MAXIMAL POSTER / LIQUID GLASS / IOS DEFAULT / СТАРЫЙ IOS (v06), пишущий `@AppStorage("ui.theme")`. Паритет с V10 `ThemePickerSheet`, но в native v06 idiom.

НЕ в scope (уже готово — verify-only): AI cost cap display, AI chat SSE, Management Hub rows.
</domain>

<decisions>
## Implementation Decisions

### Theme picker (ЕДИНСТВЕННЫЙ net-new deliverable)
- В `Features/Management/SettingsView.swift`, секция «Дизайн»: заменить одиночную кнопку «Переключить на V10» на 4 выбираемых ряда (native Form idiom): MAXIMAL POSTER, LIQUID GLASS, IOS DEFAULT (= `Theme.allCases`, rawValues maximal_poster/liquid_glass/ios_default) + СТАРЫЙ IOS (sentinel `"v06"`).
- Каждый ряд: label (`Theme.ruLabel` / «СТАРЫЙ IOS») + checkmark у текущего выбора. Опционально маленький цветовой swatch (как V10 ThemePickerSheet). Tap → пишет `@AppStorage("ui.theme")` → AppRouter переоценивает body (non-v06 → V10MainShell с выбранной темой; "v06" → MainShell остаётся).
- Native реализация: inline Form-ряды (Button с checkmark), БЕЗ зависимости от PosterRouter (v06 SettingsView не в poster-контексте). Не тащить `.posterSheet`. Отдельный sheet не нужен — выбор прямо в Form-секции.
- Текущий выбор: если `themeRaw == "v06"` → выбран «СТАРЫЙ IOS»; иначе `Theme.resolve(themeRaw)`.
- Сохранение — уже через `@AppStorage` (персист между запусками).

### Тестируемость
- Вынести логику опций + резолв текущего выбора в чистый helper (напр. `ThemeOption` enum/струк: список опций, `selected(for rawValue:) -> ThemeOption`, `rawValue(for option:)`). Unit-тесты: каждый rawValue резолвится в правильную опцию; неизвестный raw → maximal_poster (как `Theme.resolve`); "v06" → v06-опция; round-trip option↔rawValue.

### Verify-only области (НЕ трогать код, подтвердить в верификации)
- **AI cost cap display** — уже в SettingsView `aiSpendSection` (UserDTO.aiSpendCents/aiSpendingCapCents из `/me`; формат `$spend / $cap`, «Отключён» при cap==0). Gap нет.
- **AI chat SSE** — `Features/AI/AIChatView.swift` + `AIChatViewModel` + `AIChatAPI.stream` уже на `POST /api/v1/ai/chat` SSE (URLSession.bytes → SSEEvent parsing: messageDelta/complete/toolCall/propose/usage/error/done; history GET /ai/history; clear DELETE /ai/conversation). Gap нет.
- **Management Hub rows** — `ManagementView.ManagementItem.all` уже содержит все 9 доменов с рядами + destination: accounts (P60), planEditor (P61), savings (P62) зарегистрированы. Gap нет.

### Claude's Discretion
- Цветовой swatch в рядах темы (да/нет; если да — взять акцентные цвета per-theme).
- Inline Button-ряды vs `Picker(.inline)` — выбрать наиболее чистый native вариант с явным checkmark.
- Порядок рядов (рекоменд.: MAXIMAL POSTER, LIQUID GLASS, IOS DEFAULT, СТАРЫЙ IOS).
</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `Features/Management/SettingsView.swift` (+ SettingsViewModel) — Form с секциями (cycle/notify/AI toggle), `aiSpendSection`, и секцией «Дизайн» (текущая кнопка → V10). Цель правки.
- `FeaturesV10/Common/PosterTokens.swift` → `enum Theme: String, CaseIterable { maximalPoster="maximal_poster", liquidGlass="liquid_glass", iosDefault="ios_default" }` + `ruLabel` + `resolve(_:)`.
- `App/AppRouter.swift` → `@AppStorage("ui.theme") themeRaw`; `isLegacyV06Shell = (themeRaw == "v06")` → MainShell, иначе V10MainShell. Переключение реактивно через @AppStorage.
- `FeaturesV10/Management/ThemePickerSheet.swift` — V10-эталон содержимого (4 опции, swatch+label+description+checkmark). Воспроизвести в native idiom.

### Established Patterns (v06)
- SettingsView Form conventions: Section{}, LabeledContent, .monospacedDigit, saved-flash overlay, ошибки в red Section. Picker/Button-ряды.
- ManagementItem.ID enum (Hashable) + `.all` row list + `destination(for:)` switch. (Не требует правки в этой фазе.)

### Integration Points
- @AppStorage("ui.theme") — единственная точка переключения шелла; picker лишь пишет в неё.
- XcodeGen: новые .swift (helper, тесты) → `cd ios && xcodegen generate` перед build. Build+tests зелёные (iPhone 17 Pro).
</code_context>

<specifics>
## Specific Ideas

- Паритет именно с V10 ThemePickerSheet — те же 4 варианта, те же ru-лейблы, тот же эффект переключения; разница только в native-вёрстке (Form, без poster chrome).
- Друг-пользователь и владелец оба должны мочь вернуться на v06 ИЗ Settings (сейчас обратный путь есть только в V10 SettingsV10View) — добавляемый picker включает опцию «СТАРЫЙ IOS».
</specifics>

<deferred>
## Deferred Ideas

- Любые правки AI chat / cost cap / Management rows — уже готовы, вне scope.
- Анимации/swatch-полировка сверх паритета — опционально, не обязательно.
</deferred>
