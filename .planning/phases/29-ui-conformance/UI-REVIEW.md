# UI Conformance Review — Phase 29

**Generated:** 2026-05-11
**Method (Web):** Playwright snapshots → side-by-side vs `prototype/index.html` (plan 29-01 + 29-02).
**Method (iOS):** XcodeBuildMCP screenshots → audit vs `DESIGN-SYSTEM.md` + `SCREENS.md` (plan 29-03).
**Reference:** `.planning/v1.0-handoff/handoff/prototype/index.html`, `.planning/v1.0-handoff/handoff/DESIGN-SYSTEM.md`, `.planning/v1.0-handoff/handoff/SCREENS.md`.

Pre-known divergences in `.planning/v1.0-handoff/DIVERGENCES.md` (W-01..W-05, I-01..I-05, X-01..X-02) are excluded from re-flagging.

---

## Web

Per-screen deviation report для каждого из 8 web V10 экранов против
`prototype/index.html` (фактический рендер в файлах
`prototype/poster-screens.jsx`, lines 202-1252) и `DESIGN-SYSTEM.md` §1-7.
Baseline screenshots: `frontend/tests/e2e/v10-pixel-snapshots.spec.ts-snapshots/`
(8 PNGs, см. 29-01-SUMMARY.md inventory).

Token source of truth for `--poster-*` variables:
`frontend/src/stylesV10/tokens.css` (NOT `frontend/src/styles/tokens.css`,
которая держит legacy Liquid-Glass палитру — distinct subsystem).

### Excluded — known DIVERGENCES.md (not re-flagged)

The following entries are ACCEPTED divergences. Findings below do NOT
re-open them; any visual artifact attributable to one of these rows is
suppressed from the audit:

- **W-01** — DM Serif Display Italic Cyrillic fallback to PT Serif Italic
  (ADR-001). Italic glyphs «Реестр.», «Подписки.», «Копилка.»,
  «Дневной темп —», «Май», «Сегодня» рендерятся as PT-Serif-flavoured
  shapes — EXPECTED for the Cyrillic unicode-range.
- **W-02** — Snapshot tolerance 2% + macOS-only baseline (`-darwin`
  suffix); cross-platform sub-pixel AA differences accepted.
- **W-03** — Animation duration zeroed in snapshots; static screenshots
  capture FINAL state only.
- **W-04** — Baseline PNGs deferred — CLOSED plan 29-01.
- **W-05** — Permissive routing selectors. **This audit surfaces a
  screen-level consequence — see § Web / 5. PlanMonth.** Flagging the
  setup-issue inside § 5 is NOT a re-open of W-05 — it surfaces the
  audit-gating consequence (PlanMonth cannot be audited without correct
  baseline).
- **X-01** — Tab-content swap differs web vs iOS; accepted.
- **X-02** — Toast lifetime symmetric; PASS state.

### 1. Home

**Status:** WARNING

**Findings:**

- **[WARNING] Eyebrow VOL counter pluralization differs from prototype.**
  - **File:** `frontend/src/screensV10/common/format.ts`
    (`formatPeriodEyebrow`) — emits «21 ДЕНЬ» (singular). Prototype
    hardcodes `VOL.04 / MAY 2026 · {D.daysLeft} ДНЯ`
    (`prototype/poster-screens.jsx:215`) using a literal «ДНЯ» regardless
    of count.
  - **Expected:** literal «ДНЯ» suffix (per prototype's deliberate
    poster-style invariance) ИЛИ proper Russian plural
    (1 ДЕНЬ / 2-4 ДНЯ / 5+ ДНЕЙ).
  - **Actual:** «21 ДЕНЬ» — implementation использует singular form для
    21, что грамматически ОК для 21/31, но disagrees with prototype's
    static «ДНЯ» choice. Demoted to WARNING because the prototype
    itself doesn't pluralize.

- **[INFO] BigFig count-up displays mid-flight value `184`/`214` в
  baseline PNG.**
  - **File:** `frontend/src/componentsV10/BigFig.tsx` (uses
    `requestAnimationFrame` для count-up — JS-driven per W-03).
  - **Expected:** terminal count-up value at baseline freeze (e.g.
    `0` since fixture has no actuals — daily-pace ≈ floor(5000/22) ≈ 227).
  - **Actual:** snapshot captured mid-rAF frame. `freezeMotion()`'s
    `animation-duration: 0s` kills CSS animations only, not rAF.
  - **Fix candidate** (informational): `freezeMotion` could monkey-patch
    `BigFig.value` to terminal synchronously.

- **Other PASS items:**
  - Layout order (eyebrow → italic «Дневной темп —» 28px → BigFig 88px
    → mono subline → PLAN МАЯ plate → КАТЕГОРИИ block) matches
    prototype lines 213-296.
  - Colors: `--poster-coral #FF5A3C` matches `POSTER.coral` literal in
    `poster-screens.jsx:7`.
  - PLAN МАЯ plate: positive surplus uses `--poster-yellow`
    (`HomeView.module.css:93`), matches prototype yellow (line 240).
  - Bar fill: 3px height matches prototype line 281.
  - Stagger animation: 0.08 + i·0.045 delay matches prototype line 261.
  - Eyebrow letter-spacing 0.18em via `--poster-tracking-eye` token
    — matches DESIGN-SYSTEM.md §6.1.

### 2. Transactions

**Status:** BLOCKER

**Findings:**

- **[BLOCKER] Eyebrow position order swapped relative to prototype.**
  - **File:** `frontend/src/screensV10/Transactions/TransactionsView.tsx:113-124`
  - **Expected (prototype `poster-screens.jsx:331-333`):**
    1. `<Eye>SECTION II</Eye>` (top, standalone)
    2. `<Mass italic size={70}>Реестр.</Mass>` (middle)
    3. `<Eye style={{ marginTop:4, opacity:0.6 }}>{N} ЗАПИСЕЙ · {Σ} ₽</Eye>` (below mass).
  - **Actual:** Both eyebrows packed in a single horizontal flex row
    ABOVE the Mass headline. The count eyebrow never sits below the mass.
    Baseline PNG (`transactions-chromium-mobile-darwin.png`) confirms.

- **[BLOCKER] Mass headline size differs.**
  - **File:** `frontend/src/screensV10/Transactions/TransactionsView.tsx:122`
  - **Expected:** `<Mass italic size={70}>` (prototype line 332).
  - **Actual:** `<Mass italic size={88}>` — +18px, outside ±4px tolerance.

- **[BLOCKER] Broken CSS variable references — `var(--poster-font-dm-serif)`
  и `var(--poster-font-pt-serif)` НЕ определены в `frontend/src/stylesV10/tokens.css`.**
  - **File:** `frontend/src/screensV10/Transactions/TransactionsView.module.css:83, 186`
  - **Expected:** font-family chain resolves via defined tokens
    `--poster-font-dm-serif-italic` и `--poster-font-pt-serif-italic`
    (tokens.css lines 28-29).
  - **Actual:** оба `var(--…)` lookups резолвятся в пустую строку; chain
    проваливается на литеральные fallback `'PT Serif', 'DM Serif Display',
    Georgia, serif`. По случайности W-01 dual-font subset уже инжектится
    глобально, поэтому день-метка и empty-headline всё-таки рендерятся как
    italic serif — но token reference сломан. Classify BLOCKER per rubric
    («broken animation reference» обобщён до «broken token reference»).

- **[WARNING] Chip-bar overflow scroll mechanic differs.**
  - **File:** `frontend/src/screensV10/Transactions/TransactionsView.module.css:55-67`
  - **Expected (prototype line 335):** `display:flex; flexWrap:'wrap'` —
    чипы переносятся на несколько строк.
  - **Actual:** `display:flex; overflow-x: auto` — чипы скроллятся
    горизонтально. Поведенческая divergence с visible impact, когда
    filter list растёт за viewport width.

- **[INFO] Empty-state copy «Реестр пуст —» / «добавьте первую трату
  через FAB»** is impl's own creation (`TransactionsView.tsx:142-143`).
  Prototype shows «Ничего не найдено в фильтре «{filter}».»
  (`poster-screens.jsx:347-349`) — но ТОЛЬКО когда filter narrows to zero,
  not for a globally-empty registry. Justified design — INFO.

### 3. AddSheet

**Status:** BLOCKER

**Findings:**

- **[BLOCKER] Element-order swap — Keypad rendered BEFORE description /
  date chips / category chips / account row.**
  - **File:** `frontend/src/screensV10/AddSheet/AddSheet.tsx:289-398`
  - **Expected (prototype `poster-screens.jsx:1165-1235`):**
    1. eyebrow «NEW ENTRY · ...»
    2. BigFig 86px yellow
    3. Description input (italic serif placeholder «кафе / продукты / …»)
    4. «Когда» eyebrow + 3 date chips
    5. «Категория» eyebrow + chip grid
    6. «Счёт» eyebrow + account row
    7. **Keypad 3×4 (LAST input section)**
    8. CTA «СОХРАНИТЬ ↵» (jaune)
  - **Actual order:** eyebrow → BigFig → **Keypad** → description →
    date chips → category scroll → account row → CTA. The keypad
    плавает наверх с позиции 7 на позицию 3. Baseline PNG подтверждает:
    keypad visible в верхней половине, description ниже.

- **[BLOCKER] Account row styling — prototype shows Eye eyebrow «Счёт»
  ABOVE the row, with mono `ТИНЬКОФФ · 3477` left + mono «сменить ↓» right.
  Impl has «СЧЁТ» label inline в самой row плюс chevron `→`.**
  - **File:** `frontend/src/screensV10/AddSheet/AddSheet.tsx:365-379`
  - **Expected (`poster-screens.jsx:1209-1213`):** Eye eyebrow «Счёт»
    отдельным элементом; plate с padding `13px 14px`, border
    `1px solid rgba(255,246,232,0.25)`.
  - **Actual:** Single-row button с инлайн `СЧЁТ` label, разное
    padding, chevron `→` вместо caption «сменить ↓».

- **[BLOCKER] Account display content differs.**
  - **File:** `frontend/src/screensV10/AddSheet/AddSheet.tsx:374-376`
  - **Expected:** `{BANK.toUpperCase()} · {mask}` (соответствует
    Transactions sub-line pattern, TXN-V10-04).
  - **Actual:** `{currentAccount.bank}${currentAccount.mask ? ' ·· ' +
    currentAccount.mask : ''}` — bank в raw-case, separator
    `··` (двойной) вместо single, нет uppercase.

- **[WARNING] Keypad cell `.` (dot) opacity.** Prototype использует
  `opacity: k === '.' ? 0.45 : 1` (line 1222) для dim decimal key.
  В impl Keypad cells показываются на full opacity в screenshot.
  - **File:** `frontend/src/screensV10/AddSheet/Keypad.tsx` + `Keypad.module.css`.
  - Plan 29-04 to confirm via CSS read.

- **[INFO] BigFig:** prototype `size={86}` yellow, impl `size={86}` yellow.
  PASS. Description input: prototype `fontFamily:'DM Serif Display',
  fontStyle:'italic', fontSize:24` — impl uses serif-italic; визуально
  совпадает в baseline. PASS pending CSS-exact match.

### 4. CategoryDetail

**Status:** BLOCKER

**Findings:**

- **[BLOCKER] Eyebrow copy / structure differs.**
  - **File:** `frontend/src/screensV10/CategoryDetail/CategoryDetailView.tsx:92-95`
  - **Expected (prototype `poster-screens.jsx:526`):** Eye text
    `{over ? 'OVERDRAFT' : 'IN PLAN'} · CAT`. Передаёт state inline.
  - **Actual:** `CATEGORY · {category.ord ?? '00'}` — нет
    OVERDRAFT/IN-PLAN state suffix; используется ordinal. Baseline PNG
    показывает «CATEGORY · 01»; prototype показал бы «IN PLAN · CAT».

- **[BLOCKER] BigFig size mismatch.**
  - **File:** `frontend/src/screensV10/CategoryDetail/CategoryDetailView.tsx:110`
  - **Expected:** `size={64}` (prototype `poster-screens.jsx:534`).
  - **Actual:** `size={88}` — +24px, далеко за ±4px tolerance.

- **[BLOCKER] Missing «{N} осталось» / «{N} over» segment в bar caption.**
  - **File:** `frontend/src/screensV10/CategoryDetail/CategoryDetailView.tsx:131-133`
  - **Expected (prototype `poster-screens.jsx:535-537`):**
    `из {fmt(plan)} ₽ · {over ? '−{N} over' : '{N} осталось'}` — двух-сегментная
    line.
  - **Actual:** `из {planRubles} ₽` only — правая половина отсутствует.
    Baseline PNG подтверждает single-segment caption.

- **[BLOCKER] Rollover plate styling и content.**
  - **File:** `frontend/src/screensV10/CategoryDetail/CategoryDetailView.tsx:136-143`
    + `CategoryDetailView.module.css:104-119`
  - **Expected (prototype `poster-screens.jsx:550-555`):** dark plate
    `background: rgba(0,0,0,0.22)`, mono eyebrow «ОСТАТОК ПО КАТЕГОРИИ →
    {ПРОЧЕЕ|НАКОПЛЕНИЯ}», mono money line «+ {fmt(left)} ₽» ниже
    (yellow когда не over, paper когда over).
  - **Actual:** outlined ghost-style plate `background:
    rgba(255,246,232,0.08); border: 1px solid rgba(255,246,232,0.25)`,
    archivo-black uppercase label «ОСТАТОК → ПРОЧЕЕ», money line
    отсутствует целиком. Baseline PNG подтверждает.

- **[BLOCKER] CTA pair styling.**
  - **File:** `frontend/src/screensV10/CategoryDetail/CategoryDetailView.tsx:146-156`
  - **Expected (prototype `poster-screens.jsx:557-560`):** «+ ПОДНЯТЬ
    ЛИМИТ» = inline chip `background:yellow, color:cobalt,
    padding:'8px 10px'`. «ПАУЗА» = bordered ghost chip
    `border:1px solid rgba(255,246,232,0.45)`. Two compact pills.
  - **Actual:** Two `<PosterButton variant="ghost">` full-width plates
    side-by-side через `.ctaRow` с `flex:1 1 auto`. Рендерятся как
    paper-outlined ghost прямоугольники — не prototype's
    yellow-pill + bordered-pill mix.

- **[BLOCKER] Broken token reference (same as Transactions).**
  - **File:** `frontend/src/screensV10/CategoryDetail/CategoryDetailView.module.css:148`
  - `var(--poster-font-dm-serif), var(--poster-font-pt-serif)` —
    undefined; correct tokens `--poster-font-dm-serif-italic` /
    `--poster-font-pt-serif-italic`.

- **[WARNING] Mass headline size:** 70 (impl line 98) vs 68 (prototype
  line 528). 2px diff — WARNING tier.

### 5. PlanMonth

**Status:** BLOCKER (setup-issue gates pixel audit; code-only review proceeds)

**Findings:**

- **[BLOCKER] Baseline PNG `plan-month-chromium-mobile-darwin.png`
  captured HOME, not PlanMonth.**
  - **File:** `frontend/tests/e2e/v10-pixel-snapshots.spec.ts` (helper
    `gotoPlanMonth`) — uses W-05 permissive selector chain. The helper
    matched a generic `getByRole('button', { name: /план/i })` and
    captured Home itself (Home's «PLAN МАЯ» plate satisfies the regex).
  - **Expected:** baseline shows cobalt background, Mass «PLAN<br/>МАЯ.»
    56px, ОСТАЛОСЬ РАСПРЕДЕЛИТЬ surplus plate, 2 aggregate plates,
    «РЕГУЛЯРНЫЕ» block, «КАТЕГОРИИ» block с 8 sliders.
  - **Actual:** Baseline показывает Home view (coral bg, «Дневной темп —»,
    BigFig 214 ₽, КАТЕГОРИИ с 1 row).
  - This is the W-05 risk materialised. Audit cannot validate
    PlanMonth visuals without correct baseline. Plan 29-04 must add
    stable `data-testid="nav-plan"` (см. W-05 Decision row) и tighten
    helper, затем re-run `--update-snapshots`.

- **[BLOCKER] Headline copy mismatch.**
  - **File:** `frontend/src/screensV10/Plan/PlanView.tsx:133-135`
  - **Expected (prototype `poster-screens.jsx:738`):**
    `<Mass size={56}>PLAN<br/>МАЯ.</Mass>` — two-line, 56px, dynamic
    month genitive.
  - **Actual:** `<Mass size={70}>PLAN МЕСЯЦА.</Mass>` — single-line,
    70px, hardcoded «МЕСЯЦА». +14px size diff + different word.

- **[BLOCKER] Rollover aggregate plates: prototype имеет ASYMMETRIC
  styling (левый = bordered ghost, правый = yellow plate когда
  has-savings), `prototype/poster-screens.jsx:749-758`.**
  - **File:** `frontend/src/screensV10/Plan/PlanView.tsx:151-158`
  - **Actual:** Two identical `.aggPlate` plates side-by-side
    (`PlanView.module.css` определяет одну class). Asymmetric
    yellow-tinted right plate отсутствует.

- **[BLOCKER] Eyebrow «ОСТАТОК ПО ИТОГУ МЕСЯЦА» отсутствует.**
  - **File:** `frontend/src/screensV10/Plan/PlanView.tsx`
  - **Expected (prototype `poster-screens.jsx:748`):** Eye eyebrow
    «ОСТАТОК ПО ИТОГУ МЕСЯЦА» над 2 aggregate plates.
  - **Actual:** Plates рендерятся напрямую без этого eyebrow caption.

- **[BLOCKER] Regulars block: «РЕГУЛЯРНЫЕ · ПРОВЕСТИ В ФАКТ» dark plate
  summary line missing.**
  - **File:** `frontend/src/screensV10/Plan/PlanView.tsx:166-202`
  - **Expected (prototype `poster-screens.jsx:795-798`):** dark plate
    `background: rgba(0,0,0,0.22)` с «{N} ждут проведения» mono +
    `{sum} ₽` yellow справа, НАД per-regular rows.
  - **Actual:** Блок прыгает с eyebrow прямо на первую regular row;
    summary plate omitted.

- **[WARNING] Surplus plate visual style differs.**
  - **File:** `frontend/src/screensV10/Plan/PlanView.module.css`
    (`.surplusPlate.ok` / `.overflow`)
  - **Expected (prototype `poster-screens.jsx:740-746`):** dark plate
    `background: rgba(0,0,0,0.22)`, mono eyebrow «ОСТАЛОСЬ
    РАСПРЕДЕЛИТЬ», mono `+ {N} ₽` с paper color (или yellow если
    `left<0`); inline `OK` / `OVER` badge справа.
  - **Actual:** Custom `.surplusPlate.ok` / `.overflow` — full CSS
    comparison deferred к plan 29-04 inline review.

- Note: BLOCKERs derived из source-code comparison (baseline PNG —
  wrong-screen). Plan 29-04 must regenerate the PlanMonth baseline
  AFTER fixing W-05 selector to verify pixel-level conformance.

### 6. Subscriptions

**Status:** BLOCKER

**Findings:**

- **[BLOCKER] Text colour is INK on coral background.**
  - **File:** `frontend/src/screensV10/Subscriptions/SubscriptionsView.module.css:7`
  - **Expected (prototype `poster-screens.jsx:1091`):** `color: POSTER.paper`
    (`#FFF6E8` paper на `#FF5A3C` coral). Per DESIGN-SYSTEM.md §1
    палитра-правило row «Подписки → coral / paper / yellow».
  - **Actual:** `color: var(--poster-ink)` (`#1B1A18` ink на `#FF5A3C`
    coral). Baseline PNG подтверждает dark/ink текст на coral — contrast
    высокий, но color relationship inverts spec. Hex diff: каждая цифра
    `#1B1A18` vs `#FFF6E8` отличается — maximal BLOCKER per rubric.

- **[BLOCKER] BigFig size mismatch.**
  - **File:** `frontend/src/screensV10/Subscriptions/SubscriptionsView.tsx:77`
  - **Expected:** `size={56}` (prototype `poster-screens.jsx:1097`).
  - **Actual:** `size={86}` — +30px, далеко за ±4px.

- **[BLOCKER] Row separator color matches ink-text choice
  (`rgba(0,0,0,0.12)` в `SubscriptionsView.module.css:81`); prototype
  использует `rgba(255,246,232,0.25)` paper (line 1102).** Consequence of
  BLOCKER #1; flagged together.

- **[WARNING] Mass headline size:** 70 (impl line 69) vs 68 (prototype
  line 1095). 2px diff — WARNING tier.

- **[WARNING] Empty-state typography использует литеральный
  `'DM Serif Display'` family напрямую (`SubscriptionsView.module.css:68`)
  вместо canonical token chain. Should reference
  `--poster-font-dm-serif-italic` для consistency.** Demoted to WARNING
  — visually identical, but not token-anchored.

- **[INFO] Row trailing `···` rendered as `<button>` (impl line 110-118);
  prototype uses `<span>` plate с `background: rgba(0,0,0,0.18)`.**
  Prototype имеет небольшой dark plate around dots; impl — bare 22px
  char без plate. INFO.

- **PASS items:** Layout order ← НАЗАД → eyebrow → Mass italic → BigFig
  → eyebrow «N АКТИВНЫХ · Y ₽ В ГОД» → list совпадает с prototype.

### 7. Savings

**Status:** BLOCKER (setup-issue gates audit)

**Findings:**

- **[BLOCKER] Baseline PNG рендерится полностью WHITE/EMPTY surface
  (2 374 bytes — см. 29-01-SUMMARY.md inventory).**
  - **File:** `frontend/src/screensV10/Savings/SavingsMount.tsx:52`
    вызывает `fetchSavingsSummary()` → `GET /api/v1/savings`.
    29-01 fixture catch-all `**/api/v1/**` возвращает `[]` для любого
    GET, который специфично не замокан. `SavingsView` получает
    `snapshot = []` (truthy), обходит loading/error sub-views (lines
    69-117), и пытается `snap.total_cents` на массиве — `undefined`,
    `Math.floor(undefined/100) === NaN`, и `snap.config.roundup_enabled`
    крашит рендер (`TypeError: Cannot read properties of undefined
    (reading 'roundup_enabled')`).
  - **Expected:** non-empty SavingsSnapshot замокан в фикстуру — e.g.
    `{ total_cents: 0, month_in_cents: 0, config: { roundup_enabled:
    false, roundup_base: 50 }, goals: [] }` — так чтобы EMPTY state
    Savings (black bg, jaune plate, roundup section, «Нет целей»
    empty state) корректно рендерился.
  - **Actual:** Render-time exception → blank screen.

- **[BLOCKER] Same broken-fixture problem предотвращает pixel-level
  audit всех SavingsView elements.** Cannot evaluate:
    - Yellow plate «НАКОПЛЕНО ВСЕГО»
    - В МАЕ + Y ₽ eyebrow
    - ОКРУГЛЕНИЕ ТРАТ section (toggle + 3 base chips)
    - ЦЕЛИ section (goal cards or empty state)
    - CTA row «+ НОВАЯ ЦЕЛЬ» + «ПОПОЛНИТЬ»
  Plan 29-04 must extend 29-01 fixture с `savings/` `extraRoutes`
  entry (используя `installOnboardedFixture` opts) BEFORE re-snapshotting.

- **[BLOCKER] (source-only, pending visual confirmation) Layout: yellow
  plate в prototype содержит TWO columns — «НАКОПЛЕНО ВСЕГО {S.total} ₽»
  (left) AND «В МАЕ + {S.monthIn} ₽» (right, flex-end), стилизованных
  как single horizontal plate (`prototype/poster-screens.jsx:1009-1018`).**
  - **File:** `frontend/src/screensV10/Savings/SavingsView.tsx:161-178`
  - **Actual:** Plate содержит ТОЛЬКО «НАКОПЛЕНО ВСЕГО + BigFig» как
    single-column. «В МАЕ» eyebrow живёт в ОТДЕЛЬНОЙ row под plate
    (lines 173-178). Two-column composite layout разделён на две UI
    strips.

- **[BLOCKER] Roundup section: prototype использует ONE inline plate
  с toggle (ВКЛ/ВЫКЛ) справа ОТ «ОКРУГЛЯТЬ ДО {base} ₽» Archivo Black
  текста, плюс mtd-amount mono line ниже, плюс 3 base chips ниже того
  (`prototype/poster-screens.jsx:1021-1043`).** Impl splits this in
  separate `toggleRow` + `chipsRow` flexbox. Pending CSS-level audit
  after fixture fix.

### 8. AI initial-state

**Status:** BLOCKER

**Findings:**

- **[BLOCKER] Background color is BLACK instead of CREAM.**
  - **File:** `frontend/src/screensV10/Ai/AiView.module.css:18`
  - **Expected (prototype `poster-screens.jsx:424`):** `background:
    POSTER.cream` (`#F4EAD9`). Per DESIGN-SYSTEM.md §1 AI surface в
    «cream / ink / red» context.
  - **Actual:** `background: var(--poster-black) (#0E0E0E)`. Hex diff:
    `#F4EAD9` vs `#0E0E0E` — каждая цифра отличается. Maximal BLOCKER.

- **[BLOCKER] Text color paper вместо ink (consequence of bg flip).**
  - **File:** `frontend/src/screensV10/Ai/AiView.module.css:19`
  - **Expected:** `color: var(--poster-ink)`.
  - **Actual:** `color: var(--poster-paper)`. Вся AI surface inverted
    vs prototype's cream/ink палитра.

- **[BLOCKER] DM Serif italic 36px observation block рендерится EMPTY
  в baseline (observation = null т.к. нет API mock для
  `/ai/observation`).**
  - **File:** `frontend/src/screensV10/Ai/AiView.tsx:124-128`
  - **Expected:** «Май в плюсе на 21 170 ₽.» 36px DM Serif italic над
    «— из ваших данных, ...» eyebrow.
  - **Actual:** observation prop is `null`, observationLoading=`false`,
    observationError=`null` — весь DM Serif italic 36px block omitted.
    Baseline PNG показывает только «— ИЗ ВАШИХ ДАННЫХ, 11 МАЯ» eyebrow
    + 4 chips.
  - Setup BLOCKER — same nature as W-05 / Savings: fixture deficit.

- **[BLOCKER] Composer input + message bubbles имеют `border-radius: 4px`.**
  - **File:** `frontend/src/screensV10/Ai/AiView.module.css:159, 173, 234`
  - **Expected (DESIGN-SYSTEM.md §4):** «**Радиусы:** **0** на 95%
    компонентов. Это «постер», не «пузырь»». Bubble border-radius должен
    быть 0 за исключением listed exceptions (iOS device frame только —
    NONE here).
  - **Actual:** 4px rounded на user msg bubble, AI msg bubble, и composer
    input. Direct violation DS rule.

- **[BLOCKER] Composer padding / structure differs.**
  - **File:** `frontend/src/screensV10/Ai/AiView.module.css:212-225`
  - **Expected (prototype `poster-screens.jsx:486-501`):** composer — single
    inline plate `padding:'14px 16px', background:POSTER.ink,
    color:POSTER.cream`, с placeholder input + yellow «↵ ОТПРАВИТЬ»
    pill кнопкой ВНУТРИ plate.
  - **Actual:** composer sticky с `background: var(--poster-black)` и
    input имеет own padding/bg `rgba(255,246,232,0.10)` (отдельный inner
    pill). Prototype single-plate structure разделена на два слоя
    (composer container + input pill).

- **[WARNING] Suggestion chips — full-width buttons с «→» arrow справа
  (`AiView.tsx:142-155`).** Prototype рендерит их как `padding:'16px 0'`
  flex rows с `borderTop` separators (line 442-453). Impl uses
  `border-bottom` на каждом chip (`AiView.module.css:105`). Visual
  difference: prototype top-borders каждый row (первый row получает top
  line), impl bottom-borders (последний row получает bottom line).

- **[INFO] Chip suggestion copy.** Prototype: «Сколько я потратил на
  еду?», «Запиши: кофе 350 ₽», «На что трачу больше всего?», «Шаблон на
  отпуск». Impl chips (из `computeAi.ts` default chips): другой список.
  Copy choice — product decision, не visual conformance.

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
- Right-side «МЕНЮ ↗» is rendered (line 111 `HomeV10View.swift`) but documented as no-op until Phase 26+; **not a deviation** for v1.0 — PROTOTYPE shows same text-only chrome.

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

- _No deviations._ Black background. Eyebrow `← НАЗАД SAVINGS / КОПИЛКА` matches §11 + I-02. Mass-italic «Копилка.» at ~70pt PosterSerifItalic (I-01 fallback) — matches §11.
- Jaune plate «НАКОПЛЕНО ВСЕГО / 0 ₽» — yellow plate (PosterTokens.Color.yellow `#FFE76E`) on black bg with ink text matches §6.4 inverted-plate rule. BigFig «0₽» yellow style on plate — matches SCREENS §11.
- Subline mono «В MAY + 0 ₽» — matches §11 «В МАЕ + X ₽» pattern (May 2026 → «MAY» — INFO).
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

- **[BLOCKER] Initial observation does not render in DM Serif italic 36px hero.**
  - **Spec (SCREENS §03):** «Большая фраза-наблюдение DM Serif 36px («Май в плюсе на 21 170 ₽.»)»
  - **Implementation:** screenshot shows red-tinted error line «Не удалось загрузить наблюдение» at small size — fallback for offline/error state (backend not reachable from sim).
  - This is partly justified by the network error (acceptable degraded state) BUT the *fallback* itself is not the SCREENS §03 spec hero element. When the observation loads, it should be DM Serif italic 36px in **ink** on **cream**.
  - **Fix:** (a) Out-of-scope: fix dev environment to seed observation (plan 29-04 backend setup). (b) In-scope visually: confirm in code that `success` branch renders the spec hero. Source review of `AiV10View.swift` shows the observation IS rendered in DM Serif italic when present — so this finding reduces to **the bg-color BLOCKER above + an INFO note that the error-path was captured**.
  - **Severity (revised):** **INFO** (network error captured the wrong state, not a real layout bug).

- **[INFO] Hint chips «Сколько я потратил на кафе в мае?» etc. rendered in DM Serif italic with `→` arrows** — matches §03 «4 строки-чипа (DM Serif italic 18px) с →». PASS.
- **[INFO] Eyebrow `ASSISTANT / ONLINE` is partially obscured by the device Dynamic Island in screenshot** — purely a screenshot-capture artifact (status bar overlap), not an app bug. The on-device layout offsets via safe-area inset (I-04).
- **[INFO] Eyebrow «— ИЗ ВАШИХ ДАННЫХ, 11 МАЯ»** matches §03 «— из ваших данных, 9 мая» pattern (date variable).
- **[INFO] Eyebrow «ПОДСКАЗКИ · ТАПНИ» + 4 chips** — PASS.

**Summary for iOS-8:** 1 BLOCKER (bg color), 1 demoted-to-INFO finding (error-state capture, not a real layout bug).

---

## Summary

| Platform | Severity | Count | Screens affected |
|----------|----------|-------|------------------|
| Web      | BLOCKER  | 26    | Transactions (3), AddSheet (3), CategoryDetail (6), PlanMonth (6), Subscriptions (3), Savings (4), AI (5) — counts include the 1 setup-issue BLOCKER each on PlanMonth, Savings, and AI (fixture/selector gaps) |
| Web      | WARNING  | 7     | Home (1), Transactions (1), AddSheet (1), CategoryDetail (1), PlanMonth (1), Subscriptions (2) |
| Web      | INFO     | 6     | Home (1), Transactions (1), AddSheet (1), Subscriptions (1), AI (2) |
| Web      | PASS     | 1     | Home (passes overall; WARNING + INFO items don't disqualify) |
| iOS      | BLOCKER  | 2     | iOS-6 Subscriptions, iOS-8 AI |
| iOS      | WARNING  | 1     | iOS-2 Transactions |
| iOS      | INFO     | 2     | iOS-7 Savings (locale), iOS-8 AI (error-state capture) |
| iOS      | PASS     | 5     | iOS-1 Home, iOS-3 AddSheet, iOS-4 CategoryDetail, iOS-5 PLAN мая, iOS-7 Savings (apart from locale INFO) |

**Total Web BLOCKER:** 26 spread across 7 screens. Home is the lone web PASS.

**Web screens requiring fix-plan in 29-04:**

1. **Transactions** (3 BLOCKERs) — eyebrow position, Mass size, broken
   token refs.
2. **AddSheet** (3 BLOCKERs) — element-order swap (keypad placement),
   account row styling, account display format.
3. **CategoryDetail** (6 BLOCKERs) — eyebrow copy, BigFig size, missing
   bar caption, rollover plate styling, CTA pair styling, broken token
   refs.
4. **PlanMonth** (6 BLOCKERs) — setup issue (wrong baseline via W-05),
   headline copy/size, asymmetric aggregate plates, missing eyebrow
   «ОСТАТОК», missing regulars dark-plate summary, surplus plate style.
5. **Subscriptions** (3 BLOCKERs) — text color (ink instead of paper),
   BigFig size, row separator color.
6. **Savings** (4 BLOCKERs) — setup issue (empty render, fixture
   missing), composite plate layout split, roundup section layout.
7. **AI initial-state** (5 BLOCKERs) — wrong bg (black vs cream),
   inverted text color, missing observation rendering (fixture deficit),
   non-zero border-radius (DS violation), composer structure split.

**iOS BLOCKER list (carried from plan 29-03):**
- iOS-6 Subscriptions — wrong text palette (ink instead of paper on coral)
- iOS-8 AI — wrong background palette (black instead of cream)

**Pre-conditions for 29-04 (must be solved BEFORE BLOCKER fixes can be
visually verified):**

1. **W-05 selector hardening (PlanMonth gate)** — add
   `data-testid="nav-plan"` to Home «PLAN МАЯ» plate OR to management-hub
   entry; update `gotoPlanMonth` helper to use testid. Re-run
   `--update-snapshots --project=chromium-mobile` to regenerate
   `plan-month-chromium-mobile-darwin.png` from the correct screen.
2. **Savings fixture extension** — extend
   `frontend/tests/e2e/fixtures/onboarded-user.ts` with a default
   `**/api/v1/savings` route returning a non-empty SavingsSnapshot
   (zero balances, empty goals, default config). Current catch-all
   `[]` collides with screen's response-shape.
3. **AI fixture extension** — mock `**/api/v1/ai/observation` (или
   соответствующий endpoint AiMount calls) с deterministic observation
   payload (e.g. `{"text": "Май в плюсе на 21 170 ₽.", "generated_at":
   "2026-05-09T08:00:00Z"}`).
4. **(optional, INFO) BigFig deterministic snapshot:** extend
   `freezeMotion` helper для monkey-patch `BigFig` count-up so final
   value is set synchronously before snapshot — kills the
   non-determinism noted в Home INFO finding.

**Next:** Plan 29-04 spawns one sub-fix plan per BLOCKER-flagged screen
(7 web sub-plans + 2 iOS sub-plans). Plan 29-05 mass-edits DIVERGENCES.md
with WARNING/INFO entries for the v1.1 backlog. Note: web cross-references
the iOS findings — iOS-6 Subscriptions ink-on-coral BLOCKER and web
Subscriptions ink-on-coral BLOCKER are the SAME defect surface; a single
DESIGN-SYSTEM §1 enforcement pass would close both. Same applies to
iOS-8 AI bg=black and web AI bg=black — both violate DS §1 «AI →
cream/ink/red».
