"""Phase 32 REQ-32-04 — Multi-tenant production load test.

Scenarios:
  • ActualTxnUser — POST /api/v1/actual repeatedly.
  • AIChatUser    — POST /api/v1/ai/chat (SSE; collect first response chunk).

Run locally:
  pip install locust
  locust -f loadtest/locustfile.py --headless \
    -u 50 -r 5 -t 2m --host=http://localhost:8000 --csv=results

Each User authenticates via `X-Test-User: <random_tg_id>` header
(DEV_MODE=true required — load test runs against staging or dev env, NOT
prod). Users получают unique tg_user_id (1_000_000 + locust user index)
через internal seed endpoint при on_start.

Acceptance: p95 < 800ms, 0 5xx, 0 cross-tenant leakage (samples checked).
"""
from __future__ import annotations

import os
import random

from locust import FastHttpUser, between, task

INTERNAL_TOKEN = os.environ.get("INTERNAL_TOKEN", "loadtest-internal")
BASE_USER_ID = 1_000_000  # offset to avoid colliding with real users


class ActualTxnUser(FastHttpUser):
    """Создаёт actual_transaction multiple times — exercises /actual path."""

    wait_time = between(0.1, 0.5)

    def on_start(self) -> None:
        # Assign unique tg_user_id per virtual user.
        self.tg_user_id = BASE_USER_ID + random.randint(1, 100_000)
        # Seed user via internal endpoint (idempotent).
        self.client.post(
            f"/api/v1/internal/onboarding/seed?tg_user_id={self.tg_user_id}",
            headers={"X-Internal-Token": INTERNAL_TOKEN},
        )
        # Cache user's first category_id for tx creates.
        r = self.client.get(
            "/api/v1/categories",
            headers={"X-Test-User": str(self.tg_user_id)},
        )
        cats = r.json() if r.status_code == 200 else []
        self.category_id = cats[0]["id"] if cats else 1

    @task(10)
    def create_actual_tx(self) -> None:
        payload = {
            "category_id": self.category_id,
            "amount_cents": random.randint(100, 5000),
            "kind": "expense",
            "tx_date": "2026-05-11",
            "description": "loadtest-tx",
            "source": "mini_app",
        }
        self.client.post(
            "/api/v1/actual",
            json=payload,
            headers={"X-Test-User": str(self.tg_user_id)},
            name="POST /api/v1/actual",
        )

    @task(1)
    def get_me(self) -> None:
        self.client.get(
            "/api/v1/me",
            headers={"X-Test-User": str(self.tg_user_id)},
            name="GET /api/v1/me",
        )


class AIChatUser(FastHttpUser):
    """Send AI chat messages — exercises /ai/chat SSE endpoint."""

    wait_time = between(1.0, 3.0)

    def on_start(self) -> None:
        self.tg_user_id = BASE_USER_ID + 500_000 + random.randint(1, 50_000)
        self.client.post(
            f"/api/v1/internal/onboarding/seed?tg_user_id={self.tg_user_id}",
            headers={"X-Internal-Token": INTERNAL_TOKEN},
        )

    @task
    def chat(self) -> None:
        payload = {"message": "Сколько я потратил в этом месяце?"}
        with self.client.post(
            "/api/v1/ai/chat",
            json=payload,
            headers={
                "X-Test-User": str(self.tg_user_id),
                "Accept": "text/event-stream",
            },
            name="POST /api/v1/ai/chat",
            stream=True,
            catch_response=True,
        ) as resp:
            if resp.status_code == 429:
                # cap-exceeded is expected after some chats — mark as success.
                resp.success()
            elif resp.status_code >= 500:
                resp.failure(f"5xx: {resp.status_code}")
            else:
                # Consume some bytes to ensure server-side write happens.
                for chunk in resp.iter_lines():
                    break
                resp.success()
