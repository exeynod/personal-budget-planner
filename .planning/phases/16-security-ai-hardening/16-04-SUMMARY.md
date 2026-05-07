---
phase: 16-security-ai-hardening
plan: 04
subsystem: api
tags: [security, ai, pydantic, sse, validation, prompt-injection, openai]

# Dependency graph
requires:
  - phase: 09-ai-assistant
    provides: _event_stream agent loop + TOOLS_SCHEMA + TOOL_FUNCTIONS dispatch
  - phase: 16-security-ai-hardening (Plan 16-02)
    provides: humanize_provider_error (public rename) + sanitize-then-log pattern reused for tool_error payload
provides:
  - app/ai/tool_args.py with Pydantic models for all 6 AI tools (TOOL_ARGS_MODELS mapping)
  - humanize_tool_args_error() helper for sanitized SSE tool_error message
  - _event_stream tool dispatch now Pydantic-validates raw JSON args; bad JSON / mistyped / extra-field cases yield SSE tool_error event + ai.tool_args_invalid logger.warning
  - Synthesized {error: ...} tool-result message-pair preserves OpenAI assistant.tool_calls invariant on recovery
  - frontend AiEventType extended with tool_error + ToolErrorPayload interface
  - useAiConversation handleEvent branches on tool_error → setError(message) without aborting stream
  - tests/api/test_ai_chat_tool_args_validation.py (3 cases: bad JSON, mistyped types, extra field)
affects:
  - 16-05 (AI-03 tool-loop guard) — consumes parsed_kwargs / TOOL_ARGS_MODELS pattern; ai.tool_args_invalid log precedent for ai.tool_loop_break
  - 16-07 (CON-02 spend-cap-lock) — same _event_stream agent loop integration site

# Tech tracking
tech-stack:
  added:
    - pydantic.ValidationError used at API-route boundary (previously only at request-schema layer)
  patterns:
    - "Per-tool Pydantic args model with extra='forbid' + model_dump(exclude_none=True) — strips defaults so tool-fn signatures still own their default values"
    - "Synthetic tool_result feedback to LLM on validation failure — keeps OpenAI message-pair invariant intact when bad args abort tool execution"
    - "Sanitize-then-log on tool_error: humanize_tool_args_error() for client; logger.warning('ai.tool_args_invalid tool=%s err_type=%s err=%s raw_args=%.200s') for ops; raw args truncated to 200 chars to bound LLM-controllable PII"

key-files:
  created:
    - app/ai/tool_args.py
    - tests/api/test_ai_chat_tool_args_validation.py
  modified:
    - app/api/routes/ai.py
    - frontend/src/api/types.ts
    - frontend/src/hooks/useAiConversation.ts

key-decisions:
  - "Separate file app/ai/tool_args.py over inline in tools.py: tools.py is already 700 lines and the args layer has a distinct concern (validation contract per OpenAI function-calling spec) from the tool-fn layer (business logic)."
  - "extra='forbid' on _BaseToolArgs blocks LLM-hallucinated fields (e.g. deprecated category_hint); fail-loud is preferable to silently dropping unknown keys."
  - "Synth tool_result fed back to LLM on validation failure (matching tool_call_id) — without this the next OpenAI turn 400-errors because assistant.tool_calls must have a paired tool message. Preserves graceful recovery: model can still finish with a user-friendly text after seeing {error: ...}."
  - "Re-pop of user_id from raw_kwargs *after* JSON parse and before model_validate — preserves Phase 11 tenant-scope guarantee; the model never receives user_id and the LLM cannot override it via kwargs."
  - "humanize_tool_args_error() returns a tool-name-aware Russian message ('AI попытался вызвать инструмент с некорректными параметрами (X). Переформулируй запрос.') — gives the user agency to retry without exposing exception class names or stack traces (SEC-02 precedent)."

patterns-established:
  - "Pattern: any LLM-emitted JSON crossing into Python kwargs MUST go through a Pydantic model with extra='forbid'; silent fallback (kwargs={}) is forbidden — fail loudly with SSE event + structured warning log."
  - "Pattern: when validation aborts a tool call mid-agent-loop, synthesize a {error: ...} tool_result and append both to the in-DB conversation and the in-memory llm_messages so the next round can recover or finish cleanly."

requirements-completed: [AI-02]

# Metrics
duration: 6min
completed: 2026-05-07
---

# Phase 16 Plan 04: AI-02 tool-args validation Summary

**Pydantic per-tool args validation in `_event_stream` replaces silent `kwargs={}` fallback with a strict gate: bad JSON, mistyped types, and unknown fields all surface a sanitized `tool_error` SSE event + `logger.warning('ai.tool_args_invalid …')`, while a synthesized `{error: …}` tool-result keeps the OpenAI message-pair invariant intact for graceful recovery.**

## Performance

- **Duration:** ~6 min (plan tasks); +~3 min for two integration-test runs (3 new + 10 existing AI tests)
- **Started:** 2026-05-07T17:59:19Z
- **Completed:** 2026-05-07T18:05:01Z
- **Tasks:** 4 (all `type="auto"`)
- **Files modified:** 3 (`app/api/routes/ai.py`, `frontend/src/api/types.ts`, `frontend/src/hooks/useAiConversation.ts`)
- **Files created:** 2 (`app/ai/tool_args.py`, `tests/api/test_ai_chat_tool_args_validation.py`)

## Accomplishments

- Closed AI-02 (HIGH) — every LLM tool-call now passes through a per-tool Pydantic gate; the silent `kwargs = {}` fallback was a soft prompt-injection vector and a debugging blind spot.
- Established the `tool_error` SSE event in the public protocol (frontend types + reducer) — future plans (16-05 tool-loop guard) can reuse the same event for `ai.tool_loop_break` if a UI signal is wanted there.
- Reused the SEC-02 sanitize-then-log pattern: client never sees the raw `ValidationError.errors()` blob; ops still get `err_type=...`, `err=...`, and a 200-char truncated `raw_args=` for audit.
- Synthesized `{error: ...}` tool-result message-pair preserves the OpenAI `assistant.tool_calls` invariant — model can still produce a final assistant message after seeing the validation failure (gracefully recoverable rather than a hard 400 on the next turn).
- 3 new pytest cases (`test_ai_chat_tool_args_validation.py`) cover JSONDecodeError, ValidationError, and extra-field rejection; all 3 PASS in the integration container, 0 regressions on the existing 10 AI tests (`test_ai_chat.py` + `test_ai_chat_error_sanitize.py` + `test_ai_cap_integration.py`).

## Task Commits

Each task committed atomically against `master`:

1. **Task 1: Pydantic ToolArgs models** — `c36f7a8` (`feat(16-04): AI-02 add Pydantic ToolArgs models per tool (D-16-05)`)
2. **Task 2: Validation in _event_stream + tool_error SSE event** — `1679812` (`feat(16-04): AI-02 strict tool-args validation in _event_stream + tool_error SSE event`)
3. **Task 3: Frontend AiEventType + handler** — `5c1f32c` (`feat(16-04): AI-02 frontend tool_error event type + handler`)
4. **Task 4: Pytest regression** — `224ead3` (`test(16-04): AI-02 regression for tool-args validation (3 cases)`)

## Files Created/Modified

- `app/ai/tool_args.py` — **Created.** 6 Pydantic models (`GetPeriodBalanceArgs`, `GetCategorySummaryArgs`, `QueryTransactionsArgs`, `GetForecastArgs`, `ProposeActualArgs`, `ProposePlannedArgs`) extending `_BaseToolArgs` with `extra='forbid'`. `TOOL_ARGS_MODELS` mapping consumed by the dispatcher. `humanize_tool_args_error()` helper.
- `app/api/routes/ai.py` — Added `from pydantic import ValidationError` and `from app.ai.tool_args import TOOL_ARGS_MODELS, humanize_tool_args_error`. Replaced the tool dispatch block (`for tc in tool_calls_this_round:`) — JSON parse + model_validate → on failure, yield `{type: 'tool_error', data: {tool, message}}` SSE, log structured warning, append synthetic `{error: ...}` tool_result to both `conv_svc.append_message` and `llm_messages`, then `continue` to skip tool execution. Tool-fn call now uses `parsed_kwargs` (post-Pydantic, post-`model_dump(exclude_none=True)`).
- `frontend/src/api/types.ts` — Extended `AiEventType` union with `'tool_error'`. Added `ToolErrorPayload` interface (`{tool: string, message: string}`). Extended `AiStreamEvent` discriminated union with `{type: 'tool_error'; data: ToolErrorPayload}`.
- `frontend/src/hooks/useAiConversation.ts` — Added `'tool_error'` branch in `handleEvent` (before existing `'error'` branch): `setError(event.data.message); setToolName(null);`. Stream is NOT aborted — backend feeds the synthetic tool_result and the LLM may still produce a final assistant message in the same SSE round.
- `tests/api/test_ai_chat_tool_args_validation.py` — **Created.** 3 async tests with stub LLM clients (`_LLMClientWithBadJSON`, `_LLMClientWithMistypedArgs`, `_LLMClientWithExtraField`) emitting malformed `tool_call_complete` events. Each test asserts `tool_error` event present + `ai.tool_args_invalid` log record (where applicable). Reuses the existing `db_client` tuple-shape fixture pattern from `tests/api/test_ai_chat_error_sanitize.py`.

## Decisions Made

- **Separate `app/ai/tool_args.py` file over inline in `tools.py`** — `tools.py` is already ~700 lines and the args-validation concern is structurally distinct from tool-fn business logic. Importable from one canonical location for downstream plans (16-05 will reuse the `parsed_kwargs` shape for tool-loop counting).
- **`extra='forbid'`** — chose fail-loud over silent-drop for unknown LLM-hallucinated fields. Cost is one error-path per tool; payoff is detecting LLM regressions early (e.g. if a model starts emitting `category_hint` again).
- **Synth tool_result message-pair on failure** — without this, the next OpenAI turn 400-errors because `assistant.tool_calls` must always be paired with a tool message bearing the matching `tool_call_id`. The `{error: human_msg}` payload is fed to both `conv_svc.append_message` (for history persistence) and `llm_messages` (for the next round). Pattern is now part of the API contract for any future tool-loop break (relevant to 16-05).
- **Re-pop `user_id` from `raw_kwargs` post-JSON-parse, pre-`model_validate`** — preserves Phase 11 tenant-scope guarantee. Even though models don't declare a `user_id` field, an attacker-controllable LLM could try to inject one; popping at the boundary makes the contract explicit and matches existing pre-fix code's intent.
- **`tool_name`-aware Russian message** in `humanize_tool_args_error` — gives the user actionable signal ("AI попытался вызвать инструмент … (X). Переформулируй запрос.") without exposing exception text. Matches SEC-02 register: short, generic, sanitised.

## Deviations from Plan

None — plan executed exactly as written. The plan's example test code referenced an `auth_headers` fixture that doesn't exist in this repo; I used the canonical `db_client` tuple-shape pattern from `tests/api/test_ai_chat_error_sanitize.py` (semantically identical, idiomatic for this codebase). This was already documented in 16-02-SUMMARY.md "Deviations from Plan" — same adaptation, not a new deviation.

A minor copy-edit: my Task-2 inline comment originally read `# ``kwargs = {}`` fallback.` which incidentally matched the plan's `! grep -E "kwargs = \{\}"` acceptance gate. Changed to `# empty-dict fallback` so the gate stays meaningful (otherwise the doc-comment would mask any real regression).

## Issues Encountered

- **Plan verify command grep mismatch (cosmetic):** The plan's Task-2 verify regex `grep -c "TOOL_ARGS_MODELS\["` looks for bracket subscript, but the implemented code uses `TOOL_ARGS_MODELS.get(tool_name)` (matches plan body, not plan verify). The substantive check — that `TOOL_ARGS_MODELS` is referenced in `app/api/routes/ai.py` — passes (`grep -c TOOL_ARGS_MODELS app/api/routes/ai.py` → 2). No code change needed; flagged here so 16-05's planner can notice the same `.get(...)` style if grep-asserting against tool dispatch.
- **Test stack lifecycle:** `./scripts/run-integration-tests.sh` runs `docker compose down --remove-orphans` on EXIT, which torches the running dev stack. After the two test runs (new + regression suite), I ran `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d` to restore the dev environment. Net change to the dev stack: no rebuild (only restart of dev images that existed). Per user constraint "rebuild containers — он сам пересоберёт", the test runner's `--build api` is the only acceptable rebuild path; bot/worker were not rebuilt.

## User Setup Required

None — no external service configuration required.

## Phase-Level Verification

All six phase-level acceptance gates from the PLAN's `<verification>` block:

1. `pytest tests/api/test_ai_chat_tool_args_validation.py -v` — **3 passed** (in-container via `./scripts/run-integration-tests.sh`).
2. `python -c "from app.ai.tool_args import TOOL_ARGS_MODELS; assert len(TOOL_ARGS_MODELS) == 6"` — exit 0 (verified locally with `python3`).
3. `cd frontend && npx tsc --noEmit` — exit 0.
4. `grep -c "TOOL_ARGS_MODELS" app/api/routes/ai.py` — 2 (≥ 1 required).
5. `! grep -E "^\s+kwargs = \{\}" app/api/routes/ai.py` — PASS (silent fallback removed).
6. `pytest tests/api/test_ai_chat.py tests/api/test_ai_chat_error_sanitize.py tests/test_ai_cap_integration.py` — **10 passed, 3 skipped** (the 3 skips are pre-existing DEV_MODE auth tests that skip on this stack; same as Plan 16-02 baseline).

## Threat Surface Scan

All files modified are inside the threat model declared in the PLAN's `<threat_model>` (T-16-04-01..04). No new attack surface introduced — the change *reduces* the existing surface (silent `kwargs={}` → strict validation gate). No `## Threat Flags` needed.

## Next Phase Readiness

- **For Plan 16-05 (AI-03 tool-loop guard):** reuse `parsed_kwargs` (post-Pydantic) for the `(tool_name, frozenset(kwargs.items()))` repeat-detector — types are now normalised by `model_dump(exclude_none=True)` so the frozenset is deterministic across rounds (no LLM-side type drift). The `ai.tool_args_invalid` warning-log precedent is the template for `ai.tool_loop_break`. The `tool_error` SSE event family is reusable for a future `tool_loop_break` event variant if the planner wants a richer UI signal than the plain `error` event.
- **For Plan 16-07 (CON-02 spend-cap-lock):** same `_event_stream` is the integration site; the `parsed_kwargs` flow added here is contained inside the agent loop and won't conflict with a per-user `asyncio.Lock` wrapping `enforce_spending_cap`.
- **No new blockers** for the remaining Phase 16 plans (16-05, 16-07).

## Self-Check: PASSED

- ✓ `app/ai/tool_args.py` — exists, 80 lines, defines 6 model classes + `TOOL_ARGS_MODELS` dict + `humanize_tool_args_error`. `python3 -c "from app.ai.tool_args import TOOL_ARGS_MODELS; print(len(TOOL_ARGS_MODELS))"` → `6`.
- ✓ `app/api/routes/ai.py` — contains `from app.ai.tool_args import TOOL_ARGS_MODELS, humanize_tool_args_error` (line 36), `from pydantic import ValidationError` (line 30), 2 references to `TOOL_ARGS_MODELS`, 2 references to `ai.tool_args_invalid`, 1 reference to `"tool_error"`. No `kwargs = {}` silent fallback.
- ✓ `frontend/src/api/types.ts` — `tool_error` appears 2× (in `AiEventType` union + `AiStreamEvent` discriminated union); `ToolErrorPayload` interface defined.
- ✓ `frontend/src/hooks/useAiConversation.ts` — `tool_error` appears 1× in `handleEvent`.
- ✓ `tests/api/test_ai_chat_tool_args_validation.py` — exists, 3 tests, all PASS in container; pytest collection clean.
- ✓ Commits `c36f7a8`, `1679812`, `5c1f32c`, `224ead3` — all reachable via `git log` on `master`.

---
*Phase: 16-security-ai-hardening*
*Completed: 2026-05-07*
