"""Service layer: async business logic, DB-aware, framework-agnostic.

Each service module owns one domain and exports async functions that take
an AsyncSession as the first argument. Services are reusable from FastAPI
routes (Plan 02-04) and from worker jobs (Phase 5/6).
"""
