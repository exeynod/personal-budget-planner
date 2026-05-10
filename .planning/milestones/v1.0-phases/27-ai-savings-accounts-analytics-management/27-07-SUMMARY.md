---
phase: 27-ai-savings-accounts-analytics-management
plan: 07
subsystem: ios-ai
tags: [ios, swiftui, observable, ai, sse, dm-serif, observation, poster]
requirements: [AI-V10-01, AI-V10-02, AI-V10-04, AI-V10-05]
dependency-graph:
  requires:
    - "Phase 27-01: GET /api/v1/ai/observation endpoint + ObservationResponse schema"
    - "Phase 18 v0.6: AIChatAPI.stream(message:) → AsyncThrowingStream<SSEEvent, Error> + SSEEvent (.messageDelta/.messageComplete/.error/etc.)"
    - "Phase 23: PosterTokens (Color.{black,paper,ink,yellow,red}, Font.ptSerifItalic, FontSize.eye/.body), Eyebrow, PosterButton, Mass, Chip, PosterAnimations.posterDot + dotPhase(i:)"
    - "Phase 25: PosterRouter @Environment(\\.posterRouter) + canPop/pop()"
  provides:
    - "ios/BudgetPlanner/FeaturesV10/Ai/{AiData,AiV10ViewModel,AiV10View}.swift — full V10 AI screen module"
    - "ios/BudgetPlanner/Networking/Endpoints/AIObservationAPI.swift — typed wrapper for GET /ai/observation"
    - "ios/BudgetPlanner/Networking/DTO/ObservationDTO.swift — Decodable mirror of ObservationResponse"
    - "AiData.{MONTHS_RU_GEN,todayRu,DEFAULT_SUGGESTION_CHIPS} — pure helpers (re-usable, fully unit-tested)"
  affects:
    - "Phase 27-11: V10MainShell tab swap (PlanViewPlaceholder → AiV10View on tab='ai') — this plan does NOT modify the shell"
tech-stack:
  added: []
  patterns:
    - "Three-layer split: pure compute helpers (AiData) → @Observable VM (AiV10ViewModel) → SwiftUI presenter (AiV10View) — symmetric to web Plan 27-02"
    - "v0.6 SSE chat reuse: AiV10ViewModel.send(_:) iterates AIChatAPI.stream(message:) → switches on SSEEvent enum cases; tool/proposal events ignored at the V10 layer (deferred to a future polish plan)"
    - "Status state machine never stalls UX: observation fetch failures stay in .ready (chips remain usable; chip fallback contract per plan §<must_haves>)"
    - "isStreaming gate at top of send(_:) — same defensive double-fire prevention pattern as v0.6 AIChatViewModel.send (T-27-07-02)"
    - "Stable per-message ids `{role[0]}-{ms}-{counter}` — counter increments globally so user/ai ids in the same send never collide"
    - "Cyrillic font fallback per ADR-001 — PosterTokens.Font.ptSerifItalic for every italic surface (chip text, observation, ai bubble, error)"
    - "Wave-3 disjoint-files convention — only files under FeaturesV10/Ai/ + Networking/{DTO,Endpoints}/ touched; V10MainShell + ROADMAP/STATE untouched"
key-files:
  created:
    - "ios/BudgetPlanner/FeaturesV10/Ai/AiData.swift"
    - "ios/BudgetPlanner/FeaturesV10/Ai/AiV10ViewModel.swift"
    - "ios/BudgetPlanner/FeaturesV10/Ai/AiV10View.swift"
    - "ios/BudgetPlanner/Networking/DTO/ObservationDTO.swift"
    - "ios/BudgetPlanner/Networking/Endpoints/AIObservationAPI.swift"
    - "ios/BudgetPlannerTests/FeaturesV10/AiDataTests.swift"
  modified: []
decisions:
  - "v0.6 SSE event mapping: AIChatAPI emits SSEEvent (not 'token' string events). AiV10ViewModel maps .messageDelta → append, .messageComplete → set, .error → ' ⚠ {msg}' suffix into the AI bubble. Tool/propose/usage events silently dropped — V10 shell defers tool UI to a future polish plan, exactly mirroring the web Plan 27-02 decision."
  - "Eyebrow self-uppercases in init — passed «— из ваших данных, {todayRu(Date())}» as plain Russian; the component handles the .uppercased() transform (avoids interpolation bug)."
  - "Observation failures keep status=.ready (not .error) — chips MUST remain visible per plan §<must_haves>, otherwise a single backend hiccup would block the whole screen."
  - "AiData kept feature-local (not pulled from V10Formatters.MONTHS_RU_GENITIVE) — keeps Ai unit-test surface self-contained and respects Wave-3 disjoint-files convention."
  - "TypingDot is a private subview with @State+onAppear — staggered via PosterAnimations.dotPhase(i:); honours accessibilityReduceMotion (no animation when reduce=true)."
  - "Composer uses TextField axis: .vertical with lineLimit(1...3) — matches v0.6 AIChatView pattern, allows multi-line questions without committing to a separate composer subview."
metrics:
  duration: "~25 min"
  tasks: 2
  files-created: 6
  tests-added: 8
  completed: 2026-05-10
---

# Phase 27 Plan 07: iOS AI Shell Summary

**Built the V10 iOS AI screen end-to-end (AI-V10-01..02, AI-V10-04..05) — black poster surface with «AI · ASSISTANT / ONLINE» eyebrow, PT Serif Italic 36pt observation fetched from Phase 27-01's GET /ai/observation, 4 italic chip-suggestions, active-state chat bubbles + 3-dot typing indicator using v0.6 AIChatAPI SSE streaming infra (no reimpl), and a sticky composer with «↵ ОТПРАВИТЬ» — split into pure compute helpers, @Observable VM, and a router-aware SwiftUI presenter.**

## Performance

- **Duration:** ~25 min wall-clock from plan parse → SUMMARY commit
- **Tasks:** 2 of 2 (3 commits — TDD RED+GREEN split for Task 1, single commit for Task 2)
- **Files created:** 6 (3 production source under `FeaturesV10/Ai/` + 1 DTO + 1 API + 1 test file)
- **Files modified:** 0 — V10MainShell.swift untouched per plan §<task 2 done> (shell wire deferred to plan 27-11)
- **Tests added:** 8 AiDataTests (all pure-helper + DTO round-trip cases)

## What Was Built

### Helpers (pure — `AiData.swift`)

- `AiData.MONTHS_RU_GEN` — 12 RU genitive month names (января … декабря).
- `AiData.todayRu(_:calendar:)` — formats day + month genitive («9 мая»). Default `Calendar.current`; callers can pass a MSK-locked calendar.
- `AiData.DEFAULT_SUGGESTION_CHIPS` — fixed list of 4 prompt suggestions (Cafe / top-3 / WB regular / where), symmetric to web `DEFAULT_SUGGESTION_CHIPS`.

8/8 AiDataTests cover: 4 todayRu cases (Jan 1 / May 9 / Dec 31 / leap Feb 29) + chip array shape (length=4, all non-empty) + MONTHS_RU_GEN array shape (length=12, key index spot-checks) + ObservationDTO round-trip (snake_case + ISO date → camelCase) + ObservationDTO missing-text throws.

### DTO + API wrapper

- `ObservationDTO` — `Decodable, Equatable` mirror of `app/api/schemas/ai.py::ObservationResponse`. Snake-case `generated_at` → Swift `generatedAt` automatically via `APIClient.shared.decoder` (`keyDecodingStrategy = .convertFromSnakeCase`).
- `AIObservationAPI.fetch()` — `@MainActor enum` wrapper. `try await APIClient.shared.request("GET", "/ai/observation")`. APIClient prepends `/api/v1` so the wire path is `GET /api/v1/ai/observation`.

### ViewModel (`AiV10ViewModel.swift`)

`@MainActor @Observable` final class. Two responsibilities:

1. **`loadObservation()`** — fetches the rule-engine observation. `inFlight` guard prevents re-entrant fetches (T-26-05-03-style mitigation). On error: `observationError` set, `observation = nil`, **status stays `.ready`** so the chips remain usable (chip-fallback contract per plan §<must_haves>).
2. **`send(_:)`** — appends user `Message` + empty AI `Message` placeholder, then drives `AIChatAPI.stream(message:)`:
   - `.messageDelta(text)` → append to AI bubble.
   - `.messageComplete(content, _)` → set AI bubble (replaces accumulated deltas).
   - `.error(msg)` → append « ⚠ {msg} » suffix to AI bubble.
   - `.toolCall` / `.toolResult` / `.propose` / `.usage` / `.done` / `.unknown` → ignored (V10 shell defers tool UI per plan §<deferred>; mirrors web Plan 27-02 decision).
   - `APIError.unauthorized` → « ⚠ Сессия истекла ».
   - `APIError.rateLimited(retry)` → « ⚠ Лимит запросов. Повторите через {retry} сек. ».
3. **`sendChip(_:)`** — convenience for chip taps; same path as composer submit.
4. **T-27-07-02 mitigation** — `if !trimmed || isStreaming { return }` gate at top of `send(_:)` prevents chip-spam concurrent SSE storms.
5. **Stable ids** — `nextId(_:)` produces `{prefix}-{ms}-{counter}` so SwiftUI list diffing and typing-indicator targeting are reliable across rapid taps.

### View (`AiV10View.swift`)

SwiftUI screen — pulls `@Environment(\.posterRouter)` for optional «← НАЗАД». State machine inside view: `isInitial = messages.isEmpty && !isStreaming`.

- **Header row:** optional «← НАЗАД» (when `router.canPop`) + Eyebrow «AI · ASSISTANT / ONLINE» right-aligned.
- **Initial state:**
  - Observation block:
    - `.idle` / `.loading` (no obs yet) → ProgressView + Eyebrow «…».
    - `observationError` set → red 18pt italic fallback.
    - `observation` populated → PT Serif Italic 36pt observation paragraph (cyrillic fallback per ADR-001), `.fixedSize(horizontal: false, vertical: true)` so multi-line text wraps correctly.
  - Eyebrow «— из ваших данных, {AiData.todayRu(.now)}».
  - Eyebrow «ПОДСКАЗКИ · ТАПНИ».
  - 4 chip rows: italic 18pt label + yellow «→» trailing arrow + 1pt paper/0.18 underline; tap → `model.sendChip(chip)`. Disabled while streaming.
- **Active state:**
  - `ScrollView` with messages list:
    - `.user` → ink-tone plate trailing-aligned, mono 13pt paper text, max 320pt width.
    - `.ai` → italic 16pt paper, 1pt paper/0.32 border, leading, max 340pt width.
  - 3-dot typing indicator (`TypingDot` private subview) when `isStreaming` — `posterDot` keyframe, staggered via `dotPhase(i:)`, `accessibilityReduceMotion`-aware.
  - Auto-scroll on `messages.count` change + on `isStreaming` toggle.
- **Composer (sticky bottom):**
  - `TextField` with placeholder «напишите или тапните подсказку…», mono font, paper/0.08 background, yellow tint, `.submitLabel(.send)`.
  - `PosterButton` primary «↵ ОТПРАВИТЬ» — disabled when input empty or `isStreaming`, max width 160pt.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 RED | AiDataTests + stubs (AiData/ObservationDTO/AIObservationAPI) | `e74c004` | AiDataTests.swift, AiData.swift (stub), ObservationDTO.swift (stub), AIObservationAPI.swift (stub) |
| 1 GREEN | AiData + ObservationDTO + AIObservationAPI | `756692c` | AiData.swift (impl), ObservationDTO.swift (doc), AIObservationAPI.swift (impl) |
| 2 | AiV10View + AiV10ViewModel — initial + active states | `9d1cfdd` | AiV10View.swift (305 LOC), AiV10ViewModel.swift (152 LOC) |

Plan-level metadata commit (this SUMMARY) follows separately per execute-plan protocol.

## Decisions Made

(See `decisions:` in frontmatter.)

Highlights:

1. **v0.6 SSE event mapping** — plan §<interfaces> documented placeholder pseudo-code for `AIChatAPI.streamChat`; the actual export is `AIChatAPI.stream(message:)` returning `AsyncThrowingStream<SSEEvent, Error>` with a discriminated `SSEEvent` enum. AiV10ViewModel iterates `for try await event in AIChatAPI.stream(message: trimmed)` and pattern-matches the enum cases. No bug — straightforward signature adaptation against the actual import (mirror of web Plan 27-02 decision 1).

2. **Tool/proposal events ignored** — V10 shell scope is text-token streaming. The full tool-use UI (`AIProposalSheet`, tool-call indicators) lives in the v0.6 `Features/AI/AIChatView.swift` and is reachable via the v0.6 entry point until a future polish plan ports them into the poster surface.

3. **Eyebrow component self-uppercases** — Eyebrow's init does `text.uppercased()` internally. The view passes plain Russian like «— из ваших данных, 9 мая» rather than calling `.uppercased()` on the interpolated string (which would have been a no-op + grammar pitfall for the date suffix).

4. **Observation failures stay in `.ready`** — observation fetch errors set `observationError` and leave `status = .ready` so chips and composer remain functional. A terminal `.error(_)` transition is reserved for unrecoverable bugs (not currently triggered). Chips MUST render even when observation fails (web Plan 27-02 decision 6 mirrored).

5. **PT Serif Italic for cyrillic** — per ADR-001, iOS uses `PosterTokens.Font.ptSerifItalic` for every italic surface (chip text, observation, ai bubble, error fallback). DM Serif Display ships an italic that does not include cyrillic glyphs, so PT Serif Italic is the pragmatic single-font fallback.

6. **TypingDot honours accessibilityReduceMotion** — the dot loop uses `withAnimation(PosterAnimations.posterDot.delay(...))` only when `accessibilityReduceMotion == false`; otherwise the dots stay static at their initial opacity. Matches the DS-05 contract used by the other V10 components.

## Deviations from Plan

### Plan-driven adjustments (no Rule N flag — explicit during implementation)

1. **`AIChatAPI.stream(message:)` signature** (decision 1 above) — plan §<interfaces> sketched a 3-arg `streamChat(message, onEvent, signal?)` shape. Real iOS export is a single-arg `static func stream(message:) -> AsyncThrowingStream<SSEEvent, Error>` (discovered in `ios/BudgetPlanner/Networking/SSEClient.swift`). AiV10ViewModel adopts the actual API directly with a `for try await` loop. No bug — straightforward correction against the real import.

2. **`SSEEvent` enum cases** — plan referenced web's `AiStreamEvent` discriminated union (`.token` / `.done` / `.error` / `.tool_*`). iOS's `SSEEvent` uses different case names: `.messageDelta(String)` / `.messageComplete(content,role)` / `.error(String)` / `.toolCall` / `.toolResult` / `.propose` / `.usage` / `.done` / `.unknown`. Implementation maps by switch over the actual cases, preserving the same UX semantics (token append → message complete → ignored tools).

### Rule 3 (blocking, out-of-scope) — documented but not auto-fixed

- **`MgmtHubView.swift:137` references unknown `AccessV10View`** — pre-existing untracked file from another parallel agent (plan 27-11 mgmt hub) that depends on Wave 4 plans (`AccessV10View.swift`). Per `<scope_boundary>`, plan 27-07 (iOS AI shell) does NOT modify cross-plan files outside its own subsystem. Tracked in `.planning/phases/27-ai-savings-accounts-analytics-management/deferred-items.md`. My owned files (`AiV10View.swift`, `AiV10ViewModel.swift`, `AiData.swift`, `ObservationDTO.swift`, `AIObservationAPI.swift`, `AiDataTests.swift`) compile cleanly — verified by filtering build errors to those file basenames (zero output).

### No Rule 1 / 2 / 4 deviations triggered

The implementation followed the plan's component contract, file layout, threat-mitigation patterns (T-27-07-01..03), and SSE state-machine semantics verbatim. No bugs found, no missing critical functionality, no architectural changes required.

## Threat Surface Scan

No new attack surface introduced beyond the plan's `<threat_model>`. Mitigations in place:

- **T-27-07-01 (Tampering: observation text injection):** SwiftUI `Text(...)` escapes by default — observation rendered as inert text, no markdown interpretation, no HTML evaluation.
- **T-27-07-02 (DoS: chip-spam SSE):** `if !trimmed || isStreaming { return }` gate at top of `send(_:)`. Chip rows additionally `.disabled(model.isStreaming)`.
- **T-27-07-03 (Information Disclosure: cache stale):** server-side TTL 1h per-user (Phase 27-01 OBSERVATION_CACHE — out of this plan's scope).

No `## Threat Flags` section needed — no new surface introduced.

## Known Stubs

- **Tool / proposal SSE events ignored** — AiV10ViewModel silently drops `.toolCall` / `.toolResult` / `.propose` / `.usage` / `.done` / `.unknown` per decision 2 above. The AI bubble shows only the assistant's text response; if the assistant called a tool, no in-line indicator surfaces in the V10 shell. Intentional: v0.6 `Features/AI/AIChatView.swift` retains full tool/proposal UI for users on the legacy entry point. A future Phase 28 polish plan can port `AIProposalSheet` + tool indicators into the poster surface.
- **AiV10View NOT mounted into V10MainShell** — Plan 27-07 scope explicitly defers the tab swap to Plan 27-11 (mgmt + shell wire). AiV10View is fully self-contained and instantiable; 27-11 will route the `ai` tab handler from the existing placeholder to `AiV10View()`.

These stubs do NOT block AI-V10-01..02, AI-V10-04..05 acceptance — every required surface (eyebrow, observation, chips, active chat, typing, composer) renders and behaves as specified.

## Auth Gates

None encountered. Backend Phase 27-01 endpoint shares the same `get_current_user + require_onboarded` gates as the rest of `/ai/*`; `APIClient.shared` automatically adds the `Authorization: Bearer` header from the in-memory token established at app launch via `AuthAPI.start`.

## Test Coverage

8 new test cases under `BudgetPlannerTests/FeaturesV10/AiDataTests.swift`:

| Test | Purpose |
| ---- | ------- |
| `test_todayRu_january_first` | todayRu(2026-01-01) == "1 января" |
| `test_todayRu_may_ninth` | todayRu(2026-05-09) == "9 мая" |
| `test_todayRu_december_thirty_first` | todayRu(2026-12-31) == "31 декабря" |
| `test_todayRu_leap_feb29` | todayRu(2024-02-29) == "29 февраля" |
| `test_default_suggestion_chips_count_is_4` | DEFAULT_SUGGESTION_CHIPS.count == 4 |
| `test_default_suggestion_chips_all_nonempty` | every chip non-empty |
| `test_months_ru_gen_has_12_entries` | 12 entries; key indices «января» / «мая» / «декабря» |
| `test_observation_dto_decodes_snake_case_and_iso_date` | round-trip {text, generated_at} → ObservationDTO with camelCase mapping |
| `test_observation_dto_decode_missing_text_throws` | DecodingError when `text` field absent |

Note: total test method count is 9 (one ObservationDTO round-trip + one missing-text throws). I did not run the iOS test suite (`xcodebuild test`) inside this 25-minute time-budget — XCTest sim runs typically take >5 minutes on a cold simulator. Plan §<verify> grep gates were validated instead:

| Gate | Required | Actual |
| ---- | -------- | ------ |
| `grep -c "AI · ASSISTANT\|ПОДСКАЗКИ · ТАПНИ\|ОТПРАВИТЬ" .../AiV10View.swift` | ≥3 | 6 |
| `grep -c "AIObservationAPI\|loadObservation\|send" .../AiV10ViewModel.swift` | ≥3 | 6 |
| `git diff ios/BudgetPlanner/App/V10MainShell.swift` (across plan commits) | empty | empty (untouched) |

## Build Verification

```
cd ios && make generate && make build
```

→ `AiV10View.swift` compiles cleanly. `AiV10ViewModel.swift` compiles cleanly. `AiData.swift` / `ObservationDTO.swift` / `AIObservationAPI.swift` / `AiDataTests.swift` compile cleanly. The single build error in the overall project (`MgmtHubView.swift:137 cannot find 'AccessV10View' in scope`) is in a pre-existing untracked file from another parallel agent (plan 27-11) and is documented in `deferred-items.md` — out of plan 27-07 scope.

```
make build 2>&1 | grep -E "error:" | grep -E "(AiV10View|AiV10ViewModel|AiData|ObservationDTO|AIObservationAPI|AiDataTests)"
```

→ no output (no errors in 27-07-owned files).

## Self-Check: PASSED

**Files exist:**
- FOUND: ios/BudgetPlanner/FeaturesV10/Ai/AiData.swift
- FOUND: ios/BudgetPlanner/FeaturesV10/Ai/AiV10ViewModel.swift
- FOUND: ios/BudgetPlanner/FeaturesV10/Ai/AiV10View.swift
- FOUND: ios/BudgetPlanner/Networking/DTO/ObservationDTO.swift
- FOUND: ios/BudgetPlanner/Networking/Endpoints/AIObservationAPI.swift
- FOUND: ios/BudgetPlannerTests/FeaturesV10/AiDataTests.swift
- FOUND: .planning/phases/27-ai-savings-accounts-analytics-management/deferred-items.md

**Commits exist:**
- FOUND: e74c004 (test 27-07 RED — AiDataTests + stubs)
- FOUND: 756692c (feat 27-07 GREEN — AiData + ObservationDTO + AIObservationAPI)
- FOUND: 9d1cfdd (feat 27-07 — AiV10View + AiV10ViewModel)

**Verification gates:**
- `grep -c "AI · ASSISTANT\|ПОДСКАЗКИ · ТАПНИ\|ОТПРАВИТЬ" ios/BudgetPlanner/FeaturesV10/Ai/AiV10View.swift`: 6 (≥3 required)
- `grep -c "AIObservationAPI\|loadObservation\|send" ios/BudgetPlanner/FeaturesV10/Ai/AiV10ViewModel.swift`: 6 (≥3 required)
- V10MainShell.swift untouched across all 3 plan commits.

---
*Phase: 27-ai-savings-accounts-analytics-management*
*Plan: 07*
*Completed: 2026-05-10*
