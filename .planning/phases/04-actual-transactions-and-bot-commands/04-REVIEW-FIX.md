---
phase: 04-actual-transactions-and-bot-commands
fixed_at: 2026-05-03T00:00:00Z
review_path: .planning/phases/04-actual-transactions-and-bot-commands/04-REVIEW.md
iteration: 1
findings_in_scope: 13
fixed: 12
skipped: 1
status: partial
---

# Phase 04: Code Review Fix Report

**Fixed at:** 2026-05-03T00:00:00Z
**Source review:** .planning/phases/04-actual-transactions-and-bot-commands/04-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 13 (CR-01–CR-04, WR-01–WR-07, IN-02, IN-03)
- Fixed: 12
- Skipped: 1 (WR-05 — design decision required)

## Fixed Issues

### CR-01: Float arithmetic in parsers.py

**Files modified:** `app/bot/parsers.py`
**Commit:** 7266610
**Applied fix:** Imported `Decimal, ROUND_HALF_UP` from `decimal`; replaced `float(s)` + `round(f * 100)` with `Decimal(s)` and `.quantize(Decimal("1"), rounding=ROUND_HALF_UP)` * 100 cast to `int`. Eliminates IEEE-754 rounding errors.

---

### CR-02: Float arithmetic in ActualEditor.tsx

**Files modified:** `frontend/src/components/ActualEditor.tsx`
**Commit:** 06527b6
**Applied fix:** Replaced `parseFloat` + `Math.round(f * 100)` in `parseRublesToKopecks` with integer string-split: splits on `.`, pads fractional part to 2 digits, computes `intPart * 100 + fracPart` using `parseInt`. No floating-point involved.

---

### CR-03: from_user null-check in command handlers

**Files modified:** `app/bot/commands.py`
**Commit:** 4295b62
**Applied fix:** In `_handle_add_or_income`, `cmd_balance`, and `cmd_today`: extract `user = message.from_user` before the `_is_owner` guard, add `if not user or not _is_owner(message): return`, then use `user.id` instead of `message.from_user.id`. Guards against AttributeError on None `from_user`.

---

### CR-04: Missing try/catch in handleDelete

**Files modified:** `frontend/src/screens/ActualScreen.tsx`
**Commit:** 100c0c2
**Applied fix:** Wrapped `deleteActual` call in try/catch; on success: close sheet, show toast, refetch; on failure: set `mutationError` (displayed inline). Added `setMutationError(null)` before the try block.

---

### WR-01: datetime.utcnow() deprecated

**Files modified:** `app/bot/disambiguation.py`
**Commit:** 01acd9d
**Applied fix:** Added `timezone` to `datetime` import; replaced `datetime.utcnow` field default with `lambda: datetime.now(timezone.utc)`; replaced `datetime.utcnow()` in `is_expired` with `datetime.now(timezone.utc)`. Both sides are now timezone-aware.

---

### WR-02: Short UUID token collision risk

**Files modified:** `app/bot/disambiguation.py`
**Commit:** 9f69d18
**Applied fix:** Changed `uuid4().hex[:8]` to `uuid4().hex` in `store_pending`. Full 128-bit token, negligible collision probability.

---

### WR-03: callback.answer() not always called in cb_disambiguation

**Files modified:** `app/bot/commands.py`
**Commit:** 0a780a1
**Applied fix:** Moved `await callback.answer()` outside the `if status == "created"` block to after it. Added `return` after the else branch's `callback.answer(alert)`. Now `callback.answer()` always executes on the success path regardless of whether `edit_text` or `answer` was used.

---

### WR-04: TOCTOU race in _resolve_period_for_date

**Files modified:** `app/services/actual.py`
**Commit:** 204f678
**Applied fix:** Added `from sqlalchemy.exc import IntegrityError` import; wrapped the `db.add(period)` + `await db.flush()` block in try/except IntegrityError; on conflict, calls `await db.rollback()` then re-fetches the winning period via SELECT. Note: requires a unique DB constraint on `(period_start, period_end)` to trigger; the catch is safe without it. Alembic migration for the constraint is a separate task.

---

### WR-06: todayISO() uses UTC not Moscow TZ

**Files modified:** `frontend/src/components/ActualEditor.tsx`
**Commit:** 18a533f
**Applied fix:** Added `todayInMoscow()` helper using `Date.now() + 3 * 60 * 60 * 1000` offset before `.toISOString().slice(0, 10)`. Updated `todayISO()` to delegate to `todayInMoscow()`. Updated `maxTxDateDefault()` to start from Moscow-offset date before adding 7 days.

---

### WR-07: window.confirm blocks Telegram Mini App

**Files modified:** `frontend/src/components/ActualEditor.tsx`
**Commit:** 9b41ec3
**Applied fix:** `usePopup` hook is not available in the installed `@telegram-apps/sdk-react` version (only functional `openPopup`/`showPopup` available). Implemented custom inline confirm state: `confirmDelete: boolean`. Clicking "Удалить" sets `confirmDelete=true` and renders an inline "Удалить транзакцию? / Да / Нет" row. "Да" triggers the async delete; "Нет" resets the confirm state. No `window.confirm` call remains.

---

### IN-02: format_kopecks called with potentially negative balance

**Files modified:** `app/bot/commands.py`
**Commit:** 49b823b
**Applied fix:** Line 178 in `_format_balance_reply`: changed `format_kopecks(result['balance_now_cents']) ₽` to `format_kopecks_with_sign(result['balance_now_cents'])`. The with-sign variant uses `abs()` so negative balances display correctly with a minus sign and ₽ suffix.

---

### IN-03: Wrong test assertion in test_cb_disambiguation_flow

**Files modified:** `tests/test_bot_handlers_phase4.py`
**Commit:** d79c21c
**Applied fix:**
1. Added `msg.edit_text = AsyncMock()` and `msg.edit_reply_markup = AsyncMock()` to `_make_message` helper so the success path (which calls `edit_text`) is properly awaitable.
2. Changed `callback.message.answer.assert_awaited_once()` to `callback.message.edit_text.assert_awaited_once()` + `callback.message.answer.assert_not_awaited()` — now tests the actual happy path.
3. Also updated `created_at=datetime.utcnow()` to `datetime.now(timezone.utc)` in the test's `PendingActual` constructor to match the WR-01 change (avoid naive/aware datetime comparison error in `is_expired`).

---

## Skipped Issues

### WR-05: compute_balance silently drops archived-category actuals from by_category

**File:** `app/services/actual.py:374-395`
**Reason:** skipped: design decision required — the fix requires choosing between (a) including archived categories with a visual marker `(archived)` in `by_category`, or (b) adding a separate `archived_categories_actuals_cents` field to the response so the UI can show the discrepancy. Both options require coordinated changes to the service response schema, the API route schema, and the frontend balance display. This is a UX design decision, not a mechanical fix.
**Original issue:** Archived categories with historical actuals silently vanish from `by_category`, causing the by-category sum to not match the displayed totals (data is not lost, just hidden with no indication).

---

**Verification results:**
- `cd frontend && npm run build`: PASSED — TypeScript clean, 72 modules, no errors.
- `python3 -m pytest tests/test_bot_parsers.py -x -q`: PASSED — 18/18 tests.
- `python3 -m pytest tests/test_bot_handlers_phase4.py -x -q`: PASSED — 13/13 tests.

---

_Fixed: 2026-05-03T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
