# Deferred Items — Phase 16

## Pre-existing failures encountered during execution (not in scope)

### tests/test_admin_cap_endpoint.py::test_member_forbidden_403
- **Discovered during:** Plan 16-07 execution (CON-02 spend-cap lock).
- **Status:** Failing on `master` (pre-existing — verified by stashing 16-07 changes and re-running).
- **Symptom:** Member calling `PATCH /api/v1/admin/users/{owner_id}/cap` returns 200, expected 403.
- **Root cause (suspected):** `PATCH /admin/users/{id}/cap` is missing `Depends(require_owner)`
  at the route level — relies only on `get_current_user`. Member is allowed through.
- **Why deferred:** Out of scope for Plan 16-07 (CON-02 is concurrency, not RBAC). Should be
  filed as a new HIGH finding for Phase 17 (admin RBAC sweep) — not part of the
  Phase 16 hotfix bundle.
