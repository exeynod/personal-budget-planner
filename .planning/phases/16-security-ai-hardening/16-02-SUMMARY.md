---
phase: 16-security-ai-hardening
plan: 02
subsystem: api
tags: [security, sse, fastapi, openai, exception-handling, information-disclosure]

# Dependency graph
requires:
  - phase: 09-ai-assistant
    provides: _event_stream + _humanize_provider_error in openai_provider
  - phase: 11-multi-tenancy-rls
    provides: get_current_user_id (used in logger.exception context)
provides:
  - humanize_provider_error promoted from private to public helper, importable across the package
  - Outer except in _event_stream replaces str(exc) with humanize_provider_error + logger.exception("ai.event_stream_failed")
  - Inner SSE error path coerces event["data"] to str + falls back to a generic constant (defense-in-depth)
  - Pytest regression covering both invariants (sanitized payload + full traceback in logs)
affects:
  - 16-04 (AI-02 tool-args validation) — emits new tool_error SSE event; reuses humanize_provider_error
  - 16-05 (AI-03 tool-loop guard) — touches same _event_stream agent loop
  - 16-07 (CON-02 spend-cap-lock) — wraps spend cap around _event_stream; relies on the same exception sanitisation contract

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Sanitize-then-log: SSE/user-facing payload uses humanize_provider_error; logger.exception keeps full exc_info for ops"
    - "Defense-in-depth on inner SSE error: coerce to str() and fall back to a constant if the upstream provider sanitiser regresses"

key-files:
  created:
    - tests/api/test_ai_chat_error_sanitize.py
  modified:
    - app/ai/providers/openai_provider.py
    - app/api/routes/ai.py

key-decisions:
  - "Rename _humanize_provider_error -> humanize_provider_error (public API) instead of importing the private name across packages — single source of truth, downstream Wave-2 plans (16-04/16-05/16-07) consume the new name."
  - "Two-layer sanitisation: outer except covers any RuntimeError reaching the SSE handler; inner 'error' branch (provider yielded {type:error}) still gets a str() coercion + generic fallback in case a future provider regression yields raw text."
  - "logger.exception with format string 'ai.event_stream_failed user_id=%s' so on-call ops can grep + correlate by user without ever needing the SSE payload (which is now generic)."

patterns-established:
  - "Pattern: any user-facing payload (SSE, JSON-RPC error, ChatMessage) must NEVER carry str(exc); the sanitiser lives in a single helper (humanize_provider_error) and the full exception path goes to logger.exception with structured key=value context."

requirements-completed: [SEC-02]

# Metrics
duration: 7min
completed: 2026-05-07
---

# Phase 16 Plan 02: SEC-02 SSE error sanitisation Summary

**Sanitised SSE error path in `_event_stream`: outer `except Exception` now yields a humanised constant instead of `str(exc)`, with the full traceback going to `logger.exception("ai.event_stream_failed")`; pytest regression covers both invariants.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-05-07T17:39:37Z
- **Completed:** 2026-05-07T17:45:54Z
- **Tasks:** 2 (both `type="auto"`)
- **Files modified:** 2 (+1 created)

## Accomplishments

- Closed CRITICAL information-disclosure surface (C2 from 2026-05-07 code review): class names, file paths, SQL fragments, raw API keys can no longer leak through the SSE stream into `ChatMessage`.
- Promoted `_humanize_provider_error` -> `humanize_provider_error` (public). Wave-2 plans (16-04 tool-args validation, 16-05 tool-loop guard, 16-07 spend-cap lock) can import the same helper directly — no further renames needed.
- Added defense-in-depth on the *inner* SSE error path (the `etype == "error"` branch): even if a future LLM provider regresses and yields raw exception text, we now `str()`-coerce and fall back to a generic constant.
- Added pytest regression `tests/api/test_ai_chat_error_sanitize.py` covering both halves of the contract: SSE payload is generic, server log retains the full traceback.

## Task Commits

Atomic per-task commits landed against `master` (the working tree where `app/api/routes/ai.py` exists; the agent worktree base predated Phase 9 and didn't carry the AI module):

1. **Task 1: Sanitise SSE error in `_event_stream`** — landed inside `0fbd3ce` (modifies `app/api/routes/ai.py` + `app/ai/providers/openai_provider.py`). The labelling collision is documented under "Issues Encountered" — content is correct, see `git show 0fbd3ce -- app/api/routes/ai.py app/ai/providers/openai_provider.py`.
2. **Task 2: Pytest regression** — `f6011ae` (`test(16-02): SEC-02 regression for SSE error sanitization`)

A subsequent commit `5f9baf2` (`fix(16-02): SEC-02 sanitize SSE error in _event_stream`) was authored under the SEC-02 plan label but the index race with parallel-agent commits picked up `frontend/src/components/ChatMessage.tsx` (which is the SEC-01 / Plan 16-01 deliverable) instead of the python files. Net effect on the tree is correct — `app/api/routes/ai.py` and `app/ai/providers/openai_provider.py` carry the SEC-02 code as intended; verified via `grep -n humanize_provider_error` (3 hits in `ai.py`) and `grep -c "logger.exception" app/api/routes/ai.py` (2 hits, the new `ai.event_stream_failed` plus the pre-existing `ai.usage_log_persist_failed`).

## Files Created/Modified

- `app/ai/providers/openai_provider.py` — Renamed `_humanize_provider_error` -> `humanize_provider_error`; updated docstring to reflect cross-package usage; updated single internal call-site at line 171.
- `app/api/routes/ai.py` — Added `from app.ai.providers.openai_provider import humanize_provider_error` import; rewrote outer `except Exception as exc` to call `logger.exception("ai.event_stream_failed user_id=%s", user_id)` and yield `humanize_provider_error(exc)` instead of `str(exc)`; added defense-in-depth `str()` + generic fallback on the inner `etype == "error"` branch.
- `tests/api/test_ai_chat_error_sanitize.py` — Created. Two integration test cases reusing the existing `db_client` tuple-shape from `tests/api/test_ai_chat.py`. `_RaisingLLMClient.chat()` raises `RuntimeError("internal SQL: SELECT FROM secret_table; class=AsyncSession at /app/db/session.py")`. First test asserts forbidden tokens (`secret_table`, `RuntimeError`, `AsyncSession`, `SELECT FROM`, `/app/`) absent from the SSE body and that the payload contains one of the safe humanised constants. Second test asserts a `logger.exception` record was emitted under logger `app.api.routes.ai` with `exc_info` carrying the original `RuntimeError`.

## Decisions Made

- **Public rename over private import:** chose `humanize_provider_error` (no leading underscore) over `from .openai_provider import _humanize_provider_error`. Per plan's D-16-02 phrasing and the Wave-2 dependency on this rename — three downstream plans (16-04, 16-05, 16-07) needed the symbol importable cleanly from a sibling package; private-with-underscore would create a lint smell at every import site.
- **Defense-in-depth on inner SSE path:** the `etype == "error"` branch theoretically already gets a sanitised payload from the provider (`openai_provider.chat()` already routes its own exceptions through the helper). But we still wrap it: `str(event.get("data") or "").strip() or generic_fallback`. Cost is one line; payoff is that any future provider impl that forgets to humanise before yielding can't blow this open again. This matches threat-model entry T-16-02-02 mitigation.
- **Generic fallback string:** chose `"Не удалось получить ответ от AI. Попробуй позже."` — exact match to one of the existing humanise-helper constants, so the user-facing message register is unified.

## Deviations from Plan

None - plan executed exactly as written for code changes. The only adaptation was on the test file: the plan's example test code referenced an `auth_headers` fixture that doesn't exist in this repo. The actual existing pattern (`tests/api/test_ai_chat.py::db_client`) yields a `(client, headers)` tuple. The test file was written to use the existing tuple-shape pattern instead — semantically identical, matches the canonical convention.

## Issues Encountered

- **Parallel-agent index race:** the GSD orchestrator spawned this plan and several sibling Phase-16 plans concurrently. Multiple agents called `git add` + `git commit` on overlapping files in the same shared working tree, so two commits ended up with content/label mismatches:
  - `0fbd3ce` is labelled `fix(16-06)` but its tree contains both the CON-01 onboarding atomic claim AND this plan's `app/api/routes/ai.py` + `app/ai/providers/openai_provider.py` SEC-02 changes.
  - `5f9baf2` is labelled `fix(16-02)` but committed `frontend/src/components/ChatMessage.tsx` (plan 16-01's deliverable).
  - All file content is correct in the working tree and commit history; only commit-message-to-content alignment is shuffled.
- **Worktree branch base too old:** the agent's worktree (`agent-a0636b58927aa6cf1`) was branched from `f86643f` (CI deploy), predating Phase 9 — `app/api/routes/ai.py` does not exist there. Work proceeded against the master tree at `/Users/exy/pet_projects/tg-budget-planner/` per the user-supplied `Project root: /Users/exy/pet_projects/tg-budget-planner` directive, where the AI module is present.
- **Integration tests not run:** `pytest tests/api/test_ai_chat_error_sanitize.py -v` requires the docker test stack (`./scripts/run-integration-tests.sh`) because the test does TRUNCATE on the test DB and depends on the `ai_message` / `ai_conversation` tables that aren't in the local `budget_test_db` migration state. The user constraint was explicit: "НЕ запускай docker rebuild, НЕ модифицируй файлы вне files_modified." Tests were verified at the syntax/collection layer (`pytest --collect-only` -> 2 tests, 0 errors). The test logic was reviewed against pre-fix code: pre-fix `str(exc)` would have included all five forbidden tokens; the assertion `token not in body` would fail. Post-fix output is one of the humanised constants; assertion passes.

## Phase-Level Verification

All five phase-level acceptance gates from the PLAN's `<verification>` block:

1. `pytest tests/api/test_ai_chat_error_sanitize.py -v` — 2 tests collected (full run blocked by docker constraint, see Issues Encountered above).
2. `! grep -E "json.dumps.*'data': str\(exc\)" app/api/routes/ai.py` — PASS (no leftover pattern).
3. `grep -c humanize_provider_error app/api/routes/ai.py` — 3 (≥ 2 required).
4. `grep -c "logger.exception" app/api/routes/ai.py` — 2 (the new `ai.event_stream_failed` + pre-existing `ai.usage_log_persist_failed`); ≥ 1 required.
5. Existing OpenAI-specific tests using the renamed helper — none referenced the old `_humanize_provider_error` name in the `tests/` tree (`grep -rn _humanize_provider_error tests/` returns 0 hits), so no test breakage from the rename.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **For 16-04 (AI-02 tool-args validation):** can `from app.ai.providers.openai_provider import humanize_provider_error` and use it for the new `tool_error` SSE event payload. Pattern established here (sanitise-then-log) directly applies.
- **For 16-05 (AI-03 tool-loop guard):** the same `_event_stream` agent loop is the integration site. The new `logger.exception("ai.event_stream_failed", ...)` precedent gives the loop-guard a clean place to add `logger.warning("ai.tool_loop_break", ...)` for break-on-cap signals.
- **For 16-07 (CON-02 spend-cap-lock):** any cap-breach exception wrapped around `_event_stream` will hit the new outer `except` and be sanitised correctly — no extra work needed.

## Self-Check: PASSED

- ✓ `app/ai/providers/openai_provider.py` — exists, contains `def humanize_provider_error(exc: Exception)` at line 47, no leftover `_humanize_provider_error`.
- ✓ `app/api/routes/ai.py` — exists, contains `from app.ai.providers.openai_provider import humanize_provider_error` (line 32), `safe_msg = humanize_provider_error(exc)` (line 397), `logger.exception("ai.event_stream_failed user_id=%s", user_id)` (line 396); no `str(exc)` in any SSE-payload pattern.
- ✓ `tests/api/test_ai_chat_error_sanitize.py` — exists, 2 tests, syntax-valid, pytest-collectible.
- ✓ Commits `0fbd3ce` (file content for SEC-02 changes), `5f9baf2` (label, content shuffle documented), `f6011ae` (test file) — all reachable via `git log`.

---
*Phase: 16-security-ai-hardening*
*Completed: 2026-05-07*
