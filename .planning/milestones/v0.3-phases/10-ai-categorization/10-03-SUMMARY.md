---
phase: 10-ai-categorization
plan: "03"
subsystem: api
tags: [fastapi, embedding, openai, pgvector, background-tasks, lifespan]

# Dependency graph
requires:
  - phase: 10-ai-categorization-02
    provides: EmbeddingService with upsert_category_embedding() and embed_text()
  - phase: 10-ai-categorization-01
    provides: CategoryEmbedding ORM model, pgvector migration 0004
provides:
  - BackgroundTasks embedding refresh on category name PATCH
  - Startup lifespan init — generates missing category embeddings on API boot
  - Graceful skip when OPENAI_API_KEY=changeme or ENABLE_AI_CATEGORIZATION=False
affects: [api, ai-categorization, suggest-category]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "BackgroundTasks with own AsyncSessionLocal session for post-response async work"
    - "Startup init with graceful AI subsystem skip (try/except with warning log)"

key-files:
  created: []
  modified:
    - app/api/routes/categories.py
    - main_api.py

key-decisions:
  - "_refresh_embedding uses its own AsyncSessionLocal session (not request-scoped DB) to avoid use-after-close issues"
  - "Startup init calls upsert_category_embedding per category — no batch API to avoid partial failures"
  - "OPENAI_API_KEY=changeme check in startup allows DEV_MODE without real API key"

patterns-established:
  - "Background tasks always open their own DB session via AsyncSessionLocal"
  - "AI subsystem failures never block startup — wrapped in try/except with warning"

requirements-completed: [AICAT-04, AICAT-05]

# Metrics
duration: 10min
completed: 2026-05-06
---

# Phase 10 Plan 03: Category hooks + startup init Summary

**BackgroundTasks embedding refresh on category name change + lifespan startup init for missing category embeddings using EmbeddingService**

## Performance

- **Duration:** 10 min
- **Started:** 2026-05-06T00:00:00Z
- **Completed:** 2026-05-06T00:10:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- PATCH /categories/{id} now schedules background embedding refresh when category name changes and ENABLE_AI_CATEGORIZATION=True
- API lifespan generates missing CategoryEmbedding rows at startup for all active categories
- Graceful skip when OPENAI_API_KEY not configured — startup never blocked by AI subsystem

## Task Commits

Each task was committed atomically:

1. **Task 1: BackgroundTasks embedding refresh on PATCH** - `a384655` (feat)
2. **Task 2: Startup lifespan init for missing embeddings** - `8da4647` (feat)

## Files Created/Modified
- `app/api/routes/categories.py` - Added BackgroundTasks param to PATCH, _refresh_embedding() helper with own DB session
- `main_api.py` - Added _init_missing_embeddings() coroutine, called from lifespan before yield

## Decisions Made
- `_refresh_embedding` opens its own `AsyncSessionLocal` session because background tasks run after the request DB session is closed
- Startup init iterates categories one by one (not batch) to handle per-item failures gracefully
- OPENAI_API_KEY `changeme` check added in startup to allow DEV_MODE without real credentials

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Wave 3 complete: embedding hooks and startup init are wired
- AI categorization pipeline fully operational: suggest endpoint (plan 02) + embedding refresh (plan 03) + startup sync (plan 03)
- Ready for plan 04 if it exists (frontend integration or further AI features)

---
*Phase: 10-ai-categorization*
*Completed: 2026-05-06*
