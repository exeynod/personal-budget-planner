# Sketch Style Guide

> **Источник истины:** `frontend/src/styles/tokens.css` и компоненты в `frontend/src/components/`.
> Этот документ фиксирует фактический реализованный дизайн. Все новые скетчи
> должны использовать паттерны отсюда, а не изобретать свои.

## Базовые правила

1. **На топ-скринах нет «‹ Назад»-шапки.** Топ-скрин начинается с `PageTitle`
   (`<h1>` левый + опц. `.sub`) или edge-to-edge HeroCard. Только саб-скрины
   (`SettingsScreen`, форма редактирования подписки и т.п.) имеют `ScreenHeader`:
   `[‹ back][title центр][пусто]`.
2. **Bottom nav v0.3 — функциональная, 5 табов:**
   `Главная / Транзакции / Аналитика / AI / Управление`.
   - **Главная** — hero + tabs Расходы/Доходы + список категорий
   - **Транзакции** — под-табы История / План
   - **Аналитика** — тренд / топ перерасходов / топ категорий / прогноз
   - **AI** — conversational chat с tool-use (фиолетовый акцент `#a78bfa` когда активен)
   - **Управление** — меню-список: Подписки / Шаблон / Категории / Настройки
3. **Тёмная тема — primary.** Светлая — opt-in только. Не использовать в скетчах.
4. **Иконки** — Phosphor (`@phosphor-icons/react`) с двумя весами: `thin`
   (неактивно), `fill` (активно). В скетчах допустимо имитировать символами/SVG, но
   стиль должен быть line-icons, не emoji-смайлы. ❌ `🏠 ➕ 📊 ✨` → ✅ House / Plus /
   ChartBar / Sparkle (тонкие линии).
5. **Деньги** — `font-family: var(--font-mono)` (он же Inter), `font-variant-numeric: tabular-nums`,
   формат `325 ₽` без копеек на UI. Положительная дельта — зелёный, отрицательная —
   красный, нулевая — muted.
6. **Никаких локальных переопределений токенов.** Цвета, радиусы, шрифты — только
   через `var(--token)` из `themes/default.css`.

## Обязательные блоки на топ-скринах

```
┌────────────────────────────────────────┐
│  [HERO CARD edge-to-edge]              │  ← без отступов слева/справа в .root
│  apr 5 – may 4 2026                   │     period range (rgba(255,255,255,0.5))
│  БАЛАНС                               │     uppercase tiny label
│  325 ₽                                │     mono, 40px, weight 700
│  [+128 ₽] экономия                    │     deltaChip + deltaLabel
└────────────────────────────────────────┘
            ‹ Апрель 2026 г. ›             ← PeriodSwitcher: centered, primary chevrons
─────────────────────────────────────────
│ Расходы              │   Доходы        │ ← TabBar: sticky underline, primary 2px
─────────────────────────────────────────
│ ПЛАН   ФАКТ   ОСТАТОК                  │ ← AggrStrip: 3 cols, uppercase muted labels,
│ 850 ₽  425 ₽  +425 ₽                   │   mono semibold, surface bg + border-bottom
─────────────────────────────────────────
│ ┌────────────────────────────────────┐ │
│ │ Продукты ›          185 / 200 ₽    │ │ ← DashboardCategoryRow: surface bg, transparent
│ │ ▰▰▰▰▰▰▰▱▱▱                          │ │   border, slim 4px progress, warn/overspend = colored border
│ └────────────────────────────────────┘ │
│  ⋯                                     │
│                                  [+]  │ ← FAB: bottom-right, primary blue circle
─────────────────────────────────────────
│  ⌂      ▤      ▦      ◉      ⋮         │ ← BottomNav: 5 фиксированных табов
│  Главная  История  План  Подписки  Ещё │
└────────────────────────────────────────┘
```

## Точные параметры компонентов

### HeroCard
- `background: var(--gradient-hero)` + `::before` с `var(--gradient-hero-glow)`
- `padding: var(--space-5) var(--space-5) var(--space-6)` (20/20/24)
- В `.root` обёрнут в `.heroWrap` с `margin: -16px -16px 16px` — **edge-to-edge**
- Структура содержимого:
  1. `.periodRange` — `text-sm`, `rgba(255,255,255,0.5)`, weight 500
  2. `.amountWrap`:
     - `.amountLabel` — `text-xs`, **uppercase**, `letter-spacing: 0.08em`, `rgba(255,255,255,0.5)`
     - `.amount` — **font-mono**, `text-3xl` (40px), weight 700, `#fff`
  3. `.deltaWrap`:
     - `.deltaChip` — `padding: 3px 10px`, `radius-full`, **mono**, `text-sm`, weight 600
       - positive: `bg rgba(46,204,113,0.2)` + `border 1px rgba(46,204,113,0.3)` + `color success`
       - negative: `bg rgba(255,93,93,0.2)` + `border 1px rgba(255,93,93,0.3)` + `color danger`
       - zero: `bg rgba(255,255,255,0.1)` + muted text
     - `.deltaLabel` — `text-xs`, `rgba(255,255,255,0.45)`. Текст:
       - delta > 0 → «экономия»
       - delta < 0 → «перерасход»
       - delta = 0 → «по плану»

### PeriodSwitcher
- `display: flex; align-items: center; justify-content: center; gap: 12px`
- `height: 36px`, `padding: 0 16px`, `margin-bottom: 12px`
- Стрелки: `background: transparent`, `color: var(--color-primary)`, `text-md`, weight 600
- Disabled стрелки: `color: var(--color-text-dim)`
- Лейбл периода: `text-base`, weight 600, `color-text`
- Бейдж «Закрыт»: `padding: 2px 8px`, `radius-full`, `bg surface-2`, muted

### TabBar (Расходы / Доходы)
- `position: sticky; top: 0; z-index: 20`
- `height: 44px`, `bg var(--color-bg-elevated)` (растягивается edge-to-edge с margin-left компенсацией)
- `border-bottom: 1px solid var(--color-border-subtle)`
- Активный таб: `color text`, weight 600, `border-bottom: 2px solid var(--color-primary)`
- Неактивный: `color text-muted`, weight 400, без бордера
- **Без pill-фона**, **без счётчика-каунта** (в скетчах 001-B он был — в реале нет)

### AggrStrip
- `display: grid; grid-template-columns: 1fr 1fr 1fr`
- `padding: 12px 16px`, `bg var(--color-surface)`, `border-bottom: 1px solid var(--color-border-subtle)`
- Лейбл: `text-sm`, **uppercase**, `letter-spacing: 0.06em`, `color-text-dim`, weight 600
- Значение: **font-mono**, `text-base`, weight 600, `color-text`
- Лейблы: «ПЛАН», «ФАКТ», и третья колонка «ОСТАТОК» (для расходов) / «СВЕРХ» (для доходов)
- Цвет третьей колонки определяется знаком delta: `success / danger / muted`

### DashboardCategoryRow
- `bg surface`, `border 1px transparent`, `radius-md`, `padding: 12px 16px`, `min-height: 52px`
- Структура: `topRow` (name + amounts) → опционально `bar`
- Имя: `text-base`, weight regular. Если `onClick`, после имени добавляется `›` (color-text-dim, text-sm)
- Суммы: `font-mono`, `text-sm`. Формат: `<actual> / <planned> ₽`. Если нет плана — только actual.
  - `.actual` — color-text
  - `.slash` — color-text-dim
  - `.planned` — color-text-muted
  - `.currency` — color-text-muted, `margin-left: 2px`
- Бейдж перерасхода: `padding: 2px 8px`, `radius-full`, `bg danger-soft`, color danger, `text-sm`, weight 600 — формат `120%`
- Бар: `height: 4px`, `bg color-border`, `radius: 2px`, fill primary; `width = min(actual/planned, 100%)`
- Состояния:
  - `pct >= 0.8 && pct <= 1.0` → `border-color: var(--color-warn)` + `barFill warn`
  - `pct > 1.0` → `border-color: var(--color-danger)` + `barFill danger` (всегда 100% width)

### Иконки (важно!)
Phosphor-style line-icons. **Active state — НЕ через `fill: currentColor; stroke-width: 0`!**
Stroke-only иконки (ChartBar `M3 21h18M7 21V10...`, ArrowsLeftRight `M3 7h13...`) при таком подходе **исчезают** — у них нет fillable area, а stroke=0 убивает линии.

**Правильный паттерн для активного state:**
```css
.nav .tab .ic svg { stroke: currentColor; fill: none; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
.nav .tab.active .ic svg { stroke-width: 2; fill: currentColor; }
```
Для line-icons активный state = более толстый stroke. Для closed-path icons (House, Sparkle, SquaresFour) `fill: currentColor` дополнительно делает silhouette. Оба эффекта совместимы.

В реальной имплементации (`@phosphor-icons/react`) этой проблемы нет — там `weight="thin"` и `weight="fill"` это **разные SVG paths**, swap происходит на уровне React. В скетчах же мы используем единый path, поэтому нужен stroke-width fallback.

### BottomNav (v0.3 функциональная)
- `position: fixed; bottom: 0`, `height: 56px + safe-area`
- `bg var(--color-bg-elevated)`, `border-top: 1px solid var(--color-border)`, `box-shadow: 0 -2px 12px rgba(0,0,0,0.3)`
- 5 табов:
  - Главная — Phosphor `House`
  - Транзакции — Phosphor `ArrowsLeftRight` (двусторонние стрелки = факт+план)
  - Аналитика — Phosphor `ChartBar`
  - **AI** — Phosphor `Sparkle`
  - Управление — Phosphor `SquaresFour`
- Иконка: 26px, `weight="thin"` неактивно / `weight="fill"` активно
- Активный таб: `color: var(--color-primary)` (фон не меняется!)
- **Активный AI-таб:** `color: #a78bfa` (фиолетовый), чтобы AI визуально отделялся
- Неактивный: `color: var(--color-text-muted)`
- AI-таб неактивный: `stroke-width: 1.5` (чуть толще обычного thin), чтобы Sparkle не растворялся
- Лейбл: `font-size: 10px`, weight 500, под иконкой
- На десктопе (≥540px): nav центрируется в колонке `var(--col-width)` 420px
- **Нет точки/полоски-индикатора, нет pill-фона.** Активность = только цвет иконки и лейбла.

### FAB (Fab)
- `position: fixed`, `right: 24px`, `bottom: bottom-nav-height + safe-area + 16px`
- `width/height: 56px`, `radius: 50%`
- `bg var(--color-primary)`, `color #fff`, `box-shadow: 0 4px 20px rgba(78,164,255,0.4)`
- Иконка: Phosphor `Plus`, 28px, weight bold

### BottomSheet
- `bg var(--color-surface)`, `radius-lg radius-lg 0 0`, `max-height: 85vh`, `box-shadow-lg`
- `.handle` — 40×4, `bg color-border`, `radius-full`, `margin: 12px auto 0`
- `.head` — flex, `padding: 16px 20px 12px`, title `text-md` weight 600 + close `✕` (`color-text-muted`, 28px)
- `.body` — `padding: 0 20px 20px`

### ActualEditor (форма в bottom-sheet)
- `display: flex; flex-direction: column; gap: 16px`
- `.kindToggle` — два сегмента «Расход / Доход», активный `bg var(--color-accent)` (#ffd166 жёлтый), `color #fff`
- Поля: `bg surface-2`, `border 1px var(--color-border)`, `radius-md`, `padding: 10px 12px`
- Лейбл поля: `text-sm`, color-text-muted, над полем
- Кнопки: `.cancelBtn` (bg transparent + border) + `.saveBtn` (bg primary, color #fff)

### PageTitle (top-level header, заменяет «‹ Назад / title / ⚙»)
Для топ-уровневых табов (Аналитика, AI, Транзакции, Управление, и т.п.):
- `padding: var(--space-3) 0 var(--space-4)`
- `<h1>`: `font-size: var(--text-xl)` (24px), weight 700, color-text, margin 0
- `.sub` (опц.): `font-size: var(--text-xs)` (11px), color-text-muted, margin-top: 2px
- Может включать иконку слева (например, AI-аватар 36×36 фиолетовый круг для AI-таба)
- **Никаких back-кнопок.** Топ-уровневые табы не возвращаются куда-то — они в bottom nav

### MenuItem (для «Управление» и аналогов)
- `bg surface`, `border 1px var(--color-border)`, `radius-md`, `padding: 12px 16px`
- Иконка-контейнер 36×36 c `bg primary-soft`, line-icon Phosphor 20px внутри
- Title (`text-base`, weight 600, color-text) + опц. desc (`text-xs`, muted, ellipsis)
- `›` chevron справа (color-text-dim, 18px)
- Опц. badge-счётчик: mono, 11px, `bg bg-elevated`, muted

### SectionCard (для саб-экранов и onboarding)
- `bg surface`, `radius-md`, `padding: 16px 18px`, `margin-bottom: 16px`
- Заголовок: numbered circle (24×24, primary bg, white text) + title (`text-base`, weight 600)
- Состояния: `.locked` (opacity 0.4), `.done` (success-coloured circle + check)

### Section title (uppercase muted) — для блоков на саб-скринах
- `text-sm`, weight 600, `color-text-muted`, **uppercase**, `letter-spacing: 0.06em`

## Что **не** использовать в скетчах

- ❌ `🏠 ➕ 📊 ✨ ⋯` emoji-иконки. Использовать стилизованные SVG line-icons (Phosphor стиль).
- ❌ Pill-таббары для Расходы/Доходы. Только underline.
- ❌ Шапка «‹ Назад / Бюджет / ⚙» на топ-уровневых табах — нет такого паттерна.
- ❌ TG status bar «9:41 • 5G ▮» сверху — он не в скоупе скетча.
- ❌ Свои цвета вне токенов (`#1a1a2e`, `#4ea4ff` напрямую и т.п.). Только `var(--…)`.
   Исключение: фиолетовый `#a78bfa` для AI-таба пока не зафиксирован токеном.
- ❌ `font-family: 'SF Pro'` — реальный фронт использует Inter.
- ❌ Старые названия табов «История / План / Подписки / Ещё» — это до v0.3.
   В v0.3 они объединены в «Транзакции» (под-табы История/План) и «Управление» (Подписки + Шаблон + Категории + Настройки).
- ❌ «Скидывать редкое в Ещё». Bottom nav v0.3 — функциональные табы по частоте использования, не свалка.
- ❌ `.hero-sub` с двумя колонками «Прогноз / Старт». Реальный hero — только period range + amount + delta chip.

## Чек-лист перед merge скетча

- [ ] Использует `themes/default.css` без локальных color/radius переопределений
- [ ] Top-level скетч: нет TG header, нет «‹ Назад» сверху главного экрана
- [ ] Все суммы — `font-mono` + `tabular-nums`, формат `XXX ₽`
- [ ] Bottom nav (если есть) — 5 табов, line-icons, active = primary color без фона
- [ ] Hero (если есть) — порядок: periodRange → label → amount → deltaChip + deltaLabel
- [ ] Tabs (Расходы/Доходы) — underline, не pill
- [ ] AggrStrip — 3 колонки uppercase лейбл + mono значение
- [ ] Состояния категорий: норма / warn (≥80%) / overspend (>100% + бейдж)
