# Data Model

> Структуры, бизнес-правила, форматтеры. Источник правды для бэкенда и фронта.

---

## 1. Сущности

### 1.1 User

```ts
type User = {
  id: string;            // соответствует tg user_id
  income: number;        // месячный доход в копейках, после налогов
  primaryAccountId: string;
  createdAt: ISODate;
};
```

### 1.2 Account

```ts
type Account = {
  id: string;
  userId: string;
  bank: string;          // 'Т-БАНК' | 'СБЕР' | 'НАЛИЧНЫЕ' | свободный ввод
  mask?: string;         // '·· 4408' (только для card)
  kind: 'card' | 'cash' | 'savings';
  balance: number;       // в копейках
  primary: boolean;      // ровно один primary на пользователя
  createdAt: ISODate;
};
```

### 1.3 Category

```ts
type Category = {
  id: string;            // 'food', 'cafe', 'home', ...
  userId: string;
  name: string;          // UPPERCASE отображаемое
  ord: string;           // '01', '02', ... — порядковый
  plan: number;          // лимит на текущий месяц, в копейках
  rollover: 'misc' | 'savings';   // куда уходит остаток в конце месяца
  paused?: boolean;      // если true — не учитывается в расчётах
  parentId?: string;     // R3: подкатегории
};
```

**Дефолтные категории при онбординге:**

| ord | id      | name      | share от income |
|-----|---------|-----------|------------------|
| 01  | food    | ПРОДУКТЫ  | 0.20             |
| 02  | cafe    | КАФЕ      | 0.10             |
| 03  | home    | ДОМ       | 0.30             |
| 04  | transit | ТРАНСПОРТ | 0.06             |
| 05  | fun     | РАЗВЛЕЧ.  | 0.05             |
| 06  | gifts   | ПОДАРКИ   | 0.04             |
| 07  | health  | ЗДОРОВЬЕ  | 0.05             |
| 08  | subs    | ПОДПИСКИ  | 0.03             |

Сумма shares = 0.83. Остаток (0.17) предлагается уйти в копилку.

### 1.4 Transaction

```ts
type Transaction = {
  id: string;
  userId: string;
  accountId: string;
  categoryId: string;
  amount: number;        // в копейках; <0 — расход, >0 — доход
  name: string;          // 'Surf Coffee'
  occurredAt: ISODate;   // когда совершено (с точностью до минуты)
  createdAt: ISODate;
  kind: 'expense' | 'income' | 'roundup' | 'deposit';
  // 'roundup'  — округление трат → копилка
  // 'deposit'  — ручное пополнение копилки или перенос остатка
  parentTxnId?: string;  // для roundup — id операции, которая вызвала округление
};
```

### 1.5 Recurrent (регулярный платёж)

```ts
type Recurrent = {
  id: string;
  userId: string;
  name: string;          // 'Аренда', 'Spotify Family'
  categoryId: string;
  accountId: string;
  amount: number;        // отрицательное
  dayOfMonth: number;    // 1..28
  paused?: boolean;
  // в текущем месяце — статус
  postedTxnId?: string;  // если != null — регулярка проведена этим txn
};
```

### 1.6 Goal (цель копилки)

```ts
type Goal = {
  id: string;
  userId: string;
  name: string;
  target: number;        // в копейках
  current: number;       // в копейках
  due?: ISODate | null;
  createdAt: ISODate;
};
```

### 1.7 SavingsConfig

```ts
type SavingsConfig = {
  userId: string;
  roundupEnabled: boolean;
  roundupBase: 10 | 50 | 100;   // ₽
};
```

### 1.8 AI Conversation

```ts
type AiMessage = {
  id: string;
  userId: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: ISODate;
  refTxnId?: string;     // если AI создал/процитировал транзакцию
};
```

---

## 2. Производные значения

Считаются на бэке (или в кэше клиента), не хранятся.

### 2.1 По категории за месяц

```
fact     = Σ |txn.amount| where catId == c.id && month == current && txn.kind == 'expense'
left     = c.plan - fact
pct      = fact / c.plan * 100
isOver   = fact > c.plan
```

### 2.2 По месяцу

```
totalIncome   = Σ txn.amount where kind == 'income'
totalExpense  = Σ |txn.amount| where kind == 'expense'
totalSaved    = max(0, totalIncome - totalExpense)
planTotal     = Σ category.plan
surplus       = planTotal - totalExpense
daysLeft      = daysInMonth(today) - day(today) + 1
dailyPace     = max(0, (planTotal - totalExpense) / daysLeft)
```

### 2.3 По счёту

```
account.balance — хранится; обновляется при каждой txn (delta = txn.amount).
```

### 2.4 Копилка

```
savingsTotal     = Σ |txn.amount| where kind in ('roundup', 'deposit')
roundupMtd       = Σ |txn.amount| where kind == 'roundup' && month == current
roundupDelta(t)  = ceil(|t.amount| / base) * base − |t.amount|     // для расхода
```

---

## 3. Перенос остатка категории (rollover)

В последний день месяца, в полночь:

```pseudocode
for c in categories where !c.paused:
  remainder = max(0, c.plan - factOf(c, currentMonth))
  if remainder == 0: continue
  if c.rollover == 'savings':
    createTxn({
      kind: 'deposit', amount: -remainder,
      categoryId: 'savings', accountId: user.primaryAccountId,
      name: `Остаток ${c.name} → копилка`,
    });
  else: // 'misc'
    // не создаём txn, но при отчёте за следующий месяц этот remainder
    // суммируется в виртуальную категорию "Прочее" с пометкой источника
```

---

## 4. Округление (roundup)

При создании расходной транзакции, если `savingsConfig.roundupEnabled`:

```pseudocode
delta = ceil(|t.amount| / base) * base − |t.amount|
if delta > 0 && delta < base:
  createTxn({
    kind: 'roundup',
    amount: -delta,
    categoryId: 'savings',
    accountId: t.accountId,
    name: 'Округление',
    parentTxnId: t.id,
    occurredAt: t.occurredAt,
  });
  // плюс: уменьшить account.balance на delta, увеличить savingsTotal
```

В реестре `roundup` отображается как отдельная строка с жёлтой плашкой
«↻ ОКРУГЛ.».

---

## 5. Форматтеры (фронт)

### 5.1 Числа

```ts
// Тысячи через тонкий пробел U+202F (узкий неразрывный)
const fmt = (cents: number): string =>
  Math.abs(Math.round(cents / 100))      // если хранится в копейках
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '\u202F');
```

### 5.2 Знак

```ts
const sign = (n: number) =>
  n > 0 ? '+' : n < 0 ? '\u2212' : '';   // U+2212 — math minus, не дефис
```

### 5.3 Даты

```ts
// 'Сегодня' / 'Вчера' / '7 мая'
const formatDay = (d: Date, today: Date): string => {
  if (sameDay(d, today)) return 'Сегодня';
  if (sameDay(d, addDays(today, -1))) return 'Вчера';
  return `${d.getDate()} ${MONTHS_GENITIVE[d.getMonth()]}`;
  // MONTHS_GENITIVE = ['января', 'февраля', ..., 'декабря']
};

// '14:32'
const formatTime = (d: Date): string =>
  `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
```

### 5.4 Валюта

Всегда в виде `${fmt(amount)} ₽` или `${fmt(amount)} ₽ / мес`. Без копеек на витринах.

---

## 6. Валидаторы

| Поле                  | Правило                              | Сообщение                                |
|-----------------------|--------------------------------------|------------------------------------------|
| `income`              | `> 0`, `≤ 100_000_000` ₽             | «Введите доход больше 0»                 |
| `category.plan`       | `≥ 0`, `≤ income * 4`                | «Слишком большой лимит»                  |
| `Σ category.plan`     | `≤ income`                           | «Превышение плана на X ₽»                |
| `transaction.amount`  | `!= 0`, `|amount| ≤ 100_000_000` ₽   | «Введите сумму»                          |
| `transaction.name`    | `length ≤ 80`                        | «Слишком длинное описание»               |
| `goal.target`         | `> 0`                                | «Введите целевую сумму»                  |
| `goal.due`            | `> today` если задано                | «Срок должен быть в будущем»             |
| `account.bank`        | `length 1..40`                       | —                                        |

---

## 7. API (черновик)

```
POST   /api/auth/tg               { initData } → { token, user }
GET    /api/me                    → { user, accounts, categories, savings }
PATCH  /api/me                    { income? }

GET    /api/accounts              → Account[]
POST   /api/accounts              { bank, mask?, kind, balance } → Account
PATCH  /api/accounts/:id          partial<Account>
DELETE /api/accounts/:id          (только если 0 транзакций)

GET    /api/categories            → Category[]
PATCH  /api/categories/:id        { plan?, rollover?, paused? }

GET    /api/txns?from=&to=&cat=&acc=  → Txn[]
POST   /api/txns                  { amount, name, catId, accId, kind?, occurredAt? } → Txn
PATCH  /api/txns/:id              partial<Txn>
DELETE /api/txns/:id

GET    /api/recurrents            → Recurrent[]
POST   /api/recurrents/:id/post   → Txn       (провести регулярку в текущий месяц)
POST   /api/recurrents/:id/unpost → void

GET    /api/savings               → { total, monthIn, config, goals }
PATCH  /api/savings/config        { roundupEnabled?, roundupBase? }
POST   /api/savings/deposit       { amount, accountId, goalId? } → Txn
POST   /api/goals                 { name, target, due? } → Goal
PATCH  /api/goals/:id             partial<Goal>
DELETE /api/goals/:id

POST   /api/ai/message            { text } → { messages: AiMessage[], action?: ... }
```

---

## 8. Ивенты / триггеры

| Событие                                | Что происходит                                                     |
|----------------------------------------|--------------------------------------------------------------------|
| `txn.created (kind: expense)`          | Если `roundupEnabled` — создаётся `roundup` txn.                   |
| `txn.created`                          | `account.balance += txn.amount`. Пересчёт factOf(category).        |
| `txn.deleted`                          | Откат `account.balance` и связанных roundup-txn (`parentTxnId`).   |
| `recurrent.posted`                     | Создаётся `txn` от регулярки, `recurrent.postedTxnId = txn.id`.    |
| `month.rollover` (полночь 1-го числа)  | Cron: rollover остатков, обнуление `recurrent.postedTxnId`.        |
| `category.over`                        | Push-уведомление пользователю (R4).                                |
| `roundup.threshold` (например 1000 ₽)  | AI-наблюдение «копилка пополнилась на X ₽».                        |

---

## 9. Edge cases / правила округления

- Все деньги — в копейках, целые числа. Без `float`.
- Округление при roundup — **вверх до базы**. Если `|amount| % base == 0` — пропуск.
- Если у пользователя нет `primaryAccount` — все ручные операции в `cash` (создаётся
  автоматически при первой записи).
- Если все категории `paused` — на главной показать пустое состояние «настроить план».
- При удалении категории — операции по ней переезжают в системную «Прочее»
  (создаётся при необходимости).
