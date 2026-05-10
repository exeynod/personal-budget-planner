---
phase: 27-ai-savings-accounts-analytics-management
plan: 02
subsystem: web-ai
tags: [react, typescript, vitest, ai-shell, sse, dm-serif, observation, poster]
requirements: [AI-V10-01, AI-V10-02, AI-V10-04, AI-V10-05]
dependency-graph:
  requires:
    - "Phase 27-01: GET /api/v1/ai/observation endpoint + ObservationResponse schema"
    - "Phase 18 v0.6: streamChat() SSE infra in frontend/src/api/ai.ts (AiStreamEvent token/done/error/tool_*)"
    - "Phase 25-02: PosterRouter + screensV10/common barrel (usePosterRouter, formatPeriodEyebrow)"
    - "Phase 23: componentsV10 (Eyebrow, PosterButton) + stylesV10/animations.css (posterDot keyframe)"
  provides:
    - "frontend/src/screensV10/Ai/{AiMount,AiView,computeAi,index}.ts(x) — full V10 AI screen module"
    - "frontend/src/api/v10/ai.ts — fetchObservation typed wrapper + ObservationResponse type"
    - "DEFAULT_SUGGESTION_CHIPS, todayRu, MONTHS_RU_GEN — pure helpers (re-usable)"
    - "AiView pure presentational (router-agnostic; props-only) — testable without provider scaffolding"
    - "AiMount data fetcher (observation GET + SSE state machine + AbortController cleanup)"
  affects:
    - "Phase 27-06: V10MainShell tab swap (PlanViewPlaceholder → AiMount on tab='ai')"
    - "Phase 27-07: iOS AI screen — symmetric implementation (same compute, same chips)"
tech-stack:
  added: []
  patterns:
    - "View / Mount / Compute three-layer split — pure helpers (no React) → pure presenter (no fetch) → router-bound mount (orchestrates SSE + observation)"
    - "Disjoint-files Wave-2 convention — append-only edit to api/v10/index.ts (shared barrel) keeps merge-safe across the 4 sibling agents"
    - "scrollIntoView jsdom guard: `typeof node.scrollIntoView === 'function'` so tests don't blow up on smooth-scroll calls"
    - "isStreaming gate — same defensive double-fire prevention pattern used by v0.6 AiScreen.handleSend (T-27-02-02)"
    - "Cyrillic font fallback chain per ADR-001: DM Serif Italic → PT Serif → Georgia for every italic surface (chip text, observation, ai bubble)"
key-files:
  created:
    - "frontend/src/api/v10/ai.ts"
    - "frontend/src/screensV10/Ai/AiView.tsx"
    - "frontend/src/screensV10/Ai/AiView.module.css"
    - "frontend/src/screensV10/Ai/AiMount.tsx"
    - "frontend/src/screensV10/Ai/computeAi.ts"
    - "frontend/src/screensV10/Ai/index.ts"
    - "frontend/src/screensV10/Ai/__tests__/computeAi.test.ts"
    - "frontend/src/screensV10/Ai/__tests__/AiView.test.tsx"
    - "frontend/src/screensV10/Ai/__tests__/AiMount.test.tsx"
  modified:
    - "frontend/src/api/v10/index.ts (append-only — re-export fetchObservation + ObservationResponse)"
decisions:
  - "Adapter for v0.6 streamChat 4-arg signature: plan §<interfaces> assumed `streamChat(message, onEvent, signal)` but the actual export is `streamChat(message, onEvent, onDone, signal)` with onDone separate from event stream. AiMount adapts — onDone closure clears isStreaming."
  - "AiStreamEvent shape uses `data` (not `token`) per `frontend/src/api/types.ts:481`. Implementation reads `event.data` for type='token' branch; v0.6 chat-bubble token concatenation pattern preserved."
  - "Tool/proposal events ignored in V10 shell — Plan 27-02 scope is text-token streaming only. The v0.6 AiScreen still owns ToolUseIndicator/AiProposalSheet rendering until a future polish plan (Phase 28+) ports those into the poster surface. No regression — V10 path is opt-in via tab swap (Plan 27-06)."
  - "Locally-defined MONTHS_RU_GEN instead of importing from screensV10/common/format.ts (which has MONTHS_RU_GENITIVE) — keeps Ai feature's compute-helpers test self-contained, avoids pulling common/format into a small pure-helpers test surface, and respects Wave-2 disjoint-files gate."
  - "Auto-scroll smooth-into-view inside AiView (not AiMount) since the messages list lives in the view; jsdom guard prevents test crashes."
  - "obs-loading + obs-error mutually-exclusive of obs-text (rendered conditionally) — mirrors HomeMount loading/error sub-views; chips ALWAYS visible so user has fallback even when observation fails."
metrics:
  duration: "~10 min"
  tasks: 3
  files-created: 9
  files-modified: 1
  tests-added: 23
  completed: 2026-05-10
---

# Phase 27 Plan 02: Web AI Shell Summary

**Built the V10 web AI screen end-to-end (AI-V10-01..02, AI-V10-04..05) — black poster surface with «AI · ASSISTANT / ONLINE» eyebrow, DM Serif Italic 36px observation fetched from Phase 27-01's `GET /ai/observation`, 4 italic chip-suggestions, active-state chat bubbles + 3-dot typing indicator using v0.6 SSE streaming infra (no reimpl), and a sticky composer with «↵ ОТПРАВИТЬ» — split into pure compute helpers, props-only AiView, and a router-bound AiMount.**

## Performance

- **Duration:** ~10 min wall-clock from plan parse → SUMMARY commit
- **Tasks:** 3 of 3 (5 commits with TDD RED/GREEN splits for Tasks 1-2; Task 3 atomic)
- **Files created:** 9 (1 API wrapper + 4 production source + 1 CSS module + 3 test files)
- **Files modified:** 1 (api/v10/index.ts — append-only re-export of fetchObservation + ObservationResponse)
- **Tests:** 23 new (8 computeAi + 12 AiView + 3 AiMount); full project suite 481/481 pass; tsc clean

## What Was Built

### Helpers (pure — `computeAi.ts`)

- `MONTHS_RU_GEN` — 12 RU genitive month names (января … декабря).
- `todayRu(d: Date)` — formats day + month genitive ("9 мая").
- `DEFAULT_SUGGESTION_CHIPS` — fixed list of 4 prompt suggestions used in the initial chip block.

8/8 computeAi unit tests cover: 4 todayRu cases (Jan/May/Dec/leap-Feb29) + chip array shape (length=4, all non-empty) + MONTHS_RU_GEN array shape.

### API wrapper (`api/v10/ai.ts`)

- `fetchObservation(): Promise<ObservationResponse>` — typed wrapper for `GET /ai/observation` (Phase 27-01 endpoint). `apiFetch` already prefixes `/api/v1`.
- `ObservationResponse` interface mirrors `app/api/schemas/ai.py::ObservationResponse` (text + generated_at ISO string).
- Re-exported via append-only edit to `api/v10/index.ts` barrel (Wave-2 disjoint-files convention).

### View (`AiView.tsx` + `AiView.module.css`)

Pure presentational component — router-agnostic (`canPop` + `onBack` are props). State machine inside view: `isInitial = messages.length === 0 && !isStreaming`.

- **Initial state:** «← НАЗАД» (when canPop) + «AI · ASSISTANT / ONLINE» eyebrow → DM Serif Italic 36px observation block (with `obs-loading` and `obs-error` sub-states) → «— из ваших данных, {todayLabel}» eyebrow → «ПОДСКАЗКИ · ТАПНИ» eyebrow → 4 chip rows (italic 18px DM Serif fallback chain, dashed underline → arrow that nudges right on hover).
- **Active state:** scrollable `.messages` log with `.msgUser` (paper plate, mono 13px, right-aligned, max 80% width) vs `.msgAi` (transparent, paper border, italic DM Serif 16px, left-aligned, max 92% width); 3-dot typing indicator using `posterDot` keyframe with staggered delays (0 / 0.18s / 0.36s); auto-scroll to bottom on each message append (jsdom-guarded).
- **Composer (sticky bottom):** mono input with placeholder «напишите или тапните подсказку…» + yellow «↵ ОТПРАВИТЬ» PosterButton; disabled when input empty or isStreaming; Enter key submits.

12/12 AiView component tests cover initial state (eyebrow / observation / loading / error / chips / chip-tap), active state (user+ai messages with role-specific testids, typing indicator), composer (disabled-on-empty, onSend with trimmed input), and back button (hidden when !canPop, invokes onBack on click).

### Mount (`AiMount.tsx`)

Data fetcher + state machine + glue. Lifecycle:

1. On mount: `fetchObservation()` → state. On reject: `observationError` set; chips still render.
2. `handleSend(text)`: append user msg + empty AI bubble → `streamChat(text, onEvent, onDone, signal)` (v0.6 4-arg signature):
   - `token` event: append `event.data` to AI bubble's text via immutable `setMessages` map.
   - `error` event: write error sentinel into AI bubble.
   - `done` (via 3rd-arg onDone closure): `setIsStreaming(false)`.
   - `tool_*` / `propose` events: ignored (V10 shell defers tool UI per plan decision).
3. `handleChipTap(chip)` delegates to `handleSend(chip)`.
4. `isStreaming` gate at top of `handleSend` prevents double-fire (T-27-02-02 mitigation).
5. Unique ids `${role[0]}-${Date.now()}-${counter}` so React keys never collide on rapid taps (T-27-02-04 mitigation).
6. `AbortController.abort()` on unmount + on each new send (cancels stale stream if user re-sends mid-stream).

3/3 AiMount smoke tests cover: obs-loading → obs-text on resolve, obs-error on reject, 4 chips visible while loading.

### Barrel (`Ai/index.ts`)

Re-exports `AiMount`, `AiView`, `AiMessage`, `AiViewProps`, `todayRu`, `DEFAULT_SUGGESTION_CHIPS`, `MONTHS_RU_GEN`. Plan 27-06 will edit a single import in V10MainShell.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 RED | computeAi helpers — failing tests + stub | `2c30bdf` | computeAi.ts (stub), __tests__/computeAi.test.ts |
| 1 GREEN | computeAi helpers + fetchObservation wrapper | `69c831b` | computeAi.ts (impl), api/v10/ai.ts, api/v10/index.ts |
| 2 RED | AiView 12 failing tests + stub | `762d471` | AiView.tsx (stub), AiView.module.css (stub), __tests__/AiView.test.tsx |
| 2 GREEN | AiView presentational + CSS module | `12693f4` | AiView.tsx (impl), AiView.module.css (impl) |
| 3 | AiMount + barrel + smoke tests | `63a1821` | AiMount.tsx, index.ts, __tests__/AiMount.test.tsx |

Plan-level metadata commit (this SUMMARY) follows separately per execute-plan protocol.

## Decisions Made

(See `decisions:` in frontmatter.)

Highlights:

1. **streamChat signature mismatch** — plan §<interfaces> documented `streamChat(message, onEvent, signal?)`, the actual v0.6 export is `streamChat(message, onEvent, onDone, signal?)` with `onDone` as a separate callback (not an event in the stream). AiMount adapts: passes `() => setIsStreaming(false)` as `onDone`, treats SSE events as data-only.
2. **Token event uses `data` not `token`** — `AiStreamEvent` is a discriminated union `{ type: 'token', data: string } | …`. Implementation reads `event.data` for the token branch (mirrors v0.6 AiScreen exactly).
3. **Tool/proposal events ignored** — V10 shell scope is text-token streaming. The full tool-use UI (`ToolUseIndicator`, `AiProposalSheet`) lives in the v0.6 `screens/AiScreen.tsx` and is reachable via the v0.6 entry point until a future polish plan ports them. AiMount silently skips `tool_start`/`tool_end`/`propose`/`tool_error` events.
4. **Local MONTHS_RU_GEN** — sister `MONTHS_RU_GENITIVE` already exists in `screensV10/common/format.ts` for the period eyebrow formatter, but I kept the Ai-local copy so the Ai feature's pure-helpers test surface stays self-contained (no need to pull common into a 6-test file) and so the Wave-2 disjoint-files gate stays clean (`common/format.ts` is not in this plan's `files_modified`).
5. **`Eyebrow color` is a CSS string** — plan §<interfaces> typed it as enum `"ink"|"paper"|"yellow"`, but the actual `EyebrowProps.color: string` accepts any CSS color or token var. AiView uses `color="var(--poster-paper)"` matching PlanView/HomeView convention.
6. **scrollIntoView jsdom guard** — `Element.prototype.scrollIntoView` is absent in jsdom. Wrapped the call with `typeof node.scrollIntoView === 'function'` check so AiView tests render cleanly without monkey-patching the prototype globally (PlanMount's pattern of `Element.prototype.scrollIntoView = vi.fn()` in beforeEach also works and is used in the AiMount smoke tests for safety).

## Deviations from Plan

### Plan-driven adjustments (no Rule N flag — explicit during implementation)

1. **streamChat 4-arg signature adapter** (decision 1 above) — plan's example code in Task 3 used 3-arg `streamChat(text, onEvent, controller.signal)` and a `done` event. Real signature has `onDone` as 3rd arg + `signal` as 4th. AiMount passes `onDone = () => setIsStreaming(false)` and adapts the event handler to the actual `AiStreamEvent` discriminated union (`event.data` not `event.token`). No bug — straightforward signature adaptation against the actual import.
2. **AiView added 12 tests** instead of plan's spec'd 8 — split «active-state messages» into «messages render» + «typing indicator» + «back button visible/invokes» (3 cases) and dropped one «test_input_change_invokes_onInputChange» that would have been a redundant smoke test. The view tests now cover every prop callback at least once.
3. **3 AiMount smoke tests** instead of plan's «1-2 tests достаточно» — added an explicit «4 chips visible while loading» case so the chip-fallback contract is locked in (chips MUST render even when observation fails). Trivial, no scope creep.

### No Rule 1/2/3/4 deviations triggered

The implementation followed the plan's component contract, file layout, CSS token usage, threat-mitigation patterns, and SSE state-machine semantics verbatim. No bugs found, no missing critical functionality, no blocking infrastructure issues that required diverging from the plan.

## Threat Surface Scan

No new attack surface introduced beyond the plan's `<threat_model>`. Mitigations in place:

- **T-27-02-01 (XSS via observation):** observation rendered via React JSX → escaped by default. Asserted indirectly by the obs-text test reading text content via `toHaveTextContent`.
- **T-27-02-02 (DoS via chip-spam):** `if (!trimmed || isStreaming) return` at top of `handleSend` ensures only one active stream session at a time. AbortController on cleanup + on each new send.
- **T-27-02-03 (Information Disclosure cache stale):** server-side TTL 1h per-user (Phase 27-01 semantics — out of this plan's scope).
- **T-27-02-04 (message duplication on rapid-tap):** `isStreaming` gate AND unique id-генерация `${role[0]}-${Date.now()}-${counter}` (counter increments per id, not per send-pair, so user/ai ids in the same send never collide).

No `## Threat Flags` section needed.

## Known Stubs

- **`tool_*` and `propose` SSE events ignored** — V10 AiMount silently drops these per decision 3 above. The AI bubble will show only the assistant's text response; if the assistant called a tool, no in-line indicator surfaces in the V10 shell. This is intentional; v0.6 `screens/AiScreen.tsx` retains full tool/proposal UI for users on the legacy entry point. A future Phase 28 polish plan can port `ToolUseIndicator` + `AiProposalSheet` into the poster surface.
- **AiMount NOT mounted into V10MainShell** — Plan 27-02 scope explicitly defers the tab swap to Plan 27-06 (web Mgmt + shell wire). AiMount is fully self-contained and tested; 27-06 will replace the existing `<PlanViewPlaceholder />` import in V10MainShell with `<AiMount />` for `tab === 'ai'`.

These stubs do NOT block AI-V10-01..02, AI-V10-04..05 acceptance — every required surface (eyebrow, observation, chips, active chat, typing, composer) renders and behaves as specified.

## Auth Gates

None encountered. Backend Phase 27-01 endpoint shares the same `get_current_user + require_onboarded` gates as the rest of `/ai/*`; `apiFetch` handles `X-Telegram-Init-Data` automatically.

## Test Coverage

23 new test cases across 3 files:

| Test File | Cases | Purpose |
| --------- | ----- | ------- |
| `__tests__/computeAi.test.ts` | 8 | Pure helpers — todayRu (4), DEFAULT_SUGGESTION_CHIPS (2), MONTHS_RU_GEN (2) |
| `__tests__/AiView.test.tsx` | 12 | Initial state (6) + active state (2) + composer (2) + back button (2) |
| `__tests__/AiMount.test.tsx` | 3 | obs-loading→obs-text on resolve, obs-error on reject, chips visible while loading |

## Self-Check: PASSED

**Files exist:**
- FOUND: frontend/src/api/v10/ai.ts
- FOUND: frontend/src/screensV10/Ai/AiView.tsx
- FOUND: frontend/src/screensV10/Ai/AiView.module.css
- FOUND: frontend/src/screensV10/Ai/AiMount.tsx
- FOUND: frontend/src/screensV10/Ai/computeAi.ts
- FOUND: frontend/src/screensV10/Ai/index.ts
- FOUND: frontend/src/screensV10/Ai/__tests__/computeAi.test.ts
- FOUND: frontend/src/screensV10/Ai/__tests__/AiView.test.tsx
- FOUND: frontend/src/screensV10/Ai/__tests__/AiMount.test.tsx
- FOUND: frontend/src/api/v10/index.ts (modified — fetchObservation + ObservationResponse re-export appended)

**Commits exist:**
- FOUND: 2c30bdf (test 27-02 RED computeAi)
- FOUND: 69c831b (feat 27-02 GREEN computeAi + fetchObservation)
- FOUND: 762d471 (test 27-02 RED AiView)
- FOUND: 12693f4 (feat 27-02 GREEN AiView + CSS)
- FOUND: 63a1821 (feat 27-02 AiMount + barrel + smoke tests)

**Verification gates:**
- `cd frontend && npx tsc --noEmit`: clean (no output)
- `cd frontend && npx vitest run screensV10/Ai`: 23/23 pass (8 computeAi + 12 AiView + 3 AiMount)
- `cd frontend && npx vitest run`: 481/481 pass (full project suite, no regressions)
- `grep -c "AI · ASSISTANT\|ПОДСКАЗКИ · ТАПНИ\|ОТПРАВИТЬ" frontend/src/screensV10/Ai/AiView.tsx`: 4 (≥3 required)
- `grep -c "fetchObservation\|streamChat" frontend/src/screensV10/Ai/AiMount.tsx`: 6 (≥2 required)
- `grep -c "AiMount\|AiView" frontend/src/screensV10/Ai/index.ts`: 4 (≥2 required)
- `git diff frontend/src/screensV10/V10MainShell.tsx`: empty (V10MainShell untouched per plan §<task 3 done>)

**No accidental file deletions** in any task commit (`git diff 4d3e7e0..HEAD --diff-filter=D --name-only`: empty).

---
*Phase: 27-ai-savings-accounts-analytics-management*
*Plan: 02*
*Completed: 2026-05-10*
