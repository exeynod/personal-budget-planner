# User Stories — TG Budget Planner (snapshot 2026-05-08)

> Описание текущего функционала всех экранов TMA на дату snapshot.
> Используется как handoff для перерисовки UI в Anthropic Claude Design.
> Source of truth — код `frontend/src/screens/` на 2026-05-08.

## Навигация

5-табовый BottomNav: **Главная** / **Транзакции** / **Аналитика** / **AI** / **Управление**.

«Управление» — хаб-экран, ведущий на 5 sub-screen'ов (Подписки / Шаблон / Категории / Настройки / Доступ). Пункт «Доступ» виден только для роли `owner` (см. `useUser().role`).

Особые состояния (вне табов):
- **OnboardingScreen** — рендерится когда `user.onboarded_at === null` (первый запуск).
- **HistoryView** — это `TransactionsScreen` с активным фильтром по категории; включается через клик по строке категории на Home.
- **PlannedView** — sub-tab внутри `TransactionsScreen` (переключатель «История» / «План»).

Скриншоты — в директории [`screenshots/`](./screenshots/).

---

## 1. HomeScreen — Дашборд план/факт

**User story:** Как владелец бюджета, я хочу одним взглядом видеть актуальную дельту план/факт по категориям за текущий период, чтобы понимать, сколько ещё могу потратить и где уже превысил план.

**UI элементы:**
- Hero-карточка наверху: текущий `balance_now_cents` + общая дельта (для расходов: «План − Факт»; для доходов: «Факт − План»).
- Tabs «Расходы» / «Доходы» — переключают `kind` отображаемого списка категорий.
- Список категорий: имя + горизонтальный прогресс-бар (planned vs actual) + цифры в рублях.
- Клик по строке категории → переход в `TransactionsScreen` с фильтром по этой категории.
- `PeriodSwitcher` (если периодов несколько) — переключение между текущим/прошлыми периодами.
- Empty state — когда нет категорий с `planned_cents > 0` и нет транзакций.

**Скриншоты:**
- `screenshots/01-home-expenses.png` — расходы (типичное состояние)
- `screenshots/02-home-income.png` — доходы (одна строка «Зарплата»)
- `screenshots/03-home-empty.png` — нулевой баланс, пустой список

---

## 2. TransactionsScreen — Транзакции

**User story:** Как владелец бюджета, я хочу быстро записать факт-трату и просмотреть последние транзакции, чтобы вести учёт без переключения на Google-таблицу.

**UI элементы:**
- Двухуровневая навигация: sub-tab «История» / «План» (`SubTabBar`) + sub-tab «Расходы» / «Доходы» (`SubTabBar`).
- Полоска chip'ов категорий — фильтр по конкретной категории (toggle-выбор).
- Список транзакций (или элементов плана, если активен sub-tab «План») с датой, описанием, суммой.
- FAB (плавающая круглая кнопка снизу) — открывает bottom-sheet «Добавить транзакцию» (или «Добавить строку плана» в зависимости от sub-tab'а).
- При активном `categoryFilter` (передан с Home) — отдельная плашка «Только: <имя>» с кнопкой сброса.

**Скриншоты:**
- `screenshots/04-transactions-history.png` — список транзакций, sub-tab «История»
- `screenshots/05-transactions-plan.png` — sub-tab «План», список плановых строк
- `screenshots/06-transactions-history-filtered.png` — отфильтровано по категории (после клика на Home)

---

## 3. PlannedView (sub-tab «План» внутри Transactions)

**User story:** Как владелец бюджета, я хочу видеть и редактировать запланированные строки текущего периода, чтобы корректировать план в течение месяца.

**UI элементы:**
- Список плановых записей (`planned_transaction`): категория, сумма, описание, источник (`manual` / `template`).
- Filter chips по категориям (как в HistoryView).
- Клик по строке → bottom-sheet редактирования.
- FAB снизу с label «Добавить строку плана».

**Скриншоты:**
- `screenshots/05-transactions-plan.png`
- `screenshots/18-plan-create-sheet.png` — sheet создания (best-effort)

---

## 4. HistoryView (фильтрованные транзакции)

**User story:** Как владелец бюджета, я хочу провалиться в детали одной категории, чтобы увидеть все траты на «Кафе» за период.

**UI элементы:**
- Те же chip'ы фильтра + список, что и в обычной TransactionsScreen.
- Заголовок-индикатор активного фильтра (категория + кнопка «Сбросить»).
- Empty state, если в выбранной категории нет транзакций.

**Скриншоты:**
- `screenshots/06-transactions-history-filtered.png`

---

## 5. AnalyticsScreen — Аналитика

**User story:** Как владелец бюджета, я хочу видеть тренды и прогноз баланса на конец периода, чтобы понимать долгосрочную траекторию.

**UI элементы:**
- Range chips: `1M` / `3M` / `6M` / `12M` (`AnalyticsRange`).
- Секция «Прогноз / Cashflow» (зависит от range): `1M` показывает forecast, `3M+` — суммарный cashflow.
- Секция «Top overspend» — категории с превышением плана (overspend_pct).
- Секция «Top categories» — категории с наибольшими actual_cents.
- График тренда (timeline по периодам с expense/income).
- Skeleton-state на загрузке + error-state на ошибке.

**Скриншоты:**
- `screenshots/07-analytics.png`

---

## 6. AiScreen — AI-помощник

**User story:** Как владелец бюджета, я хочу спросить у AI «сколько я потратил на еду в апреле» и быстро получить ответ или предложение записать новую трату, чтобы не открывать UI вручную.

**UI элементы:**
- Скроллируемый список сообщений (user / assistant / tool).
- Empty state с подсказкой формулировки запроса.
- Поле ввода внизу с placeholder «Спроси о бюджете…».
- Кнопка «Отправить» (`aria-label="Отправить"`).
- Кнопка «Очистить историю» (`aria-label="Очистить историю"`).
- Propose-sheet — когда AI предложил записать транзакцию, sheet с подтверждением и редактированием полей перед сохранением.
- Tool-error inline-уведомление (Phase 16-04 AI-02) — при невалидном tool_call показывается, но стрим не прерывается.

**Скриншоты:**
- `screenshots/08-ai-empty.png`

---

## 7. ManagementScreen (хаб)

**User story:** Как владелец бюджета, я хочу из одного места перейти в редактирование подписок, шаблона, категорий, настроек и admin-секции, чтобы не искать пункты в меню.

**UI элементы:**
- 5 row-кнопок (порядок): Подписки, Шаблон, Категории, Настройки, Доступ.
- Каждая row: иконка/маркер + label + краткое описание.
- Пункт «Доступ» **скрыт** для не-owner (`useUser().role !== 'owner'`).

**Скриншоты:**
- `screenshots/09-management-hub.png`

---

## 8. SubscriptionsScreen — Подписки

**User story:** Как владелец бюджета, я хочу управлять списком повторяющихся платежей (Netflix, Spotify, iCloud) с напоминаниями за N дней и автосписанием в категорию, чтобы не забывать про ежемесячные расходы.

**UI элементы:**
- Список подписок: имя, сумма, дата следующего списания, категория.
- Кнопка/FAB добавления.
- Клик по строке → bottom-sheet редактирования (имя, сумма, cycle, next_charge_date, notify_days_before, is_active).
- Header с «← Назад».

**Скриншоты:**
- `screenshots/11-management-subscriptions.png`
- `screenshots/17-subscription-edit.png` — edit-sheet (best-effort)

---

## 9. TemplateScreen — Шаблон плана

**User story:** Как владелец бюджета, я хочу один раз задать шаблон плана на месяц (категория × сумма × kind), чтобы при открытии нового периода система автоматически создавала плановые строки.

**UI элементы:**
- Список template-строк (`plan_template_item`): категория, kind, amount, описание.
- Кнопка/FAB добавления строки.
- Inline-редактирование или bottom-sheet (зависит от элемента).
- Header с «← Назад».

**Скриншоты:**
- `screenshots/12-management-template.png`

---

## 10. CategoriesScreen — Категории

**User story:** Как владелец бюджета, я хочу создавать/переименовывать/архивировать категории, чтобы подстроить структуру под свой бюджет; soft-delete (через `is_archived`) сохраняет историю транзакций по архивной категории.

**UI элементы:**
- Список категорий (split: Расходы / Доходы или единый список с маркером kind).
- Каждая row: имя, статус архивации, кнопка edit/archive.
- FAB / button «Добавить категорию» → sheet с полями (name, kind).
- Edit-sheet: переименование, kind (?), архивация.
- Header с «← Назад».

**Скриншоты:**
- `screenshots/13-management-categories.png`

---

## 11. SettingsScreen — Настройки

**User story:** Как владелец бюджета, я хочу настроить день начала бюджетного цикла и за сколько дней получать напоминания о подписках, чтобы синхронизировать систему со своими реальными датами зарплаты.

**UI элементы:**
- Поле `cycle_start_day` (1..28) — день старта периода.
- Поле `notify_days_before` (0..7) — за сколько дней до списания подписки слать напоминание.
- Индикатор `is_bot_bound` — связан ли webapp с ботом (нужен ли deep-link вход через бота).
- Кнопка «Сохранить» (валидация на сервере).
- Header с «← Назад».

**Скриншоты:**
- `screenshots/14-management-settings.png`

---

## 12. AccessScreen — Доступ (admin / owner-only)

**User story:** Как владелец-админ (`role: owner`), я хочу управлять whitelist'ом пользователей бот-приложения и видеть AI-расходы каждого, чтобы контролировать, кто пользуется приложением и сколько каждый тратит на AI.

**UI элементы:**
- Sub-tab bar: «Пользователи» / «AI Usage».
- Tab «Пользователи»:
  - Список (`UsersList`) пользователей: tg_user_id, role (owner/member/revoked), last_seen, spending_cap.
  - FAB или кнопка «Пригласить» → `InviteSheet` (ввод tg_user_id).
  - Action в строке: «Отозвать» → `RevokeConfirmDialog`.
  - Action: «Изменить cap» → `CapEditSheet` (PATCH `/admin/users/{id}/cap`).
- Tab «AI Usage»:
  - Список (`AiUsageList`) per-user: requests, total_tokens, est_cost_usd, pct_of_cap.
  - Линейный progress-bar pct_of_cap (warn ≥0.80 / danger ≥1.0) — паттерн dashboard category row.
- Toast (`role="status"`) для уведомлений после invite/revoke.
- Header с «← Назад».

**Скриншоты:**
- `screenshots/15-management-access.png`

---

## 13. OnboardingScreen — Первый запуск

**User story:** Как новый пользователь, я хочу за 30 секунд указать день начала бюджетного цикла и попасть в основное приложение, чтобы начать вести учёт.

**UI элементы:**
- Welcome-блок с описанием приложения.
- Поле выбора `cycle_start_day` (1..28) с дефолтом.
- Кнопка «Начать» → POST `/api/v1/onboarding` (atomic claim, см. Plan 16-06 CON-01).
- Loading state на сабмите.
- Error inline (если бэк отдал 409 already-onboarded — refetch /me и в основной UI).

**Скриншоты:**
- `screenshots/10-onboarding.png`

---

## Bonus: Modal/Sheet states

- **Add transaction sheet** (`screenshots/16-add-transaction-sheet.png`) — bottom-sheet, открываемый FAB на TransactionsScreen («История»). Поля: категория (chips), сумма, описание, дата.
- **Plan create sheet** (`screenshots/18-plan-create-sheet.png`) — best-effort снимок; FAB на «План» открывает sheet добавления плановой строки.
- **Subscription edit sheet** (`screenshots/17-subscription-edit.png`) — best-effort снимок; клик по подписке открывает edit-sheet.

---

## Что НЕ покрыто snapshot'ом

- Real-time AI streaming (SSE) — токены и tool_call события моки трудно симулировать без реального backend; для redesign'а достаточно empty-state.
- Telegram-specific UI (`BackButton`, `MainButton` от `@telegram-apps/sdk-react`) — рендерятся самим Telegram chrome'ом, а не webapp'ом.
- Dark theme — этот snapshot только light theme; в production webapp подхватывает `colorScheme` из Telegram, но в Playwright без TG-окружения остаётся дефолтная тема.
- Loading skeletons и error states — захвачены частично (только если успели отрендериться до screenshot timing).
