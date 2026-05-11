# Plan 37-01 Summary

**Commit:** `3fc4e8e`
**Status:** Done
**Date:** 2026-05-11

## What changed

- Added `LICENSE` (PolyForm Shield 1.0.0 canonical text, ~60 lines).
- Added `LICENSE-CLOSED-COMPONENTS.md` — explicit proprietary paths list.
- Added `OPEN-CORE-MANIFEST.md` — strategic split + public/private
  inventory with Pro-tier rationale.

## REQ coverage

- **REQ-37-01** — `LICENSE` shipped (PolyForm Shield 1.0.0).
- **REQ-37-02** (legal subset) — closed-components list + manifest
  shipped; physical submodule/compile-flag split deferred to manual.

## Files

- `LICENSE` (root)
- `LICENSE-CLOSED-COMPONENTS.md` (root)
- `OPEN-CORE-MANIFEST.md` (root)

## Notes

PolyForm Shield 1.0.0 chosen for noncompete clause — blocks competing
SaaS clones while permitting self-hosted personal/family/org use.
NOTICE.md / LICENSING.md (DCO-specific files from REQ-37-01 wording)
folded into CONTRIBUTING.md (37-02) for simplicity.
