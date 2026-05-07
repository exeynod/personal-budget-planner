---
plan_id: 16-08-db-01-set-tenant-scope-unify
phase: 16
plan: 08
type: execute
wave: 1
depends_on: []
requirements: [DB-01]
files_modified:
  - app/services/spend_cap.py
  - tests/test_spend_cap_set_tenant_scope.py
autonomous: true
must_haves:
  truths:
    - "`grep -r 'SET LOCAL app.current_user_id' app/services/spend_cap.py` возвращает 0 совпадений"
    - "spend_cap._fetch_spend_cents_from_db использует `await set_tenant_scope(db, user_id)` вместо f-string SET LOCAL"
    - "Существующая RLS-функциональность сохраняется — `tests/test_spend_cap_service.py` остаётся зелёным"
  artifacts:
    - path: "app/services/spend_cap.py"
      provides: "Унифицированный set_tenant_scope helper-call"
      contains: "set_tenant_scope"
    - path: "tests/test_spend_cap_set_tenant_scope.py"
      provides: "Regression-тест: после _fetch_spend_cents_from_db, `app.current_user_id` GUC установлен корректно через safe bind-параметр"
      exports: []
  key_links:
    - from: "app/services/spend_cap.py::_fetch_spend_cents_from_db"
      to: "app/db/session.py::set_tenant_scope"
      via: "import + await вызов"
      pattern: "from app.db.session import set_tenant_scope"
---

<objective>
Закрыть DB-01 (HIGH SQLi-regression-guard): `app/services/spend_cap.py:85-87` использует f-string `SET LOCAL app.current_user_id = '{int(user_id)}'`. Текущий `int(user_id)` cast блокирует injection, но это другой паттерн чем `app/db/session.py::set_tenant_scope` (который использует безопасный `set_config('app.current_user_id', :uid, true)` с bind-параметром).

Purpose: Per D-16-08 — заменить f-string на `await set_tenant_scope(db, user_id)`. Минимальный диф (две строки), убирает регресс-риск любого будущего изменения, где user_id приходит не как int.

Output: Один импорт + одна замена строки в spend_cap.py + grep-тест проверяющий отсутствие f-string SET LOCAL и наличие set_tenant_scope-вызова.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/REQUIREMENTS.md
@.planning/phases/16-security-ai-hardening/16-CONTEXT.md
@/Users/exy/.claude/plans/serialized-prancing-spark.md

@app/services/spend_cap.py
@app/db/session.py
@tests/test_spend_cap_service.py
@tests/test_security_probes.py
@tests/test_postgres_role_runtime.py

<interfaces>
Existing safe helper from app/db/session.py:30-65:
```
async def set_tenant_scope(session: AsyncSession, user_id: int) -> None:
    if not isinstance(user_id, int) or user_id < 0:
        raise ValueError(f"set_tenant_scope: invalid user_id={user_id!r}")
    await session.execute(
        text("SELECT set_config('app.current_user_id', :uid, true)"),
        {"uid": str(user_id)},
    )
```

Current insecure pattern in app/services/spend_cap.py:85-87:
```
await db.execute(sql_text(f"SET LOCAL app.current_user_id = '{int(user_id)}'"))
```
</interfaces>
</context>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| user_id (resolved by app from app_user.id PK) -> SQL session GUC | Currently safe due to int() cast; future-proof against caller passing string-typed user_id (e.g. query param). |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-16-08-01 | Tampering / SQLi-regression | spend_cap.py:85-87 f-string SET LOCAL | mitigate | Per D-16-08: заменить на `await set_tenant_scope(db, user_id)`. set_tenant_scope использует set_config(:uid) с bind-параметром + ValueError на non-int user_id (defence-in-depth). |
| T-16-08-02 | Repudiation | Тест-suite должен проверять что NO ONE re-introduces f-string SET LOCAL | mitigate | Grep-test regression: `! grep -r "SET LOCAL app.current_user_id" app/services/spend_cap.py`. Также pytest проверяет, что _fetch_spend_cents_from_db правильно ставит app.current_user_id (через current_setting() check после вызова). |
| T-16-08-03 | Defense-in-depth | Other places in codebase potentially use unsafe SET LOCAL | accept | Out-of-scope — только spend_cap.py упомянут в код-ревью. Other modules использовали set_tenant_scope изначально (Phase 11). Если grep по всей кодовой базе найдёт другие SET LOCAL — backlog для следующего phase. |
</threat_model>

<tasks>

<task type="auto">
  <name>Task 1: Заменить f-string SET LOCAL на set_tenant_scope</name>
  <files>app/services/spend_cap.py</files>
  <action>
Per D-16-08: один импорт + одна замена.

Точные шаги:

1. В `app/services/spend_cap.py`, в функции `_fetch_spend_cents_from_db` (def line 65), заменить блок строк 80-87:

Старый код (строки 80-87):
```
from sqlalchemy import text as sql_text

month_start = _month_start_msk()
month_start_utc = month_start.astimezone(timezone.utc)
# Set RLS context so budget_app role can see this user's rows.
# PostgreSQL SET LOCAL does not accept bind parameters — interpolate int directly.
# Safe: user_id is always int (PK); no injection vector.
await db.execute(sql_text(f"SET LOCAL app.current_user_id = '{int(user_id)}'"))
```

Новый код:
```
month_start = _month_start_msk()
month_start_utc = month_start.astimezone(timezone.utc)
# DB-01 (Plan 16-08): unified RLS-context helper. Equivalent to the
# previous f-string SET LOCAL but uses set_config() with a bind-parameter,
# matching app/db/session.py:30 (set_tenant_scope).
from app.db.session import set_tenant_scope  # local import: avoid cycle
await set_tenant_scope(db, user_id)
```

2. Удалить строку `from sqlalchemy import text as sql_text` если она больше нигде не используется в файле. Если используется — оставить.

3. Обновить docstring (`RLS note:` блок строки 75-79) — упомянуть что используется shared helper:
```
RLS note: ai_usage_log has row-level security policy that filters by
app.current_user_id. We call set_tenant_scope() (shared helper from
app/db/session.py) so the runtime budget_app role can read only the
target user's rows. set_config() is scoped to the current transaction.
```

4. НЕ трогать остальную логику функции (SUM, ceil, return).
  </action>
  <verify>
    <automated>! grep -r "SET LOCAL app.current_user_id" app/services/spend_cap.py && grep -q "from app.db.session import set_tenant_scope" app/services/spend_cap.py && grep -q "await set_tenant_scope(db, user_id)" app/services/spend_cap.py</automated>
  </verify>
  <done>F-string SET LOCAL удалён; set_tenant_scope импортирован и вызван; existing test_spend_cap_service.py остаётся зелёным.</done>
</task>

<task type="auto">
  <name>Task 2: Pytest regression — grep-gate + RLS GUC verification</name>
  <files>tests/test_spend_cap_set_tenant_scope.py</files>
  <action>
Создать regression-тест с двумя уровнями проверки:

1. Static grep-gate — `SET LOCAL app.current_user_id` НЕ должен появляться снова.
2. Behavioral — после _fetch_spend_cents_from_db, `app.current_user_id` GUC установлен в правильное значение (через `SELECT current_setting(...)` в той же транзакции).

Точный код:
```
"""DB-01 regression: spend_cap.py uses unified set_tenant_scope helper.

Two-layer test:
1. Static (grep-style) — guarantees no future regression to f-string SET LOCAL.
2. Behavioral — verifies app.current_user_id GUC is set after _fetch_spend_cents_from_db.

This test FAILs if app/services/spend_cap.py reverts to f-string SET LOCAL.
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest
from sqlalchemy import text


def test_spend_cap_does_not_use_fstring_set_local():
    """Static guard: no f-string SET LOCAL in spend_cap.py.

    grep-gate hygiene per planner standards: filter out comments AND
    docstrings so the test is robust to historical references in
    documentation. We strip lines starting with `#` (comments) and
    require the pattern to appear in actual Python code.
    """
    path = Path("app/services/spend_cap.py")
    raw = path.read_text(encoding="utf-8")

    # Filter out python comments (lines starting with `#` after stripping).
    code_lines = [
        line for line in raw.splitlines()
        if not line.lstrip().startswith("#")
    ]
    code = "\n".join(code_lines)

    # f-string SET LOCAL pattern: `f"SET LOCAL app.current_user_id` or similar.
    forbidden = re.compile(r"f['\"]SET LOCAL app\.current_user_id", re.IGNORECASE)
    assert not forbidden.search(code), (
        "DB-01 regression: f-string SET LOCAL re-introduced into spend_cap.py. "
        "Use await set_tenant_scope(db, user_id) instead (app/db/session.py:30)."
    )


def test_spend_cap_imports_set_tenant_scope():
    """Static guard: spend_cap.py imports set_tenant_scope from session module."""
    raw = Path("app/services/spend_cap.py").read_text(encoding="utf-8")
    assert "set_tenant_scope" in raw, (
        "DB-01: spend_cap.py must reference set_tenant_scope (helper from "
        "app/db/session.py)."
    )


@pytest.mark.asyncio
async def test_fetch_spend_cents_sets_current_user_id_guc(db_session, app_user_one):
    """Behavioral: after _fetch_spend_cents_from_db, current_setting('app.current_user_id') == user_id."""
    from app.services.spend_cap import _fetch_spend_cents_from_db

    # Call the function — it sets the GUC and runs the SUM query.
    await _fetch_spend_cents_from_db(db_session, user_id=app_user_one.id)

    # Verify GUC was set within the same transaction.
    result = await db_session.execute(
        text("SELECT current_setting('app.current_user_id', true)")
    )
    val = result.scalar()
    assert val == str(app_user_one.id), (
        f"Expected current_user_id GUC = {app_user_one.id!r}; got {val!r}"
    )


@pytest.mark.asyncio
async def test_fetch_spend_cents_rejects_non_int_user_id(db_session):
    """Behavioral: passing non-int user_id raises ValueError (defense-in-depth from set_tenant_scope)."""
    from app.services.spend_cap import _fetch_spend_cents_from_db

    with pytest.raises((ValueError, TypeError)):
        # set_tenant_scope raises ValueError on non-int.
        await _fetch_spend_cents_from_db(db_session, user_id="evil; DROP TABLE")  # type: ignore[arg-type]
```

Используется fixture `app_user_one` (см. tests/conftest.py — типичный паттерн в `test_spend_cap_service.py`). Если fixture называется иначе — заменить.

FAIL до Task 1: grep-gate ловит f-string SET LOCAL → assert падает.
PASS после Task 1: f-string удалён, set_tenant_scope используется → все 4 теста зелёные.
  </action>
  <verify>
    <automated>cd /Users/exy/pet_projects/tg-budget-planner && pytest tests/test_spend_cap_set_tenant_scope.py -v</automated>
  </verify>
  <done>4 теста (grep f-string, grep import, behavioral GUC, defense-in-depth ValueError) PASS.</done>
</task>

</tasks>

<verification>
Phase-level acceptance:
1. `pytest tests/test_spend_cap_set_tenant_scope.py -v` → 4 passed.
2. `pytest tests/test_spend_cap_service.py` → no regress.
3. `! grep -r 'SET LOCAL app.current_user_id' app/services/spend_cap.py` → exit 0 (no matches).
4. `grep -c 'set_tenant_scope' app/services/spend_cap.py` ≥ 2 (импорт + вызов).
</verification>

<success_criteria>
DB-01 закрыт:
- F-string SET LOCAL удалён из spend_cap.py.
- set_tenant_scope shared helper используется идентично app/db/session.py.
- Regression-тест проверяет grep-gate + behavioral GUC + defense-in-depth.
- Existing functionality (SUM est_cost_usd по user) сохраняется.
</success_criteria>

<output>
After completion, create `.planning/phases/16-security-ai-hardening/16-08-SUMMARY.md`
</output>

## Commit Message
fix(16): DB-01 unify spend_cap.py with set_tenant_scope helper + grep + behavioral regression
