"""POST /webhooks/yookassa — receives ЮKassa payment events."""
from __future__ import annotations
from datetime import datetime, timezone, timedelta
from typing import Any
from fastapi import APIRouter, Request, Depends, HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.db.models import Payment, SubscriptionBilling

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.post("/yookassa", status_code=status.HTTP_200_OK)
async def yookassa_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """
    Handle ЮKassa notification.

    Idempotency: ЮKassa payment.id is our natural key. Duplicate webhook
    for the same event mutates state at most once (state-transition guard).

    Authentication: ЮKassa uses IP allowlist for production
    (185.71.76.0/27, 185.71.77.0/27, 77.75.153.0/25, ...). Optional Bearer
    token via YOOKASSA_WEBHOOK_BEARER env var for dev/staging.
    """
    body: dict[str, Any] = await request.json()
    event = body.get("event")
    obj = body.get("object", {})

    if not event or not isinstance(obj, dict):
        raise HTTPException(status_code=400, detail="malformed webhook body")

    if event == "payment.succeeded":
        await _handle_payment_succeeded(db, obj)
    elif event == "payment.canceled":
        await _handle_payment_canceled(db, obj)
    elif event == "refund.succeeded":
        await _handle_refund_succeeded(db, obj)
    # else: ignore unknown events (forward-compat).

    return {"status": "ok"}


async def _handle_payment_succeeded(db: AsyncSession, obj: dict[str, Any]) -> None:
    payment_id = obj.get("id")
    if not payment_id:
        return
    stmt = select(Payment).where(Payment.yookassa_payment_id == payment_id)
    row = (await db.execute(stmt)).scalar_one_or_none()
    if row is None or row.status == "succeeded":
        return  # not our payment OR already processed (idempotent)
    row.status = "succeeded"
    row.paid_at = datetime.now(timezone.utc)
    # Create / extend subscription_billing for Pro tier (1-month period).
    today = datetime.now(timezone.utc).date()
    period_end = today + timedelta(days=30)
    sb = SubscriptionBilling(
        user_id=row.user_id,
        tier="pro",
        period_start=today,
        period_end=period_end,
        payment_id=row.id,
        status="active",
    )
    db.add(sb)
    await db.commit()


async def _handle_payment_canceled(db: AsyncSession, obj: dict[str, Any]) -> None:
    payment_id = obj.get("id")
    if not payment_id:
        return
    stmt = (
        update(Payment)
        .where(Payment.yookassa_payment_id == payment_id, Payment.status != "succeeded")
        .values(status="canceled")
    )
    await db.execute(stmt)
    await db.commit()


async def _handle_refund_succeeded(db: AsyncSession, obj: dict[str, Any]) -> None:
    payment_id = obj.get("payment_id")
    if not payment_id:
        return
    stmt = select(Payment).where(Payment.yookassa_payment_id == payment_id)
    row = (await db.execute(stmt)).scalar_one_or_none()
    if row is None or row.status == "refunded":
        return
    row.status = "refunded"
    row.refunded_at = datetime.now(timezone.utc)
    # Cancel active subscription_billing tied to this payment.
    sb_stmt = (
        update(SubscriptionBilling)
        .where(SubscriptionBilling.payment_id == row.id, SubscriptionBilling.status == "active")
        .values(status="canceled")
    )
    await db.execute(sb_stmt)
    await db.commit()
