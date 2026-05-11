"""ЮKassa Self-Employed API client. See https://yookassa.ru/developers/api ."""
from __future__ import annotations
import os
from dataclasses import dataclass
from typing import Optional
import httpx


@dataclass
class YookassaPaymentResult:
    payment_id: str
    confirmation_url: str
    status: str


@dataclass
class YookassaPaymentStatus:
    payment_id: str
    status: str  # pending / waiting_for_capture / succeeded / canceled
    amount_cents: int
    paid_at: Optional[str] = None  # ISO timestamp string from ЮKassa


@dataclass
class YookassaRefundResult:
    refund_id: str
    status: str


class YookassaClient:
    """Thin async wrapper around ЮKassa v3 REST API."""

    def __init__(
        self,
        shop_id: Optional[str] = None,
        secret_key: Optional[str] = None,
        base_url: str = "https://api.yookassa.ru/v3",
        client: Optional[httpx.AsyncClient] = None,
    ) -> None:
        self.shop_id = shop_id or os.environ.get("YOOKASSA_SHOP_ID", "")
        self.secret_key = secret_key or os.environ.get("YOOKASSA_SECRET_KEY", "")
        self.base_url = base_url
        self._client = client  # injection point for tests

    def _http(self) -> httpx.AsyncClient:
        return self._client or httpx.AsyncClient(
            auth=(self.shop_id, self.secret_key),
            base_url=self.base_url,
            timeout=15.0,
        )

    async def create_payment(
        self,
        amount_cents: int,
        description: str,
        return_url: str,
        idempotency_key: str,
        save_payment_method: bool = False,
    ) -> YookassaPaymentResult:
        amount_rub = amount_cents / 100
        payload = {
            "amount": {"value": f"{amount_rub:.2f}", "currency": "RUB"},
            "confirmation": {"type": "redirect", "return_url": return_url},
            "capture": True,
            "description": description,
            "save_payment_method": save_payment_method,
        }
        async with self._http() as h:
            r = await h.post("/payments", json=payload, headers={"Idempotence-Key": idempotency_key})
            r.raise_for_status()
            data = r.json()
        return YookassaPaymentResult(
            payment_id=data["id"],
            confirmation_url=data["confirmation"]["confirmation_url"],
            status=data["status"],
        )

    async def get_payment(self, payment_id: str) -> YookassaPaymentStatus:
        async with self._http() as h:
            r = await h.get(f"/payments/{payment_id}")
            r.raise_for_status()
            data = r.json()
        amount_cents = int(round(float(data["amount"]["value"]) * 100))
        return YookassaPaymentStatus(
            payment_id=data["id"],
            status=data["status"],
            amount_cents=amount_cents,
            paid_at=data.get("captured_at"),
        )

    async def refund(self, payment_id: str, amount_cents: int, idempotency_key: str) -> YookassaRefundResult:
        amount_rub = amount_cents / 100
        payload = {
            "amount": {"value": f"{amount_rub:.2f}", "currency": "RUB"},
            "payment_id": payment_id,
        }
        async with self._http() as h:
            r = await h.post("/refunds", json=payload, headers={"Idempotence-Key": idempotency_key})
            r.raise_for_status()
            data = r.json()
        return YookassaRefundResult(refund_id=data["id"], status=data["status"])
