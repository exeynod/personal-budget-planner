---
plan_id: 16-03-ai-01-amount-positive
phase: 16
plan: 03
type: execute
wave: 1
depends_on: []
requirements: [AI-01]
files_modified:
  - app/ai/tools.py
  - tests/ai/test_tools_amount_validation.py
autonomous: true
must_haves:
  truths:
    - "`propose_actual_transaction(amount_rub=-1)` возвращает `{'error': 'Сумма должна быть > 0'}` БЕЗ поля `_proposal: True`"
    - "`propose_actual_transaction(amount_rub=0)` возвращает `{'error': 'Сумма должна быть > 0'}`"
    - "`propose_planned_transaction(amount_rub=-100.5)` возвращает `{'error': 'Сумма должна быть > 0'}`"
    - "`propose_planned_transaction(amount_rub=0.001)` валиден (округлится до 0 → отвергается тоже, проверить семантику)"
    - "Положительные суммы (`amount_rub=500`, `amount_rub=0.01`) продолжают работать и создают `_proposal: True` payload"
  artifacts:
    - path: "app/ai/tools.py"
      provides: "Validated propose_*_transaction tools"
      contains: "Сумма должна быть > 0"
    - path: "tests/ai/test_tools_amount_validation.py"
      provides: "Unit-тесты на знак/ноль для обоих proposal-tools"
      exports: []
  key_links:
    - from: "app/ai/tools.py::propose_actual_transaction"
      to: "if amount_cents <= 0: return {'error': ...}"
      via: "пост-парсинг проверка"
      pattern: "if amount_cents <= 0"
---

<objective>
Закрыть AI-01 (HIGH data integrity): proposal-tools `propose_actual_transaction` и `propose_planned_transaction` в `app/ai/tools.py` НЕ валидируют знак/ноль `amount_rub`. LLM может (по prompt-injection или ошибочно) вернуть `amount_rub: -500`, frontend получает ProposalPayload с `amount_cents: -50000`, пользователь подтверждает — баланс корраптится.

Purpose: Fix data integrity boundary для финансовых tool-outputs. Минимальный диф (D-16-04): добавить `if amount_cents <= 0: return {"error": "Сумма должна быть > 0"}` СРАЗУ после парсинга `int(round(float(amount_rub) * 100))` в обеих функциях.

Output: Backend-валидация в обеих proposal-функциях + unit-тесты для (-1, 0, -0.5, 0.001 boundary). UI-mirror-валидация — out-of-scope (CONTEXT deferred).
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

@app/ai/tools.py
@tests/ai/test_tools.py
@tests/conftest.py

<interfaces>
<!-- Current vulnerable code from app/ai/tools.py:376-470 -->
```python
async def propose_actual_transaction(
    db: AsyncSession, *, user_id: int, amount_rub: float,
    kind: str = "expense", description: str = "", tx_date: str | None = None,
    **_ignored: Any,
) -> dict[str, Any]:
    try:
        amount_cents = int(round(float(amount_rub) * 100))
    except (TypeError, ValueError):
        return {"error": "Не удалось распознать сумму"}
    # NO sign check — НЕ ДОЛЖНО БЫТЬ так.
    ...
    return {"_proposal": True, "kind_of": "actual", "txn": {...}}
```

Same shape in propose_planned_transaction (line 446+).
</interfaces>
</context>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| LLM tool-call → propose_*_transaction → frontend ProposalPayload → user-confirmed POST /actual | LLM-controllable amount_rub crosses into financial side-effect path. Pydantic schemas validate POST input but tool-OUTPUT is bypass-path. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-16-03-01 | Tampering | propose_actual_transaction (app/ai/tools.py:376-443) | mitigate | Per D-16-04: `if amount_cents <= 0: return {"error": "Сумма должна быть > 0"}` сразу после try/except парсинга. Возврат без `_proposal: True` гарантирует, что route не эмитит SSE-propose event → bottom-sheet не открывается → POST /actual не вызывается. |
| T-16-03-02 | Tampering | propose_planned_transaction (app/ai/tools.py:446-494) | mitigate | Идентичная проверка. |
| T-16-03-03 | Defense-in-depth | Frontend mirror-validation в ActualEditor/PlanItemEditor | accept | Out-of-scope (CONTEXT deferred). UI уже имеет `amountCents > 0` гард в `canSubmit` — но ловит проблему позже backend tool-output. Backlog. |
| T-16-03-04 | Tampering | POST /actual / POST /planned Pydantic schemas | accept | Уже валидируют (Pydantic `gt=0`). Это последняя линия обороны; AI-01 закрывает PRE-confirm path, не replace. |
</threat_model>

<tasks>

<task type="auto">
  <name>Task 1: Validate amount_rub > 0 в обеих proposal-функциях</name>
  <files>app/ai/tools.py</files>
  <action>
Per D-16-04: добавить strict positive-check после try/except парсинга `amount_cents`.

Точные шаги:

1. В `app/ai/tools.py`, в функции `propose_actual_transaction` (def на строке 376):
   - После строк 397-400:
   ```python
   try:
       amount_cents = int(round(float(amount_rub) * 100))
   except (TypeError, ValueError):
       return {"error": "Не удалось распознать сумму"}
   ```
   - Добавить НА СЛЕДУЮЩЕЙ СТРОКЕ (после try/except):
   ```python
   if amount_cents <= 0:
       return {"error": "Сумма должна быть > 0"}
   ```

2. В функции `propose_planned_transaction` (def на строке 446):
   - После строк 460-463 (try/except для amount_cents) — идентичный блок:
   ```python
   if amount_cents <= 0:
       return {"error": "Сумма должна быть > 0"}
   ```

3. НЕ менять docstring; НЕ менять остальные ветки функций. Семантика возврата для error-формы уже определена (`{"error": "..."}`); LLM получит через tool-result + сможет переспросить пользователя.

4. Семантика edge-кейса `amount_rub=0.001`: `int(round(0.001 * 100))` = `int(round(0.1))` = `0` → попадает в `amount_cents <= 0` → отвергается. Корректно.

5. Семантика `amount_rub="abc"`: уже отвергается через `try/except (TypeError, ValueError)` — не трогаем.
  </action>
  <verify>
    <automated>grep -c 'if amount_cents <= 0' app/ai/tools.py | grep -E "^2$" && grep -c 'Сумма должна быть > 0' app/ai/tools.py | grep -E "^2$"</automated>
  </verify>
  <done>В обеих функциях (propose_actual_transaction + propose_planned_transaction) присутствует positive-check; grep возвращает ровно 2 совпадения.</done>
</task>

<task type="auto">
  <name>Task 2: Pytest unit-тест на знак/ноль для proposal-tools</name>
  <files>tests/ai/test_tools_amount_validation.py</files>
  <action>
Создать `tests/ai/test_tools_amount_validation.py` с тестами для negative / zero / round-down-to-zero / valid amounts на обеих функциях.

Точный код:
```python
"""AI-01 regression: propose_*_transaction must reject amount_rub <= 0.

This test FAILs against pre-fix code (no sign check, returns _proposal: True
with negative amount_cents).
PASSes after Plan 16-03 (positive-check raises {"error": ...}).
"""
from __future__ import annotations

import pytest


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "amount_rub",
    [-1, -100, -100.5, 0, 0.0, 0.001, 0.004],  # 0.001 → round to 0 cents → reject
)
async def test_propose_actual_transaction_rejects_non_positive(
    db_session, app_user_one, amount_rub
):
    """Negative, zero, and round-down-to-zero amounts return {"error": ...}."""
    from app.ai.tools import propose_actual_transaction

    result = await propose_actual_transaction(
        db_session,
        user_id=app_user_one.id,
        amount_rub=amount_rub,
        kind="expense",
        description="adversarial",
    )
    assert "error" in result, f"Expected error for amount_rub={amount_rub!r}, got {result!r}"
    assert "_proposal" not in result, (
        f"Negative amount must NOT yield _proposal: True; got {result!r}"
    )
    assert result["error"] == "Сумма должна быть > 0", (
        f"Expected canonical error msg; got {result['error']!r}"
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("amount_rub", [-1, -100, -100.5, 0, 0.0, 0.001, 0.004])
async def test_propose_planned_transaction_rejects_non_positive(
    db_session, app_user_one, amount_rub
):
    """Mirror check on planned-proposal tool."""
    from app.ai.tools import propose_planned_transaction

    result = await propose_planned_transaction(
        db_session,
        user_id=app_user_one.id,
        amount_rub=amount_rub,
        kind="expense",
        description="adversarial",
    )
    assert "error" in result, f"Expected error for amount_rub={amount_rub!r}, got {result!r}"
    assert "_proposal" not in result
    assert result["error"] == "Сумма должна быть > 0"


@pytest.mark.asyncio
async def test_propose_actual_transaction_accepts_one_kopek(db_session, app_user_one):
    """Smallest positive amount (1 kopek = 0.01 rub) MUST pass."""
    from app.ai.tools import propose_actual_transaction

    result = await propose_actual_transaction(
        db_session,
        user_id=app_user_one.id,
        amount_rub=0.01,
        kind="expense",
        description="coffee",
    )
    assert result.get("_proposal") is True
    assert result["txn"]["amount_cents"] == 1


@pytest.mark.asyncio
async def test_propose_planned_transaction_accepts_typical_amount(
    db_session, app_user_one
):
    """Typical 500 rub → 50000 cents."""
    from app.ai.tools import propose_planned_transaction

    result = await propose_planned_transaction(
        db_session,
        user_id=app_user_one.id,
        amount_rub=500,
        kind="expense",
        description="абонемент",
    )
    assert result.get("_proposal") is True
    assert result["txn"]["amount_cents"] == 50000


@pytest.mark.asyncio
async def test_propose_actual_transaction_unparseable_returns_error(
    db_session, app_user_one
):
    """Non-numeric input keeps the existing 'не распознать' error path."""
    from app.ai.tools import propose_actual_transaction

    result = await propose_actual_transaction(
        db_session,
        user_id=app_user_one.id,
        amount_rub="not-a-number",  # type: ignore[arg-type]
        kind="expense",
        description="garbage",
    )
    assert "error" in result
    assert "_proposal" not in result
    # Existing code path; we don't change this message.
    assert result["error"] == "Не удалось распознать сумму"
```

Использует fixtures `db_session`, `app_user_one` (типичный паттерн в `tests/ai/test_tools.py` и conftest). Если фикстура `app_user_one` называется иначе (см. tests/conftest.py: возможно `db_user`, `current_user` итп) — заменить под существующий помощник, обеспечивающий объект `AppUser` с `.id`.

Тест FAIL до Task 1: parametrized тесты с negative amounts падают (получают `_proposal: True` + negative amount_cents).
Тест PASS после Task 1: получают `{"error": "Сумма должна быть > 0"}`.
  </action>
  <verify>
    <automated>cd /Users/exy/pet_projects/tg-budget-planner && pytest tests/ai/test_tools_amount_validation.py -v 2>&1 | tail -25</automated>
  </verify>
  <done>pytest tests/ai/test_tools_amount_validation.py возвращает exit 0 с минимум 16 passed (7 actual + 7 planned + 3 happy/edge).</done>
</task>

</tasks>

<verification>
Phase-level acceptance:
1. `pytest tests/ai/test_tools_amount_validation.py -v` → all passed.
2. `grep -c 'if amount_cents <= 0' app/ai/tools.py` → 2.
3. `grep -c 'Сумма должна быть > 0' app/ai/tools.py` → 2.
4. Existing `tests/ai/test_tools.py` smoke (`pytest tests/ai/test_tools.py`) → PASS (negative regress на ранее работавшие позитивные пути).
</verification>

<success_criteria>
AI-01 закрыт:
- Negative и zero amount_rub возвращают `{"error": "Сумма должна быть > 0"}` без `_proposal: True`.
- 0.001 rub → 0 cents → также reject (data-integrity invariant).
- Positive amounts (включая 0.01 rub) продолжают работать.
- Тест-suite зелёный.
</success_criteria>

<output>
After completion, create `.planning/phases/16-security-ai-hardening/16-03-SUMMARY.md`
</output>

## Commit Message
fix(16): AI-01 reject non-positive amount_rub in propose_*_transaction + pytest regression
