"""CSV export of user transactions for tax-reporting / archival (Phase 36-03, REQ-36-03).

Pro-gated endpoint позволяет самозанятым (Persona E) выгружать факт-транзакции
за период в Excel-совместимый CSV (RFC 4180; UTF-8 with BOM). Денормализует
``category.code``/``category.name``/``category.tag`` чтобы CSV был
self-contained (для последующей фильтрации в Excel/Google Sheets без джойнов).

Schema нюансы:
- ``ActualTransaction.description`` — текстовая заметка (НЕ ``note``).
- ``ActualTransaction.kind`` — :class:`app.db.models.ActualKind` enum
  (``expense`` / ``income`` / ``roundup`` / ``deposit``).
- ``ActualTransaction.source`` — :class:`app.db.models.ActualSource` enum
  (``mini_app`` / ``bot``).
- ``tag`` на transaction — NULL-able override от category.tag.
"""
from __future__ import annotations

import csv
import io
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import ActualTransaction, Category

CSV_HEADERS = [
    "date",
    "category_code",
    "category_name",
    "category_tag",  # personal/business/mixed
    "amount_cents",
    "amount_rub",
    "kind",  # expense/income/roundup/deposit
    "tag",   # personal/business/mixed (per-transaction override; пусто если наследует)
    "note",
    "source",  # mini_app/bot
]


async def export_user_transactions_csv(
    db: AsyncSession,
    user_id: int,
    period_start: date,
    period_end: date,
) -> str:
    """Return CSV string with user's transactions в [period_start, period_end].

    Format: RFC 4180 (excel dialect, LF line-terminator), UTF-8 with BOM
    (Excel ru-RU реквиз корректно распознать UTF-8 без BOM почти не умеет).

    Sort: ``tx_date DESC`` — самые свежие сверху (то же, что в Mini App
    transactions screen, чтобы CSV/UI consistency).

    Empty period → только заголовочная строка (Excel-friendly empty export).
    """
    stmt = (
        select(
            ActualTransaction.tx_date,
            Category.code,
            Category.name,
            Category.tag.label("category_tag"),
            ActualTransaction.amount_cents,
            ActualTransaction.kind,
            ActualTransaction.tag.label("txn_tag"),
            ActualTransaction.description,
            ActualTransaction.source,
        )
        .join(Category, Category.id == ActualTransaction.category_id)
        .where(
            ActualTransaction.user_id == user_id,
            ActualTransaction.tx_date >= period_start,
            ActualTransaction.tx_date <= period_end,
        )
        .order_by(ActualTransaction.tx_date.desc())
    )
    rows = (await db.execute(stmt)).all()

    buf = io.StringIO()
    writer = csv.writer(buf, dialect="excel", lineterminator="\n")
    writer.writerow(CSV_HEADERS)
    for r in rows:
        (
            tx_date,
            code,
            name,
            cat_tag,
            amount_cents,
            kind,
            txn_tag,
            description,
            source,
        ) = r
        amount_rub = f"{(amount_cents or 0) / 100:.2f}"
        # Enum → string (PG enum приходит как str-enum subclass, но guard на
        # случай если SQLAlchemy вернёт raw value).
        kind_str = kind.value if hasattr(kind, "value") else (kind or "")
        source_str = source.value if hasattr(source, "value") else (source or "")
        writer.writerow(
            [
                tx_date.isoformat() if tx_date else "",
                code or "",
                name or "",
                cat_tag or "",
                amount_cents or 0,
                amount_rub,
                kind_str,
                txn_tag or "",
                description or "",
                source_str,
            ]
        )
    # UTF-8 BOM для Excel ru-RU авто-detect кодировки.
    return "﻿" + buf.getvalue()
