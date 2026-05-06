---
status: human_needed
phase: 10-ai-categorization
verified_at: 2026-05-06
---

# Phase 10: AI Categorization — Verification

## Automated Checks

| Check | Status | Notes |
|-------|--------|-------|
| TypeScript (tsc --noEmit) | PASS | No type errors |
| Vite build | PASS | Bundle clean (335 kB JS, 64 kB CSS) |
| pytest tests/ai/ (unit, no DB) | PASS | 20 passed, 0 failures |
| pytest tests/ (all, no Docker) | PARTIAL | 168 passed; DB-dependent tests skipped (connection refused without docker-compose — expected) |

### Pytest Details

- `tests/ai/test_categorization.py` — AI embeddings logic: 20 unit tests PASS
- `tests/ai/test_tools.py::test_get_period_balance_returns_dict` — requires `db_session` fixture (DB), skipped without docker-compose (expected)
- Other DB-dependent integration tests (test_subscriptions, test_settings) — connection refused without docker-compose (expected)

## Requirements Coverage

| ID | Requirement | Status | Evidence |
|----|-------------|--------|----------|
| AICAT-01 | Debounce 500ms → suggest-category endpoint | PASS | `useAiCategorize` hook in `ActualEditor.tsx` with 500ms debounce via `useEffect` + `setTimeout` |
| AICAT-02 | confidence >= 0.5 → AI-suggestion box | PASS | `ActualEditor` renders `AiSuggestionBox` component when `aiSuggestion && aiSuggestion.confidence >= 0.5` |
| AICAT-03 | confidence < 0.5 → normal select | PASS | `ActualEditor` falls back to standard category select when confidence below threshold |
| AICAT-04 | category_embedding table + HNSW index | PASS | Migration 0004 creates `category_embedding` table; `CategoryEmbedding` ORM model; HNSW cosine index |
| AICAT-05 | enable_ai_categorization toggle | PASS | Migration 0005 adds column to `app_user`; PATCH /settings accepts field; `SettingsScreen.tsx` toggle |
| AICAT-06 | HNSW index for cosine search | PASS | `CREATE INDEX ... USING hnsw (embedding vector_cosine_ops)` in migration 0004 |
| SET-03 | Settings toggle in UI | PASS | `SettingsScreen.tsx` renders Toggle for `enable_ai_categorization` |

## Human Verification Items

**Status: human_needed** — requires live environment with `OPENAI_API_KEY` and running docker-compose stack.

### Steps to verify in live environment

1. Open ActualEditor (new transaction form), type a description of ≥3 characters (e.g., "кофе") — verify AI suggestion box appears after ~500ms with category name and confidence bar in purple (#a78bfa)
2. Verify confidence bar renders proportionally (e.g., 80% confidence → 80% fill width)
3. Click «Сменить» button in the AI suggestion box — verify standard category dropdown appears instead
4. Open Settings screen, toggle "AI категоризация" off — verify suggestion box stops appearing in ActualEditor
5. Rename a category (PATCH /api/v1/categories/{id}) — verify embedding regeneration is triggered in background (check API logs for embedding task)
6. Verify `GET /api/v1/ai/suggest-category?q=<text>` returns `{category_id, name, confidence}` when confidence >= 0.5, or `{category_id: null}` when below threshold

## Notes

- TypeScript and Vite build verified locally without Docker (no env vars needed for type checking)
- AI unit tests (20) run without DB or OpenAI API key (mocked/skipped in tests)
- Full integration test (embedding API call) requires OPENAI_API_KEY in environment
