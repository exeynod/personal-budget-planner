---
phase: 04-actual-transactions-and-bot-commands
reviewed: 2026-05-03T00:00:00Z
depth: standard
files_reviewed: 27
files_reviewed_list:
  - app/api/router.py
  - app/api/routes/actual.py
  - app/api/routes/internal_bot.py
  - app/api/schemas/actual.py
  - app/api/schemas/internal_bot.py
  - app/bot/api_client.py
  - app/bot/commands.py
  - app/bot/disambiguation.py
  - app/bot/parsers.py
  - app/services/actual.py
  - app/services/internal_bot.py
  - frontend/src/App.tsx
  - frontend/src/api/actual.ts
  - frontend/src/api/types.ts
  - frontend/src/components/ActualEditor.tsx
  - frontend/src/components/Fab.tsx
  - frontend/src/hooks/useActual.ts
  - frontend/src/screens/ActualScreen.tsx
  - frontend/src/screens/HomeScreen.tsx
  - main_bot.py
  - tests/test_actual_crud.py
  - tests/test_actual_period.py
  - tests/test_balance.py
  - tests/test_bot_handlers_phase4.py
  - tests/test_bot_parsers.py
  - tests/test_internal_bot.py
  - tests/test_main_bot_entry.py
findings:
  critical: 4
  warning: 7
  info: 3
  total: 14
status: issues_found
---

# Phase 04: Code Review Report

**Reviewed:** 2026-05-03T00:00:00Z
**Depth:** standard
**Files Reviewed:** 27
**Status:** issues_found

## Summary

Phase 4 adds actual-transaction CRUD, balance aggregation, and bot commands (`/add`, `/income`, `/balance`, `/today`, `/app`) with disambiguation. The overall structure is sound — service/route separation is clean, exception→HTTP mappings are consistent, and the single-tenant model is respected. However, four blockers were found: floating-point arithmetic is used for kopeck conversion in two places (violates the project's no-float money rule and introduces rounding bugs), the `cb_disambiguation` callback's message edit path sends a reply to the wrong chat when `edit_text` fails, the `_is_owner` guard is bypassed via a possible `None` `from_user` dereference in command handlers, and the delete flow in `ActualScreen` swallows errors silently. Seven quality warnings round out the report.

---

## Critical Issues

### CR-01: Float arithmetic used for kopeck conversion in parsers.py (no-float money rule violation)

**File:** `app/bot/parsers.py:49-54`

**Issue:** `parse_amount` converts the user's string to `float` with `float(s)`, then multiplies by 100 and rounds. This violates the project convention "Никаких float" (CLAUDE.md) and introduces IEEE-754 rounding errors for inputs like `"0.07"` (which becomes `6` kopecks instead of `7`). The bug is latent for common values but guaranteed to surface for specific amounts.

```python
f = float(s)          # line 49 — prohibited
cents = round(f * 100) # line 54 — may round incorrectly
```

**Fix:** Use `decimal.Decimal` with explicit quantization, or split on the separator and compute kopecks with integer arithmetic:

```python
from decimal import Decimal, ROUND_HALF_UP

s_decimal = s.replace(",", ".")  # already normalised at this point
d = Decimal(s_decimal)
cents = int((d * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
```

---

### CR-02: Float arithmetic used for kopeck conversion in ActualEditor.tsx (no-float money rule violation)

**File:** `frontend/src/components/ActualEditor.tsx:48-50`

**Issue:** `parseRublesToKopecks` uses `parseFloat` then `Math.round(f * 100)`. JavaScript `Number` (IEEE-754 double) has the same rounding problem as Python `float`. For example, `parseFloat("14.97") * 100 = 1496.9999...` rounds to `1496` instead of `1497`. This silently stores wrong values in the database.

```ts
const f = parseFloat(cleaned);  // line 48 — floating-point
return Math.round(f * 100);     // line 50 — may produce wrong kopecks
```

**Fix:** Parse integer and fractional parts separately using string splitting:

```ts
function parseRublesToKopecks(input: string): number | null {
  const cleaned = input.replace(/\s/g, '').replace(',', '.');
  if (cleaned === '') return null;
  const [intPart, fracPart = ''] = cleaned.split('.');
  if (!/^\d+$/.test(intPart) || !/^\d{0,2}$/.test(fracPart)) return null;
  const kopecks = parseInt(intPart, 10) * 100 + parseInt(fracPart.padEnd(2, '0'), 10);
  return kopecks > 0 ? kopecks : null;
}
```

---

### CR-03: `message.from_user` is accessed without null-check after `_is_owner` guard passes

**File:** `app/bot/commands.py:248, 308, 324`

**Issue:** `_is_owner` correctly guards against `from_user is None` (returns `False`), so a `None` `from_user` will cause the handler to silently return. However, once `_is_owner` returns `True` and execution continues, `message.from_user.id` is accessed directly at lines 248, 308, and 324 without any re-check. In Telegram's Bot API a message sent through a linked channel forwards can have `from_user=None` even for channel owner messages. If `_is_owner` were ever to return a false-positive `True` for a message with `None` `from_user` (e.g., due to a configuration error where `OWNER_TG_ID == 0`), the handlers would crash with `AttributeError`. More concretely, `OWNER_TG_ID` is loaded from env and has no explicit positive-integer validation; if it were `0`, `getattr(message_or_callback, "from_user", None)` returns `None` which has `.id` evaluated as `None == 0` → `False` safely, but the pattern is fragile.

The actual blocker is line 248: `_handle_add_or_income` checks `_is_owner(message)` (line 233) and then immediately calls `message.from_user.id` (line 248) — but `from_user` is obtained via `getattr` with a default of `None` in `_is_owner`, while in the handler body it is accessed directly without any safety. If Telegram ever delivers a message where `from_user` is `None` but the channel check passes (service messages, etc.), this is an unhandled `AttributeError` crash.

**Fix:** Use `callback.from_user` consistently via `_is_owner` result or guard explicitly:

```python
user = message.from_user
if not user or user.id != settings.OWNER_TG_ID:
    return
# then use user.id safely
tg_user_id = user.id
```

Apply this pattern at lines 232-248, 303-308, 318-324.

---

### CR-04: Delete error in ActualScreen.handleDelete is not surfaced to the user

**File:** `frontend/src/screens/ActualScreen.tsx:87-94`

**Issue:** `handleDelete` does not have a try/catch block. If `deleteActual` throws (e.g., 404, network error), the exception propagates unhandled — the `BottomSheet` closes and the toast "Транзакция удалена" is never shown, but the list is also not refreshed. The user sees a half-open/closed sheet with no feedback, the old item may still appear in the list (since `refetch()` was not called), and the JavaScript error reaches the unhandled promise rejection handler. Compare with `handleSave`, which wraps in try/catch and sets `mutationError`.

```ts
const handleDelete = async () => {
  if (!sheet.item) return;
  await deleteActual(sheet.item.id);   // throws on failure — no try/catch
  setSheet(CLOSED_SHEET);
  showToast('Транзакция удалена');
  await refetch();
};
```

**Fix:**

```ts
const handleDelete = async () => {
  if (!sheet.item) return;
  setMutationError(null);
  try {
    await deleteActual(sheet.item.id);
    setSheet(CLOSED_SHEET);
    showToast('Транзакция удалена');
    await refetch();
  } catch (e) {
    setMutationError(e instanceof Error ? e.message : String(e));
  }
};
```

---

## Warnings

### WR-01: `datetime.utcnow()` is deprecated in Python 3.12 and produces naive datetimes

**File:** `app/bot/disambiguation.py:37, 42`

**Issue:** `datetime.utcnow()` is deprecated since Python 3.12 (the project targets Python 3.12 per CLAUDE.md). It also returns a naïve datetime, while the TTL comparison (`datetime.utcnow() - self.created_at`) only works correctly because both sides are naive. If any future code passes a timezone-aware datetime to `PendingActual`, the comparison will crash with `TypeError`. The correct replacement is `datetime.now(timezone.utc)`.

**Fix:**

```python
from datetime import datetime, timezone

# In field default:
created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

# In is_expired property:
return datetime.now(timezone.utc) - self.created_at > TTL
```

---

### WR-02: Disambiguation token collision is possible — token only 8 hex chars (32 bits entropy)

**File:** `app/bot/disambiguation.py:54`

**Issue:** The token is `uuid4().hex[:8]` — only 32 bits of entropy. With simultaneous pending entries (even a handful), the birthday-collision probability becomes non-negligible. A collision causes a second `/add` command to silently overwrite the first pending entry, making it unresolvable. For a single-user bot the practical risk is low, but the design is fragile with no collision check.

**Fix:** Use the full UUID token or check for collision before inserting:

```python
token = uuid4().hex  # 128 bits — collision probability negligible
```

Or at minimum detect and retry:
```python
while (token := uuid4().hex[:8]) in _PENDING:
    pass
```

---

### WR-03: `cb_disambiguation` falls back to `callback.message.answer()` — sends to wrong place on edit failure

**File:** `app/bot/commands.py:399-402`

**Issue:** When `edit_text` fails (old message, permissions), the fallback at line 402 calls `callback.message.answer(text)`, which sends a **new message** to `callback.message.chat`. This is correct if `callback.message` is not `None`. However, if `callback.message` is `None` (which the aiogram type system allows for inline messages), the guard at line 397 (`if callback.message:`) was already checked, so the `answer` call would never be reached — but `edit_text` at line 399 would also be guarded. The real issue is that on edit failure, `callback.answer()` (the mandatory acknowledgement) is **never called**, leaving the Telegram spinner running indefinitely for the user. The `callback.answer()` on the success path (line 403) is only reached when `status == "created"` and `edit_text` succeeds or fallback `answer` completes — but if `edit_text` raises and the fallback `answer` also raises (e.g., network), the `callback.answer()` on line 403 is skipped.

**Fix:** Move `await callback.answer()` outside the try/except block so it always executes:

```python
    if status == "created":
        text = _format_created_actual(result, kind=pending.kind)
        if callback.message:
            try:
                await callback.message.edit_text(text)
            except Exception:
                await callback.message.answer(text)
    else:
        await callback.answer(f"Неожиданный статус: {status}", show_alert=True)
        return
    await callback.answer()  # always acknowledge
```

---

### WR-04: `_resolve_period_for_date` has a TOCTOU race: two concurrent requests can create duplicate periods

**File:** `app/services/actual.py:124-168`

**Issue:** The function selects an existing period, then inserts if none found. Under concurrent requests (two rapid `/add` bot commands or two Mini App saves), both may pass the SELECT check and attempt INSERT, creating two overlapping `BudgetPeriod` rows for the same date range. There is no unique constraint on `(period_start, period_end)` in the model, so both INSERTs succeed. This results in duplicate active periods violating the invariant that only one active period should exist at a time.

**Fix:** Add a unique DB constraint on `(period_start, period_end)` and handle the `IntegrityError` by re-fetching the existing row, or use `INSERT ... ON CONFLICT DO NOTHING RETURNING id` then fall back to SELECT:

```python
from sqlalchemy.dialects.postgresql import insert as pg_insert

stmt = (
    pg_insert(BudgetPeriod)
    .values(period_start=p_start, period_end=p_end, ...)
    .on_conflict_do_nothing(index_elements=["period_start", "period_end"])
    .returning(BudgetPeriod.id)
)
result = await db.execute(stmt)
row = result.first()
if row:
    return row[0]
# Re-fetch on conflict
return await db.scalar(select(BudgetPeriod.id).where(...))
```

---

### WR-05: `compute_balance` `by_category` iterates `seen_keys` including archived-category keys — but then skips them, producing an incorrect total when an archived category has actuals

**File:** `app/services/actual.py:374-395`

**Issue:** `seen_keys = set(planned_map) | set(actual_map)` includes keys for archived categories. The loop then calls `cats.get(cat_id)` and `continue`s when `cat is None` (archived not in `cats`). This correctly excludes archived categories from `by_category`. However, the comment says "Their transactions ARE included in totals" — and indeed `plan_exp`, `act_exp`, etc. are summed from the full maps. This is intentional and documented. The bug is that the `seen_keys` iteration silently discards archived categories without any log — if a category is archived mid-period, its historical actuals silently vanish from `by_category` with no indication to the user. This is a UX correctness issue (not a data loss bug — data is preserved), but the balance screen will show totals that don't match the sum of visible rows, which is confusing.

**Fix:** Either include archived categories with a visual marker `(archived)` in `by_category`, or add a separate `archived_categories_actuals_cents` field to the response so the UI can show the discrepancy.

---

### WR-06: `todayISO()` and `maxTxDateDefault()` in ActualEditor use client UTC, not Europe/Moscow TZ

**File:** `frontend/src/components/ActualEditor.tsx:33-41`

**Issue:** `new Date().toISOString().slice(0, 10)` produces the ISO date in UTC. For a user in Europe/Moscow (UTC+3), before midnight UTC (i.e., 00:00–03:00 Moscow time), `toISOString()` returns yesterday's UTC date. The `tx_date` field will default to yesterday, and the `max` attribute for the date picker will also be off by a day. The same problem exists in `ActualScreen.tsx` lines 23-25 (groupByDate "today"/"yesterday" labels) and lines 55-56 (maxTxDate).

The server-side check uses Europe/Moscow (`_today_in_app_tz()`), so a transaction dated with UTC "today" that is MSK "tomorrow" would be rejected correctly — but the client-side UI default is wrong for users from midnight to 03:00 MSK.

**Fix:** Compute the local date string from the Moscow offset explicitly:

```ts
function todayInMoscow(): string {
  return new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
```

Or use `Intl.DateTimeFormat` with `timeZone: 'Europe/Moscow'`.

---

### WR-07: `window.confirm` in ActualEditor blocks the Telegram Mini App UI thread

**File:** `frontend/src/components/ActualEditor.tsx:127`

**Issue:** `window.confirm('Удалить транзакцию?')` is a synchronous blocking call. In Telegram Mini App WebView (Android/iOS), `window.confirm` may be suppressed, always return `false`, or behave unexpectedly depending on the platform. On some Android WebViews, `window.confirm` is silently suppressed, making the delete button non-functional. The Telegram SDK provides `@telegram-apps/sdk-react`'s `usePopup` hook as the proper modal mechanism.

**Fix:** Replace `window.confirm` with `usePopup` from the Telegram SDK:

```tsx
import { usePopup } from '@telegram-apps/sdk-react';

const popup = usePopup();
const handleDelete = async () => {
  const confirmed = await popup.open({
    title: 'Удалить транзакцию?',
    buttons: [{ type: 'ok', id: 'confirm' }, { type: 'cancel' }],
  });
  if (confirmed !== 'confirm') return;
  // ...
};
```

---

## Info

### IN-01: `BotActualRequest` `model_validator` treats empty string `category_query` as missing

**File:** `app/api/schemas/internal_bot.py:21`

**Issue:** The validator checks `if not self.category_query` which is `True` for both `None` and `""` (empty string). This is the correct intent — an empty string is not a useful query. However, `max_length=200` on `category_query` does not enforce `min_length=1`, so an empty string passes Pydantic field validation and only fails at the model validator with a `ValueError`. This produces a `422` with a somewhat opaque message. Adding `min_length=1` to the field makes the failure surface earlier and with a clearer Pydantic message.

**Fix:**

```python
category_query: Optional[str] = Field(default=None, min_length=1, max_length=200)
```

---

### IN-02: `format_kopecks` does not handle negative amounts — `format_kopecks_with_sign` delegates `abs(cents)` but `format_kopecks` itself uses `//` which floors negatives incorrectly

**File:** `app/bot/commands.py:59-63`

**Issue:** `format_kopecks(-150050)` would compute `cents % 100 = -50` (in Python `%` returns same sign as divisor for negatives), so `-150050 % 100 == 50` (Python semantics), then `rubles = -150050 // 100 == -1501` — giving "-1 501,50" instead of "-1 500,50". This is reached through `format_kopecks_with_sign` which does `format_kopecks(abs(cents))` first, so the sign-aware formatter is safe. But any direct call to `format_kopecks` with a negative value (e.g., a negative `balance_cents`) would produce a wrong string. Currently `format_kopecks(result['balance_now_cents'])` is called on line 178 — `balance_now_cents` can be negative if expenses exceed starting balance + income.

**Fix:** Add a guard or document that `format_kopecks` requires non-negative input; use `format_kopecks_with_sign` for any value that may be negative:

```python
# Line 178 — balance can be negative
f"💰 Баланс: {format_kopecks_with_sign(result['balance_now_cents'])}",
```

---

### IN-03: Tests for `test_cb_disambiguation_flow` check `callback.message.answer` but the success path calls `edit_text` first

**File:** `tests/test_bot_handlers_phase4.py:288-289`

**Issue:** The test asserts `callback.message.answer.assert_awaited_once()`, but the actual success path in `cb_disambiguation` at line 399 calls `callback.message.edit_text(text)` first. The test passes only because `_make_message` returns a `MagicMock` whose `edit_text` is an `AsyncMock` that succeeds — so `answer` is never called. The assertion `callback.message.answer.assert_awaited_once()` should therefore **fail** unless `edit_text` raises. This means the test is passing for the wrong reason (it is actually testing the `edit_text` fallback path, not the happy path), and the `edit_text` call is not asserted at all. The test provides false confidence.

**Fix:** Assert on `edit_text` for the success path:

```python
callback.message.edit_text.assert_awaited_once()
callback.message.answer.assert_not_awaited()
```

---

_Reviewed: 2026-05-03T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
