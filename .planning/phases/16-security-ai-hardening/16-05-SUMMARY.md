---
phase: 16-security-ai-hardening
plan: 05
subsystem: api
tags: [security, ai, cost-dos, agent-loop, sse, prompt-injection, openai]

# Dependency graph
requires:
  - phase: 09-ai-assistant
    provides: _event_stream agent loop + max_rounds=5 outer cap (defended-on-top)
  - phase: 16-security-ai-hardening (Plan 16-04)
    provides: parsed_kwargs (post-Pydantic) — used as the deterministic source for repeat-detection signature; ai.tool_args_invalid logger pattern reused for ai.tool_loop_* warnings
provides:
  - MAX_TOTAL_TOOL_CALLS=8 hardcap on total tool-fn executions per SSE session (D-16-06)
  - Adjacent-round repeat-detect via (tool_name, frozenset(parsed_kwargs.items())) signature comparison
  - Graceful fallback close on guard-trip — "Не удалось завершить, переформулируй запрос" yielded as token + done event, persisted via append_message
  - Two new structured warning logs: ai.tool_loop_repeat (signature collision) + ai.tool_loop_hardcap (count >= 8)
  - tests/api/test_ai_chat_tool_loop_guard.py — 3 regression cases (repeat, hardcap, normal-flow sanity)
affects:
  - 16-07 (CON-02 spend-cap-lock) — same _event_stream is the integration site; guard-state is local to the generator and won't conflict with a per-user asyncio.Lock around enforce_spending_cap

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-session local-state in SSE generator: counter + signature-set + abort-flag scoped to a single _event_stream call (no cross-request module state — D-16-06 Claude's discretion)"
    - "Counter increments AFTER args validation passes and BEFORE tool_fn() — so Plan 16-04 tool_error path does NOT consume the budget; bad-args don't count as real tool exec"
    - "Repeat-detect signature filters out unhashable values (lists/dicts/sets) into frozenset — falls back to () on TypeError so dedup degrades to no-op while hardcap still holds"
    - "Graceful guard-close yields a token-style fallback (not an error event) so the frontend reducer treats it as a normal completion, not an aborted stream"

key-files:
  created:
    - tests/api/test_ai_chat_tool_loop_guard.py
  modified:
    - app/api/routes/ai.py

key-decisions:
  - "MAX_TOTAL_TOOL_CALLS=8 + repeat-detect on (tool_name, frozenset(kwargs.items())): per D-16-06 a soft floor for legitimate multi-turn flows (3 tools × ~2-3 rounds = 6-9 max in normal use). Hardcap at 8 covers the worst of the legitimate workload while still capping cost-DoS to <2× a normal session. max_rounds=5 retained as outer safety net."
  - "Guard placed AFTER args-validation success and BEFORE tool_fn() — Plan 16-04 args-error path issues its own SSE tool_error and synth tool_result; counting those as 'tool calls' would double-charge against the cap and falsely break legitimate sessions when the LLM emits a malformed arg-set once."
  - "Local-state (D-16-06 Claude's discretion) over module-level dict[user_id, counter]: per-session is the natural scope (one SSE response = one budget); module-level state would leak across reconnects, complicate cleanup, and introduce a memory leak in the spirit of the spend_cap.py grow-forever lock dict."
  - "Fallback yielded as token+done (not error+done): the user is mildly informed but not alarmed; frontend reducer treats it as completion, not failure. Persisted to conversation history via append_message so subsequent /history reads see the same text. Aligned with SEC-02 register: short, generic, non-leaking."
  - "Reused Plan 16-04 logger.warning prefix scheme: ai.tool_loop_repeat + ai.tool_loop_hardcap mirror ai.tool_args_invalid (same logger, same severity, same audit-tag style). Ops dashboard / alerts can grep ai.tool_loop_* family without further config."
  - "Inner loop-break also skips the trailing tool_end SSE event (placed below the break): no need to signal tool_end on an aborted round — fallback message is the cleaner UX signal. This is intentional, not a bug."

patterns-established:
  - "Pattern: cost-DoS guards on agent-loops live in the SSE-generator local scope — per-session, not per-user (which leaks). Counter increments at the precise tool_fn boundary, not at message boundaries."
  - "Pattern: signature-based repeat-detect uses parsed_kwargs (post-Pydantic-validate, post-model_dump(exclude_none=True)) — types are normalized so the frozenset is deterministic across rounds (Plan 16-04 dependency)."

requirements-completed: [AI-03]

# Metrics
duration: 4min
completed: 2026-05-07
---

# Phase 16 Plan 05: AI-03 tool-loop guard Summary

**Hardcap of 8 total tool-fn executions per SSE session + adjacent-round repeat-detect via `(tool_name, frozenset(parsed_kwargs.items()))` signature in the `_event_stream` agent-loop, with a graceful "Не удалось завершить, переформулируй запрос" fallback message yielded as token+done events on guard trip — closes AI-03 cost-DoS without affecting normal multi-tool flows.**

## Performance

- **Duration:** ~4 min plan tasks; +~6 min for two integration-test runs (3 new + 13 existing AI tests)
- **Started:** 2026-05-07T18:09:40Z
- **Completed:** 2026-05-07T18:13:39Z
- **Tasks:** 2 (both `type="auto"`)
- **Files modified:** 1 (`app/api/routes/ai.py`)
- **Files created:** 1 (`tests/api/test_ai_chat_tool_loop_guard.py`)

## Accomplishments

- Closed AI-03 (HIGH) — `max_rounds=5` is now defended on top of by a per-session hardcap of 8 total tool-fn executions; LLM-side prompt-injection or pathological agent-loop can no longer burn 5×N tool exec where N is parallel tool fan-out.
- Repeat-detect via `(tool_name, frozenset)` signature catches the most-common cost-DoS (LLM stuck calling `get_period_balance({})` over and over) on the *second* round — well below the hardcap, before any meaningful token spend.
- Counter is placed AFTER Plan 16-04 args-validation success and BEFORE `tool_fn()` — Plan 16-04's `tool_error` path does not consume the budget, so a single malformed arg-set doesn't falsely terminate a legitimate session.
- Reused Plan 16-04 logger pattern: `ai.tool_loop_repeat` + `ai.tool_loop_hardcap` mirror `ai.tool_args_invalid` for consistency in ops/audit (single grep pattern: `ai\.tool_(loop|args)_*`).
- Fallback yields as token+done (not error+done) — the frontend reducer treats it as a normal completion, message persisted to conversation history; user gets mild signal "переформулируй запрос" without the chat looking broken.
- 3 new pytest cases — repeat-dedup (LLM called <=3, not 5), hardcap (tool_fn called <=8), normal-flow sanity (single-tool flow unaffected). All PASS in integration container; 0 regressions on the existing 13 AI tests.

## Task Commits

Each task committed atomically against `master`:

1. **Task 1: Tool-loop guard in `_event_stream` agent-loop** — `59d5acf` (`feat(16-05): AI-03 hardcap 8 tool-calls + adjacent-round repeat-detect`)
2. **Task 2: Pytest regression — 3 cases** — `837859a` (`test(16-05): AI-03 regression for tool-loop guard (3 cases)`)

## Files Created/Modified

- `app/api/routes/ai.py` — Added per-session local-state (`MAX_TOTAL_TOOL_CALLS = 8`, `tool_call_count`, `prev_round_signatures`, `loop_aborted`) right above the `for _round in range(max_rounds):` outer loop. Each round initializes a fresh `current_round_signatures: set` next to `tool_calls_this_round`. Inside the inner `for tc in tool_calls_this_round:` dispatch loop, AFTER the Plan 16-04 args-validation `continue` and BEFORE the `tool_fn = TOOL_FUNCTIONS.get(tool_name)` call, a guard block computes `signature = (tool_name, frozenset(parsed_kwargs.items()))` (filtered to hashable values, with `TypeError` fallback to `frozenset()`), checks `signature in prev_round_signatures` → `loop_aborted = True; break` + `ai.tool_loop_repeat` warning, then checks `tool_call_count >= MAX_TOTAL_TOOL_CALLS` → same break + `ai.tool_loop_hardcap` warning. After the inner loop, `prev_round_signatures = current_round_signatures` rolls forward; `if loop_aborted: break` exits the outer agent-loop. Right before the existing "5. Persist финального assistant-ответа" block, an early-return checks `if loop_aborted` → persists the fallback "Не удалось завершить, переформулируй запрос." via `conv_svc.append_message`, yields it as a `token` event, then a `done` event, and `return`s — graceful close.
- `tests/api/test_ai_chat_tool_loop_guard.py` — **Created.** 3 async tests + 2 stub LLM clients (`_LoopingLLMClient` for dedup, `_DistinctArgsLoopingLLMClient` for hardcap) + a local `_NormalLLM` for the sanity test. Reuses the canonical `db_client` tuple-shape fixture pattern from `tests/api/test_ai_chat_tool_args_validation.py` (Plan 16-04) — bootstraps owner via `GET /api/v1/me`, flips `onboarded_at`, yields `(client, headers)`. The dedup test asserts: 200 status, fallback token yielded, done event present, `ai.tool_loop_repeat` log record, LLM called ≤ 3 rounds. The hardcap test monkeypatches `TOOL_FUNCTIONS["query_transactions"]` with a counting wrapper and asserts `call_count ≤ 8`. The sanity test asserts the normal flow's final text contains "Баланс показан выше" and does NOT contain "переформулируй".

## Decisions Made

- **Local-state (per-session) over module-level state** — D-16-06 explicitly granted Claude's discretion here; per-session is the natural scope (one SSE response = one cost-DoS-budget). Module-level `dict[user_id, counter]` would leak across reconnects, complicate cleanup, and replicate the grow-forever pattern that Plan 16-07 will need to address in `spend_cap.py`.
- **Counter placement: after args-validation success, before `tool_fn()`** — Plan 16-04's `tool_error` path issues its own SSE `tool_error` event + synthesizes a `{error: ...}` tool_result, but does NOT execute the tool. Counting those as "tool calls" would double-charge against the cap and falsely terminate sessions when the LLM emits one malformed arg-set early.
- **Signature with `frozenset` of hashable kwargs only** — `parsed_kwargs` post-`model_dump(exclude_none=True)` may still contain lists or nested dicts depending on which tool's args model. `(k, v) for k, v in items() if not isinstance(v, (list, dict, set))` filters those out so the `frozenset()` constructor doesn't `TypeError`. The wrapping `try`/`except TypeError` is belt-and-suspenders for any future Pydantic model that emits unhashable values via custom validators. Trade-off: a tool call that differs only in its list-valued kwargs won't be deduped — but the hardcap still bounds the worst case at 8.
- **Fallback as token+done, not error+done** — token-style fallback flows through the frontend reducer's `'token'` branch (already concatenates into the assistant message). Frontend treats this as a normal completion, the message is persisted to history, and the user sees a subtle prompt to retry rather than a red error banner. This matches SEC-02 register (short, generic, non-leaking) and the broader UX direction of "fail soft on AI agent issues".
- **Logger family `ai.tool_loop_*`** mirrors Plan 16-04's `ai.tool_args_invalid` — same logger, same WARNING level, same audit-tag style. Ops can grep `ai\.tool_(loop|args)_` with one regex.
- **`tool_end` SSE event suppressed on guard-trip** — placed the `tool_end` yield AFTER the `if loop_aborted: break` so an aborted round doesn't emit a misleading "tool_end" signal to the frontend. The fallback token+done is the cleaner UX signal. Intentional, not a bug.

## Deviations from Plan

None — plan executed exactly as written for the substantive guard logic. Two minor and documented adaptations:

1. The plan's example test code referenced an `auth_headers` fixture that doesn't exist in this repo; I used the canonical `db_client` tuple-shape pattern from `tests/api/test_ai_chat_tool_args_validation.py` (Plan 16-04) — semantically identical. Already documented as a non-deviation in 16-04-SUMMARY.md.
2. The plan's snippet placed the guard "ПОСЛЕ блока успешной валидации args (когда `parsed_kwargs` готов и `args_error is None`) и ДО `tool_fn(...)` вызова". I implemented exactly that: the guard sits between the `if args_error is not None: ... continue` block and the `tool_fn = TOOL_FUNCTIONS.get(tool_name)` lookup. The `current_round_signatures` set is initialized at the top of every `for _round` iteration (next to `tool_calls_this_round`) — also exactly as the plan describes.

## Issues Encountered

- **Test stack lifecycle:** `./scripts/run-integration-tests.sh` runs `docker compose down --remove-orphans` on EXIT, which torches the running dev stack. After both test runs (new file + regression), I ran `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d` to restore the dev environment. Per user constraint "rebuild containers — он сам пересоберёт", the test runner's `--build api` is the only acceptable rebuild path; bot/worker were not rebuilt.
- **Walrus-syntax typo caught early:** my first draft of `test_distinct_args_loop_breaks_via_hardcap` accidentally wrote `headers=headers := headers` (gibberish — walrus inside a kwarg). Fixed before commit by hoisting `client, headers = db_client` to the top of the test like the dedup test. No commit polluted by it.

## User Setup Required

None — no external service configuration required.

## Phase-Level Verification

All four phase-level acceptance gates from the PLAN's `<verification>` block:

1. `pytest tests/api/test_ai_chat_tool_loop_guard.py -v` — **3 passed** (in-container via `./scripts/run-integration-tests.sh`).
2. `grep -q MAX_TOTAL_TOOL_CALLS app/api/routes/ai.py` — **exit 0** (verified locally).
3. `grep -q "Не удалось завершить, переформулируй" app/api/routes/ai.py` — **exit 0** (verified locally).
4. `pytest tests/api/test_ai_chat.py tests/api/test_ai_chat_error_sanitize.py tests/api/test_ai_chat_tool_args_validation.py tests/test_ai_cap_integration.py` — **13 passed, 3 skipped** (the 3 skips are pre-existing DEV_MODE auth tests that skip on this stack; same as Plan 16-02 / 16-04 baseline).

## Threat Surface Scan

All files modified are inside the threat model declared in the PLAN's `<threat_model>` (T-16-05-01..04). No new attack surface introduced — the change *reduces* the existing surface (max_rounds-only → hardcap+repeat+fallback). No `## Threat Flags` needed.

## Next Phase Readiness

- **For Plan 16-07 (CON-02 spend-cap-lock):** the `_event_stream` integration site has now been touched by 16-02, 16-04, and 16-05; all three are local-scope changes within the SSE generator. A per-user `asyncio.Lock` wrapping `enforce_spending_cap` (D-16-07) lives outside `_event_stream` (in `app/services/spend_cap.py` + `app/api/dependencies.py`) and won't conflict with the local-state guard added here.
- **No new blockers** for the remaining Phase 16 plans (16-07 only). After 16-07, Phase 16 is complete.

## Self-Check: PASSED

- ✓ `app/api/routes/ai.py` — modified, `MAX_TOTAL_TOOL_CALLS` appears 4× (3 references + 1 def), `tool_call_count` appears 4×, `loop_aborted` appears 6× (1 init + 4 reads/writes inside loop + 1 fallback gate), `Не удалось завершить, переформулируй` appears 1×, `ai.tool_loop_repeat` and `ai.tool_loop_hardcap` log markers both present.
- ✓ `tests/api/test_ai_chat_tool_loop_guard.py` — exists, 302 lines, 3 tests + 2 stub LLM client classes; pytest collection clean; all 3 PASS in integration container.
- ✓ Commits `59d5acf`, `837859a` — both reachable via `git log` on `master` (verified `git log --oneline -3`).

---
*Phase: 16-security-ai-hardening*
*Completed: 2026-05-07*
