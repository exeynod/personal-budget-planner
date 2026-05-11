# Plan 37-02 Summary

**Commit:** `4806f4d`
**Status:** Done
**Date:** 2026-05-11

## What changed

- Added `README.md` — public-facing project landing for open-core
  release (~70 lines): feature split (open-core vs Pro), self-hosting
  quickstart, hosted Pro pricing, tech stack, РФ compliance notes.
- Added `CONTRIBUTING.md` — open-core contribution guide with DCO,
  Conventional Commits, pytest requirement, auto-licensing terms.

## REQ coverage

- **REQ-37-03** — public README shipped. Deferred from REQ wording:
  screenshot/GIF, `<3 min docker compose` benchmark, hosted bot URL
  (placeholder used; real URL pending Phase 38).

## Files

- `README.md` (root)
- `CONTRIBUTING.md` (root)

## Notes

No pre-existing `README.md` → no `README-INTERNAL.md` backup was
needed. Project context for internal devs remains in
`CLAUDE.md` + `.planning/PROJECT.md` + `docs/HLD.md`.
