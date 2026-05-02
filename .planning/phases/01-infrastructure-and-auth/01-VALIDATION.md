---
phase: 1
slug: infrastructure-and-auth
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-01
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 8.4.2 + pytest-asyncio 1.2.0 |
| **Config file** | `pyproject.toml [tool.pytest.ini_options]` — Wave 0 installs |
| **Quick run command** | `uv run pytest tests/ -x -q` |
| **Full suite command** | `uv run pytest tests/ -v` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `uv run pytest tests/test_auth.py tests/test_health.py -x -q`
- **After every plan wave:** Run `uv run pytest tests/ -v`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 1-auth-01 | auth | 1 | AUTH-01 | T-replay | HMAC compare_digest, auth_date ≤ 24h | unit | `uv run pytest tests/test_auth.py::test_valid_init_data -x` | ❌ W0 | ⬜ pending |
| 1-auth-02 | auth | 1 | AUTH-01 | T-invalid | Invalid HMAC → 403 | unit | `uv run pytest tests/test_auth.py::test_invalid_init_data -x` | ❌ W0 | ⬜ pending |
| 1-auth-03 | auth | 1 | AUTH-02 | T-whitelist | Non-OWNER tg_user_id → 403 | unit | `uv run pytest tests/test_auth.py::test_owner_whitelist -x` | ❌ W0 | ⬜ pending |
| 1-inf-04 | internal | 1 | INF-04 | T-internal | /internal/* without token → 403 | integration | `uv run pytest tests/test_internal_auth.py -x` | ❌ W0 | ⬜ pending |
| 1-inf-05a | health | 2 | INF-05 | — | N/A | integration | `uv run pytest tests/test_health.py -x` | ❌ W0 | ⬜ pending |
| 1-inf-02 | migrations | 2 | INF-02 | — | N/A | integration | `uv run pytest tests/test_migrations.py -x` | ❌ W0 | ⬜ pending |
| 1-inf-01 | compose | 2 | INF-01 | — | N/A | smoke (manual) | `docker compose up -d && docker compose ps` | manual | ⬜ pending |
| 1-inf-03 | caddy | 2 | INF-03 | — | N/A | smoke (manual/VPS) | ручная проверка на VPS | manual | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/__init__.py` — пакет тестов
- [ ] `tests/conftest.py` — async_client fixture, test DB setup (SQLite для unit-тестов)
- [ ] `tests/test_auth.py` — AUTH-01, AUTH-02 (unit, без БД)
- [ ] `tests/test_health.py` — INF-05 (с running app через httpx AsyncClient)
- [ ] `tests/test_internal_auth.py` — INF-04
- [ ] `tests/test_migrations.py` — INF-02 (проверка таблиц после alembic upgrade head)
- [ ] `pyproject.toml [tool.pytest.ini_options]` — pytest config
- [ ] Framework install: `uv add --dev pytest pytest-asyncio httpx`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Caddy раздаёт SPA + `/api/*` проксируется | INF-03 | Требует реального TLS + DNS на VPS | `curl https://PUBLIC_DOMAIN/healthz` → 200; `curl https://PUBLIC_DOMAIN/` → HTML |
| docker-compose up поднимает все 5 контейнеров | INF-01 | Требует docker daemon + реальных env | `docker compose up -d && docker compose ps` — все `healthy` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
