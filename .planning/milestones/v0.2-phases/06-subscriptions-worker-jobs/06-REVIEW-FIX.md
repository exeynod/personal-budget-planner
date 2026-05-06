---
phase: 06-subscriptions-worker-jobs
fixed_at: 2026-05-03T00:00:00Z
review_path: .planning/phases/06-subscriptions-worker-jobs/06-REVIEW.md
iteration: 1
findings_in_scope: 9
fixed: 9
skipped: 0
status: all_fixed
---

# Фаза 06: Отчёт о применении исправлений

**Исправлено:** 2026-05-03
**Исходный обзор:** `.planning/phases/06-subscriptions-worker-jobs/06-REVIEW.md`
**Итерация:** 1

**Итого:**
- Находок в области применения: 9 (4 критических + 5 предупреждений)
- Исправлено: 9
- Пропущено: 0

---

## Исправленные проблемы

### CR-01: Транзакционное загрязнение после rollback в charge_subscription

**Файл изменён:** `app/services/subscriptions.py`
**Коммит:** `9fdd296`
**Применённое исправление:** Заменил `db.add(planned)` + `try: await db.flush()` с полным `await db.rollback()` на `async with db.begin_nested():` (SAVEPOINT). Теперь при `IntegrityError` откатывается только savepoint, основная транзакция остаётся чистой. `IntegrityError` перехватывается за пределами `begin_nested`, что является корректным — SQLAlchemy сам завершает savepoint через context manager.

---

### CR-02: update_subscription пропускает обновление булевых и нулевых значений

**Файл изменён:** `app/services/subscriptions.py`
**Коммит:** `465e177`
**Применённое исправление:** Убрал проверку `if v is not None` в цикле `for k, v in patch.items()`. Теперь все поля из patch применяются безусловно. Docstring обновлён — уточнено, что patch уже содержит только явно переданные поля благодаря `model_dump(exclude_unset=True)` в роуте.

---

### CR-03: UTC/local сдвиг при парсинге дат в Timeline

**Файл изменён:** `frontend/src/screens/SubscriptionsScreen.tsx`
**Коммит:** `81e93f1`
**Применённое исправление:** Добавлена вспомогательная функция `parseLocalDate(dateStr: string): Date`, которая разбивает ISO-строку `YYYY-MM-DD` на компоненты и создаёт объект `new Date(y, m-1, d)` в локальном времени. Все вызовы `new Date(s.next_charge_date)` в компоненте `Timeline` заменены на `parseLocalDate(s.next_charge_date)`. Функция `daysUntil` также обновлена.

---

### CR-04: Нет 404 при DELETE несуществующей подписки

**Файлы изменены:** `app/services/subscriptions.py`, `app/api/routes/subscriptions.py`
**Коммит:** `02bdde2`
**Применённое исправление:** В `delete_subscription` добавлена проверка `result.rowcount == 0` с выбросом `LookupError`. В роуте `delete_sub` добавлен блок `try/except LookupError` → `HTTPException(404)`. Комментарий к эндпоинту в docstring роутера обновлён.

---

### WR-01: Advisory lock не освобождается при раннем return в notify_subscriptions_job

**Файл изменён:** `app/worker/jobs/notify_subscriptions.py`
**Коммит:** `f01d5f1`
**Применённое исправление:** Переход с `pg_try_advisory_lock` (session-level) на `pg_try_advisory_xact_lock` (transaction-level). Вся логика джоба обёрнута в `async with db.begin():` — транзакционная блокировка автоматически освобождается при COMMIT или ROLLBACK, что исключает риск утечки блокировки при переиспользовании соединения из пула. Явный вызов `pg_advisory_unlock` и `lock_acquired` флаг удалены.

---

### WR-02: `SettingsRead` на фронтенде не содержит `is_bot_bound`

**Файл изменён:** `frontend/src/api/types.ts`
**Коммит:** `eb0dc8f`
**Применённое исправление:** Добавлено поле `is_bot_bound: boolean` в интерфейс `SettingsRead`. Теперь интерфейс полностью соответствует backend-схеме `SettingsRead` из `app/api/schemas/settings.py`.

---

### WR-03: Некорректная обработка NaN в полях суммы (SubscriptionEditor)

**Файл изменён:** `frontend/src/components/SubscriptionEditor.tsx`
**Коммит:** `86fc0c5`
**Применённое исправление:** В `handleSubmit` добавлена ранняя валидация: `parseFloat` выполняется до `setBusy(true)`, результат проверяется через `isNaN(parsedAmount) || parsedAmount <= 0`. При невалидном вводе отображается ошибка `'Введите корректную сумму'` и форма не отправляется. `cents` вычисляется из уже проверенного `parsedAmount`.

---

### WR-04: `window.setTimeout` без сохранения ID и очистки

**Файл изменён:** `frontend/src/screens/SettingsScreen.tsx`
**Коммит:** `7132b3f`
**Применённое исправление:** Добавлен `flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)`. В `useEffect` с пустым массивом зависимостей добавлена функция cleanup `() => { if (flashTimerRef.current !== null) clearTimeout(flashTimerRef.current); }`. В `handleSave` сначала очищается предыдущий таймер, затем ID нового сохраняется в `flashTimerRef.current`. `window.setTimeout` заменён на глобальный `setTimeout`.

---

### WR-05: `useSettings` и `useSubscriptions` не отменяют `refetch` при размонтировании

**Файлы изменены:** `frontend/src/hooks/useSettings.ts`, `frontend/src/hooks/useSubscriptions.ts`
**Коммит:** `867fef3`
**Применённое исправление:** В оба хука добавлен `mountedRef = useRef(true)` с `useEffect` для установки `mountedRef.current = false` при размонтировании. Функция `refetch` обновлена: все вызовы `setSettings`/`setSubscriptions`, `setError` и `setLoading` обёрнуты в проверку `if (mountedRef.current)`. Промисовая цепочка в `useEffect` сохраняет прежний паттерн с `cancelled` флагом.

---

## Пропущенные проблемы

Нет — все 9 находок успешно исправлены.

---

_Исправлено: 2026-05-03_
_Исправщик: Claude (gsd-code-fixer)_
_Итерация: 1_
