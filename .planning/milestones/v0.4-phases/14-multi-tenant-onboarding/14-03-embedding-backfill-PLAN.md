---
phase: 14-multi-tenant-onboarding
plan: 03
type: execute
wave: 1
depends_on: [01]
files_modified:
  - app/services/ai_embedding_backfill.py
  - app/ai/embedding_service.py
  - app/services/onboarding.py
autonomous: true
requirements: [MTONB-02, MTONB-03]
must_haves:
  truths:
    - "After complete_onboarding for a member with seed_default_categories=True, exactly 14 rows in `category_embedding` exist scoped to that user_id (when OpenAI provider is healthy)."
    - "When OpenAI provider raises (e.g. RuntimeError, network error), complete_onboarding still succeeds; category_embedding count is 0; structured WARNING log emitted."
    - "EmbeddingService gains an `embed_texts(list[str]) -> list[list[float]]` batch method that issues a single LLM call (or fans out internally if provider lacks batch)."
    - "backfill_user_embeddings is idempotent: re-running for the same user does NOT duplicate rows or overwrite existing embeddings."
  artifacts:
    - path: "app/services/ai_embedding_backfill.py"
      provides: "backfill_user_embeddings(db, *, user_id) -> int helper"
      min_lines: 60
      contains: "async def backfill_user_embeddings"
    - path: "app/ai/embedding_service.py"
      provides: "EmbeddingService.embed_texts batch helper"
      contains: "async def embed_texts"
    - path: "app/services/onboarding.py"
      provides: "complete_onboarding step 5 — embedding backfill"
      contains: "backfill_user_embeddings"
  key_links:
    - from: "app/services/onboarding.py:complete_onboarding"
      to: "app/services/ai_embedding_backfill.py:backfill_user_embeddings"
      via: "await call after seed_default_categories"
      pattern: "await backfill_user_embeddings"
    - from: "app/services/ai_embedding_backfill.py"
      to: "app/ai/embedding_service.py:EmbeddingService.embed_texts"
      via: "batch embedding call (single OpenAI request for 14 names)"
      pattern: "await embedding_svc.embed_texts"
---

<objective>
Implement seed-category embedding backfill (MTONB-02 / MTONB-03 / D-14-03). New service helper `backfill_user_embeddings` generates a single batch OpenAI request for all of a user's categories without embeddings, persists 14 `CategoryEmbedding` rows, and is wired into `complete_onboarding` as step 5.

Purpose: When a member finishes onboarding, the very first `/ai/suggest-category` request must work — no cold-start latency. 14 categories × 1 batch call ≈ 200-400ms inside the onboarding response. Failure of OpenAI is non-fatal: onboarding still succeeds; backfill returns 0.
Output: 1 new module + 1 new method on EmbeddingService + 1 new step in `complete_onboarding`. Plan 14-01 RED tests for embedding backfill turn GREEN.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/14-multi-tenant-onboarding/14-CONTEXT.md
@.planning/phases/10-ai-categorization
@./CLAUDE.md

<interfaces>
From `app/ai/embedding_service.py`:
```python
EMBEDDING_DIM = 1536  # text-embedding-3-small

class EmbeddingService:
    async def embed_text(self, text: str) -> list[float]: ...   # single call, with LRU cache
    async def upsert_category_embedding(
        self, db: AsyncSession, category_id: int, vector: list[float],
        *, user_id: int,
    ) -> None: ...

def augment_category_name_for_embedding(name: str) -> str: ...  # adds synonym pack

def get_embedding_service() -> EmbeddingService: ...  # @lru_cache(maxsize=1) singleton
```

From `app/ai/llm_client.py`:
```python
class AbstractLLMClient(ABC):
    @abstractmethod
    async def embed(self, text: str) -> list[float]: ...
```
Note: current `embed` is single-string. OpenAI `text-embedding-3-small` accepts batch input — `embed_texts` will iterate the existing single-string `embed` for now (sequential `await`s are fine for 14 items, ~1-2s walltime; provider-batch optimisation is a follow-up if needed and is NOT part of this plan).

From `app/services/categories.py:SEED_CATEGORIES`:
14 tuples of (name, kind, sort_order). After `seed_default_categories(db, user_id=user.id)` returns 14 Category rows.

From `app/services/onboarding.py:complete_onboarding` (current 4 steps):
```python
async def complete_onboarding(
    db: AsyncSession, *,
    tg_user_id: int, starting_balance_cents: int,
    cycle_start_day: int, seed_default_categories: bool,
) -> dict[str, Any]:
    # 1. Resolve user / 409 if already onboarded
    # 2. Optional seed default categories
    # 3. Create first period
    # 4. Set onboarded_at + cycle_start_day
    # NEW step 5 (this plan): backfill embeddings (try/except, log on failure)
    return {"period_id": int, "seeded_categories": int, "onboarded_at": iso-str}
```

From `app/db/models.py:CategoryEmbedding`:
PK = `category_id` (FK CASCADE to category.id); columns include `user_id`, `embedding Vector(1536)`, `updated_at`.

From `tests/test_embedding_backfill.py` (created in 14-01) — 6 tests; all expect:
- Module: `app.services.ai_embedding_backfill`
- Function: `async def backfill_user_embeddings(db, *, user_id) -> int`
- Helper called: `embedding_svc.embed_texts([...])` returns `list[list[float]]`.
- Exception swallowing (returns 0, no propagation).
- Tenant scoping (only categories with matching user_id).
- Skip categories that already have a CategoryEmbedding row.
- Skip archived categories.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add embed_texts batch helper to EmbeddingService</name>
  <files>app/ai/embedding_service.py</files>
  <read_first>
    - app/ai/embedding_service.py (full file — note `embed_text` LRU cache + dependency on `_llm_client.embed`)
    - app/ai/llm_client.py (full — abstract contract + factory)
  </read_first>
  <behavior>
    `EmbeddingService.embed_texts(texts: list[str]) -> list[list[float]]`:
    - Returns vectors in input order; same length as input.
    - For each text, prefer LRU cache (same key normalisation as `embed_text`: `key = text.strip().lower()`).
    - Cache misses are fetched from `_llm_client.embed` sequentially (provider-level batching is a future opt; sequential is fine for 14 items, ~200ms each ≈ 3s worst case, plus a single empty cache).
    - Empty input list returns `[]` immediately without calling provider.
    - Strings whose `key == ""` (whitespace-only) bypass cache and call `_llm_client.embed(original_text)` directly.
  </behavior>
  <action>
    Add as a new method on `EmbeddingService` immediately after `embed_text`:

    ```python
    async def embed_texts(self, texts: list[str]) -> list[list[float]]:
        """Batch wrapper around embed_text — preserves LRU caching per item.

        Phase 14 (MTONB-03): callers like backfill_user_embeddings issue 14
        embeddings at once. Routing each through embed_text means duplicate
        names within the batch (or repeated batches over time) hit the
        in-process LRU cache instead of the LLM provider.

        For Phase 14 the implementation is a sequential loop of self.embed_text;
        switching to a true provider-side batch API (single HTTPS request) is
        a future optimisation that does not change the public contract.

        Args:
            texts: list of input strings, may be empty.
        Returns:
            list[list[float]] of length len(texts), each vector EMBEDDING_DIM.
        """
        if not texts:
            return []
        vectors: list[list[float]] = []
        for t in texts:
            vectors.append(await self.embed_text(t))
        return vectors
    ```

    Update the module docstring (top of file) — after the existing Phase 11 paragraph, add:
    ```
    Phase 14 (MTONB-03): EmbeddingService.embed_texts wraps embed_text for
    batch usage from backfill_user_embeddings without breaking the LRU
    cache semantics (per-text key, same normalisation).
    ```
  </action>
  <verify>
    <automated>
    grep -c "async def embed_texts" app/ai/embedding_service.py | grep -q "^1$" &amp;&amp; \
    python -c "from app.ai.embedding_service import EmbeddingService; assert hasattr(EmbeddingService, 'embed_texts')"
    </automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "async def embed_texts" app/ai/embedding_service.py` == 1.
    - `python -c "from app.ai.embedding_service import EmbeddingService; assert callable(EmbeddingService.embed_texts)"` exits 0.
    - Existing `pytest tests/test_categories.py -x` passes (no signature break to `embed_text`).
  </acceptance_criteria>
  <done>EmbeddingService gains embed_texts batch helper.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Implement backfill_user_embeddings helper</name>
  <files>app/services/ai_embedding_backfill.py</files>
  <read_first>
    - app/ai/embedding_service.py (full — note new embed_texts; `augment_category_name_for_embedding`; `upsert_category_embedding`)
    - app/db/models.py (search for `class Category` and `class CategoryEmbedding` — note FK / PK relationships)
    - app/services/categories.py (lines 60-95 — pattern for `select(Category).where(Category.user_id == user_id)` filter)
    - tests/test_embedding_backfill.py (full — drives every behaviour)
  </read_first>
  <behavior>
    GREEN target for the 6 RED tests in `tests/test_embedding_backfill.py`:
    1. Creates embeddings for all of a user's active categories without an existing row → returns count.
    2. Skips categories that already have a CategoryEmbedding row (LEFT JOIN check).
    3. Skips archived categories.
    4. Empty result set → returns 0, no LLM call.
    5. Provider exception is swallowed; returns 0; structured warning logged.
    6. Strict tenant scoping: queries filter by `Category.user_id == user_id`.
  </behavior>
  <action>
    Create `app/services/ai_embedding_backfill.py`:

    ```python
    """Embedding backfill helper (Phase 14 MTONB-03, D-14-03).

    Generates `category_embedding` rows for all of a user's active categories
    that don't yet have one. Used by:
      (a) app/services/onboarding.py:complete_onboarding — inline async,
          5th atomic step (new in Phase 14).
      (b) Future on-demand fallback in app/api/routes/ai_suggest.py if
          a category lacks an embedding when first queried (deferred).

    Failure mode: any exception from EmbeddingService.embed_texts is logged
    at WARNING and swallowed — caller receives 0. This keeps onboarding
    success rate at 100% even when OpenAI is degraded; the AI-suggest path
    will fallback to on-demand or surface "no suggestion" gracefully.
    """
    from __future__ import annotations

    import structlog
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.ai.embedding_service import (
        augment_category_name_for_embedding,
        get_embedding_service,
    )
    from app.db.models import Category, CategoryEmbedding

    logger = structlog.get_logger(__name__)


    async def backfill_user_embeddings(
        db: AsyncSession,
        *,
        user_id: int,
    ) -> int:
        """Generate missing embeddings for a single user's active categories.

        Args:
            db: AsyncSession (caller-managed transaction; this helper does
                NOT commit — onboarding wraps everything in one atomic txn).
            user_id: app_user.id PK; queries scope all reads/writes to it.

        Returns:
            Count of CategoryEmbedding rows actually created (0..N).
            On provider failure returns 0 without raising.
        """
        # 1. Find this user's active categories that lack an embedding.
        #    LEFT JOIN approach via outerjoin → filter where ce.category_id IS NULL.
        stmt = (
            select(Category.id, Category.name)
            .outerjoin(
                CategoryEmbedding,
                CategoryEmbedding.category_id == Category.id,
            )
            .where(
                Category.user_id == user_id,
                Category.is_archived.is_(False),
                CategoryEmbedding.category_id.is_(None),
            )
            .order_by(Category.id)
        )
        result = await db.execute(stmt)
        rows: list[tuple[int, str]] = list(result.all())

        if not rows:
            logger.info(
                "embedding_backfill.skip_empty",
                user_id=user_id,
            )
            return 0

        category_ids = [cid for cid, _ in rows]
        # 2. Augment names with synonym packs to lift cosine recall on short
        #    Russian probes (Phase 10.1 pattern); same as create_category +
        #    update_category background tasks.
        embed_inputs = [augment_category_name_for_embedding(name) for _, name in rows]

        embedding_svc = get_embedding_service()
        try:
            vectors = await embedding_svc.embed_texts(embed_inputs)
        except Exception as exc:
            logger.warning(
                "embedding_backfill.provider_failed",
                user_id=user_id,
                category_count=len(category_ids),
                error=str(exc),
            )
            return 0

        # 3. Upsert each embedding (single transaction, caller commits).
        for category_id, vector in zip(category_ids, vectors, strict=True):
            await embedding_svc.upsert_category_embedding(
                db,
                category_id=category_id,
                vector=vector,
                user_id=user_id,
            )

        logger.info(
            "embedding_backfill.completed",
            user_id=user_id,
            count=len(category_ids),
        )
        return len(category_ids)
    ```

    **Verification step:**
    - Run RED tests: `pytest tests/test_embedding_backfill.py -x` → 6/6 GREEN.
    - If any test fails on the LEFT JOIN behaviour, double-check `outerjoin` direction (Category as base, CategoryEmbedding as outer) and the filter `CategoryEmbedding.category_id.is_(None)`.
    - The tenant-scope test (case 6) might require ensuring `await embedding_svc.upsert_category_embedding(..., user_id=user_id)` passes the **caller's** `user_id` and NOT a stale value from the row.
  </action>
  <verify>
    <automated>
    pytest tests/test_embedding_backfill.py -x --no-header 2>&1 | tail -5 | grep -E "(6 passed|passed.*6)" &amp;&amp; \
    grep -c "async def backfill_user_embeddings" app/services/ai_embedding_backfill.py | grep -q "^1$"
    </automated>
  </verify>
  <acceptance_criteria>
    - `app/services/ai_embedding_backfill.py` exists and exports `backfill_user_embeddings`.
    - `grep -c "outerjoin" app/services/ai_embedding_backfill.py` ≥ 1 (LEFT JOIN approach).
    - `grep -c "is_archived.is_(False)" app/services/ai_embedding_backfill.py` ≥ 1.
    - `grep -c "Category.user_id == user_id" app/services/ai_embedding_backfill.py` ≥ 1.
    - `grep -c "except Exception" app/services/ai_embedding_backfill.py` ≥ 1 (graceful fallback).
    - `pytest tests/test_embedding_backfill.py -x` → exit code 0, 6 passed.
  </acceptance_criteria>
  <done>backfill_user_embeddings exported; all 6 RED tests from 14-01 turn GREEN.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Wire backfill_user_embeddings into complete_onboarding as step 5</name>
  <files>app/services/onboarding.py, tests/test_onboarding.py</files>
  <read_first>
    - app/services/onboarding.py (full file — atomic 4-step structure to extend)
    - app/services/ai_embedding_backfill.py (just-created — confirm signature)
    - tests/test_onboarding.py (lines 1-100 — pattern for adding a new test)
    - app/core/settings.py (search for `ENABLE_AI_CATEGORIZATION` — used as feature flag in categories.py:create_category)
  </read_first>
  <behavior>
    After this task:
    - `complete_onboarding(db, ..., seed_default_categories=True)` for a user with no categories: 14 categories seeded + 14 CategoryEmbedding rows created (when AI categorization enabled and provider healthy).
    - `complete_onboarding(db, ..., seed_default_categories=False)`: no categories created, no embeddings created (skip backfill entirely).
    - When `settings.ENABLE_AI_CATEGORIZATION=False`: onboarding still completes, embeddings step is skipped entirely (mirror Phase 10.1 pattern in `categories.py:create_category`).
    - When OpenAI provider raises: onboarding still returns success; structured warning logged; embeddings count = 0.
    - One new integration test (`test_complete_onboarding_creates_seed_embeddings`) confirms the 14 rows; one (`test_complete_onboarding_swallows_embedding_failure`) confirms graceful failure.
  </behavior>
  <action>
    **Part 1 — Modify `app/services/onboarding.py`:**

    Add after the existing imports:
    ```python
    from app.core.settings import settings
    from app.services.ai_embedding_backfill import backfill_user_embeddings
    ```

    In `complete_onboarding`, insert step 5 between current step 4 (`user.onboarded_at = now()`) and the `return` statement. Step 5 MUST run AFTER `db.flush()` in step 4 so the categories are visible to the embedding query, and BEFORE the response dict is built.

    ```python
    # 5. Phase 14 MTONB-03: backfill embeddings for the 14 seed categories so
    #    the very first /ai/suggest-category call has hot indices. Wrapped in
    #    try/except by backfill_user_embeddings — provider failure logs WARN
    #    and returns 0 without rolling back onboarding.
    embeddings_created = 0
    if seed_default_categories and settings.ENABLE_AI_CATEGORIZATION:
        embeddings_created = await backfill_user_embeddings(db, user_id=user_pk)

    return {
        "period_id": period.id,
        "seeded_categories": len(seeded),
        "onboarded_at": user.onboarded_at.isoformat(),
        "embeddings_created": embeddings_created,
    }
    ```

    Update the module docstring (top of file) to bump from "four steps" to "five steps":
    ```
    Performs five steps atomically (all-or-nothing via the request-scoped DB
    transaction held by ``get_db``):

      1. Verify user not already onboarded (``AlreadyOnboardedError`` → 409).
      2. Optionally seed default categories (idempotent inside service).
      3. Create the first budget period using ``period_for(today_msk, cycle_start_day)``.
      4. Set ``user.cycle_start_day`` + ``user.onboarded_at = now()``.
      5. Phase 14 (MTONB-03): backfill seed-category embeddings for AI suggest
         cold-start. Wrapped in try/except — provider failure does NOT roll
         back onboarding (returns embeddings_created=0).
    ```

    **Part 2 — Verify `OnboardingCompleteResponse` schema:**

    Read `app/api/schemas/onboarding.py`. The response model currently has `period_id: int, seeded_categories: int, onboarded_at: str`. The route does `OnboardingCompleteResponse(**result)` (`app/api/routes/onboarding.py:75`). Adding a new key to `result` dict (`embeddings_created`) without adding the field to `OnboardingCompleteResponse` will be silently dropped by Pydantic — that's acceptable. Decision: keep the new key in the dict, but ALSO add `embeddings_created: int = 0` to `OnboardingCompleteResponse` for visibility (matches frontend `OnboardingCompleteResponse` which can simply ignore the field). If the schema file is small (likely <30 LOC), add the optional field with default 0; if changing the schema risks frontend type drift, leave the field off the schema (Python dict keeps the data, route silently drops it).

    Concrete decision: ADD `embeddings_created: int = 0` to `OnboardingCompleteResponse` in `app/api/schemas/onboarding.py`. This is a backward-compatible additive change — frontend types in `frontend/src/api/types.ts:OnboardingCompleteResponse` can ignore extra fields without TypeScript complaints (TS is structural; the response object still satisfies the existing interface).

    **Part 3 — Add 2 integration tests to `tests/test_onboarding.py`:**

    Append after the last existing test:

    ```python
    # ---------------------------------------------------------------
    # Phase 14 MTONB-03: embedding backfill during onboarding
    # ---------------------------------------------------------------

    async def test_complete_onboarding_creates_seed_embeddings(
        db_client, auth_headers, monkeypatch,
    ):
        """seed_default_categories=True + AI on → 14 embeddings created."""
        from unittest.mock import AsyncMock
        from app.ai.embedding_service import EMBEDDING_DIM, get_embedding_service
        from sqlalchemy import select, func
        from app.db.models import CategoryEmbedding

        # Force AI categorization on (default true, but be explicit).
        from app.core.settings import settings
        monkeypatch.setattr(settings, "ENABLE_AI_CATEGORIZATION", True)

        # Mock provider so no real OpenAI call.
        get_embedding_service.cache_clear()
        svc = get_embedding_service()
        monkeypatch.setattr(
            svc,
            "embed_texts",
            AsyncMock(side_effect=lambda texts: [[0.0] * EMBEDDING_DIM for _ in texts]),
        )

        async_client, SessionLocal = db_client
        resp = await async_client.post(
            "/api/v1/onboarding/complete",
            headers=auth_headers,
            json={
                "starting_balance_cents": 100_00,
                "cycle_start_day": 5,
                "seed_default_categories": True,
            },
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["seeded_categories"] == 14
        assert body["embeddings_created"] == 14

        async with SessionLocal() as session:
            count = await session.scalar(
                select(func.count()).select_from(CategoryEmbedding)
            )
            assert count == 14, f"expected 14 embeddings, got {count}"


    async def test_complete_onboarding_swallows_embedding_failure(
        db_client, auth_headers, monkeypatch,
    ):
        """Provider raises → onboarding succeeds; embeddings_created=0."""
        from unittest.mock import AsyncMock
        from app.ai.embedding_service import get_embedding_service
        from sqlalchemy import select, func
        from app.db.models import CategoryEmbedding

        from app.core.settings import settings
        monkeypatch.setattr(settings, "ENABLE_AI_CATEGORIZATION", True)

        get_embedding_service.cache_clear()
        svc = get_embedding_service()
        monkeypatch.setattr(
            svc,
            "embed_texts",
            AsyncMock(side_effect=RuntimeError("OpenAI down")),
        )

        async_client, SessionLocal = db_client
        resp = await async_client.post(
            "/api/v1/onboarding/complete",
            headers=auth_headers,
            json={
                "starting_balance_cents": 0,
                "cycle_start_day": 1,
                "seed_default_categories": True,
            },
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["embeddings_created"] == 0

        async with SessionLocal() as session:
            count = await session.scalar(
                select(func.count()).select_from(CategoryEmbedding)
            )
            assert count == 0, f"expected 0 embeddings on failure, got {count}"
    ```

    Note: existing `test_onboarding.py` may need additional fixtures (e.g. `monkeypatch` is already pytest-builtin; available without setup). Verify the existing fixture `db_client` exposes `(async_client, SessionLocal)` — the existing fixture at lines 28-65 returns a yield, you may need to read past line 65 to confirm shape; if it doesn't yield SessionLocal, adjust the test to call `truncate_db()` and use `AsyncSessionLocal` directly.
  </action>
  <verify>
    <automated>
    pytest tests/test_onboarding.py -x --no-header 2>&1 | tail -5 &amp;&amp; \
    grep -c "backfill_user_embeddings" app/services/onboarding.py | grep -q "^[1-9]$" &amp;&amp; \
    grep -c "embeddings_created" app/services/onboarding.py | grep -q "^[1-9]$"
    </automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "from app.services.ai_embedding_backfill import backfill_user_embeddings" app/services/onboarding.py` == 1.
    - `grep -c "embeddings_created" app/services/onboarding.py` ≥ 2 (assignment + return key).
    - `grep -c "ENABLE_AI_CATEGORIZATION" app/services/onboarding.py` == 1.
    - `app/api/schemas/onboarding.py:OnboardingCompleteResponse` has `embeddings_created: int = 0`.
    - `pytest tests/test_onboarding.py -x` — all existing + 2 new tests pass.
    - `pytest tests/test_embedding_backfill.py -x` — still 6/6 GREEN (no regression).
  </acceptance_criteria>
  <done>complete_onboarding extended to 5 steps; failure-graceful; AI-flag-respecting; new integration tests prove both paths.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries
| Boundary | Description |
|----------|-------------|
| api → OpenAI (text-embedding-3-small) | Outbound HTTPS for 14 vectors during onboarding response. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-14-03-01 | Denial of service | Onboarding response blocks ~1-3s on OpenAI batch | accept | Onboarding is a one-time per-user event; 1-3s is acceptable budget. Graceful fallback if provider down. |
| T-14-03-02 | Information disclosure | Category names sent to OpenAI | accept | Names are seeded defaults ("Продукты", "Транспорт", …) — no PII. User-renamed categories follow the existing background-task path in `categories.py:create_category`. |
| T-14-03-03 | Tampering | Cross-tenant embedding write (user A's call writes user B's embedding row) | mitigate | `backfill_user_embeddings` queries `Category.user_id == user_id` AND passes the same `user_id` to `upsert_category_embedding`. Phase 11 RLS is the backstop. |
| T-14-03-04 | Repudiation / debug | Silent provider failure leaves user without embeddings indefinitely | mitigate | Structured WARN log with `user_id` + `category_count` lets ops detect; future plan can add `/admin/users/{id}/backfill-embeddings` retry endpoint (deferred). |
</threat_model>

<verification>
- `pytest tests/test_embedding_backfill.py -x` → 6/6 GREEN.
- `pytest tests/test_onboarding.py -x` → all existing + 2 new GREEN.
- `pytest tests/test_categories.py -x` → no regression (`embed_text` still working through new `embed_texts`).
- `grep -c "5\\." app/services/onboarding.py | head -1` ≥ 1 (docstring updated).
- Manual smoke (optional, defer to 14-06): observe structured log `embedding_backfill.completed user_id=... count=14` after onboarding member.
</verification>

<success_criteria>
- New module `app/services/ai_embedding_backfill.py` with `backfill_user_embeddings` function.
- `EmbeddingService.embed_texts` batch helper available.
- `complete_onboarding` invokes embeddings step 5 only when `seed_default_categories=True` AND `settings.ENABLE_AI_CATEGORIZATION=True`.
- Onboarding succeeds even if OpenAI fails; `embeddings_created=0` in response.
- `OnboardingCompleteResponse` schema gains optional `embeddings_created: int = 0`.
- All 14-01 RED tests for embedding backfill turn GREEN.
- 0 regressions in pre-existing test suite.
</success_criteria>

<output>
After completion, create `.planning/phases/14-multi-tenant-onboarding/14-03-SUMMARY.md`.
</output>
