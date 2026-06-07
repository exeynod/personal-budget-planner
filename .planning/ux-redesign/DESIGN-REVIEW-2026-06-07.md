# Native-shell (Liquid Glass) — большой дизайн-ревью и план приведения в порядок

> **СТАТУС 2026-06-07: РЕАЛИЗОВАНО ПОЛНОСТЬЮ** (ветка `v1.1-design-fixes`, в прод не пушено).
> P0-1…7, P1-1…6, P2-1…5 — все сделаны и зелёные (tsc 0, vitest 381, native e2e 15 +
> поттер pixel 7 = 22/22). Коммиты: 0c6dd26 (постер-регрессия), f629712 (P0), 1f5f6e2 (P1),
> 2a7cbc2 (единый «+» план), 475425a (glass-токены + iOS native glass), 06d9966 (P1-4/5 + P2).
> Ниже — исходный план (оставлен как карта сделанного).

**Дата:** 2026-06-07
**Ветка:** `v1.1-design-fixes`
**Скоуп:** только native-шелл, `ui.theme === 'liquid_glass'` (Maximal Poster не трогаем — у него свои пиксельные эталоны).
**Тип документа:** READ-ONLY аудит → план. Код в этом проходе не менялся.
**Ориентир:** нативный iOS / Apple HIG — чистота, предсказуемая сетка, никаких «осколков» другого дизайна.

Источники анализа:

- 6 скриншотов владельца (аналитика, модалка ЯНДЕКС ПЛЮС, тост «НЕ УДАЛОСЬ ПРОВЕСТИ ВСЕ», обрезающийся прямоугольник, OS date-picker, ладдер Σплан/Доход).
- 14 свежих native-скриншотов из `npx playwright test native-liquid-glass.spec.ts` → `.planning/liquid-glass-v2-proof/web/*.png` (home, plan, template, category-detail, settings, transactions, management, ai, add-sheet, onboarding, analytics, subscriptions).
- Исходники: `frontend/src/stylesV10/native.css`, `tokens.css`, `screensV10/native/*`, `componentsV10/*`, и per-screen `Native*View.{tsx,module.css}`.

---

## 0. Главный диагноз (TL;DR)

Native-шелл — это **не цельный дизайн, а слой «нативных» компонентов поверх недодемонтированного Maximal Poster**. Отсюда ощущение «на коленке»:

1. **Два несвязанных набора токенов** живут параллельно: `--lgn-*` (native.css, реально используется в native-компонентах) и `--lg-*` (tokens.css, под `[data-theme=liquid_glass]`, по сути мёртвый). Радиусы конфликтуют: `--lgn-r-card: 20px` vs `--lg-radius-card: 14px`. Шкала радиусов де-факто отсутствует — значения 7/9/10/14/20px разбросаны по файлам.
2. **Maximal-Poster-компоненты протекают в native-экраны**: `Toast` (жёлтый, JetBrains Mono, `border-radius: 0`), `SubscriptionMenuSheet` (кремовый `--poster-paper`, Archivo Black, коралловая кнопка), `PosterButton` в Management-вьюхах. Это и есть «кремовый артефакт» и «несвёрстанность».
3. **Системный «оптический градиент»-фон** (6 наложенных радиальных + диагональный) фонит сквозь все экраны — пёстрый, отвлекает от цифр, на пустых экранах (Подписки, AI, пустая Аналитика) выглядит как недогруженная заглушка.
4. **Стандартные OS-контролы вместо свёрстанных**: `<input type="date">` и `<input type="number">` дают системный date-picker и нескруглённую плашку — ровно жалоба №3.
5. **Клиппинг при переходах**: `overflow: hidden` на корне + анимация `translateX` без отдельного слоя композитинга → видны «обрезающиеся прямоугольники».
6. **Несвёрстанные мелочи**: лишние плашки (Σплан/Доход отдельной карточкой; дублирующий бейдж OK/Превышено + цветной бордер + цвет числа), UPPERCASE заголовки транзакций (poster-идиома, анти-HIG), inline-формы добавления вместо переиспользования AddSheet.

Хорошая новость: **корректный native-паттерн уже есть** — это `NativeAddSheet` (ActionSheet для даты/категории, keypad, inset-группы). Его нужно сделать **эталоном** и подтянуть к нему Plan/Template/Subscriptions, а не изобретать заново.

---

## 1. Системные (сквозные) проблемы

### S1. Дублирующиеся токены и отсутствие шкалы радиусов — `stylesV10/tokens.css` + `stylesV10/native.css`

- `tokens.css:53-92` определяет `--lg-*` под `[data-theme="liquid_glass"]`; ни один native-компонент их не читает (грепаются только `--lgn-*`). Мёртвый код, вводит в заблуждение.
- Радиусы рассинхронизированы: `--lgn-r-card:20px`, `--lgn-r-tile:10px`, `--lgn-r-button:14px`; при этом сегмент-трек захардкожен `border-radius: 9px` / thumb `7px` (`NativePrimitives.module.css:184,194`), date-input в Plan — `--lgn-r-button` (14px), а карточки — 20px. Глаз читает «случайные» скругления.
- **Действие:** удалить блок `--lg-*` из tokens.css (или явно пометить deprecated), объявить **одну** шкалу радиусов в native.css и использовать только её (см. §3).

### S2. Протечки Maximal Poster в native-шелл

Конкретные места:

- **Toast** — `componentsV10/Toast.module.css:1-21`: `background: var(--poster-yellow)`, `font-family: 'JetBrains Mono'`, `text-transform: uppercase`, `border-radius: 0`, `letter-spacing: 0.18em`. Используется в `Plan/PlanMount.tsx:353`, `CategoryDetail/CategoryDetailMount.tsx`. Это и есть жёлтая плашка «НЕ УДАЛОСЬ ПРОВЕСТИ ВСЕ» (скрин 10/11) — кричит, не-iOS, прямоугольная.
- **SubscriptionMenuSheet** — `Subscriptions/SubscriptionMenuSheet.tsx:120-255` + `.module.css`: `backgroundColor="var(--poster-paper)"` (кремовый!), `font-family: --poster-font-archivo-black`, `.destructive { background: var(--poster-coral) }`, `PosterButton variant="ghost"`. Это **в точности** модалка ЯНДЕКС ПЛЮС со скрина 8: кремовый фон, пустое тело, коралловая кнопка «ОТМЕНИТЬ ПОДПИСКУ».
- **PosterButton/PosterSlider** в Management: `SettingsView`, `TemplateMount`, `MgmtHubView`, `AccessView`, `SettingsView` импортируют `PosterButton` из `componentsV10`. Под native-темой `--poster-coral`/`--poster-cobalt` занулены в `NativeShell.module.css:64-66`, поэтому кнопки выглядят «прозрачными»/«пустыми».
- **UPPERCASE-заголовки** (poster-идиома): `Transactions/NativeTransactionsView.tsx:230` `catName.toUpperCase()`, `:197` `bank.toUpperCase()`; `CategoryDetail/NativeCategoryDetailView.tsx:206` `category.name.toUpperCase()`; `Subscriptions/NativeSubscriptionsView.tsx:109` `s.name.toUpperCase()` + соответствующие `text-transform:uppercase` в их CSS. iOS-списки используют обычный регистр — на скринах «ПРОДУКТЫ/КАФЕ/ТРАНСПОРТ» читаются как чужеродные.
- **Действие:** для native — собственный `NativeToast` (см. §3/быстрые победы), полная пересборка `SubscriptionMenuSheet` на native-примитивах, замена `PosterButton` на native-кнопку в Management, снять `toUpperCase()`/`text-transform` со всех native-списков.

### S3. «Идиотский градиент» — `screensV10/native/NativeShell.module.css:16-55`

Фон = `--lgn-bg` + **6 слоёв** `radial-gradient` (оранжевый каустик, коралл, лаванда, тил, бирюза) + диагональный `linear-gradient` тил→индиго, `background-attachment: fixed`. Под полупрозрачными карточками это даёт пёструю, «нефтяную» подложку. На контентных экранах терпимо, на пустых (Подписки/AI/пустая Аналитика, скрины) выглядит как баг/недогруз. Контраст по краям нестабилен (числа над тёмно-тиловым низом теряют 4.5:1).

- **Действие:** заменить на **нейтральный** фон — мягкий вертикальный градиент в сторону iOS `systemGroupedBackground` (#F2F2F7) с едва заметным тёплым верхом, либо плоский #EEF1F6. Сохранить лёгкий top-light для specular-кромок карточек, убрать цветные пол`юса. См. §«Быстрые победы».

### S4. Клиппинг таб-бара и push-переходов — `NativeShell.module.css:3-11,58,94-126`

- `.shellRoot { overflow: hidden }` + `.content { overflow-y:auto }` + анимация `.viewWrap` через `transform: translateX(...)` без `will-change`-изолированного слоя и без явного clip-контекста. Во время `lgnSlideInFwd/Back` уезжающий слой обрезается жёстким прямоугольником корня → «обрезающиеся прямоугольники» (жалоба №1, скрин 11).
- Плавающий таб-бар (`NativePrimitives.module.css:235-262`) с `backdrop-filter` поверх контента, который под ним скроллится: на стыке blur даёт банддинг/«ступеньку», особенно при анимации (новый stacking context от `backdrop-filter` + `transform`).
- Активная «линза» таба `.tabActive::before { inset: 6px 6px; box-shadow ... }` (`:282-297`) при ширине таба может выходить за капсулу → подрезается `border-radius` пилюли.
- **Действие:** (а) дать `.content`/`.viewWrap` `overflow: clip` с `border-radius` совпадающим, ИЛИ убрать `overflow:hidden` с корня и клиповать только область контента; (б) анимировать оба слоя (входящий+уходящий) одновременно (cross-fade/slide парой), а не один поверх обрезанного; (в) `transform: translateZ(0)` / `will-change` на таб-баре, чтобы фиксировать слой и убрать банддинг; (г) проверить, что `.tabActive::before` помещается в капсулу.

### S5. Несогласованная навигация (back/header)

- Большие экраны: `NativeLargeTitle` (34px, trailing «+»), без back. Pushed: `NativeNavBar` (17px центр, «‹ Назад» слева акцентным цветом).
- НО Subscriptions-скрин показывает «‹ Назад» синим и «0 ₽/мес» жирным слева — это не `NativeNavBar` стиль, заголовок «Подписки» по центру, а под ним крупная сумма без карточки (poster-вёрстка протекла). Несогласованность «больших чисел без контейнера».
- **Действие:** единый `NativeNavBar` на всех pushed-экранах; «итоговую сумму» выносить в первую inset-карточку, а не в голый bold-текст.

### S6. Типографика — нет единой шкалы, «магические» размеры

Размеры шрифта разбросаны прямо по компонентам: 34/28/24/17/15/14/13/12/11/10px в разных файлах, частично совпадают с iOS Text Styles, частично нет (24px в KPI — не iOS-стиль; 10px tab-label — на грани читаемости). `--lgn-font` правильный (SF), но **семантической шкалы (`--lgn-t-largeTitle`, `-title2`, `-body`, `-footnote`…) нет**, как нет line-height/letter-spacing токенов.

- **Действие:** ввести типо-токены (Large Title 34/41, Title2 22/28, Body 17/22, Subhead 15/20, Footnote 13/18, Caption 12/16) и заменить хардкоды.

### S7. Дата-виз (бар-чарт) слабоват — `Analytics/NativeAnalyticsView.module.css:62-121` (скрин 9)

- Бары `width:70%; max-width:26px; min-height:2px; radius 4px 4px 0 0`, gap 6px, высота 140px. На скрине столбцы тонкие, без оси/значений, подписи 10px по 12 точкам наезжают/обрезаются (`barLabel { ellipsis }`). Нет baseline, нет grid, нет выделения текущего/пикового. «Динамика расходов» читается бедно.
- KPI-числа 24px (`kpiValue`) — не из iOS-шкалы; дельта «−100% к прошлому» зелёным при нулевых данных выглядит как ошибка.
- **Действие:** перерисовать чарт по токенам: фикс-ширина баров с min-tap, baseline-линия, аккуратные подписи (каждый N-й day или поворот), highlight текущего периода; KPI на типо-шкалу.

### S8. Отступы — нет единой сетки контейнеров

Горизонтальные инсеты прыгают: карточки `margin: 0 16px` (`insetGroup`), но `surplusCard`/`bulkBtn`/`empty` — `16px`, `largeHeader`/`sectionHeader`/`footnote` — `20px`, period-switcher и таб-бар — `16px`. Левый край контента «гуляет» 16↔20px между заголовком секции и карточкой под ним.

- **Действие:** один токен горизонтального gutter (16px) для всех контейнеров верхнего уровня; заголовки секций выровнять по карточкам (iOS grouped: заголовок секции выровнен по тексту строки, т.е. ~32px, либо по краю карточки 16px — выбрать одно).

---

## 2. Аудит по экранам

Легенда: 🔴 P0 (артефакт/баг, кричит) · 🟠 P1 (системная грязь) · 🟡 P2 (polish).

### 2.1 Home / Главная — `Home/NativeHomeView.*`, скрин `home.png`

- 🟠 Фон-градиент особенно заметен в правом-верхнем (коралл/лаванда) за «+» и за period-pill — отвлекает от «Остаток на счёте». → S3.
- 🟡 Карточка остатка: метки `ЛИМИТ/РАСПИСАНО/ФАКТ/В ЗАПАСЕ` мелкими капсами — на грани, но ок; «+27 644,46» зелёным ок.
- 🟡 «План месяца» — отдельная карточка-кнопка с шевроном, ок; но её отступ/радиус должны совпасть с категориями (проверить 16 vs 20).
- 🟡 Сегмент «Расходы/Доходы» — `9px`/`7px` радиусы (S1), не из шкалы.
- 🟠 Заголовок секции «Категории» 20px-инсет vs карточка 16px (S8).
- 🟡 «+» в шапке (`circleBtn` 38px) — хорошо, это правильный нативный паттерн; держать как эталон круглой стеклянной кнопки.

### 2.2 План месяца — `Plan/NativePlanView.{tsx,module.css}`, скрины `plan.png`, владельца 10/11/12/13

Самый проблемный экран.

- 🔴 **Тост «НЕ УДАЛОСЬ ПРОВЕСТИ ВСЕ»** (скрин 10/11) — жёлтый poster-Toast поверх native-экрана, прямоугольный, моно-шрифт капсом. Чужеродно + дублирует роль inline-ошибки. → S2 (NativeToast).
- 🔴 **OS date-picker** (скрин 12): `NativePlanView.tsx:291-297` `<input type="date" class=addInputSm>` → системный календарь, нескруглённый, чужой шрифт. Жалоба №3. Должен быть ActionSheet+date как в AddSheet.
- 🔴 **Inline add-форма = «непонятный дроп-даун»** (жалоба №5): `tsx:271-323` — «Детализация» disclosure раскрывает строку `Название` + `₽` + `date` + `Добавить`. Это и есть «ужас». → переиспользовать AddSheet-паттерн «+» (§3, P0-5).
- 🟠 **Лишняя плашка «Σ план / Доход»** (скрин 13): `tsx:450-466` отдельный `InsetGroup` под категориями дублирует «Осталось распределить» сверху + «Доход» уже подразумевается. Владелец прямо назвал «лишней плашкой». → убрать/слить в сводку сверху.
- 🟠 **Тройное кодирование статуса surplus**: `surplusCard` одновременно (а) меняет цвет числа на красный, (б) рисует `border-left: 4px` цветной, (в) показывает бейдж OK/ПРЕВЫШЕНО (`:61-79`). Перебор — оставить одно (цвет числа + лаконичная подпись).
- 🟠 Bulk-кнопка «Провести запланированное · N» — сплошная оранжевая, но disabled-стейт уходит в `seg-track` (серую) — резкий перепад; радиус `--lgn-r-card` (20) vs другие кнопки 14.
- 🟠 «Регулярные» pill-CTA «Провести» синие на оранжевом фоне экрана — цветовой винегрет (оранж акцент + синие действия + зелёный/красный статус). Нужна дисциплина акцентов (§3).
- 🟡 «Детализация» toggle — текстовые «▸/▾» глифы вместо иконки; ладдер `Лимит/Расписано/Свободно` плашками `seg-track` — ок, но шрифт капсом 11px (poster-эхо).

### 2.3 Шаблон бюджета — `Management/Template*`, скрин `template-expanded.png`

- 🔴 **Та же inline add-форма** `Название/₽/День (опц.)/Добавить` (скрин) — нескруглённые инпуты, «дроп-даун»-ощущение. → AddSheet-паттерн (P0-5).
- 🟠 Мелкие **коралловые trash-иконки** в кружке у строк — poster-акцент протёк, диссонирует с native-списком.
- 🟠 «Строки · N» — синий disclosure-текст (как в Plan), не-iOS (iOS использует chevron/expandable rows).
- 🟡 Сегмент «Расход/Доход» вверху — те же 9px-радиусы.

### 2.4 Детализация категории — `CategoryDetail/NativeCategoryDetailView.*`, скрин `category-detail.png`

- 🟠 **UPPERCASE заголовок операции «ПРОДУКТЫ»** (`tsx:206 toUpperCase()` + `css:88,222 text-transform`) — poster-идиома, в iOS-строке должно быть «Продукты». → S2.
- 🟠 Прогресс-бар лимита — тонкая серая полоса (`limit 16000` под числом), почти не читается; нет заполнения цветом по доле факта.
- 🟠 Кнопка «Поднять лимит» — сплошная оранж, радиус 20px, на全 ширину; визуально тяжёлая, конкурирует с числом 385,18.
- 🟡 Хедер-карточка дублирует `ЛИМИТ/РАСПИСАНО/ФАКТ/В ЗАПАСЕ` (как Home) — ок, но проверить выравнивание чисел (tabular-nums).

### 2.5 Транзакции — `Transactions/NativeTransactionsView.*`, скрин `transactions.png`

- 🟠 **UPPERCASE «ПРОДУКТЫ/КАФЕ/ТРАНСПОРТ»** + «Т-БАНК 3477» капсом (`tsx:197,230`) — анти-HIG. → S2.
- 🟡 Фильтр-кнопка (воронка) в шапке — `circleBtn`-подобная, ок; но period-pill под крупным заголовком создаёт двойную «шапку» (заголовок + pill), много воздуха сверху.
- 🟡 Группировка по дате «9 мая» справа суммой — ок; разделители строк должны быть hairline-инсетом (проверить).

### 2.6 AI — `Ai/*`, скрин `ai.png`

- 🟠 **Градиент максимально заметен** (жалоба №1 контекст): пустая нижняя половина = чистый пёстрый фон, читается как недогруз. → S3 нейтральный фон сразу снимет.
- 🟠 Композер прибит к низу (`flex:1` в `viewWrap`), но над таб-баром — проверить, что не перекрывается плавающей пилюлей (clip S4).
- 🟡 Карточка-инсайт «Май в плюсе…» и список «Подсказки» — ок по структуре; «→» шевроны серые, норм.

### 2.7 Управление — `Management/MgmtHubView.*`, скрин `management.png`

- 🟠 **Бейдж «OWNER»** у «Доступ» — коралловый poster-чип на native-строке (диссонанс). → перекрасить в нейтральный/accent-tinted capsule.
- 🟡 Иконки пунктов меню (Шаблон/Аналитика/Подписки/Настройки/Доступ) — оранж/коралл/синие квадраты; набор цветов не систематизирован (часть из poster-палитры).
- 🟡 Аватар «П» в кружке — ок.

### 2.8 Настройки — `Management/SettingsView.*`, скрин `settings.png`

- 🔴 **Обрезанные подписи**: «Текущий расчётный остат…», «Реальный …», «Напоминать за дней до п…» (`text-overflow:ellipsis` на title) — строки не дают значению/инпуту ужаться. Выглядит сломано.
- 🟠 **`<input type="number">` степперы** «День начала цикла» −1+ — нативные `+/−` плашки в кружках коралловые (poster); инпут «Реальный … ₽» голый.
- 🟠 **Значение «КОРАЛ»** в «Цвет Home» и «LIQUID GLASS / Maximal Poster…» — это poster-настройки, протёкшие в native UI; капс-значения чужеродны.
- 🟡 Toggle (AI авто-категоризация) — зелёный iOS-switch, ок (правильный паттерн).

### 2.9 Подписки — `Subscriptions/NativeSubscriptionsView.*` + `SubscriptionMenuSheet`, скрины `subscriptions.png`, владельца 8

- 🔴 **Модалка подписки = Maximal Poster** (скрин 8): кремовый `--poster-paper` фон, заголовок Archivo Black капсом, **пустое тело** (между заголовком и кнопкой ничего — нет инфо о подписке: цена/день/счёт), коралловая кнопка «ОТМЕНИТЬ ПОДПИСКУ», кривые отступы. Полностью переписать на native (P0-3).
- 🟠 **«0 ₽/мес» голым жирным** слева в шапке (скрин subscriptions) — poster-вёрстка крупного числа без карточки; не-iOS.
- 🟠 **UPPERCASE имена подписок** (`tsx:109`). → S2.
- 🟠 Пустой стейт «Нет подписок» — одинокая карточка на пёстром фоне (S3).

### 2.10 AddSheet «Новая транзакция» — `AddSheet/NativeAddSheet.*`, скрин `add-sheet.png`

- ✅ **Эталон.** Правильный iOS-sheet: «Отмена/Новая транзакция», крупная сумма 56px, инсет-группа «Категория/Дата» с шевронами, **ActionSheet-пикеры** (дата: Сегодня/Вчера/Своя дата; категория: список с галкой), native keypad, CTA «Введите сумму»→«Добавить», dirty-confirm. Date-input **скрыт** (`hiddenDateInput`) и открывается программно — то, чего не хватает Plan/Template.
- 🟡 Keypad-клавиши — белые плашки на сером; проверить, что радиусы/тени из шкалы.
- 🟡 Чуть-чуть: header «Отмена» синее, CTA оранж — но это консистентно с системой акцентов, если её зафиксировать.
- **Вывод:** этот файл — образец для миграции остальных вводов.

### 2.11 Онбординг — `Onboarding/*`, скрин `onboarding.png`

- 🟡 В целом аккуратно (карточки дохода/баланса, day-chips, toggle «Готовые категории»). Иконка ₽ в оранж-кружке с тенью — ок.
- 🟡 Day-chips `1/5/10/15/20/25/28` — активный оранж-кружок; неактивные плоские — ок, но радиусы/размер привести к шкале.
- 🟡 Тот же фон-градиент сверху-розовый — после S3 станет нейтральнее.

---

## 3. Предложение дизайн-системы (native / Liquid Glass)

Единый источник правды — `stylesV10/native.css`. Удалить/депрекейтнуть `--lg-*` из tokens.css.

### 3.1 Фон (нейтральный, замена S3)

```
--lgn-bg: #EEF1F6;            /* нейтральная база, близко к systemGroupedBackground */
--lgn-bg-image:
  linear-gradient(180deg, #F5F7FB 0%, #EAEEF4 100%);  /* едва заметный вертикальный, без цветных полюсов */
/* опц. очень слабый top-light для specular-кромок: */
  radial-gradient(120% 50% at 50% -10%, rgba(255,255,255,.5), transparent 55%);
```

Убрать оранж/коралл/лаванда/тил/индиго слои и `background-attachment: fixed` (на iOS WebView fixed+blur — источник банддинга).

### 3.2 Радиусы (единая шкала, замена S1)

```
--lgn-r-xs: 8px;     /* инпуты, мелкие плашки (date/amount chip) */
--lgn-r-sm: 12px;    /* кнопки, сегмент-thumb */
--lgn-r-md: 16px;    /* карточки/inset-группы (вместо вразнобой 14/20) */
--lgn-r-lg: 20px;    /* шиты/крупные модалки */
--lgn-r-tile: 8px;   /* иконки-тайлы */
--lgn-r-pill: 999px;
```

Заменить хардкоды `9px/7px` (сегмент), `14px`/`20px` (карточки) на токены. Сегмент-трек `--lgn-r-sm`, thumb на 2px меньше.

### 3.3 Отступы (4pt, один gutter)

```
--lgn-gutter: 16px;   /* единый горизонтальный инсет ВСЕХ контейнеров */
--lgn-s-2/4/8/12/16/20/24  /* уже есть, оставить */
```

Заголовки секций — `padding: 16px var(--lgn-gutter) 6px`, выровнять левый край с карточками (убрать 20px).

### 3.4 Тени (оставить парные, чуть мягче на нейтральном фоне)

```
--lgn-shadow-card:  0 1px 2px rgba(20,24,40,.05), 0 6px 16px rgba(20,24,40,.08);
--lgn-shadow-float: 0 2px 6px rgba(20,24,40,.10), 0 16px 40px rgba(20,24,40,.16);
```

Specular-кромки (`--lgn-card-edge`) — оставить, но на нейтральном фоне снизить яркость `--lgn-edge-top` до .8, иначе «пластиковый» глянец.

### 3.5 Типографика (iOS Text Styles, замена S6)

```
--lgn-t-largeTitle: 700 34px/41px;   letter-spacing: .37px;
--lgn-t-title2:     700 22px/28px;
--lgn-t-title3:     600 20px/25px;
--lgn-t-headline:   600 17px/22px;
--lgn-t-body:       400 17px/22px;
--lgn-t-subhead:    400 15px/20px;
--lgn-t-footnote:   400 13px/18px;   color: --lgn-ink-2;
--lgn-t-caption:    400 12px/16px;
```

Заменить 24px KPI → title2; 10px tab-label → caption2 (11px) min. **Запретить капс** в native-списках (sentence case).

### 3.6 Цвета и дисциплина акцентов

Текущий винегрет (оранж акцент + синие действия + зелёный/красный статус) → правило:

- **Акцент действий = оранж** `--lgn-accent` (#FF7A4C). CTA, активный таб, «+», «Сохранить».
- **Связи/вторичные действия = синий** только для системно-ссылочного (links). Pill-CTA «Провести» в Plan/Subs → перевести на **акцент-tinted** (оранж 12% фон / оранж текст), а не синий, чтобы не плодить цвета.
- **Семантика = зелёный/красный** строго для дельты/статуса, не для кнопок.
- Poster-палитру (coral/cobalt/yellow) в native не использовать; бейдж OWNER → `--lgn-ink-2` на `--lgn-seg-track`.

### 3.7 Компоненты-примитивы (что добавить/починить)

- `NativeToast` — стеклянная капсула: `background: var(--lgn-chrome)`, `backdrop-filter`, `border-radius: --lgn-r-pill`, SF-шрифт, иконка ✓/⚠ из phosphor, без капса, авто-dismiss. Заменяет poster-Toast в Plan/CategoryDetail.
- `NativeDatePicker` (ActionSheet+wheel/inline) — переиспользовать паттерн из `NativeAddSheet` (`onPickCustomDate`/`ActionSheet`), вынести в `native/`. Убрать все `<input type="date">` из native-вьюх.
- `NativeStepper` — для «День начала цикла» (вместо `<input type="number">` с poster-кружками).
- `NativeButton` (primary/secondary/destructive/ghost) — замена `PosterButton` в Management; destructive = `--lgn-red` фон/белый текст, ghost = текст-акцент.
- `NativeSheet` (light, `#F2F2F7`) — обёртка, на которой строятся Subscription menu + future modals (тело обязательно, не пустое).

---

## 4. Приоритизированный план

### P0 — Артефакты/баги, которые «кричат» (сделать первыми)

**P0-1. Нейтральный фон.** `NativeShell.module.css:16-55` → заменить 6 радиалов+линейный на §3.1. Снять `background-attachment: fixed`.
_Файлы:_ `screensV10/native/NativeShell.module.css`, `stylesV10/native.css` (новые `--lgn-bg*`).

**P0-2. NativeToast вместо poster-Toast.** Создать `screensV10/native/NativeToast.{tsx,module.css}` (§3.7). Заменить импорты в `Plan/PlanMount.tsx:18,353`, `CategoryDetail/CategoryDetailMount.tsx:27`. Убирает жёлтую плашку «НЕ УДАЛОСЬ ПРОВЕСТИ ВСЕ».
_Файлы:_ новый `NativeToast.*`, `PlanMount.tsx`, `CategoryDetailMount.tsx`.

**P0-3. Пересборка SubscriptionMenuSheet на native.** `Subscriptions/SubscriptionMenuSheet.{tsx,module.css}` → light NativeSheet: шапка с именем (sentence case) + **тело с инфо** (цена/день/счёт), список действий native-строками, destructive = `NativeButton`. Убрать `--poster-*`, Archivo Black, coral, `PosterButton`. Чинит модалку ЯНДЕКС ПЛЮС (скрин 8).
_Файлы:_ `SubscriptionMenuSheet.tsx`, `SubscriptionMenuSheet.module.css`.

**P0-4. Кастомный календарь (убрать OS date-picker).** Вынести ActionSheet-date из `NativeAddSheet` в `native/NativeDatePicker`. Заменить `NativePlanView.tsx:291-297` и Template inline `<input type="date">` на него (скрытый input + триггер-строка). Чинит скрин 12 + жалобу №3.
_Файлы:_ новый `native/NativeDatePicker.*`, `Plan/NativePlanView.tsx`, `Management/Template*`.

**P0-5. Добавление в план/шаблон через «+» AddSheet-паттерн.** Заменить inline-форму `Название/₽/дата/Добавить` (`NativePlanView.tsx:271-323`, Template аналог) на bottom-sheet, переиспользующий стиль `NativeAddSheet` (keypad+ActionSheet). Жалоба №5 («непонятный дроп-даун»).
_Файлы:_ `Plan/NativePlanView.tsx`, `Plan/PlanMount.tsx`, `Management/TemplateMount.tsx`, переиспользование `AddSheet/Native*`.

**P0-6. Клиппинг переходов/таб-бара.** `NativeShell.module.css`: убрать `overflow:hidden` с корня → `overflow: clip` на `.content` с радиусом; анимировать входящий+уходящий слой парой (а не один поверх обрезанного); `will-change/translateZ(0)` на таб-баре; проверить `.tabActive::before` в пределах капсулы. Жалоба №1 (обрезающиеся прямоугольники).
_Файлы:_ `NativeShell.module.css`, `NativePrimitives.module.css` (tabBar/tabActive).

**P0-7. Чинить обрезанные подписи Настроек.** `Management/SettingsView.*`: дать title `flex-shrink`/перенос, ужать значение/инпут; убрать ellipsis на ключевых строках («Текущий расчётный остаток», «Реальный остаток», «Напоминать за N дней»).
_Файлы:_ `Management/SettingsView.tsx`, `SettingsView.module.css`.

### P1 — Системная чистка (убрать «poster-эхо» и рассинхрон)

**P1-1. Снять UPPERCASE с native-списков.** Убрать `toUpperCase()` + `text-transform:uppercase`: `NativeTransactionsView.tsx:197,230` (+css 61), `NativeCategoryDetailView.tsx:206` (+css 88,222), `NativeSubscriptionsView.tsx:109` (+css 38). Sentence case.

**P1-2. Заменить PosterButton в Management на NativeButton.** `MgmtHubView`, `SettingsView`, `TemplateMount`, `AccessView`. Перекрасить бейдж OWNER (нейтральный capsule), убрать coral trash-иконки в Template (нейтральная/red-tinted).

**P1-3. Единая шкала радиусов/отступов/типографики.** Внедрить токены §3.2–3.5, заменить хардкоды (сегмент 9/7px, карточки 14/20px, fonts 24/10px, инсеты 20px). Удалить `--lg-*` из tokens.css.

**P1-4. Дисциплина акцентов.** Pill-CTA «Провести» (Plan/Subs) синие → accent-tinted (§3.6). Свести палитру иконок меню к согласованному набору.

**P1-5. Единая навигация.** Все pushed-экраны через один `NativeNavBar`; «итоговые суммы» (Подписки «0 ₽/мес», и т.п.) — в первую inset-карточку, не голым bold.

**P1-6. Убрать лишние плашки Plan.** Снести «Σ план/Доход» отдельный `InsetGroup` (`NativePlanView.tsx:450-466`) — слить в сводку сверху. Surplus-статус: оставить одно кодирование (цвет числа + подпись), убрать дублирующий бейдж ИЛИ border-left.

### P2 — Polish

**P2-1. Бар-чарт Аналитики** (§S7): baseline, аккуратные подписи, highlight текущего, KPI на типо-шкалу, нейтрализовать «−100%» на пустых данных.
**P2-2. Прогресс-бар лимита** в CategoryDetail — заполнение цветом по доле факта, толще, читаемо.
**P2-3. Спейсинг шапок** Transactions/Home — убрать двойной «воздух» заголовок+pill; выровнять заголовки секций по карточкам (S8).
**P2-4. Specular/sheen калибровка** на нейтральном фоне (`--lgn-edge-top` .8, `--lgn-sheen` мягче) — чтобы не «пластик».
**P2-5. Keypad/онбординг/чипы** — радиусы и размеры на шкалу.

---

## 5. Быстрые победы (по прямым жалобам владельца)

1. **Нейтральный фон (жалоба №2)** — P0-1: один блок CSS в `NativeShell.module.css`, мгновенно снимает «нефтяную» подложку на всех экранах (особенно AI/Подписки/Аналитика).
2. **Таб-бар/переходы (жалоба №1)** — P0-6: `overflow:hidden`→`clip` + парная анимация + слой таб-бара. Убирает «обрезающиеся прямоугольники» и банддинг.
3. **Кастомный календарь (жалоба №3)** — P0-4: вынести готовый ActionSheet-date из AddSheet, заменить 2 места `<input type="date">`. Паттерн уже написан — это перенос, не разработка с нуля.
4. **Модалка подписки (жалоба №4)** — P0-3: переписать `SubscriptionMenuSheet` на light NativeSheet с телом. Снимает «кремовый артефакт» и пустоту.
5. **«+» для плана (жалоба №5)** — P0-5: переиспользовать AddSheet-паттерн вместо inline-дроп-дауна.
6. **«Несвёрстанность» (жалоба №6)** — P0-2 + P1-1 + P1-3: NativeToast + снять капс + единые радиусы/отступы. Это 80% ощущения «на коленке».

---

## 6. Карта файлов (быстрая ссылка)

| Область                                      | Файлы                                                                                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Токены/тема                                  | `stylesV10/native.css`, `stylesV10/tokens.css` (удалить `--lg-*`)                                                               |
| Шелл/фон/переходы/таб-бар                    | `screensV10/native/NativeShell.{tsx,module.css}`, `NativePrimitives.{tsx,module.css}`                                           |
| Эталон ввода (переиспользовать)              | `screensV10/AddSheet/NativeAddSheet.{tsx,module.css}`                                                                           |
| Poster-протечки                              | `componentsV10/Toast.*`, `Subscriptions/SubscriptionMenuSheet.*`, Management-вьюхи (PosterButton)                               |
| План/Шаблон (inline-формы, date, плашки)     | `Plan/NativePlanView.*`, `Plan/PlanMount.tsx`, `Management/Template*`                                                           |
| UPPERCASE-списки                             | `Transactions/NativeTransactionsView.*`, `CategoryDetail/NativeCategoryDetailView.*`, `Subscriptions/NativeSubscriptionsView.*` |
| Настройки (обрезка/степперы/poster-значения) | `Management/SettingsView.*`                                                                                                     |
| Аналитика (чарт)                             | `Analytics/NativeAnalyticsView.*`                                                                                               |
| Период-свитчер                               | `screensV10/native/NativePeriodSwitcher.*`                                                                                      |

---

## 7. Что НЕ трогать

- Maximal Poster (`maximal_poster`) — у него пиксельные e2e-эталоны; все изменения только под `liquid_glass`/native-компоненты.
- Бизнес-логику (`useAddSheetController`, `computePlan*`, Mount-handlers) — ревью чисто презентационный.
- `admin_audit_log`/RLS/бэкенд — вне скоупа.
