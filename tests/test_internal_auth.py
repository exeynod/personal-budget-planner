"""INF-04 — ``/api/v1/internal/*`` endpoints require ``X-Internal-Token``.

Wave-0 RED stub. Fails with ModuleNotFoundError until Plan 05 mounts the
internal router behind ``verify_internal_token`` (Pattern 5 in 01-RESEARCH).
"""

import pytest


@pytest.mark.asyncio
async def test_internal_without_token(async_client):
    response = await async_client.get("/api/v1/internal/health")
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_internal_with_wrong_token(async_client):
    response = await async_client.get(
        "/api/v1/internal/health",
        headers={"X-Internal-Token": "wrong_token"},
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_internal_with_valid_token(async_client, internal_token):
    response = await async_client.get(
        "/api/v1/internal/health",
        headers={"X-Internal-Token": internal_token},
    )
    assert response.status_code == 200
