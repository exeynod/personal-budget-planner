---
plan_id: 16-06-con-01-onboarding-atomic
phase: 16
plan: 06
type: execute
wave: 1
depends_on: []
requirements: [CON-01]
files_modified:
  - app/services/onboarding.py
  - tests/test_onboarding_concurrent.py
autonomous: true
must_haves:
  truths:
    - "Два параллельных complete_onboarding для одного tg_user_id (через asyncio.gather) дают РОВНО ОДИН success + РОВНО ОДИН AlreadyOnboardedError"
    - "user.cycle_start_day и user.onboarded_at не перетираются — winner устанавливает их атомарно через UPDATE-WHERE"
    - "Если winner-запрос упал (например, во время create_first_period), второй запрос НЕ becomes ghost-success — потому что winner-claim коммитится только в конце транзакции"
    - "Existing single-flow onboarding (тест test_complete_creates_period_and_seeds_categories) продолжает работать"
  artifacts:
    - path: "app/services/onboarding.py"
      provides: "Atomic UPDATE-with-WHERE claim onboarding state"
      contains: "RETURNING"
    - path: "tests/test_onboarding_concurrent.py"
      provides: "Pytest asyncio.gather race-test"
      exports: []
  key_links:
    - from: "app/services/onboarding.py::complete_onboarding"
      to: "UPDATE app_user SET onboarded_at=now(), cycle_start_day=:csd WHERE id=:id AND onboarded_at IS NULL RETURNING id"
      via: "atomic claim вместо SELECT + later UPDATE"
      pattern: "RETURNING|onboarded_at IS NULL"
---

<objective>
Закрыть CON-01 (HIGH race): между `SELECT AppUser` (line 104-107) и `UPDATE user.onboarded_at = now()` (line 142-143) в `complete_onboarding` — нет ни `FOR UPDATE`, ни уникального gate-индекса. Два параллельных submit'а одного `tg_user_id` оба пройдут проверку `user.onboarded_at is None`, оба попробуют create_first_period — `UniqueConstraint(user_id, period_start)` спасёт от дублей, но один из запросов упадёт с 500, и user-state частично перетрётся.

Purpose: Per D-16-03 — atomic UPDATE-with-WHERE claim:
```
UPDATE app_user
SET onboarded_at = now(), cycle_start_day = :csd
WHERE id = :id AND onboarded_at IS NULL
RETURNING id, onboarded_at
```
RETURNING None → второй параллельный запрос получает AlreadyOnboardedError. Atomic, idempotent, без SERIALIZABLE.

Output: Atomic claim в complete_onboarding + pytest concurrent regression.
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

@app/services/onboarding.py
@app/db/session.py
@app/db/models.py
@tests/test_onboarding.py
@tests/test_onboarding_existing_user_safety.py
@tests/conftest.py

<interfaces>
Current racy flow from app/services/onboarding.py:104-144:
1. SELECT AppUser by tg_user_id (line 104-107) — race window starts
2. Check user.onboarded_at is None (line 112) — both racers see None
3. set_tenant_scope (line 126) — both set scope
4. seed + create_first_period (line 130-139) — UniqueConstraint(user_id, period_start) saves from dup-period but raises IntegrityError on second
5. UPDATE user.cycle_start_day + user.onboarded_at (line 142-143) — both winners overwrite

After fix: claim happens FIRST atomically; only winner proceeds to seed+period+embeddings. Loser raises AlreadyOnboardedError immediately.
</interfaces>
</context>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Frontend POST /onboarding/complete (Mini App double-tap) -> service-layer complete_onboarding | Two concurrent requests share the same tg_user_id; service must serialize via DB-level constraint. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-16-06-01 | Tampering / state corruption | onboarding.py SELECT-then-UPDATE race | mitigate | Per D-16-03: atomic UPDATE app_user SET onboarded_at=now(), cycle_start_day=:csd WHERE id=:id AND onboarded_at IS NULL RETURNING id. Loser sees no row in RETURNING → re-fetch user.onboarded_at → raise AlreadyOnboardedError с фактическим winner-timestamp. |
| T-16-06-02 | DoS / partial state | Если winner упал в create_first_period (например, IntegrityError) | mitigate | Claim делается ДО seed/period/embeddings. Если они падают — транзакция rollback'ит claim (onboarded_at снова NULL). Repeat-call возможен. |
| T-16-06-03 | Repudiation | Loser-error должен быть HTTP 409, не 500 | accept | Existing route layer mapping AlreadyOnboardedError → 409 (test_repeat_complete_returns_409 covers this) — наша задача только обеспечить корректный exception-флоу из service слоя. |
| T-16-06-04 | Defense-in-depth | Unique partial index "WHERE onboarded_at IS NOT NULL" | accept | Out-of-scope: requires alembic migration. Atomic UPDATE-WHERE достаточно для CON-01 acceptance. Backlog. |
</threat_model>

<tasks>

<task type="auto">
  <name>Task 1: Atomic UPDATE-with-WHERE claim в complete_onboarding</name>
  <files>app/services/onboarding.py</files>
  <action>
Per D-16-03: переработать `complete_onboarding` — claim FIRST, side effects SECOND.

Точные шаги:

1. В `app/services/onboarding.py`, в функции `complete_onboarding` (def line 75), полностью переписать тело между строками 103 (комментарий "1. Locate user") и 144 (`await db.flush()`):

Старый код:
```
# 1. Locate user (resolve PK for downstream tenant-scoped calls).
result = await db.execute(
    select(AppUser).where(AppUser.tg_user_id == tg_user_id)
)
user = result.scalar_one_or_none()
if user is None:
    raise OnboardingUserNotFoundError(tg_user_id)

# D-10: idempotency / repeat-protection
if user.onboarded_at is not None:
    raise AlreadyOnboardedError(tg_user_id, user.onboarded_at)

user_pk: int = user.id

from app.db.session import set_tenant_scope
await set_tenant_scope(db, user_pk)

# 2. Optional seed (...)
seeded: list = []
if seed_default_categories:
    seeded = await cat_svc.seed_default_categories(db, user_id=user_pk)

# 3. Create first period (...)
period = await period_svc.create_first_period(
    db, user_id=user_pk,
    starting_balance_cents=starting_balance_cents,
    cycle_start_day=cycle_start_day,
)

# 4. Update user
user.cycle_start_day = cycle_start_day
user.onboarded_at = datetime.now(timezone.utc)
await db.flush()
```

Новый код:
```
from sqlalchemy import text as sql_text
from sqlalchemy.exc import IntegrityError

# 1. Locate user — needed for OnboardingUserNotFoundError + PK resolution.
result = await db.execute(
    select(AppUser).where(AppUser.tg_user_id == tg_user_id)
)
user = result.scalar_one_or_none()
if user is None:
    raise OnboardingUserNotFoundError(tg_user_id)

user_pk: int = user.id

# CON-01: atomic claim. UPDATE-with-WHERE returns the row only if NOT yet
# onboarded. Two concurrent racers: exactly one will see `claimed_at`,
# the other will see None and re-read user.onboarded_at to surface a
# proper AlreadyOnboardedError with the winner's timestamp.
now_utc = datetime.now(timezone.utc)
claim = await db.execute(
    sql_text(
        "UPDATE app_user "
        "SET onboarded_at = :now, cycle_start_day = :csd "
        "WHERE id = :id AND onboarded_at IS NULL "
        "RETURNING onboarded_at"
    ),
    {"now": now_utc, "csd": cycle_start_day, "id": user_pk},
)
claimed_row = claim.first()
if claimed_row is None:
    # Lost the race OR was already onboarded. Refresh and raise.
    await db.refresh(user, attribute_names=["onboarded_at"])
    raise AlreadyOnboardedError(tg_user_id, user.onboarded_at)

# Reflect changes onto the in-memory user object so downstream returns
# can read consistent values without an extra SELECT.
user.cycle_start_day = cycle_start_day
user.onboarded_at = claimed_row.onboarded_at

# Bug fix 2026-05-07: route uses get_db (not tenant-scoped) — RLS context
# must be set BEFORE INSERTs to category / budget_period.
from app.db.session import set_tenant_scope
await set_tenant_scope(db, user_pk)

# 2. Optional seed (idempotent inside service, scoped by user_id).
seeded: list = []
if seed_default_categories:
    seeded = await cat_svc.seed_default_categories(db, user_id=user_pk)

# 3. Create first period.
period = await period_svc.create_first_period(
    db, user_id=user_pk,
    starting_balance_cents=starting_balance_cents,
    cycle_start_day=cycle_start_day,
)

await db.flush()
```

2. НЕ удалять step 5 (embeddings backfill) — оставить как есть.

3. Импорт `from sqlalchemy import text as sql_text` и `from sqlalchemy.exc import IntegrityError` уже включены в новый блок (если они не на module-level, поднять в импорты файла).

4. Семантика race:
   - Транзакция A: BEGIN → claim (onboarded_at=now) → seed → period → COMMIT.
   - Транзакция B параллельно: BEGIN → claim (UPDATE WHERE onboarded_at IS NULL) ждёт row-level lock от A; после COMMIT A видит non-null onboarded_at → claimed_row is None → AlreadyOnboardedError.
   - Поскольку обе используют ту же AsyncSession-фабрику get_db (commit-on-yield), pytest race-тест должен использовать ДВЕ независимые сессии (две AsyncSessionLocal()).
  </action>
  <verify>
    <automated>grep -q "UPDATE app_user" app/services/onboarding.py && grep -q "RETURNING onboarded_at" app/services/onboarding.py && grep -q "WHERE id = :id AND onboarded_at IS NULL" app/services/onboarding.py && grep -q "claimed_row is None" app/services/onboarding.py</automated>
  </verify>
  <done>Atomic UPDATE-WHERE добавлен; loser raises AlreadyOnboardedError; in-memory user объект синхронизирован с claimed_row; existing seed+period+embeddings flow сохраняется.</done>
</task>

<task type="auto">
  <name>Task 2: Pytest concurrent regression — asyncio.gather two complete_onboarding</name>
  <files>tests/test_onboarding_concurrent.py</files>
  <action>
Создать `tests/test_onboarding_concurrent.py` — тест с двумя параллельными `complete_onboarding` для одного tg_user_id.

Ключевое: КАЖДАЯ корутина должна использовать СВОЮ AsyncSession (две `AsyncSessionLocal()` экземпляра), иначе race в одной session не воспроизводится. Существующие fixtures (db_session, db_client) дают одну сессию — для concurrent теста нужно открыть две вручную.

Точный код:
```
"""CON-01 regression: complete_onboarding atomic — concurrent submit yields
exactly one success and one AlreadyOnboardedError.

This test FAILs against pre-fix code (both winners pass user.onboarded_at IS
None check; one will get IntegrityError from UniqueConstraint, NOT a clean
AlreadyOnboardedError, with partial mutation of user.cycle_start_day).
PASSes after Plan 16-06 (atomic UPDATE-with-WHERE claim).
"""
from __future__ import annotations

import asyncio

import pytest
from sqlalchemy import select

from app.db.models import AppUser
from app.db.session import AsyncSessionLocal
from app.services.onboarding import (
    AlreadyOnboardedError,
    complete_onboarding,
)


@pytest.mark.asyncio
async def test_concurrent_complete_onboarding_yields_one_success_one_already(
    seeded_app_user_not_onboarded,
):
    """Two concurrent complete_onboarding for one tg_user_id race against each other.

    Fixture seeded_app_user_not_onboarded: returns an AppUser row with
    onboarded_at=NULL (created via direct ORM, NOT via /onboarding/complete).
    """
    tg_user_id = seeded_app_user_not_onboarded.tg_user_id

    async def _attempt() -> object:
        # Open an INDEPENDENT session — concurrent requests in production are
        # served by independent get_db() generators. Cannot share session.
        async with AsyncSessionLocal() as session:
            try:
                result = await complete_onboarding(
                    session,
                    tg_user_id=tg_user_id,
                    starting_balance_cents=100000,
                    cycle_start_day=1,
                    seed_default_categories=False,
                )
                await session.commit()
                return ("success", result)
            except AlreadyOnboardedError as exc:
                await session.rollback()
                return ("already", exc)
            except Exception as exc:
                await session.rollback()
                return ("error", exc)

    a, b = await asyncio.gather(_attempt(), _attempt())

    outcomes = sorted([a[0], b[0]])
    assert outcomes == ["already", "success"], (
        f"Expected one success + one already-onboarded; got {outcomes!r} "
        f"with details: a={a!r}, b={b!r}"
    )

    # Verify final DB state: exactly one onboarded_at set, cycle_start_day=1.
    async with AsyncSessionLocal() as verify_session:
        row = (await verify_session.execute(
            select(AppUser).where(AppUser.tg_user_id == tg_user_id)
        )).scalar_one()
        assert row.onboarded_at is not None
        assert row.cycle_start_day == 1


@pytest.mark.asyncio
async def test_repeat_complete_after_success_raises_already(
    seeded_app_user_not_onboarded,
):
    """Sequential repeat: second call raises AlreadyOnboardedError (regression for D-10)."""
    tg_user_id = seeded_app_user_not_onboarded.tg_user_id

    async with AsyncSessionLocal() as session_a:
        result = await complete_onboarding(
            session_a,
            tg_user_id=tg_user_id,
            starting_balance_cents=100000,
            cycle_start_day=1,
            seed_default_categories=False,
        )
        await session_a.commit()
        assert result["onboarded_at"]

    async with AsyncSessionLocal() as session_b:
        with pytest.raises(AlreadyOnboardedError):
            await complete_onboarding(
                session_b,
                tg_user_id=tg_user_id,
                starting_balance_cents=200000,
                cycle_start_day=15,
                seed_default_categories=False,
            )

    # cycle_start_day must remain 1 (winner value), not 15 (loser).
    async with AsyncSessionLocal() as verify_session:
        row = (await verify_session.execute(
            select(AppUser).where(AppUser.tg_user_id == tg_user_id)
        )).scalar_one()
        assert row.cycle_start_day == 1, "Loser must NOT overwrite cycle_start_day"
```

Также нужна fixture `seeded_app_user_not_onboarded` в этом файле или в conftest:
```
@pytest.fixture
async def seeded_app_user_not_onboarded():
    """Insert an AppUser row with onboarded_at=NULL via direct ORM."""
    from app.db.models import AppUser

    async with AsyncSessionLocal() as session:
        u = AppUser(tg_user_id=999_001_777, role="user", onboarded_at=None, cycle_start_day=1)
        session.add(u)
        await session.commit()
        await session.refresh(u)
        yield u
        # Cleanup.
        await session.delete(u)
        await session.commit()
```
(Если AppUser model требует обязательных полей — посмотреть в `app/db/models.py` и заполнить минимально-валидно. Если есть существующая фикстура — использовать её и только обнулять onboarded_at.)

FAIL до Task 1: оба call'а проходят `user.onboarded_at is None`, оба пытаются create_first_period; один падает на UniqueConstraint(user_id, period_start) с IntegrityError — `outcomes == ["error", "success"]`, не `["already", "success"]`.
PASS после Task 1: claim ловит race, loser получает clean AlreadyOnboardedError.
  </action>
  <verify>
    <automated>cd /Users/exy/pet_projects/tg-budget-planner && pytest tests/test_onboarding_concurrent.py -v</automated>
  </verify>
  <done>Оба теста (concurrent + sequential repeat) PASS; pytest exit 0.</done>
</task>

</tasks>

<verification>
Phase-level acceptance:
1. `pytest tests/test_onboarding_concurrent.py -v` → 2 passed.
2. `pytest tests/test_onboarding.py tests/test_onboarding_existing_user_safety.py` → no regress.
3. `grep -q 'UPDATE app_user' app/services/onboarding.py` → exit 0.
4. `grep -q 'RETURNING onboarded_at' app/services/onboarding.py` → exit 0.
</verification>

<success_criteria>
CON-01 закрыт:
- asyncio.gather двух complete_onboarding → ровно один success + один AlreadyOnboardedError.
- user.cycle_start_day от winner'а, не от loser'а.
- IntegrityError от UniqueConstraint(user_id, period_start) НЕ всплывает наружу — claim ловит race раньше.
- Existing single-flow тесты (test_complete_creates_period_and_seeds_categories) PASS.
</success_criteria>

<output>
After completion, create `.planning/phases/16-security-ai-hardening/16-06-SUMMARY.md`
</output>

## Commit Message
fix(16): CON-01 atomic UPDATE-WHERE claim in complete_onboarding + asyncio.gather race regression
