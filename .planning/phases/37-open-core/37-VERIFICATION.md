---
status: passed
verified: 2026-05-11
phase: 37-open-core
---

# Phase 37 Verification

## Requirements

- [x] REQ-37-01 — PolyForm Shield 1.0.0 license — `LICENSE` file.
- [x] REQ-37-02 — Closed components manifest — `LICENSE-CLOSED-COMPONENTS.md` + `OPEN-CORE-MANIFEST.md`.
- [x] REQ-37-03 — Public README + CONTRIBUTING — `README.md` + `CONTRIBUTING.md` (no pre-existing README.md → no internal backup needed).

## Manual follow-ups

- **GitHub repo creation** — push к public github.com/<user>/tg-budget-planner.
- **Repo settings:** enable Discussions, set up Issue templates (bug / feature / question).
- **.gitignore audit** — убедись что closed-source paths (`frontend/src/screensV10/`, `ios/`, `app/services/ai_*.py`, `app/services/yookassa_*.py`, `app/services/tier.py`, `app/api/routes/billing.py`, `app/api/routes/ai*.py`) включены в `.gitignore` if pushing к public mirror.
- **CHANGELOG.md** — извлечь из git history + RETROSPECTIVE.md.
- **Docs landing page** — README → tg-budget-planner.ru landing (Phase 38).

## Known gaps (manual / v1.2)

- Physical split к 2 separate репам (public + private) — manual operation.
- Issue templates + PR template + CODEOWNERS — пока скелет в CONTRIBUTING.md.
- README badges + demo GIF — content TODO.
- README EN translation — Phase 44 (v1.2 English MVP).
- REQ-37-04 CI (pytest + alembic + LICENSE check) — deferred к manual repo-split task.
- REQ-37-05 demo TG-бот — deferred к Phase 38.
- REQ-37-06 Maximal Poster `tokens.json` schema-only public version — deferred к manual repo-split.

## Commits (2 total)

1. `3fc4e8e` — feat(37-01): PolyForm Shield license + open-core manifest (REQ-37-01, REQ-37-02)
2. `4806f4d` — docs(37-02): public README + CONTRIBUTING (REQ-37-03)
