"""INF-05 — public ``GET /healthz`` returns ``{"status": "ok"}``.

Wave-0 RED stub. Fails with ModuleNotFoundError until Plan 05 wires the
FastAPI ``/healthz`` route on ``app.main_api.app``.
"""

import pytest


@pytest.mark.asyncio
async def test_api_healthz(async_client):
    response = await async_client.get("/healthz")
    assert response.status_code == 200
    data = response.json()
    assert data.get("status") == "ok"
