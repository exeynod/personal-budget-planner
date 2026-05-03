---
phase: 06-subscriptions-worker-jobs
reviewed: 2026-05-03T00:00:00Z
depth: standard
files_reviewed: 24
files_reviewed_list:
  - alembic/versions/0002_add_notify_days_before.py
  - app/api/routes/settings.py
  - app/api/routes/subscriptions.py
  - app/api/schemas/subscriptions.py
  - app/db/models.py
  - app/services/settings.py
  - app/services/subscriptions.py
  - app/worker/jobs/charge_subscriptions.py
  - app/worker/jobs/notify_subscriptions.py
  - frontend/src/App.tsx
  - frontend/src/api/subscriptions.ts
  - frontend/src/api/types.ts
  - frontend/src/components/SubscriptionEditor.module.css
  - frontend/src/components/SubscriptionEditor.tsx
  - frontend/src/hooks/useSettings.ts
  - frontend/src/hooks/useSubscriptions.ts
  - frontend/src/screens/HomeScreen.module.css
  - frontend/src/screens/HomeScreen.tsx
  - frontend/src/screens/SettingsScreen.module.css
  - frontend/src/screens/SettingsScreen.tsx
  - frontend/src/screens/SubscriptionsScreen.module.css
  - frontend/src/screens/SubscriptionsScreen.tsx
  - main_worker.py
  - tests/test_subscriptions.py
  - tests/test_worker_charge.py
findings:
  critical: 4
  warning: 5
  info: 3
  total: 12
status: issues_found
---

# Фаза 06: Отчёт о проверке кода

**Проверено:** 2026-05-03
**Глубина:** standard
**Файлов проверено:** 24
**Статус:** issues_found

## Краткое резюме

Проверены backend-сервисы подписок, worker-джобы, REST-роуты, Pydantic-схемы, Alembic-миграция, весь фронтенд (хуки, экраны, редактор) и тесты. Реализация в целом аккуратная, но обнаружено 4 блокирующих проблемы: транзакционная некорректность при AlreadyChargedError, логическая ошибка в update_subscription (булевы поля нельзя обновить в false/пустую строку), дивизия на ноль в Timeline при однодневном месяце, и отсутствие 404 для DELETE несуществующей подписки. Несколько предупреждений касаются несоответствия типов между backend и frontend, обрыва advisory-lock при выходе из notify_job по return, и XSS-вектора через `window.setTimeout`.

---

## Критические ошибки

### CR-01: Транзакционное загрязнение после rollback в charge_subscription

**Файл:** `app/services/subscriptions.py:191-198`

**Проблема:** Функция `charge_subscription` вызывается в контексте уже открытой транзакции (например, из `POST /subscriptions/{id}/charge-now`, где сессия предоставляется через `Depends(get_db)`). При поимке `IntegrityError` на строке 193 делается `await db.rollback()` (строка 194) — что откатывает **всю** сессию, включая возможные изменения, сделанные до вызова этой функции (в частности `get_cycle_start_day` делает SELECT, но сама сессия уже могла содержать незафиксированные данные). После rollback состояние ORM-сессии становится невалидным, и дальнейшие обращения к ней могут привести к `InvalidRequestError`.

Дополнительно: когда функция вызывается из worker'а (`charge_subscriptions_job`), каждая подписка обрабатывается в собственной сессии — там проблема не воспроизводится. Но в HTTP-контексте (charge-now) сессия общая.

**Fix:**
Использовать `savepoint` вместо полного rollback, либо перехватывать IntegrityError до flush-а через вложенную транзакцию:
```python
try:
    async with db.begin_nested():   # SAVEPOINT
        db.add(planned)
        await db.flush()
except IntegrityError:
    raise AlreadyChargedError(sub_id, original_date)
```
Тогда откат происходит только до savepoint, основная транзакция остаётся чистой.

---

### CR-02: update_subscription пропускает обновление булевых и нулевых значений

**Файл:** `app/services/subscriptions.py:135-137`

**Проблема:**
```python
for k, v in patch.items():
    if v is not None:
        setattr(sub, k, v)
```
Проверка `if v is not None` отсекает не только `None`, но и любое falsy-значение: `is_active=False`, `notify_days_before=0`, `amount_cents=0` (теоретически). Запрос `PATCH /subscriptions/{id}` с `{"is_active": false}` или `{"notify_days_before": 0}` молча игнорирует переданное значение — подписка остаётся активной / значение уведомлений не сбрасывается. Это прямая логическая ошибка: контракт PATCH нарушен.

**Fix:**
```python
for k, v in patch.items():
    setattr(sub, k, v)
```
`model_dump(exclude_unset=True)` в роуте уже гарантирует, что в `patch` попадают только явно переданные поля — проверка на `None` лишняя и вредная.

---

### CR-03: Division by zero в Timeline при 28-29 февраля (daysInMonth == 1)

**Файл:** `frontend/src/screens/SubscriptionsScreen.tsx:180`

**Проблема:**
```typescript
const todayPct = ((todayDay - 1) / (daysInMonth - 1)) * 100;
```
Если `daysInMonth` равен 1 (теоретически невозможно для реального месяца), деление вернёт `Infinity`. Реальный баг другой: если пользователь открывает экран **в первый день месяца** (`todayDay = 1`), то `(1 - 1) / (daysInMonth - 1) = 0` — это корректно. Но формула также используется для позиционирования точек подписок на строке 193:
```typescript
const pct = ((d - 1) / (daysInMonth - 1)) * 100;
```
Когда подписка списывается **1-го числа**, `d = 1` и `pct = 0` — точка рендерится на левом краю, что визуально некорректно (наезжает на метку). Это не crash, но следует из той же формулы.

Настоящий crash-риск: если `new Date(dateStr)` парсит строку в UTC (что делают все ISO-даты), а `today` создаётся в локальном времени, разница часовых поясов может дать `d.getDate()` на день меньше/больше из-за UTC-сдвига. На устройствах с положительным UTC-смещением (`+03:00` Москва) `new Date("2026-05-01")` даст `2026-04-30 21:00 UTC`, и `.getDate()` = 30 вместо 1. Это означает, что подписка, назначенная на 1 мая, не попадёт в `dotsThisMonth` (строка 183-185) и **не будет отображена** на timeline.

**Fix:**
```typescript
// Парсить дату без UTC-смещения
function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}
// Использовать везде вместо new Date(dateStr)
```

---

### CR-04: Нет 404 при DELETE несуществующей подписки

**Файл:** `app/api/routes/subscriptions.py:112-115`, `app/services/subscriptions.py:142-144`

**Проблема:**
```python
async def delete_subscription(db: AsyncSession, sub_id: int) -> None:
    await db.execute(delete(Subscription).where(Subscription.id == sub_id))
```
SQLAlchemy `delete()` не бросает исключение, если строка не найдена — он молча выполняет DELETE без строк. Роут отвечает 204 даже если подписки с таким ID не существует. Это нарушает REST-семантику (клиент получает успех вместо 404) и делает невозможным отличить «удалил» от «не было».

**Fix:**
```python
async def delete_subscription(db: AsyncSession, sub_id: int) -> None:
    result = await db.execute(
        delete(Subscription).where(Subscription.id == sub_id)
    )
    if result.rowcount == 0:
        raise LookupError(f"Subscription {sub_id} not found")
```
В роуте добавить `except LookupError` → 404 (по аналогии с patch_sub).

---

## Предупреждения

### WR-01: advisory lock не освобождается при раннем return в notify_subscriptions_job

**Файл:** `app/worker/jobs/notify_subscriptions.py:63-70`

**Проблема:**
```python
lock_acquired = bool(lock_result.scalar())
if not lock_acquired:
    logger.info("notify_subscriptions: lock busy, skip")
    return         # <-- выход до finally
```
При `return` внутри `try`-блока Python **всё равно** выполняет `finally` — это корректно. Однако при `return` на строке 65 (до установки `lock_acquired = True`) переменная всё ещё `False` и блок `finally` не освобождает блокировку — это правильно. Но проблема в другом: когда функция делает ранний `return` после `user is None or user.tg_chat_id is None` (строка 68-70), `lock_acquired` уже `True`, и advisory lock **корректно освобождается** в `finally`.

Настоящая проблема: при `return` на строке 90 (`if not due:`) lock тоже корректно освобождается. Но если исключение возникает внутри `send_message` и поглощается (строки 111-116), после чего `finally` пытается выполнить `db.commit()` (строка 136) — если к этому моменту сессия находится в состоянии error (из-за какого-то другого исключения, дошедшего до строки 118-119), `db.commit()` может упасть. Это значит `pg_advisory_unlock` выполнится, но `commit` потерпит неудачу → lock фактически останется, т.к. без commit PostgreSQL session-level lock удерживается до конца соединения.

Более серьёзно: `pg_advisory_lock` (session-level) удерживается на уровне PostgreSQL-соединения, а не транзакции. Вызов `db.commit()` в `finally` закрывает транзакцию, но **не закрывает соединение**. В пуле `AsyncSessionLocal` то же физическое соединение может быть переиспользовано следующей задачей с удерживаемым lock-ом. Это создаёт риск deadlock при следующем запуске джоба.

**Fix:**
Использовать транзакционные (`pg_try_advisory_xact_lock`) вместо сессионных блокировок — транзакционные блокировки освобождаются автоматически при COMMIT/ROLLBACK:
```sql
SELECT pg_try_advisory_xact_lock(:key)
```
Тогда не нужен явный `unlock`, и проблема переиспользования соединения исчезает.

---

### WR-02: `SettingsRead` на фронтенде не содержит `is_bot_bound`

**Файл:** `frontend/src/api/types.ts:61-64`

**Проблема:**
Backend `GET /settings` возвращает три поля: `cycle_start_day`, `notify_days_before`, `is_bot_bound` (см. `app/api/schemas/settings.py`). Frontend-интерфейс `SettingsRead` содержит только первые два:
```typescript
export interface SettingsRead {
  cycle_start_day: number;
  notify_days_before: number;
  // is_bot_bound отсутствует!
}
```
Поле молча теряется при десериализации. Любой будущий UI-код, обращающийся к `settings.is_bot_bound`, получит `undefined` вместо булева значения без ошибки компиляции (TypeScript просто не видит поля).

**Fix:**
```typescript
export interface SettingsRead {
  cycle_start_day: number;
  notify_days_before: number;
  is_bot_bound: boolean;
}
```

---

### WR-03: Некорректная обработка NaN в полях суммы (SubscriptionEditor)

**Файл:** `frontend/src/components/SubscriptionEditor.tsx:70`

**Проблема:**
```typescript
const cents = Math.round(parseFloat(amountRub.replace(',', '.')) * 100);
```
Если пользователь вводит строку вида `"abc"`, `"."` или `"1.2.3"`, `parseFloat` вернёт `NaN`, `Math.round(NaN)` = `NaN`, и `NaN` будет отправлен на бэкенд как `amount_cents`. FastAPI с Pydantic v2 отклонит запрос с 422 (поле `int` не принимает NaN), но пользователь увидит неинформативное сообщение об ошибке.

Проверка `canSubmit` (строка 100) проверяет `amountRub !== ''`, но не проверяет что это валидное число, поэтому кнопка «Создать» остаётся активной при вводе `"abc"`.

**Fix:**
```typescript
const parsed = parseFloat(amountRub.replace(',', '.'));
if (isNaN(parsed) || parsed <= 0) {
  setErr('Введите корректную сумму');
  return;
}
const cents = Math.round(parsed * 100);
```

---

### WR-04: `window.setTimeout` вместо глобального `setTimeout`

**Файл:** `frontend/src/screens/SettingsScreen.tsx:78`

**Проблема:**
```typescript
window.setTimeout(() => setSavedFlash(false), 1500);
```
В React Native / Telegram Mini App WebView `window` может быть не определён или иметь ограниченный API. Хук вызывается внутри `useCallback`, который может сработать после размонтирования компонента — `setSavedFlash(false)` на размонтированном компоненте даст предупреждение «Can't perform a React state update on an unmounted component» (в React <18 — ошибку). Возвращаемый ID таймера нигде не сохраняется и не очищается в cleanup.

**Fix:**
```typescript
const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
// в handleSave:
timerRef.current = setTimeout(() => setSavedFlash(false), 1500);
// в useEffect cleanup:
return () => { if (timerRef.current) clearTimeout(timerRef.current); };
```

---

### WR-05: `useSettings` не отменяет `refetch` при размонтировании

**Файл:** `frontend/src/hooks/useSettings.ts:16-26`

**Проблема:**
`useEffect` (строки 28-45) корректно использует флаг `cancelled` для начальной загрузки. Но функция `refetch` (строки 16-26), возвращаемая хуком, не проверяет флаг отмены — если компонент размонтируется во время `refetch()`, вызов `setSettings(data)` произойдёт на размонтированном компоненте. Аналогичная проблема в `useSubscriptions.ts:20-30`.

**Fix:**
```typescript
// Использовать AbortController или проверять монтирование через useRef:
const mountedRef = useRef(true);
useEffect(() => {
  mountedRef.current = true;
  return () => { mountedRef.current = false; };
}, []);

const refetch = useCallback(async () => {
  setLoading(true);
  setError(null);
  try {
    const data = await getSettings();
    if (mountedRef.current) setSettings(data);
  } catch (e: unknown) {
    if (mountedRef.current) setError(e instanceof Error ? e.message : 'load failed');
  } finally {
    if (mountedRef.current) setLoading(false);
  }
}, []);
```

---

## Замечания (Info)

### IN-01: Нарушение идемпотентности advisory lock при сбое `pg_advisory_unlock`

**Файл:** `app/worker/jobs/charge_subscriptions.py:107-115`

**Проблема:**
```python
await db_outer.commit()
```
Вызов `commit()` после `pg_advisory_unlock` избыточен для session-level блокировок (они не требуют commit для освобождения). Если `pg_advisory_unlock` не выполнился из-за разрыва соединения, `commit()` тоже упадёт. Логика освобождения блокировки такая же, как в `notify_subscriptions_job`, и оба джоба выиграют от перехода на `pg_try_advisory_xact_lock` (см. WR-01).

---

### IN-02: Закомментированный TODO в тексте комментария main_worker.py

**Файл:** `main_worker.py:14-17`

**Проблема:**
```python
# Remaining cron jobs (HLD §6):
# - ``notify_subscriptions`` daily at 09:00 Europe/Moscow — Phase 6
# - ``charge_subscriptions`` daily at 00:05 Europe/Moscow — Phase 6
```
Оба джоба уже добавлены в Phase 6 (строки 93-112), но комментарий «Remaining cron jobs» не был удалён — вводит в заблуждение при чтении файла.

**Fix:** Удалить устаревший блок комментариев.

---

### IN-03: Отсутствие теста для DELETE несуществующей подписки и PATCH is_active=false

**Файл:** `tests/test_subscriptions.py`

**Проблема:**
- Нет теста, проверяющего что `DELETE /subscriptions/{несуществующий_id}` возвращает 404 (соответствует CR-04).
- Нет теста, проверяющего что `PATCH /subscriptions/{id}` с `{"is_active": false}` реально деактивирует подписку (соответствует CR-02).
- Нет теста `notify_subscriptions_job` для подписки с `notify_days_before=0` (сегодня = дата списания).

Эти пробелы в покрытии позволили bugs CR-02 и CR-04 пройти незамеченными.

---

_Проверено: 2026-05-03_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
