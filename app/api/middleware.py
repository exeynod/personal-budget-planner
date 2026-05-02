"""FastAPI middleware module.

Authentication is implemented via dependencies
(``app/api/dependencies.py``), not middleware, to allow granular application
per router. This module is reserved for future cross-cutting middleware
(e.g. request-id, CORS for dev) and is intentionally empty in Phase 1.
"""
