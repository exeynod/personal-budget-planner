# Pitfalls Research — v1.0 «Maximal Poster Full»

**Domain:** Personal-budget Telegram Mini App + native iOS, миграция UI/UX и расширение data model
**Researched:** 2026-05-09
**Confidence:** HIGH (stack-specific, mostly verified против official docs / handoff)

---

## Скоуп

Pitfalls для v1.0-миграции: 4 кастом-шрифта (Archivo Black + DM Serif Display Italic + JetBrains Mono + Manrope), custom slide-stack навигация, 11 keyframe-анимаций, расширение data model (Account, Goal, Recurrent, Category.{plan, rollover}, kind=roundup/deposit, parent_txn_id), pixel-perfect side-by-side QA web ║ iOS, Russian-локализация на тёмной поликак-постер-палитре.

Phase mapping → Phase 22 (Backend), 23 (Design System), 24 (Onb), 25 (Home/Tx/Add), 26 (Cat/PLAN/Subs), 27 (AI/Sav/Acct/Anal/Mgmt), 28 (Animations + Acceptance).

---

## Critical Pitfalls

### Pitfall 1: DM Serif Display Italic не имеет кириллицы в Google Fonts repo

**What goes wrong:**
DM Serif Display (включая Italic) — Latin / Latin-Extended / Vietnamese only. На Google Fonts subset=cyrillic для этого family **нет**. На фронте с font-display:swap текст «Май в плюсе на 21 170 ₽» рендерится не в DM Serif Italic, а в fallback (system serif или Manrope-italic). На iOS с bundled TTF — кириллические глифы не нарисуются вообще, фоллбек на `.serif` (New York / Times). Получаем визуальное расхождение web ║ iOS на главном AI-наблюдении и на «Сегодня / Вчера / 7 мая» в реестре — а это **самый яркий типографический акцент** во всём design-system.

**Why it happens:**
DM Serif Display сделан Colophon Foundry для Latin, без расширения на Cyrillic. Handoff молча предполагает универсальную поддержку. Команда не запускает character-coverage тест на этапе Phase 23 и обнаруживает дыру только при QA Главной/AI/Реестра.

**How to avoid:**
1. **Перед началом Phase 23**: для каждого family прогнать `pyftsubset --output-file=/tmp/test.woff2 --unicodes='U+0410-044F' source.ttf` и проверить, что выходной файл содержит `--ignore-missing-glyphs=False` без warnings. Альтернатива: открыть TTF в FontForge / Glyphs Mini → Encoding → Cyrillic block → проверить заполненность.
2. **Принять решение upfront** (zafiksirovat в DESIGN-SYSTEM-RU.md):
   - Вариант A — заменить DM Serif Display на cyrillic-capable Italic-serif (PT Serif Italic, Lora Italic, Source Serif 4 Italic — все имеют качественную кириллицу).
   - Вариант B — использовать DM Serif только для латиничных вкраплений (например, числовые eyebrow), а русский italic-акцент рендерить в Lora Italic.
   - Вариант C — заказать кастомный кириллический add-on у дизайнера handoff (риск и время).
3. **Manrope** — кириллица есть, проверено. **JetBrains Mono** — кириллица есть и рекомендована для русского кода. **Archivo Black** — кириллица есть в Google Fonts (`subset=cyrillic` в URL).
4. На Web использовать `unicode-range` в `@font-face` с двумя источниками: `unicode-range: U+0000-024F, U+1E00-1EFF` для DM Serif (latin), `U+0400-04FF` для PT Serif/Lora (Cyrillic). Браузер сам подберёт. На iOS — два UIFont с composite-стратегией: проверять `cgFont.glyph(for: scalar)` и фоллбечить.

**Warning signs:**
- На Web в DevTools → Network → font request returns 404 или с другим subset.
- Visual: в Hero «Сегодня» отображается не serif italic, а sans (FOUT-фоллбек).
- На iOS: NSAttributedString рендерит «Май» с другой baseline / weight, чем «May».

**Phase to address:** **Phase 23 (Design System Foundation)**. Это блокер всем последующим.

---

### Pitfall 2: «Нет FOUT-моментов» в acceptance §14.7 нереалистично с 4 family × Russian subset

**What goes wrong:**
Handoff требует «нет FOUT-моментов». На холодном старте Mini App браузер скачивает: Archivo Black (1 weight, ~25kb cyr+lat woff2), DM Serif Display Italic (1 weight, ~28kb), JetBrains Mono (3 weights × cyr+lat, ~3×30kb), Manrope (5 weights × cyr+lat, ~5×22kb). **Итого ~250-300kb шрифтов** до first paint. На 3G это легко 1-2 секунды. С `font-display: block` (нужно для отсутствия FOUT) до 3 секунд text invisible — провал acceptance UX и Core Web Vitals (LCP > 2.5s).

С `font-display: swap` имеем FOUT (видимый замещение system → custom). С `font-display: optional` — на медленной сети custom fonts вообще не применяются (acceptance тоже не пройдёт: «шрифты прогружены»).

**Why it happens:**
Мысль «нет FOUT» сформулирована дизайнером как aesthetic ideal, без понимания тех. тredeoff. Команда либо ставит `block` (получает FOIT и провал LCP), либо `swap` (получает FOUT и провал §14.7).

**How to avoid:**
1. **Переформулировать §14.7** до Phase 23: «нет видимого FOUT после первого визита» (т.е. `font-display: optional` + service-worker-кэш + preload top-2 weights). На первом визите acceptable короткий FOUT, на повторных — instant.
2. **Self-host фонтов**: положить в `web/public/fonts/` уже subsetted woff2 (только cyrillic + latin-base, без greek/vietnamese). Это режет размер на ~40%.
3. **Preload только critical 2 weights** в `<head>`:
   ```html
   <link rel="preload" href="/fonts/manrope-500-cyr.woff2" as="font" type="font/woff2" crossorigin>
   <link rel="preload" href="/fonts/jetbrains-mono-600-cyr.woff2" as="font" type="font/woff2" crossorigin>
   ```
   Остальные веса — lazy через `font-display: swap`. Hero на главной (Manrope 500 + JetBrains 600) грузится без FOUT, остальное — с.
4. На iOS bundled TTF — FOUT нет вообще (шрифты в Resources). Это не наш кейс на Web.
5. Использовать **Fontaine / `size-adjust` CSS-метрики** (см. css-tricks): подобрать metric-compatible fallback так, чтобы swap не сдвигал baseline (CLS = 0).

**Warning signs:**
- Lighthouse mobile score < 90.
- LCP > 2.5s на Slow 3G в Chrome DevTools.
- Visual: при reload в incognito видно «дёрганье» при подгрузке Manrope 700.

**Phase to address:** **Phase 23 (Web)**, regression check в **Phase 28 Acceptance**.

---

### Pitfall 3: iOS Simulator кэширует старые TTF при замене файла без bump CFBundleVersion

**What goes wrong:**
Дизайнер прислал обновлённый Archivo Black (после фикса cyrillic glyphs). Заменили `Resources/Fonts/ArchivoBlack-Regular.ttf` в проекте → `make run`. На Simulator — рендерится **старый шрифт**. CoreText кэширует registered fonts по имени файла внутри bundle; если CFBundleVersion не изменился, Simulator может переиспользовать старый кэш. Даже Clean Build Folder помогает не всегда.

**Why it happens:**
CoreText font registration — system-level, кэш в `~/Library/Developer/CoreSimulator/Devices/<UUID>/data/Library/Caches/`. Workspace `Clean Build Folder` чистит DerivedData, но не Simulator caches. На реальном устройстве + free profile — переустановка через Xcode тоже не всегда фиксит.

**How to avoid:**
1. **Каждый font-asset replacement требует процедуры**:
   ```bash
   xcrun simctl shutdown all
   xcrun simctl erase <UDID>            # nuclear, ~3 минуты загрузки simulator
   # или мягче:
   rm -rf ~/Library/Developer/Xcode/DerivedData/*
   defaults delete com.apple.dt.Xcode
   xcrun simctl spawn booted launchctl stop com.apple.fontd
   ```
2. **Visual diff smoke-test** в Phase 23: после каждого font-update снимать скриншот Hero «PLAN МАЯ» через `xcrun simctl io booted screenshot` и diff против baseline.
3. **CFBundleVersion auto-bump** в Makefile (увеличивать на каждом `make run`) — простейший способ заставить iOS перерегистрировать fonts.
4. **На реальном устройстве**: удалить app полностью, перезагрузить iPhone (font cache device-wide), переустановить.

**Warning signs:**
- В прототипе и на iOS визуально различимый weight у одного и того же лейбла.
- `UIFont(name: "ArchivoBlack-Regular", size: 56)` возвращает non-nil, но рендерится как system bold.
- В Console.app warning «Could not find font in bundle, falling back to system».

**Phase to address:** **Phase 23 (iOS)**. Зафиксировать процедуру в `ios/docs/FONT-DEV-WORKFLOW.md`.

---

### Pitfall 4: Custom slide-stack `PosterNavStack` теряет edge-swipe-back

**What goes wrong:**
ТЗ §2 + DESIGN-SYSTEM §7.2 требуют `posterSlideInFwd` (28px справа, 420ms easeOut) для push и `posterSlideInBack` для pop — а это не совпадает со стандартной iOS slide-from-right + interactive pop gesture. Логичное решение «делаем свой `PosterNavStack` поверх `ZStack` с `.transition(.move(edge:))`» **уничтожает interactivePopGestureRecognizer**, которым пользуется 90% iOS-юзеров для возврата из Категории / Аккаунта / PLAN. Юзеры тыкают в левый край — ничего не происходит. Жалобы «приложение сломано».

Дополнительно: VoiceOver больше не объявляет «Back, button» при свайпе по nav-bar. Accessibility provoдит до WCAG 2.1.3.

**Why it happens:**
SwiftUI `NavigationStack` — это обёртка над UIKit `UINavigationController`, у которого встроен `interactivePopGestureRecognizer` с дефолтным `delegate` и зависимостями от `navigationItem.backBarButtonItem`. Кастом-стек этого не реализует.

**How to avoid:**
1. **Не строить кастом-стек с нуля.** Использовать `NavigationStack` + override transition через `.navigationTransition(.slide)` (iOS 18+) или через `UIView.animate` на `viewDidAppear` для legacy iOS 17. Анимация совпадает с `posterSlideInFwd` достаточно близко (28px не критичен — 1px difference vs spec acceptable, важна direction + timing).
2. Если всё-таки кастом-стек:
   - Добавить `UIScreenEdgePanGestureRecognizer` на root view руками.
   - Подвязать к `popLast()` модели `PosterNavStack`.
   - Прокинуть `accessibilityElements` на back-button с `.accessibilityLabel(Text("Назад"))` + `.accessibilityAddTraits(.isButton)`.
   - На iOS 18 использовать `.navigationBackButtonHidden(true)` + `.smartSwipeBackControl()` (iOS 18+) для preserve gesture.
3. **Reject edge-cases в тесте**: rotation (split на iPad — out of scope, но iPhone landscape возможен), modal-over-nav (sheet поверх PosterNavStack — pop не должен закрывать sheet), deep-link через `UIApplication.open(url)` (должен resolve до правильного screen в стеке).

**Warning signs:**
- Юзер-фидбек «не могу вернуться назад».
- Accessibility Inspector: trait `Back Button` отсутствует на nav-bar.
- В Instruments → SwiftUI: при swipe-from-edge нет события (gesture не recognised).

**Phase to address:** **Phase 23 (iOS) + Phase 25 (Home/Tx/Add — первое использование кастом-стека)**. Decision запротоколировать в ADR `.planning/research/ADR-001-poster-nav-stack.md` до начала кода.

---

### Pitfall 5: Roundup integer math — overflow + signed amount confusion

**What goes wrong:**
`DATA-MODEL.md §4`:
```
delta = ceil(|t.amount| / base) * base − |t.amount|
if delta > 0 && delta < base:
  createTxn({ kind: 'roundup', amount: -delta, ... })
```
Несколько ловушек, которые легко не отловить unit-тестами:

1. **Integer overflow на бэке**: `t.amount = 99_999_999_99` (validators §6 cap = 100_000_000 ₽), `base = 100`. `ceil(9999999999/100)*100 = 9999999900` — fits в BIGINT. Но если кто-то снимет cap до 10^15 (BIGINT max ~9.2×10^18) — overflow возможен в Python из-за automatic bigint, но в Swift `Int64` overflow с trap. На клиенте **Swift Int** 64-bit на iPhone, ОК до 9×10^18, но без защиты — `Int.multipliedReportingOverflow` нужно.

2. **Сложение signed + sign rule**: handoff пишет «<0 — расход, >0 — доход» (`§3.5`). Но §4 пишет `delta = ... − |t.amount|`. Roundup-txn `amount = -delta` (расход). Кейсы:
   - `t.amount = -350` (расход 350₽), base = 1000.
   - `|t.amount| = 350`. `ceil(350/1000)*1000 = 1000`. `delta = 650`.
   - Roundup-txn: `amount = -650` (списание 650₽ → копилка). **Это значит, что юзер потратил 350₽, но из счёта ушло 1000₽**. На UI: «Surf Coffee 350₽» + «↻ ОКРУГЛ. 650₽». Account.balance уменьшается на 1000₽. **Это правильное поведение по handoff** (округление вверх, разница идёт в копилку), но пользователь может удивиться: почему 1000, а не 50 (как обычный roundup до сотни)?
   - Альтернативная интерпретация: roundup до **следующей** круглой суммы относительно base. 350 → 400 (base=100), а не 1000. То есть `ceil(350/100)*100 = 400`, `delta = 50`. Это **другая бизнес-логика**, и в handoff неоднозначно.
   - **Real ambiguity**: `base ∈ {10, 50, 100}` (DATA-MODEL §1.7 SavingsConfig). Значит округление **до десятков/полсотен/сотен**, не до 1000. Тогда `t.amount=-350, base=100` → `ceil(350/100)*100=400, delta=50`. Это normal roundup. **Но в формуле буквально написано `ceil(|amount|/base)*base`**, и для base=10 при amount=350 → `ceil(350/10)*10=350, delta=0` → пропуск (§9). Для base=50 → `ceil(350/50)*50=350, delta=0` → пропуск. Для base=100 → `delta=50` (округление до 400). **Логика работает только если amount не кратен base**.

3. **Edge: amount = 0**: validators §6 запрещают `amount == 0`, но если каким-то путём проскочит — `ceil(0/base)*base − 0 = 0`. Условие `delta > 0` спасает. ОК.

4. **Edge: `amount % base == 0`**: например, расход ровно 500₽, base=100. `delta = 0` → пропуск (§9). Это **легко забыть в коде** — без явной проверки получишь roundup-txn с amount=0, IntegrityError на check constraint.

**How to avoid:**
1. **В Phase 22** добавить SQL check constraint `actual_transaction.amount_cents != 0`.
2. **Service-функция `compute_roundup_delta(amount_cents: int, base_rubles: int) -> int`** с unit-тестами на:
   ```
   amount=-35000 (350₽), base=100  → delta=5000 (50₽), roundup_amount=-5000
   amount=-50000 (500₽), base=100  → delta=0, no roundup txn
   amount=-1, base=100             → ceil(1/10000)*10000 - 1 = 9999 кко. (~99.99₽). edge: round to 100₽ цельный.
   amount=-50000, base=10          → ceil(500/10)*10 - 500 = 0, skip
   amount=-99_999_999_99, base=100 → проверить overflow ceil()
   amount=+50000 (доход 500₽), base=100 → roundup только для расхода! kind=expense check.
   amount=-12345, base=100          → 12345/100=123.45 → ceil=124 → 12400 - 12345 = 55 коп = 0.55₽. roundup на 0.55₽. На UI «↻ ОКРУГЛ. 1₽» (округление при показе). При следующих 99 сабтракшнах копилка пополнится на 99×55=5445 коп = 54.45₽. **Это правильно, но для юзера непривычно: он ожидает только когда 350→400.**
   ```
3. **Зафиксировать base в РУБЛЯХ, а delta в КОПЕЙКАХ** в `compute_roundup_delta` — иначе путаница (DATA-MODEL хранит amount в копейках, base в рублях). Сигнатура: `def compute_roundup_delta(amount_cents: int, base_rubles: int) -> int  # return delta_cents`.
4. **В формуле `ceil`**: для копеек `ceil_to_base = ((|amount_cents| + base_cents - 1) // base_cents) * base_cents`, чтобы избежать `math.ceil()` с floats.
5. **В Swift**: использовать `Int64` + `multipliedReportingOverflow` для умножения, fail-safe на overflow. Или просто валидатор `|amount| ≤ 100_000_000 ₽` clamp перед расчётом.
6. **Запротоколировать в `BUSINESS-RULES.md`** все edge-кейсы с примерами.

**Warning signs:**
- Roundup-txn появляется на расходах, кратных base (баг — должен пропускаться).
- Account.balance после расхода уменьшается на «странную» сумму (700₽ вместо 350₽).
- Сложение `roundup-txn + parent expense != расход + копилка` (sanity check на total).

**Phase to address:** **Phase 22 (Backend roundup logic)**. Тесты в `tests/services/test_roundup.py` обязательны до merge.

---

### Pitfall 6: Rollover idempotency — повторный запуск close_period_job создаёт дублирующие deposit-txn

**What goes wrong:**
В `app/worker/jobs/close_period.py` advisory lock защищает от concurrent runs **в один момент времени** (gunicorn worker x2). Но новая логика rollover (DATA-MODEL §3) предлагает создавать `kind='deposit'` транзакции для каждой категории с `rollover='savings'` и положительным remainder.

Сценарии повторного запуска:
1. Job отработал на user_id=42 → commit. На user_id=43 упал — exception, но user_id=42 уже committed.
2. Cron перезапущен через ручной `python -m app.worker.jobs.close_period` (debugging) → advisory lock освобождён, текущий active period для user_id=42 уже закрыт (нет expired active), но **новый период тоже уже создан**. Логика «expired is None → return» спасает от двойного closing — **но не от двойных deposit-txn**, если их создание не привязано к закрытию периода атомарно.

В текущей реализации `_close_period_for_user`: внутри одной транзакции находится expired, считает balance, ставит status=closed, создаёт next period, добавляет subscription rows. Это **атомарно** — либо всё, либо ничего. Если добавить rollover-deposit-txn в эту же транзакцию, idempotency гарантируется через первичный shortcut `if expired is None: return`.

**Но есть ловушка**: если rollover-deposit добавляются **после** flush new_period, и какой-то deposit падает с FK error (e.g., user.primaryAccountId ссылается на deleted account) — вся транзакция откатится, **но advisory lock уже снят**, и cron в следующий день **попытается снова**, но `expired is None` (предыдущий период уже отмечен как closed — wait, нет, rollback откатит и status=closed). OK, rollback корректен.

Но: что если **rollover-deposit логика разделена на отдельную миграцию данных**, например, retroactive backfill для пропущенных rollover'ов прошлых месяцев? Тогда `INSERT INTO actual_transaction(kind='deposit', ...)` без идемпотент-ключа = дубль при повторном запуске backfill-скрипта.

**How to avoid:**
1. **Атомарность в `_close_period_for_user`**: rollover-deposit-txn создаются в **той же** session/transaction, что и `expired.status = closed`. Никаких отдельных commit'ов.
2. **Idempotency-ключ для deposit-txn**: добавить колонку `actual_transaction.rollover_source_period_id BIGINT NULLABLE` + UNIQUE INDEX `(user_id, category_id, kind, rollover_source_period_id) WHERE kind='deposit' AND rollover_source_period_id IS NOT NULL`. Повторный INSERT с тем же `rollover_source_period_id` → IntegrityError → catch → skip. **Это лучшая защита**.
3. **Backfill-скрипты тоже** должны проверять существование row перед INSERT.
4. **Worker-test**: `tests/worker/test_close_period.py::test_idempotent_rerun_same_day` — гонять `close_period_job()` дважды подряд, проверять, что rollover-deposit-txn count не вырос.

**Warning signs:**
- В реестре пользователя несколько одинаковых «Остаток ПРОДУКТЫ → копилка» в один день.
- `SELECT COUNT(*) FROM actual_transaction WHERE kind='deposit' GROUP BY tx_date HAVING count > N` — N > 1 категорий с rollover='savings'.
- Account.balance скакнул резко (–2× ожидаемого).

**Phase to address:** **Phase 22 (Backend rollover)**. Migration adds rollover_source_period_id + unique index.

---

### Pitfall 7: Period close race — расход в 23:59:59 30 числа vs job старт 00:01 1 числа

**What goes wrong:**
ТЗ §3.1: «Месяц = календарный (1–28/30/31 число)». close_period_job стартует 00:01 Europe/Moscow. Юзер делает добавление в 23:59:59 30 апреля → POST `/api/v1/actual` доходит до сервера в 00:00:30 1 мая (network lag + processing). В коде `app/services/actual.py::_resolve_period_for_date`: ищет period containing tx_date. tx_date — это **DATE поле** из payload. Что прислал клиент?

- iOS клиент в 23:59:59 30 апреля → отправляет `tx_date: '2026-04-30'` ✓ → resolve в апрельский период.
- Web клиент с **server-side timezone offset bug** → может прислать `'2026-05-01'` если использует `new Date().toISOString().slice(0,10)` (UTC, не Europe/Moscow). Май-период ещё не существует (job его создаст), будет создан **shadow period** через `_resolve_period_for_date` step 3. **Но job в 00:01 пытается закрыть expired active period — этот shadow period уже active в мае, не expired**. Апрельский period (active) → expired в 00:01 → job закроет его. Но новый txn от юзера попал не в апрельский, а в shadow-майский. Последствие: апрельский close_period посчитал ending_balance **без** этой транзакции, May начался с неправильным starting_balance.

Дополнительно: `_check_future_date` allows `today + 7 days`, так что tx_date=2026-04-30 в 00:00 1 мая — OK (today=2026-05-01, max=2026-05-08).

**How to avoid:**
1. **Frontend всегда отправляет local date в Europe/Moscow**: использовать `Intl.DateTimeFormat('ru-RU', {timeZone: 'Europe/Moscow'})` для derive tx_date по умолчанию. На iOS: `Calendar(identifier: .gregorian)` с `timeZone = TimeZone(identifier: "Europe/Moscow")`.
2. **Server-side guard**: в `create_actual` перед `_resolve_period_for_date` приводить `tx_date` к Europe/Moscow date если client прислал ISO timestamp. Для DATE-only поля — доверять, но логировать когда `tx_date != today_in_app_tz()` для observability.
3. **Job latency check**: в `_close_period_for_user` после нахождения expired period **переcчитать compute_balance ещё раз**, потому что в окне 00:01:00 — 00:01:30 могли прийти новые transactions с tx_date предыдущего месяца. Это не race — просто guard через transaction ISOLATION REPEATABLE READ или явный SELECT FOR UPDATE на period.
4. **Acceptance test в Phase 28**: timezone-edge case в e2e. Замокать `_today_in_app_tz()` на 2026-05-01 00:00:30, прислать transaction с tx_date=2026-04-30, проверить что попал в апрельский period AND closing job учёл его.

**Warning signs:**
- В `budget_period.ending_balance_cents` для апреля != `period.starting_balance_cents` для мая (off by 1-2 transactions).
- Юзер: «я записал кофе в 23:59 30-го, на главной 1-го его нет в апреле и нет в мае».

**Phase to address:** **Phase 22 (close_period extension)** + **Phase 28 (timezone e2e test)**.

---

### Pitfall 8: Multi-tenant migration adds nullable columns без явного backfill — Postgres RLS не падает, **но default'ы могут утечь между tenants**

**What goes wrong:**
В Phase 11 (v0.4) сделана multitenancy с RLS на 9 таблицах. v1.0 добавляет:
- `app_user.income BIGINT NOT NULL DEFAULT 0`
- `category.plan_cents BIGINT NOT NULL DEFAULT 0`
- `category.rollover ENUM('misc','savings') NOT NULL DEFAULT 'misc'`
- `category.paused BOOLEAN NOT NULL DEFAULT FALSE`
- `category.parent_id BIGINT NULL`
- `category.ord VARCHAR(2) NULL` (e.g., '01', '02')
- `actual_transaction.kind ENUM(... 'roundup', 'deposit')` (расширение enum)
- `actual_transaction.parent_txn_id BIGINT NULL`
- Новые таблицы: `account`, `recurrent`, `goal`, `savings_config`.

Ловушки:
1. **RLS на новых таблицах** — Phase 11 перечислил 9 таблиц; новые `account`, `recurrent`, `goal`, `savings_config` нужно добавить в `DOMAIN_TABLES` и применить ENABLE ROW LEVEL SECURITY + FORCE + POLICY. **Если забыть — cross-tenant утечка**.
2. **`parent_id` foreign key** на `category(id)` — нужен `WITH CHECK (...)` на parent_id указывающий на категорию **того же** user_id. Без этого юзер A может в API установить `parent_id` на категорию юзера B (RLS не проверяет FK references по user_id, только сам row).
3. **`parent_txn_id`** на `actual_transaction(id)` — та же проблема. Roundup-txn может ссылаться на parent expense **другого** юзера, если API не валидирует scope.
4. **DEFAULT value backfill**: если на existing rows `category.plan_cents` = 0 (default), все категории after-migration outpoint plan = 0. На главной виджет «дневной темп» = `plan / daysLeft` = 0. UX broken до момента, когда юзер пройдёт PLAN screen и установит лимиты.
5. **`actual_transaction.kind` enum extension**: PostgreSQL `ALTER TYPE category_kind ADD VALUE 'roundup'` **не может выполняться внутри Alembic transaction** (transactional DDL запрещает ADD VALUE). Нужен `op.get_context().autocommit_block()`. Иначе миграция падает с `"ALTER TYPE ... ADD" cannot run inside a transaction block` (Postgres 12+).

**How to avoid:**
1. **Migration Phase 22-01**: добавить `account`, `recurrent`, `goal`, `savings_config` в `DOMAIN_TABLES` + create indices + RLS policies.
2. **Add to category & actual_transaction**: на `parent_id` и `parent_txn_id` добавить **trigger или CHECK constraint** или `INSERT/UPDATE` API-level guard. Простейший вариант — CHECK через side-table:
   ```sql
   ALTER TABLE category ADD CONSTRAINT fk_parent_same_user
     FOREIGN KEY (parent_id, user_id) REFERENCES category(id, user_id) ON DELETE SET NULL;
   ```
   Требует composite unique on `category(id, user_id)` (id уже unique глобально — composite trivial).
3. **Enum migration через autocommit_block**:
   ```python
   def upgrade():
       with op.get_context().autocommit_block():
           op.execute("ALTER TYPE category_kind ADD VALUE IF NOT EXISTS 'roundup'")
           op.execute("ALTER TYPE category_kind ADD VALUE IF NOT EXISTS 'deposit'")
   ```
4. **Backfill для plan_cents**: вместо DEFAULT 0 — после ADD COLUMN сделать `UPDATE category SET plan_cents = (SELECT plan_cents FROM plan_template_item WHERE category_id = category.id LIMIT 1)` чтобы переехать с template-level plan на category-level (если такое решение принято; иначе zero is OK + onboarding fills).
5. **Backfill для ord**: для existing категорий назначить '01'..'NN' по `id ASC` или alphabetically.
6. **Backfill для savings_config**: создать дефолтный row для каждого existing user (`roundup_enabled=false, base=100`).

**Warning signs:**
- В Phase 22 интеграционный тест `test_multitenancy_v1_0_columns.py` падает: tenant B видит plan от tenant A.
- В QA: главная пустая для existing user (plan=0), нужно вручную идти в PLAN.
- Alembic upgrade падает с «cannot ALTER TYPE ... inside transaction block» — забыли `autocommit_block`.

**Phase to address:** **Phase 22 (миграция блокирует всё остальное)**.

---

### Pitfall 9: Hidden Unicode characters в copy-paste из handoff (мы уже один раз обожглись)

**What goes wrong:**
В handoff/prototype/poster-screens.jsx использовались:
- **U+202F** (NARROW NO-BREAK SPACE) — для тысяч в `fmt()`. ОК, это by design.
- **U+2212** (MINUS SIGN) — для отрицательных сумм. ОК, by design.
- **U+00AD** (SOFT HYPHEN) — **уже всплыл в "cor­al"** (handoff текст), при copy-paste в код стал invisible character → React warning или сломанный CSS class name.
- **U+200B** (ZERO WIDTH SPACE), **U+200C/D** (zero-width non-joiner/joiner), **U+FEFF** (BOM) — могут попасть из Word/Notion handoff документов.
- **U+2060** (WORD JOINER), **U+00A0** (no-break space), **U+2009** (thin space — в отличие от U+202F, **breakable**) — путаница в тысячных разделителях.

**Конкретные риски v1.0**:
- DATA-MODEL §5.1 явно требует U+202F. Если разработчик скопирует пример из README в JSDoc и редактор подменит на U+0020 — `fmt()` начнёт рендерить с regular space → ширина не та → перенос строки на узких экранах.
- Russian текст из handoff («стоит притормозить.», «в плюсе на 21 170 ₽») может содержать invisible chars из Word'овского autocorrect.
- iOS NSAttributedString с U+202F иногда рендерит неправильную ширину если шрифт не имеет глифа для NARROW NO-BREAK SPACE (custom fonts!) — fallback на regular space или squarish glyph.

**How to avoid:**
1. **CI-check на uninvited Unicode**:
   ```bash
   # blocklist обязательных видимых-zero chars
   ! grep -rP '[\x{00AD}\x{200B}\x{200C}\x{200D}\x{FEFF}\x{2060}]' --include='*.{ts,tsx,swift,py}' app/ web/src/ ios/
   ```
   Добавить как pre-commit hook или GitHub Action.
2. **Allowlist для intentional**:
   - U+202F (narrow no-break space) — только в format helpers и тест-snapshots.
   - U+2212 (minus sign) — только в sign() helpers.
   - Все остальные форматтер-зависимые Unicode chars — нет.
3. **Constants в code**: `export const NARROW_NBSP = ' '; export const MINUS = '−';` — никогда не литералом в JSX, всегда через константу. Это делает grep'аемым.
4. **Snapshot-тест на форматтер**: `expect(fmt(142380)).toBe(`142${NARROW_NBSP}380`)`.
5. **iOS visual test**: в скриншот-снаппинге Phase 23 проверять, что `Text("142\u{202F}380")` рендерится без падающего глифа.

**Warning signs:**
- Lint: `no-irregular-whitespace` ESLint rule срабатывает.
- В DevTools view source — невидимые символы между литералами.
- iOS Console: «warning: glyph not in font» при рендере чисел.

**Phase to address:** **Phase 23 (CI-check + format helpers)**. Регрессия проверяется в **Phase 28**.

---

### Pitfall 10: VoiceOver / TalkBack ломаются на UPPERCASE + letter-spacing 0.18em для русского текста

**What goes wrong:**
DESIGN-SYSTEM §6.1 (Eyebrow), §6.5 (Primary CTA), §6.6 (Chips) — все используют `text-transform: uppercase` + `letter-spacing: 0.14em-0.18em`. Для русского:
- «КАФЕ» с tracking 0.18em iOS VoiceOver читает по буквам: «К А Ф Е» — потому что spacing > threshold для inferring word boundary. Или ещё хуже — **алфавитом**: «ка а эф е».
- Аналогично web ARIA: NVDA/JAWS/VoiceOver-Mac читают как abbreviation.
- TalkBack (Android — out of scope, but TG MiniApp on Android exists).

Дополнительно: iOS VoiceOver по умолчанию читает UPPERCASE как acronym ("OMG" → letter by letter). Для русских аббревиатур это норма ("КАФЕ" — не аббревиатура), VoiceOver ошибается.

**How to avoid:**
1. **Visual UPPERCASE через CSS / SwiftUI rendering, не через source text**:
   - Web: `text-transform: uppercase` + accessibility-friendly source (`<span>Кафе</span>`). VoiceOver читает source: «Кафе».
   - iOS: `Text("Кафе").textCase(.uppercase)` — НО! `.textCase` модификатор сейчас **тоже** аффектит accessibilityLabel by default. Нужно явно: `.accessibilityLabel(Text("Кафе"))` (Title Case).
2. **letter-spacing**: для accessibility CSS не имеет «accessibility-stripping» механизма. Решение — на screen reader игнорить визуал, читать source. Если source = «Кафе», letter-spacing на rendering не влияет.
3. **Checklist в Phase 28**: пройти VoiceOver по 11 экранам и убедиться, что:
   - Eyebrow «VOL.04 · MAY 2026 · 23 ДНЯ» читается как «Том 4, май 2026, 23 дня» (т.е. через accessibilityLabel override, потому что VOL.04 буквально неудобоваримо).
   - Chips «КАФЕ / ПРОДУКТЫ / ТРАНСПОРТ» читаются нормально.
   - CTA «+ ПОДНЯТЬ ЛИМИТ» читается «Поднять лимит, кнопка».
4. **Avoid letter-by-letter announcement**: явные `.accessibilityLabel(Text("..."))` на всех UPPERCASE-элементах.
5. **Тест на VoiceOver**: запустить на устройстве, не только Accessibility Inspector — symbol-pronunciation отличается между simulator и device.

**Warning signs:**
- В Accessibility Inspector → Audit: warning «Element label may be misread by VoiceOver: KAFE».
- User report from accessibility-aware tester «не понимаю что говорит VoiceOver».

**Phase to address:** **Phase 28 (Accessibility audit)** + проактивный design в **Phase 23 (typography helpers)**.

---

### Pitfall 11: Display P3 vs sRGB — coral `#FF5A3C` отрисовывается ярче на iPhone, чем в web

**What goes wrong:**
Дизайнер handoff работал в Figma (sRGB). Цвет coral в DESIGN-SYSTEM `#FF5A3C` — это sRGB hex.
- На Web: CSS `background: #FF5A3C` → браузер рендерит в sRGB. На iPhone Display P3-screen браузер автоматически рендерит sRGB-content в P3-aware manner — но без явного `@media (color-gamut: p3) { ... }` остаётся в sRGB. **Желаемое поведение**.
- На iOS native: `Color(red: 1.0, green: 0.353, blue: 0.235)` БЕЗ указания colorSpace **по умолчанию sRGB**. ОК, совпадает с web.
- НО: `UIColor(red:green:blue:alpha:)` создаёт sRGB. `UIColor(displayP3Red:green:blue:alpha:)` создаёт P3 — и **те же 1.0, 0.353, 0.235** в P3 это **другой видимый цвет**, более насыщенный (P3 шире на ~50%).

Если разработчик добавил Asset Catalog с цветом и в Xcode поставил «Display P3» вместо sRGB — color shift будет visible на iPhone (более saturated coral) и mismatch с web.

Дополнительно: **JPEG/PNG-скриншоты для side-by-side QA** имеют свой color profile. Render сделанный на Display P3 device, сохранённый в PNG без profile, открытый в Chrome в sRGB-mode → выглядит desaturated.

**How to avoid:**
1. **Всё в sRGB by default** для v1.0:
   - iOS Asset Catalog: при создании `Color Set` явно ставить **Color Space: sRGB**, не «Extended Range sRGB» и не «Display P3».
   - SwiftUI: `Color(red:green:blue:)` по умолчанию sRGB — OK. **Не использовать** `Color(.displayP3, red:green:blue:)`.
   - CSS: hex/rgb() — sRGB by default. **Не использовать** `color(display-p3 1 0.35 0.23)`.
2. **Document в DESIGN-TOKENS.md**: «All colors in sRGB. P3 not supported in v1.0.»
3. **Side-by-side screenshot tool**: использовать `xcrun simctl io booted screenshot --type=png` — сохраняет с правильным embedded profile. Для web — Chrome DevTools Device toolbar → Screenshot. Сравнивать **в одном color-managed viewer** (Preview.app поддерживает profiles).
4. **Real device check**: iPhone (P3 display) + MacBook (P3) — разница не должна быть видима на одинаковом sRGB content. Если видна — где-то P3 пробрался в код.
5. **Asset Catalog audit script**: 
   ```bash
   find ios -name "*.colorset" -exec grep -l "displayP3" {} +
   # должно быть пусто
   ```

**Warning signs:**
- На скриншотах web vs iOS coral выглядит разной интенсивности.
- В Xcode Color Set preview: Display P3 vs sRGB swatches — разные на p3-display.
- CSS `image-rendering: -webkit-optimize-contrast` или `color: color(display-p3 ...)` всплывают в коде.

**Phase to address:** **Phase 23 (Design System)**. Audit в **Phase 28**.

---

### Pitfall 12: 11 keyframe-анимаций на Home одновременно — jank на iPhone X / 11

**What goes wrong:**
DESIGN-SYSTEM §7.2 описывает 11 keyframes. На Home при первом mount запускаются параллельно:
- `posterRiseIn` ×4 слоя (eyebrow, mass, italic, big-fig) с delays.
- `posterBarFill` для каждой категории (если их 8 — 8 анимаций scaleX).
- `posterRowIn` ×8 строк категорий с stagger.
- `posterTabPop` если первый mount после tab switch.
- JS count-up на 3 чисел (дневной темп, кошелёк, plan).

**На iPhone X (A11, 2017) и iPhone 11 (A13, 2019)**: SwiftUI на iOS 17+ работает на этих устройствах, но без оптимизации 60fps не достижим. На web в TG Mini App embedded WebView — ещё хуже (WebView рендерит через CALayer + CSS animations через GPU, но с 8 одновременно animating transforms возможен GPU overdraw).

Конкретные проблемы:
1. **`posterBarFill: transform: scaleX(0 → 1)`** — это **transform** анимация, GPU-ускоряемая. ОК.
2. **`posterRiseIn: opacity + translateY`** — opacity composited, translateY transform — GPU-ОК.
3. **JS count-up с `requestAnimationFrame`** — main-thread, не GPU. На каждом frame форматирует с тонкими пробелами (regex replace). 60fps × 1000ms = 60 reformat'ов. Если форматтер дёшев — ОК, но если случайно сделать `Intl.NumberFormat` instance в каждом frame — drop frames.
4. **На iOS SwiftUI**: `withAnimation(.easeOut(duration: 0.9)) { value = target }` для count-up через `Text(value, format: ...)` — это re-render Text каждый frame с new value, что invalidates layout. На сложной view-hierarchy (Home с 8 категориями) — drops.

**How to avoid:**
1. **GPU-ускоряемые свойства only**: `transform`, `opacity`. Никаких `width`, `height`, `top`, `left`. ✓ handoff соблюдает.
2. **Mount-time staging**: вместо параллельного mount 8 категорий с individual `posterRowIn` — использовать один CSS animation на parent container, где children получают анимацию через CSS `animation-delay` (single keyframe). На iOS — `.animation(.spring(), value: state)` с `state.contentMounted` toggle.
3. **Count-up off main thread где возможно**: на iOS 18+ можно использовать `.animation(.easeOut, value: target).keyframeAnimator(...)` который GPU-runs. На web — Lottie или CSS transitions on number content **невозможны**, count-up придётся в JS. Профит — pre-compute formatted strings на каждый frame и cache.
4. **`prefers-reduced-motion` first**: на slow devices юзеры часто включают Reduce Motion для перфоманса. Поддержка disable-able автоматически решает 60% perf-проблем.
5. **Профилирование в Phase 28**: на iPhone 11 (минимально supported) запустить Instruments → SwiftUI / Animation Hitches. Цель: < 5 hitches per session. Если больше — снизить кол-во одновременных animations через staggering окна (только видимые animate).
6. **Preference declaration в codestyle**: keyframe `posterRowIn` ставится **только** на видимые в viewport строки. Lazy-mount категорий ниже fold с `LazyVStack` (iOS) / `IntersectionObserver` (web).

**Warning signs:**
- Instruments Animation Hitches > 10 за первые 3 секунды на Home.
- Видимый stutter при первом mount Home на iPhone 11.
- `requestAnimationFrame` callback > 16ms (Chrome DevTools Performance).

**Phase to address:** **Phase 28 (Animations Polish + Acceptance)**. Подготовить `prefers-reduced-motion` в **Phase 23**.

---

## Moderate Pitfalls

### Pitfall 13: Russian date formatting — «9 мая» vs «9 май» divergence iOS ║ Web

**What goes wrong:**
DATA-MODEL §5.3 требует genitive: «9 мая» (не «май»). На JS `Intl.DateTimeFormat('ru-RU', {day: 'numeric', month: 'long'})` корректно даёт «9 мая». Но на iOS `DateFormatter.dateFormat = "d MMMM"` с `locale = Locale(identifier: "ru_RU")` → даёт **«9 мая»** в standalone form. **Однако** есть подводный камень: `DateFormatter.localizedString(from: date, dateStyle: .medium, timeStyle: .none)` даёт «9 мая 2026 г.» (с «г.»), а `dateFormat = "d MMMM"` даёт «9 мая». Разные code paths, разные результаты на длинных датах.

Web fallback при отсутствии Intl или старой ICU (некоторые embedded WebView на iOS 14): «9 May» английский. На iOS 17+ ICU достаточно свежий.

**How to avoid:**
1. **Hardcoded months arrays** на обоих платформах:
   - JS: `MONTHS_GENITIVE = ['января', 'февраля', ...]` (DATA-MODEL §5.3 уже так).
   - Swift: `let monthsGenitive = ["января", "февраля", ...]` в Period.swift.
2. **Не использовать `Intl.DateTimeFormat({month: 'long'})`** на web — есть случаи когда возвращает nominative «май» вместо genitive (зависит от ICU версии).
3. **Snapshot-тесты на 12 месяцев** на обеих платформах.

**Phase to address:** **Phase 25 (Transactions reestr — основной consumer)**.

---

### Pitfall 14: Side-by-side QA — что считать «pixel-perfect»?

**What goes wrong:**
ТЗ §0 требует «pixel-perfect 1:1». На реальных устройствах web (Chrome WebView в TG) и iOS native рендеринг отличается:
- **Anti-aliasing**: Web CSS использует subpixel rendering (RGB stripe-aware). iOS использует subpixel-positioned, full-pixel rendering. Texts render **subtly different** на той же шкале.
- **Font hinting**: TTF с hinting на iOS применяется только при small sizes. На Web — subject of browser preferences.
- **Scale factors**: iPhone 14 Pro = @3x (1179×2556 → 393×852 pt), web в TG MiniApp = @1x scaled by user device. Скриншоты в @1x на web, @3x на iOS — direct pixel comparison невозможен.
- **Status bar / safe area**: iOS hero обрезается на safe-area top inset (~50pt). Web в TG нет status bar (есть TG header).

**How to avoid:**
1. **Перереформулировать «pixel-perfect»**: «perceptual diff < 1%» или «layout matches at 393×852 logical pt within 2pt tolerance». Не байтовая идентичность, а визуальная неотличимость.
2. **Side-by-side инструмент**: использовать Reg-Suit или BackstopJS с perceptual diff (не pixel-by-pixel).
3. **Принять divergences upfront**:
   - iOS keyboard pushes content — Web TG MiniApp не имеет system keyboard, цифровая клава bottom-sheet on top.
   - iOS DatePicker (в `Add Sheet · Когда · Своя дата`) — нативный wheel; Web — custom 3 chips «Сегодня / Вчера / Своя».
   - iOS clipboard share-sheet vs Web custom share button.
4. **Document divergences** в `.planning/v1.0-handoff/DIVERGENCES.md`: что **должно** разойтись и почему. Пример: «Add Sheet keypad на iOS — system, не custom 3×4 (out-of-MVP).»

**Phase to address:** **Phase 28 (Acceptance)**, decision template на старте Phase 23.

---

### Pitfall 15: Vite build балансирует 4 fonts × 5+ weights → bundle bloat

**What goes wrong:**
Manrope = 5 weights. JetBrains Mono = 3 weights. Archivo Black = 1. DM Serif Italic = 1. С Cyrillic+Latin subsets каждый woff2 ~20-30kb. Итого 10 файлов × 25kb = 250kb fonts. Vite по умолчанию все статические assets копирует в `dist/assets/` без code-splitting.

Проблемы:
- Initial bundle включает все fonts через `<link rel="preload">` если так prописано.
- Без preload — fonts грузятся когда CSS их first reference, что в SPA — **после JS-bundle parse + execute**. То есть FOUT длится до 2 секунд.

**How to avoid:**
1. **Subset aggressively**: использовать `glyphhanger` или `fonttools/pyftsubset`:
   ```bash
   pyftsubset Manrope-500.ttf \
     --output-file=manrope-500-cyr.woff2 \
     --flavor=woff2 \
     --unicodes='U+0020-007E,U+00A0-00FF,U+0400-04FF,U+202F,U+2212' \
     --layout-features='kern,liga,cv*'
   ```
2. **Preload только critical**: top-2 weights (Manrope 500 + JetBrains 600) в `<head>`.
3. **`woff2` only**, не fallback на woff/ttf — все TG-supported браузеры > Chrome 36 / Safari 12.
4. **vite-plugin-fonts** или `unplugin-fonts`: автоматический preload + font-face injection.
5. **Bundle audit в Phase 28**: `vite build --mode production && du -h dist/assets/*.woff2` — общий размер шрифтов < 200kb gzipped.

**Phase to address:** **Phase 23 (Web design foundation)**.

---

### Pitfall 16: Onboarding 4-step — backend create_user_with_seed atomicity

**What goes wrong:**
DATA-MODEL предполагает на онбординге создание:
- AppUser.income
- 8 default categories (food, cafe, ..., subs) с plan_cents согласно share от income
- 1+ Account с balance
- SavingsConfig
- Optional Goal

Если делать через несколько API-calls (POST /me, POST /accounts, PATCH /categories/*, POST /goals) — между ними возможен failure → юзер в inconsistent state (income есть, accounts нет, на главной empty state).

В v0.5 уже есть `CON-01: onboarding atomic` (см. PROJECT.md). Нужно extend на v1.0 entities.

**How to avoid:**
1. **Single endpoint `POST /api/v1/onboarding/complete`** с full payload (income + accounts[] + plans + goal?). Server-side single transaction.
2. **Idempotency-ключ**: если юзер ретраит — возвращать existing state, не дублировать.
3. **Phase 24 testing**: kill API между шагами 03 и 04 → юзер заходит снова → видит резюме шага 03, не пустой стейт.

**Phase to address:** **Phase 24 (Onboarding)**.

---

### Pitfall 17: PLAN мая — sum(plan) ≤ income валидация на frontend и backend разъезжаются

**What goes wrong:**
ТЗ §3.2: «Сумма всех plan ≤ income. Если больше — статус OVER, блок CTA «продолжить» до фикса.» Validators §6: `Σ category.plan ≤ income` → «Превышение плана на X ₽».

**Frontend** (PLAN screen): юзер двигает слайдеры в realtime. Frontend валидирует на каждый change. **Backend** (PATCH /categories/:id { plan }): валидирует на save. 

Сценарий: юзер двигает 7 слайдеров вверх (frontend validates pass), потом 8-й — превышение. Frontend показывает OVER. Юзер игнорирует, хитом «сохранить». Frontend отправляет 8 PATCH-запросов параллельно. **Backend получает их в random order** → первый PATCH validation: sum(other 7 plans + new 8-й) — но **other 7 plans уже могут быть updated** конкурентным запросом, и validation проходит ✓. Второй PATCH: sum (already-updated + this update) — fails. Получаем partial update: 5 категорий с новыми plan, 3 — с старыми. UI inconsistent.

**How to avoid:**
1. **Single PATCH /api/v1/plan** который атомарно обновляет all plan_cents в одной транзакции с проверкой constraint в SQL: `CHECK (sum возможно через trigger или application logic)`. Validation в одном запросе.
2. На FE — debounce + batched-save вместо per-slider PATCH.
3. **DB trigger optional** — но это adds complexity; application-level transaction OK.

**Phase to address:** **Phase 26 (PLAN мая)**.

---

### Pitfall 18: Recurrent posted-flag race — два browser tab'а

**What goes wrong:**
DATA-MODEL §1.5 Recurrent: `postedTxnId` — null до проведения, set после `POST /api/recurrents/:id/post`. На UI показывается чекбокс «провести».

Сценарий: юзер открыл PLAN на телефоне И в браузере на компе (Web). Чекнул в обоих почти одновременно. Без идемпотентности → 2 actual_transaction'а от одной recurrent.

**How to avoid:**
1. **Optimistic locking**: `postedTxnId IS NULL` в WHERE условии UPDATE. Если 0 rows affected — return existing.
2. **Service layer**:
   ```python
   async def post_recurrent(db, rec_id, user_id):
       rec = await get_recurrent(db, rec_id, user_id=user_id)
       if rec.posted_txn_id is not None:
           return await get_actual(db, rec.posted_txn_id, user_id=user_id)  # idempotent
       async with db.begin_nested():
           txn = await create_actual(...)
           updated = await db.execute(
               update(Recurrent)
                 .where(Recurrent.id == rec_id, Recurrent.posted_txn_id.is_(None))
                 .values(posted_txn_id=txn.id)
           )
           if updated.rowcount == 0:
               raise ConflictError("recurrent already posted")
   ```

**Phase to address:** **Phase 22 (Backend) / Phase 26 (PLAN)**.

---

### Pitfall 19: AI initial state — генерация наблюдения должна быть **fast** или с graceful loading

**What goes wrong:**
ТЗ §6: AI открывается на наблюдение по реальным данным. Если генерация через LLM → 1-3 секунды latency на холодный вход. Юзер видит пустой italic placeholder. Acceptance §14.5 требует «релевантное наблюдение».

**How to avoid:**
1. **Cache observations** на бэке — generate раз в час по cron, store в `ai_observation` таблице с TTL.
2. **Skeleton loader** в italic-style: «… собираем данные» с posterDot animation.
3. **Fallback non-LLM template** если cache miss и LLM не отвечает за 500ms: «Май в плюсе на X ₽» (template fill).

**Phase to address:** **Phase 27 (AI initial state)**.

---

### Pitfall 20: Account.primary uniqueness — двух primary одновременно

**What goes wrong:**
DATA-MODEL §1.2 Account: «ровно один primary на пользователя». Без DB constraint можно случайно установить два primary (race на PATCH).

**How to avoid:**
1. **Postgres unique partial index**:
   ```sql
   CREATE UNIQUE INDEX uq_account_user_primary 
   ON account(user_id) 
   WHERE primary = TRUE;
   ```
2. **Service**: при PATCH с primary=true — в транзакции UPDATE old primary → false → INSERT/UPDATE new primary → true.

**Phase to address:** **Phase 22 (Backend Schema)**.

---

## Minor Pitfalls

### Pitfall 21: SoftHyphen + line-break в DM Serif italic блок

«АИ-наблюдение» italic-сериф 17-24px. Длинные русские слова + узкий iPhone (375px) → line-breaks. CSS `hyphens: auto` для русского работает плохо без `lang="ru"`. Лучше `word-wrap: break-word` + content без soft-hyphens (см. Pitfall 9).

**Phase:** Phase 27.

---

### Pitfall 22: JetBrains Mono `tabular-nums` + count-up — width jitter

JetBrains Mono — **monospace**, поэтому tabular-nums выходят by default. Но при count-up если длина строки меняется (123 → 1234 → 12 345), на каждом frame ширина прыгает. Спасает: pre-allocate width равной maximal final width.

**Phase:** Phase 23 (CountUp component).

---

### Pitfall 23: Coral overdraw на Главной — battery drain

Coral fill всю Home view (`background: #FF5A3C`) на full-screen на iPhone X+ OLED — высокая мощность пикселей. На iOS в Settings → Battery видно «App used X% screen power». Не критично для personal use, но **тёмная тема** недоступна (handoff coral-dominant).

**Mitigation:** opt-in toggle «Тёмная палитра» (cobalt вместо coral). Out of MVP scope.

**Phase:** Documented as known limitation.

---

### Pitfall 24: Vite SSR-mode и dynamic font imports

Vite по умолчанию client-only — SSR не используется в TG MiniApp. Это ОК, но если переключаться на Vite SSR в будущем — `<link rel="preload">` динамические через JS не работают на SSR.

**Phase:** N/A для v1.0.

---

### Pitfall 25: aiogram bot — старые команды могут падать после migration

Bot имеет команды `/add`, `/income`, `/balance`, `/today`, `/app`. После миграции схемы (`category.plan_cents` etc.) эти команды могут падать если они дёргают старые схемы. Например, `/balance` использует `compute_balance` — теперь нужно учитывать `kind=roundup,deposit` в фильтрах.

**How to avoid:** интеграционный тест в Phase 22 на каждую bot-команду после миграции.

**Phase:** Phase 22.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Использовать system serif italic вместо custom DM Serif Display Italic | Сохранение времени Phase 23 | Брендовая идентичность теряется; QA провалит pixel-perfect | Только если DM Serif Cyrillic absent (Pitfall 1) и нет ресурса заменить — fallback на PT Serif Italic (тоже cyrillic-готов) |
| Inline animations через `transition:` всё подряд, без keyframes | Быстро прототипировать | На Home будет 11+ одновременных transitions, jank | Только в bottom-sheet (один dialog) |
| Игнорировать `prefers-reduced-motion` | Меньше тестов | Accessibility regression, app-store reject (потенциально) | Никогда — это часть acceptance handoff |
| Хранить plan не в копейках, а в рублях | Меньше деления на 100 на UI | Float ошибки, расхождение с другими денежными полями | Никогда (CLAUDE.md: «Никаких float») |
| Per-slider PATCH в PLAN screen без debounce | Мгновенный визуальный фидбек | N PATCH'ей race-condition (Pitfall 17) | Только с локальным state sync, без backend на каждый change |
| Roundup как frontend-логика | Backend не нужно менять | Двойная реализация iOS+Web, divergence в roundup-сумме при edge-кейсах | Никогда — server-side ради consistency |
| Кастом-стек без edge-swipe-back на iOS | Точное соответствие postSlide-анимациям | Юзеры жалуются «не возвращает» (Pitfall 4) | Только если custom-gesture добавлен с самого начала |
| Один большой alembic upgrade на всё (account + recurrent + goal + кolumns) | Single migration commit | Откат через downgrade требует enum DROP VALUE — unsupported | Только в фазе разработки до prod-deploy; для production — split на 3-5 миграций |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Google Fonts → Self-host woff2 | Скачать `&subset=cyrillic` URL и положить рядом — без font-display | Subsetted woff2 + `font-display: optional` + preload top-2 weights + Fontaine для metric-compatible fallback |
| iOS bundled fonts → CFBundleVersion | Заменили TTF, забыли bump version → simulator кэширует старый | `make bump-version` хелпер в Makefile перед `make run` после font-update |
| Telegram MiniApp WebView → Cyrillic | Полагаемся на system fonts WebView | Self-host все 4 family с явными `<link rel="preload">` + system fallback ('Helvetica Neue' для iOS WebView) |
| Postgres enum extension → Alembic | `op.execute("ALTER TYPE ... ADD VALUE 'roundup'")` без autocommit_block | `with op.get_context().autocommit_block(): op.execute(...)` |
| RLS policies → новые таблицы | Forget add to DOMAIN_TABLES list | DOMAIN_TABLES единое место истины + intg-test `assert все user-facing таблицы имеют RLS` |
| iOS Asset Catalog colors → P3 leak | Создать color asset, оставить «Display P3» по умолчанию | Скрипт: `find ios -name '*.colorset' \! -exec grep -l '"sRGB"' {} +` должно быть пусто |
| Side-by-side QA → screenshot color profiles | Сохранить PNG без profile | `xcrun simctl io booted screenshot --type=png` (embeds profile) + Chrome DevTools Device toolbar (sRGB) |
| Vite assets → cache-busting | Хеши в filename → меняем шрифт = новый hash, юзеры догружают | OK по умолчанию через Vite, no action |
| Worker close_period → per-tenant failure | Один user падает, остальные не processed | Phase 11 уже сделано: per-user isolated session |
| FastAPI middleware order | RLS scope set после dependency что делает запрос | `set_tenant_scope` в самом раннем dependency (`get_current_user`) |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| 11 keyframes одновременно on Home mount | Jank на первой секунде, hitches > 16ms | Stagger через CSS animation-delay; `prefers-reduced-motion` toggle; Lazy-mount категорий ниже fold | iPhone 11 / 60 FPS невозможен с 8+ одновременных |
| LLM observation на cold-start AI screen | 1-3s blank italic | Cache + cron-pregenerate + skeleton с posterDot | При >5 concurrent users (низкий приоритет для personal app) |
| Embedded WebView render всех 4 fonts | LCP > 2.5s | font-display: optional + preload top-2 + woff2 only + subsetted | На 3G; на WiFi незаметно |
| Per-slider PATCH в PLAN | 8 запросов за 200ms на PATCH-flood | Batched POST /plan + debounce 250ms | 50+ slider-event/сек (нагруженный juzер) |
| Count-up через JS rAF на 3 чисел parallel | 60 reformat per frame на main thread | Pre-format function (NumberFormatter cached); single RAF for all | На iPhone X — drops |
| Запрос /api/me на каждом таб-switch | Network round-trip 100-300ms | TanStack Query / SWR cache + invalidate on mutation | После 100+ транзакций — ответ становится тяжелее |
| RLS policy с `current_setting('app.current_user_id')` без index hit | Slow query на 10k+ rows на one tenant | `ix_<table>_user_id` уже есть (Phase 11) | На 100k+ transactions per user |

---

## Security Mistakes (v1.0-specific)

| Mistake | Risk Level | Prevention |
|---------|-----------|------------|
| `actual_transaction.parent_txn_id` указывает на other-tenant txn | HIGH (cross-tenant leak) | API validation: `parent_txn.user_id == current_user.id` + composite FK on `(id, user_id)` |
| `category.parent_id` указывает на other-tenant category | HIGH | То же — composite FK |
| `goal.id` enumeration через PATCH /goals/:id | MEDIUM | RLS уже защищает; добавить тест |
| AI proposes write-action для txn другого tenant | MEDIUM | AI write-flow уже propose-and-approve (v0.3); проверять scope при apply |
| Roundup-txn пишется на другой account через крафтed POST | LOW | account.user_id check уже в create_actual |
| Onboarding endpoint без rate-limit → spam new accounts | LOW (whitelist closed) | Skip для v1.0 |

---

## "Looks Done But Isn't" Checklist (для acceptance в Phase 28)

- [ ] Все 4 шрифта рендерят русский текст на Web (DevTools → Computed → font-family applied actual font, not fallback)
- [ ] Все 4 шрифта рендерят русский текст на iOS (Console.app: no «glyph not in font» warnings)
- [ ] `prefers-reduced-motion: reduce` отключает 11 keyframe-анимаций (CSS @media + iOS @Environment)
- [ ] Edge-swipe-back работает на iOS на всех custom-stack экранах (Категория, PLAN, Account Detail, Subscriptions, Sheet)
- [ ] VoiceOver читает русские UPPERCASE-elements нормально, не letter-by-letter
- [ ] Roundup-txn НЕ создаётся при `|amount| % base == 0` (тест на 50000 кко при base=10)
- [ ] Rollover idempotent: `python -m app.worker.jobs.close_period` дважды → no дубль deposit-txn
- [ ] Period close handles tx_date = последний день предыдущего месяца, отправленный через 30 сек после midnight
- [ ] Multi-tenant: новые таблицы (account, recurrent, goal, savings_config) имеют RLS policy
- [ ] `parent_txn_id` cross-tenant блокируется (тест: tenant A создаёт roundup с parent_txn_id from tenant B → 400/404)
- [ ] coral `#FF5A3C` визуально совпадает между web (Chrome) и iOS native на one display
- [ ] Hidden Unicode chars (U+00AD, U+200B, etc.) отсутствуют в кодовой базе (CI grep)
- [ ] FOUT не виден после первого визита (после service-worker cache prime)
- [ ] count-up на главной финиширует за 900-1100ms на all 3 числах
- [ ] Bot commands `/add /balance /today /income /app` работают после migration
- [ ] Onboarding atomic: kill между шагом 03 и 04 → fresh login → continue с шага 04, не сначала
- [ ] sum(plan) ≤ income enforced на backend в одном PATCH /plan
- [ ] Recurrent post — idempotent: double-tap чекбокс → 1 actual_transaction
- [ ] Account.primary unique enforced (DB constraint + service)

---

## Pitfall-to-Phase Mapping

| Pitfall | Phase | Verification |
|---------|-------|--------------|
| 1. DM Serif Cyrillic missing | 23 | Character-coverage test before merge; ADR fixes alternative |
| 2. FOUT realism | 23 | Lighthouse mobile > 90; LCP < 2.5s on Slow 3G |
| 3. iOS font cache | 23 | Document FONT-DEV-WORKFLOW.md; CFBundleVersion auto-bump |
| 4. PosterNavStack edge-swipe | 23 + 25 | ADR-001-poster-nav-stack.md; Accessibility Inspector audit |
| 5. Roundup integer math | 22 | tests/services/test_roundup.py — 8+ edge cases; CHECK constraint |
| 6. Rollover idempotency | 22 | rollover_source_period_id + UNIQUE INDEX; test_idempotent_rerun |
| 7. Period close race | 22 + 28 | Frontend tz fix; e2e timezone test |
| 8. Multi-tenant migration | 22 | Add new tables to DOMAIN_TABLES; test_multitenancy_v1_0 |
| 9. Hidden Unicode chars | 23 | CI grep blocklist; format constants |
| 10. VoiceOver UPPERCASE | 28 + 23 | Accessibility audit; .accessibilityLabel overrides |
| 11. P3 vs sRGB | 23 + 28 | Asset Catalog grep audit; visual side-by-side |
| 12. Animation jank | 28 + 23 | Instruments на iPhone 11; prefers-reduced-motion |
| 13. Russian dates | 25 | Snapshot test 12 months on both platforms |
| 14. Pixel-perfect ambiguity | 28 | DIVERGENCES.md; perceptual-diff tooling |
| 15. Vite font bundle | 23 | du -h dist/assets/*.woff2 < 200kb gzipped |
| 16. Onboarding atomicity | 24 | Single endpoint; kill-test |
| 17. PLAN sum validation race | 26 | Single PATCH /plan transaction |
| 18. Recurrent post race | 22 + 26 | Optimistic locking; test_double_post |
| 19. AI initial slow | 27 | Cache + skeleton; SLA < 500ms cache hit |
| 20. Account primary unique | 22 | DB partial unique index; service test |
| 21. Soft hyphen line breaks | 27 | content audit; lang="ru" attribute |
| 22. Tabular-nums width jitter | 23 | width pre-allocation in CountUp |
| 25. Bot commands post-migration | 22 | bot integration tests after migration |

---

## Sources

- [Archivo Black on Google Fonts (Cyrillic subset URL)](https://fonts.google.com/specimen/Archivo+Black?subset=cyrillic) — confirms cyrillic available (HIGH confidence)
- [DM Serif Display on Google Fonts](https://fonts.google.com/specimen/DM+Serif+Display) — Latin/Latin-Ext only; **no cyrillic in official subset list** (MEDIUM confidence — need direct character-coverage test)
- [SwiftUI custom NavigationStack swipe-back gesture (Apple Forums)](https://developer.apple.com/forums/thread/745986) — `interactivePopGestureRecognizer.delegate = self` workaround (HIGH)
- [Apple: accessibilityReduceMotion](https://developer.apple.com/documentation/swiftui/environmentvalues/accessibilityreducemotion) — official @Environment key (HIGH)
- [MDN: prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion) — official CSS media query (HIGH)
- [PostgreSQL ALTER TYPE ADD VALUE in Alembic](https://medium.com/makimo-on-software-development/upgrading-postgresqls-enum-type-with-sqlalchemy-using-alembic-migration-881af1e30abe) — autocommit_block requirement (HIGH)
- [Multi-tenant RLS in PostgreSQL — AWS guide](https://aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security/) — best practices for new column safety (HIGH)
- [WebKit: Display P3 in CSS](https://webkit.org/blog/10042/wide-gamut-color-in-css-with-display-p3/) — sRGB vs P3 in browsers (HIGH)
- [Optimizing Web Fonts: FOIT vs FOUT vs Font Display Strategies (talent500)](https://talent500.com/blog/optimizing-fonts-foit-fout-font-display-strategies/) — font-display tradeoffs (MEDIUM)
- [iOS 14.x Custom Font Issue (Apple Forums)](https://developer.apple.com/forums/thread/671608) — font cache symptoms after replacement (MEDIUM)
- [Apple: integer overflow](https://developer.apple.com/documentation/xcode/integer-overflow) — Swift Int64 overflow handling (HIGH)
- [How to detect Reduce Motion in SwiftUI (Hacking with Swift)](https://www.hackingwithswift.com/quick-start/swiftui/how-to-detect-the-reduce-motion-accessibility-setting) — practical pattern (HIGH)
- [VoiceOver Internationalization (Phrase blog)](https://phrase.com/blog/posts/ios-voiceover-internationalization/) — accessibilityLabel for non-Latin scripts (MEDIUM)
- [Optimize SwiftUI performance — WWDC25](https://developer.apple.com/videos/play/wwdc2025/306/) — animation hitches in Instruments (HIGH)
- Project files (HIGH — primary source):
  - `/Users/exy/pet_projects/tg-budget-planner/.planning/PROJECT.md`
  - `/Users/exy/pet_projects/tg-budget-planner/.planning/v1.0-handoff/handoff/DESIGN-SYSTEM.md`
  - `/Users/exy/pet_projects/tg-budget-planner/.planning/v1.0-handoff/handoff/DATA-MODEL.md`
  - `/Users/exy/pet_projects/tg-budget-planner/.planning/v1.0-handoff/handoff/ТЗ.md`
  - `/Users/exy/pet_projects/tg-budget-planner/app/services/actual.py`
  - `/Users/exy/pet_projects/tg-budget-planner/app/worker/jobs/close_period.py`
  - `/Users/exy/pet_projects/tg-budget-planner/alembic/versions/0006_multitenancy.py`

---
*Pitfalls research for: TG Budget Planner v1.0 «Maximal Poster Full»*
*Researched: 2026-05-09*
