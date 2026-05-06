# Phase 2: UI Spec

**Status:** Draft (auto mode, derived from sketch winners)
**Source sketches:** `006-onboarding` (winner B), `005-plan-and-categories` (winner B grouped+inline pattern)
**Design tokens:** `.planning/sketches/themes/default.css` (banking-premium dark)

---

## Scope

Phase 2 frontend = 3 экрана + общий root:

1. **OnboardingScreen** — single-page scrollable с 4 секциями (sketch 006-B).
2. **CategoriesScreen** — list + edit/archive (паттерн sketch 005-B упрощённый).
3. **SettingsScreen** — единственное поле `cycle_start_day` (stepper 1..28).

App.tsx — корень с `useState`-routing: `'onboarding' | 'home' | 'categories' | 'settings'`. После завершения onboarding пользователь попадает в `'home'` (плейсхолдер «Дашборд будет в Phase 5»). Из home — навигация в categories/settings через простую панель.

---

## Design Tokens (carried from default.css)

Импортируем `default.css` как глобальный стиль (`frontend/src/styles/tokens.css`), используем CSS-переменные:

| Token | Use |
|-------|-----|
| `--color-bg` (#0e1116) | App background |
| `--color-surface` (#1c2230) | Card/section background |
| `--color-text` / `--color-text-muted` / `--color-text-dim` | Text hierarchy |
| `--color-primary` (#4ea4ff) | Primary actions, active steps |
| `--color-success` (#2ecc71) | Done state (✓ checkmark on completed onboarding section) |
| `--color-danger` (#ff5d5d) | Error state |
| `--radius-md` (14px) | Cards, inputs |
| `--main-button-height` (54px) | Telegram MainButton fallback в браузере |
| `--tg-viewport` (375px) | Max-width контента |

Темизация: применяем default-set из CSS. `tg.themeParams` (если доступны) — игнорируем в Phase 2 (always dark). В Phase 5 можно добавить `[data-theme=light]` override.

---

## Screen 1: OnboardingScreen

### Layout (sketch 006-B winner)

```
┌────────────────────────────────────────┐
│  [Status bar]                          │
│  [Title: «Добро пожаловать»]           │
├────────────────────────────────────────┤
│   💸  Несколько шагов                  │
│       Заполните по порядку             │
├────────────────────────────────────────┤
│  ┌──────────────────────────────────┐  │
│  │ ① Подключите бота                │  │
│  │   [Открыть бот]  /  ✓ Привязано  │  │
│  └──────────────────────────────────┘  │
│  ┌──────────────────────────────────┐  │
│  │ ② Стартовый баланс               │  │
│  │   [        12 450 ₽         ]    │  │
│  │   Будет начальной точкой текущего│  │
│  │   периода.                       │  │
│  └──────────────────────────────────┘  │
│  ┌──────────────────────────────────┐  │
│  │ ③ День начала периода            │  │
│  │   [ −  ]  5  [ + ]               │  │
│  │   Например, 5 = с 5 фев по 4 мар │  │
│  └──────────────────────────────────┘  │
│  ┌──────────────────────────────────┐  │
│  │ ④ Стартовые категории            │  │
│  │   ☐ Засеять 14 категорий         │  │
│  │   (Можно настроить позже)        │  │
│  └──────────────────────────────────┘  │
│                                        │
│        [MainButton: Готово]            │
└────────────────────────────────────────┘
```

### Sections

**Section 1 — Bot bind:**
- States:
  - `chat_id_known === false`: numbered circle `①` (primary blue), title «Подключите бота», single button «Открыть @<bot> в Telegram». Click → `tg.openTelegramLink(\`https://t.me/${BOT_USERNAME}?start=onboard\`)` — открывает бота в Telegram.
  - `chat_id_known === true`: numbered circle `✓` (success green), title «Бот подключён», подзаголовок «@<bot> · готов отправлять уведомления», compact display.
- Polling: после клика «Открыть бота» — пока пользователь возвращается обратно в Mini App, повторяем `GET /me` каждые 2 сек до `chat_id_known=true` (макс 30 сек, потом отображаем «Не получилось — попробуйте ещё раз»). Альтернатива: пользователь сам тянет вниз для refresh — упрощённо для Phase 2 используем polling.
- Источник истины: `GET /me` → `{ chat_id_known: true | false }`.

**Section 2 — Стартовый баланс:**
- `<input type="text" inputmode="decimal">` принимает рубли с десятичной запятой (12 450,50 или 12450.50).
- На blur: парсится в копейки (`Math.round(parseFloat(s.replace(/\s/g, '').replace(',', '.')) * 100)`).
- Валидация: число (любое — отрицательные допустимы как debt). Empty → секция считается «не заполнена».
- Display подсказка: «Будет начальной точкой для текущего периода».

**Section 3 — Cycle start day:**
- Stepper компонент (sketch 006-B стиль): `[ − ]  N  [ + ]`, `N ∈ [1, 28]`, default `5`.
- Wrap: `+` на 28 → 1; `−` на 1 → 28.
- Подсказка: «Например, 5 = период с 5 фев по 4 мар. Можно поменять в Settings».

**Section 4 — Seed-категории:**
- Простой checkbox: `☐ Засеять 14 стартовых категорий (Продукты, Дом, …)`. Default `true`.
- Подсказка: «Можно отредактировать или добавить свои в разделе «Категории»».
- В Phase 2 НЕ рисуем тайлы с галочками per-категория (как в sketch 006-B mock) — упрощаем до single-bool. Если в будущем фидбэк потребует — добавим.

### MainButton

- Telegram MainButton (`@telegram-apps/sdk-react`'s `mainButton`):
  - `text="Готово"`, `isVisible=true`, `isEnabled=isValid`.
  - `isValid = chat_id_known && balance !== '' && cycleDay >= 1 && cycleDay <= 28`.
  - onClick → POST `/api/v1/onboarding/complete`. Success → set `currentScreen='home'`. Error 409 (already onboarded) → ignore + переходим в home (сервер источник истины). Error 4xx/5xx → toast «Не удалось — попробуйте ещё раз».
- Fallback в браузере: рендерим `<button class="main-button-fallback">Готово</button>` внизу экрана с теми же handlers.

### Files

- `frontend/src/screens/OnboardingScreen.tsx`
- `frontend/src/screens/OnboardingScreen.module.css`
- `frontend/src/components/Stepper.tsx`
- `frontend/src/components/Stepper.module.css`
- `frontend/src/components/SectionCard.tsx` (numbered + done-state visual)
- `frontend/src/components/SectionCard.module.css`

---

## Screen 2: CategoriesScreen

### Layout (упрощённый sketch 005-B паттерн — без bottom-sheet, всё inline)

```
┌────────────────────────────────────────┐
│  [← Назад]  Категории  [+ Новая]       │
├────────────────────────────────────────┤
│  Расходы                               │
│  ┌──────────────────────────────────┐  │
│  │ Продукты              [✎] [⊟]    │  │
│  │ Дом                   [✎] [⊟]    │  │
│  │ Машина                [✎] [⊟]    │  │
│  │ ...                              │  │
│  └──────────────────────────────────┘  │
│  Доходы                                │
│  ┌──────────────────────────────────┐  │
│  │ Зарплата              [✎] [⊟]    │  │
│  │ Прочие доходы         [✎] [⊟]    │  │
│  └──────────────────────────────────┘  │
│  ☐ Показать архивные                   │
└────────────────────────────────────────┘
```

### Behaviour

- `GET /api/v1/categories?include_archived=<state>` на mount + после mutation.
- Сортировка: by `kind` (expense first, потом income), внутри — by `sort_order ASC, name ASC`.
- Группировка: визуально заголовки «Расходы» / «Доходы».
- Edit `[✎]`: inline-режим — `<input>` заменяет имя, кнопка сохранения справа. Pressing Enter or blur → PATCH.
- Archive `[⊟]`: confirm («Архивировать категорию N?») → DELETE → re-fetch.
- «Показать архивные»: toggle, перезапрос с `include_archived=true`. Архивные показываются с opacity 0.5 + кнопка «Восстановить» (PATCH `is_archived=false`).
- «+ Новая»: открывает inline-форму в начале списка: `<input>` имя + radio-группа kind (expense/income) + кнопка «Создать» / «×». На submit → POST → re-fetch.

### Files

- `frontend/src/screens/CategoriesScreen.tsx`
- `frontend/src/screens/CategoriesScreen.module.css`
- `frontend/src/components/CategoryRow.tsx` (with edit/archive controls)
- `frontend/src/components/CategoryRow.module.css`
- `frontend/src/components/NewCategoryForm.tsx` (inline)

---

## Screen 3: SettingsScreen

### Layout

```
┌────────────────────────────────────────┐
│  [← Назад]  Настройки                  │
├────────────────────────────────────────┤
│  ┌──────────────────────────────────┐  │
│  │ День начала периода              │  │
│  │   [ − ]  5  [ + ]                │  │
│  │   ⓘ Изменение применится со      │  │
│  │     следующего периода. Текущий  │  │
│  │     период продолжается с тем же │  │
│  │     днём начала.                 │  │
│  └──────────────────────────────────┘  │
│         [MainButton: Сохранить]        │
└────────────────────────────────────────┘
```

### Behaviour

- `GET /settings` on mount → отображает текущий `cycle_start_day`.
- Stepper изменения отслеживаются в state.
- MainButton «Сохранить»: enabled только если изменилось значение. onClick → PATCH `/settings { cycle_start_day }`. Success → toast «Сохранено» + back to home (или оставаться, минор UX-decision).

### Files

- `frontend/src/screens/SettingsScreen.tsx`
- `frontend/src/screens/SettingsScreen.module.css`
- (переиспользует `Stepper.tsx`)

---

## Root: App.tsx (Home placeholder)

```
┌────────────────────────────────────────┐
│  TG Budget                             │
├────────────────────────────────────────┤
│  Дашборд будет в Phase 5.              │
│                                        │
│  [Категории]   [Настройки]             │
└────────────────────────────────────────┘
```

- App.tsx читает `GET /me` на mount.
- Если `onboarded_at === null` → render `OnboardingScreen`.
- Иначе → render Home placeholder с кнопками навигации.
- Простой `useState<'onboarding' | 'home' | 'categories' | 'settings'>('onboarding')`.

### Files

- `frontend/src/App.tsx` (replaces existing placeholder)
- `frontend/src/App.module.css`

---

## API Contract Used

(All calls go through `frontend/src/api/client.ts` — adds `X-Telegram-Init-Data` header.)

| Endpoint | Used by |
|----------|---------|
| `GET /api/v1/me` | App.tsx (initial), OnboardingScreen (chat_id polling) |
| `GET /api/v1/categories?include_archived=<bool>` | CategoriesScreen |
| `POST /api/v1/categories` | CategoriesScreen (create) |
| `PATCH /api/v1/categories/{id}` | CategoriesScreen (rename, restore) |
| `DELETE /api/v1/categories/{id}` | CategoriesScreen (archive) |
| `POST /api/v1/onboarding/complete` | OnboardingScreen (MainButton click) |
| `GET /api/v1/settings` | SettingsScreen (initial) |
| `PATCH /api/v1/settings` | SettingsScreen (save) |

---

## Telegram SDK Integration

- `frontend/src/main.tsx` импортирует и инициализирует `@telegram-apps/sdk-react` (`init()` + `mountBackButton()` + `mountMainButton()` если эти hooks/функции существуют в 3.3.9; иначе используем сигнал-API).
- Передаёт launch params через `<SDKProvider>` или просто хранит в context (если применимо).
- `BackButton`: на CategoriesScreen и SettingsScreen — показываем нативный BackButton, click → `setCurrentScreen('home')`.
- `MainButton`: на OnboardingScreen и SettingsScreen — показываем (см. выше).
- На home — оба скрыты.

**Точное API проверяется в Plan 02-06** (один из первых импортов вынесен в проверку — если API отличается, корректируем).

---

## Acceptance (manual, via checkpoint:human-verify)

После Plan 02-07 (frontend complete):

1. **Onboarding flow:**
   - [ ] Открываем Mini App из бота → видим OnboardingScreen.
   - [ ] Section 1 показывает «Подключите бота» с кнопкой.
   - [ ] Кликаем кнопку → открывается Telegram → `/start onboard` → бот отвечает + Mini App кнопка.
   - [ ] Возвращаемся в Mini App → Section 1 переключается в «✓ Привязано» (через polling).
   - [ ] Заполняем balance, выбираем cycle_start_day, оставляем seed checkbox checked.
   - [ ] MainButton активна.
   - [ ] Click MainButton → переход в home placeholder.
   - [ ] Перезагружаем Mini App → сразу попадаем в home (onboarding не показывается повторно).

2. **Categories:**
   - [ ] В home → click «Категории» → CategoriesScreen со списком 14 seed-категорий, сгруппированных по kind.
   - [ ] Click «+ Новая» → inline form → создаём «Спорт» / expense → появляется в списке.
   - [ ] Click [✎] на «Спорт» → переименовываем в «Фитнес» → сохраняется.
   - [ ] Click [⊟] на «Фитнес» → confirm → исчезает из списка.
   - [ ] Toggle «Показать архивные» → «Фитнес» появляется (opacity 0.5) с кнопкой «Восстановить».
   - [ ] Click «Восстановить» → возвращается в активные.

3. **Settings:**
   - [ ] В home → click «Настройки» → SettingsScreen с текущим `cycle_start_day=5`.
   - [ ] Изменяем на 10 → MainButton активна.
   - [ ] Click MainButton → toast «Сохранено».
   - [ ] Back → home → Settings снова → отображает 10.

4. **Edge:**
   - [ ] OnboardingScreen без `chat_id_known` (бот ещё не открыт): MainButton disabled.
   - [ ] OnboardingScreen с пустым balance: MainButton disabled.
   - [ ] CategoriesScreen с пустым списком (теоретически — если пропустить seed): показывает empty-state «Создайте первую категорию».

---

*UI spec: 2026-05-02 (auto mode)*
