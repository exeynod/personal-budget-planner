# Plan 38-01 Summary

**Commit:** `c802043`
**Date:** 2026-05-11
**REQ:** REQ-38-01

## What landed

`landing/index.html` — 274 LOC single-file landing page с Maximal Poster
palette (coral / cobalt / cream / ink); hero + 3 features + pricing card
(Free / Pro 299 ₽) + FAQ (5 вопросов) + footer (legal links).

## Result

Готовая статика для deploy через Caddy fileserver или GitHub Pages.
Mobile-first (responsive media-queries <420px), inline CSS — никаких
внешних зависимостей. CTA deeplink `t.me/<bot>?start=ref_landing` —
placeholder для замены реальным username при first deploy.

## Tests delta

Нет — статичный HTML без runtime. Manual Lighthouse audit перед deploy.

## Deferred

- Explainer GIF/video 30-60s (REQ-38-02 content) — content TODO.
- Lighthouse audit + Real-User-Metrics — после первого deploy.
