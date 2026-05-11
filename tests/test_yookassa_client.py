import pytest
import httpx
from app.services.yookassa_client import YookassaClient, YookassaPaymentResult


@pytest.mark.asyncio
async def test_create_payment_returns_confirmation_url():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "POST"
        assert request.url.path == "/v3/payments"
        assert "Idempotence-Key" in request.headers
        return httpx.Response(
            200,
            json={
                "id": "pmt_test_123",
                "status": "pending",
                "confirmation": {"confirmation_url": "https://yookassa.ru/confirm/pmt_test_123"},
                "amount": {"value": "299.00", "currency": "RUB"},
            },
        )

    transport = httpx.MockTransport(handler)
    client = httpx.AsyncClient(transport=transport, base_url="https://api.yookassa.ru/v3")
    yk = YookassaClient(shop_id="test", secret_key="test", client=client)
    result = await yk.create_payment(
        amount_cents=29900,
        description="Pro subscription",
        return_url="https://tgbudget.app/return",
        idempotency_key="test-key-1",
    )
    assert isinstance(result, YookassaPaymentResult)
    assert result.payment_id == "pmt_test_123"
    assert "confirm/pmt_test_123" in result.confirmation_url
    await client.aclose()


@pytest.mark.asyncio
async def test_get_payment_status():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "GET"
        assert "/v3/payments/pmt_xyz" in str(request.url)
        return httpx.Response(
            200,
            json={
                "id": "pmt_xyz",
                "status": "succeeded",
                "amount": {"value": "299.00", "currency": "RUB"},
                "captured_at": "2026-05-11T10:00:00.000Z",
            },
        )

    transport = httpx.MockTransport(handler)
    client = httpx.AsyncClient(transport=transport, base_url="https://api.yookassa.ru/v3")
    yk = YookassaClient(shop_id="test", secret_key="test", client=client)
    status = await yk.get_payment("pmt_xyz")
    assert status.status == "succeeded"
    assert status.amount_cents == 29900
    assert status.paid_at == "2026-05-11T10:00:00.000Z"
    await client.aclose()


@pytest.mark.asyncio
async def test_refund():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "POST"
        assert request.url.path == "/v3/refunds"
        return httpx.Response(200, json={"id": "rfd_test_1", "status": "succeeded"})

    transport = httpx.MockTransport(handler)
    client = httpx.AsyncClient(transport=transport, base_url="https://api.yookassa.ru/v3")
    yk = YookassaClient(shop_id="test", secret_key="test", client=client)
    result = await yk.refund("pmt_xyz", amount_cents=29900, idempotency_key="rfd-1")
    assert result.refund_id == "rfd_test_1"
    await client.aclose()
