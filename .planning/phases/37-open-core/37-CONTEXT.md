# Phase 37: Open-Core Split + GitHub Public Repo — Context

**Gathered:** 2026-05-11
**Status:** Complete (legal + docs only; physical repo split is manual)
**Mode:** Auto-generated (autonomous run, scoped legal + docs preparation).

## Phase Boundary

This phase delivers ONLY the legal + documentation foundation for the
open-core split, per PRODUCT-STRATEGY Q3 = c (PolyForm Shield 1.0.0):

- `LICENSE` (PolyForm Shield 1.0.0 canonical text).
- `LICENSE-CLOSED-COMPONENTS.md` — explicit "all rights reserved" list of
  proprietary directories (Maximal Poster, iOS, AI services, billing).
- `OPEN-CORE-MANIFEST.md` — public vs closed inventory with strategic
  rationale.
- `README.md` — public-facing landing, replacing internal README.
- `CONTRIBUTING.md` — contributor guide + DCO sign-off + PolyForm Shield
  licensing terms.

Physical repository split into separate `tg-budget-planner` (public) +
`tg-budget-planner-pro` (private submodule) is a **manual user action**
and is NOT executed here. Same applies to CI, demo bot, GitHub repo
creation, и `.gitignore` audit for the public mirror.

## Implementation Decisions

- **PolyForm Shield 1.0.0** chosen over MIT/Apache (per PRODUCT-STRATEGY
  Q3=c): noncompete clause blocks competing SaaS clones, while still
  permitting personal/family/org self-hosting + acquisition funnel
  benefits (Habr longread, GitHub stars).
- **Public-facing README** is bilingual-ready (RU primary, EN deferred к
  Phase 44 v1.2 English MVP). Avoids commitments к features outside
  open-core scope.
- **README backup**: no pre-existing `README.md` found, so no
  `README-INTERNAL.md` backup created.
- **CONTRIBUTING.md** lists open-core scope explicitly and rejects PRs
  to closed components (AI / iOS / Maximal Poster).

## Deferred (manual / v1.2+)

- Physical repo split into public + private repos.
- GitHub repo creation + Issue/PR templates + CODEOWNERS.
- `.gitignore` audit для public mirror (excluding closed-source paths).
- CHANGELOG.md generation from git history.
- README badges + demo GIF.
- EN translation (Phase 44).
- Demo TG-бот with public schema (REQ-37-05).
- CI on public repo (REQ-37-04).
- Build-time conditional imports / private submodule wiring (REQ-37-02
  physical split part).
- Maximal Poster `tokens.json` schema-only public version (REQ-37-06).

## Commits

1. `3fc4e8e` — feat(37-01): PolyForm Shield license + open-core manifest (REQ-37-01, REQ-37-02)
2. `4806f4d` — docs(37-02): public README + CONTRIBUTING (REQ-37-03)
