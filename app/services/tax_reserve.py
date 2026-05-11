"""Tax reserve calculator for self-employed (НПД 4-6%).

Phase 36-02 (REQ-36-02). Сервис для Persona E (самозанятые / Self-employed
НПД). Считает рекомендуемый резерв под налог на профессиональный доход
на основе бизнес-тэгированного дохода за период.

Бизнес-доход определяется как ``actual_transaction`` строки, у которых:
- ``kind == 'income'``,
- ``tag == 'business'`` (Phase 36-01 schema, REQ-36-01).

Декомпозиция:
- ``RATE_BY_REGIME``: маппинг enum → ставка (Decimal, без float-ошибок).
- ``round_to_cent``: half-up округление Decimal рублей → integer копейки.
- ``calculate_tax_reserve``: основной async-расчёт по DB.

Деньги хранятся в копейках (BIGINT). Внутри расчёта на короткий промежуток
переключаемся в рубли (Decimal cents / 100) для применения ставки %, затем
обратно в копейки с half-up округлением. Никаких float.

Reserve recommended = ceil(tax_owed * 1.05) — 5% safety margin под колебания
курса/просчёт даты платежа.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from typing import Literal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import ActualKind, ActualTransaction

TaxRate = Literal["nalog_4", "nalog_6"]
RATE_BY_REGIME: dict[TaxRate, Decimal] = {
    "nalog_4": Decimal("0.04"),
    "nalog_6": Decimal("0.06"),
}


@dataclass
class TaxReserveResult:
    """Outcome of one tax-reserve calculation для (user, period, regime)."""

    period_start: date
    period_end: date
    income_cents: int
    business_income_cents: int
    regime: TaxRate
    tax_owed_cents: int
    reserve_recommended_cents: int


def round_to_cent(d: Decimal) -> int:
    """Round Decimal RUB → integer cents using HALF_UP.

    HALF_UP — стандартный bankers' rounding для tax-расчётов в РФ
    (99.995 → 100.00, не 99.99 как в HALF_EVEN).
    """
    return int((d * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


async def calculate_tax_reserve(
    db: AsyncSession,
    user_id: int,
    period_start: date,
    period_end: date,
    regime: TaxRate = "nalog_4",
) -> TaxReserveResult:
    """Calculate tax reserve for НПД (Налог на профессиональный доход).

    - ``nalog_4``: 4% (доход от физлиц — default).
    - ``nalog_6``: 6% (доход от юр.лиц).

    Возвращает total income + business-tagged income + tax owed + recommended
    reserve. ``reserve_recommended = ceil(tax_owed * 1.05)`` — 5% safety
    margin.

    Фильтры по DB:
    - ``user_id`` — application-level tenant scope (RLS — defence-in-depth).
    - ``kind == income`` — игнорируем expense/roundup/deposit строки.
    - ``tx_date BETWEEN period_start AND period_end`` (inclusive обе границы).
    - Для business: дополнительно ``actual_transaction.tag == 'business'``
      (Phase 36-01 override; NULL trasaction.tag не учитываем — для MVP
      достаточно explicit per-txn override; категория-level tag будет
      учтён в follow-up если потребуется).
    """
    # Total income в периоде (все теги).
    stmt_all = select(
        func.coalesce(func.sum(ActualTransaction.amount_cents), 0)
    ).where(
        ActualTransaction.user_id == user_id,
        ActualTransaction.kind == ActualKind.income,
        ActualTransaction.tx_date >= period_start,
        ActualTransaction.tx_date <= period_end,
    )
    total_income_cents = int((await db.execute(stmt_all)).scalar_one())

    # Business-tagged income (explicit per-txn override = 'business').
    stmt_business = select(
        func.coalesce(func.sum(ActualTransaction.amount_cents), 0)
    ).where(
        ActualTransaction.user_id == user_id,
        ActualTransaction.kind == ActualKind.income,
        ActualTransaction.tag == "business",
        ActualTransaction.tx_date >= period_start,
        ActualTransaction.tx_date <= period_end,
    )
    business_income_cents = int(
        (await db.execute(stmt_business)).scalar_one()
    )

    rate = RATE_BY_REGIME[regime]
    # Decimal-арифметика на рублях, чтобы избежать float.
    tax_owed_rub = (Decimal(business_income_cents) / Decimal(100)) * rate
    tax_owed_cents = round_to_cent(tax_owed_rub)
    reserve_cents = round_to_cent(tax_owed_rub * Decimal("1.05"))

    return TaxReserveResult(
        period_start=period_start,
        period_end=period_end,
        income_cents=total_income_cents,
        business_income_cents=business_income_cents,
        regime=regime,
        tax_owed_cents=tax_owed_cents,
        reserve_recommended_cents=reserve_cents,
    )
