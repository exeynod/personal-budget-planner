# Plan 33-02 — Summary

**Status:** Shipped 2026-05-11
**Requirements:** REQ-33-03, REQ-33-06

## What was built

1. **Legal markdown documents** (Draft v0.1, pending professional legal review):
   - `docs/legal/privacy-policy.ru.md` — 152-ФЗ-compliant privacy policy in Russian (13 sections, ~125 lines)
   - `docs/legal/privacy-policy.en.md` — English translation (parallel structure)
   - `docs/legal/terms.ru.md` — Terms of Service in Russian (9 sections)
   - `docs/legal/terms.en.md` — English translation

   All documents include explicit mention of: OpenAI (EU residency) as sub-processor, 30-day cooling period after deletion, 1-year audit retention, права субъекта ПДн per ст. 14-15 152-ФЗ, контакт DPO (exeynod@gmail.com).

2. **API endpoints `app/api/routes/legal.py`:**
   - `GET /legal/privacy?lang=ru|en` — returns `text/markdown; charset=utf-8`
   - `GET /legal/terms?lang=ru|en` — same
   - Mounted on app level WITHOUT `/api/v1` prefix (publicly accessible)
   - NO auth dependency — privacy policy must be readable BEFORE Telegram auth
   - In-memory cache (per-process); container restart invalidates

3. **Dockerfile update:** `COPY docs/legal/ ./docs/legal/` so the endpoints can find the markdown files at runtime.

4. **main_api.py:** mount `legal_router` after `internal_router`.

5. **Tests `tests/test_legal_endpoints.py`** — 6 tests, all green:
   - `/legal/privacy?lang=ru` 200 + markdown content (152-ФЗ, OpenAI, DPO email, Draft v0.1)
   - `/legal/privacy?lang=en` 200 + markdown
   - Default lang is ru
   - `/legal/terms?lang=ru|en` 200
   - Invalid lang (`?lang=fr`) → 422
   - No auth required

## Verification evidence

- `pytest tests/test_legal_endpoints.py -v` → **6 passed in 0.80s**.

## Decisions / surprises

- **Docker image rebuild required** to bundle `docs/legal/` into the container; first run failed with "Legal doc missing on disk" because the path resolver pointed at a non-existent dir.
- **In-memory cache** is simple and sufficient — full restart on doc update is acceptable for low-frequency policy changes.

## Next plan

Plan 33-03 (consent endpoints + onboarding gate + bot prompt) can now reference `/legal/privacy` in its detail body.
