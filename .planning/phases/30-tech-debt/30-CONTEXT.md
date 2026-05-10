# Phase 30: Tech Debt Cleanup — Context

**Gathered:** 2026-05-11
**Status:** Ready for planning
**Mode:** Auto-generated.

<domain>
## Phase Boundary

Закрыть 7 achievable tech debt items от v1.0 (документированы в
`.planning/milestones/v1.0-MILESTONE-AUDIT.md` `tech_debt:` + `deferred_to_v1_1`):

1. **DEBT-01** — pre-existing TS errors (analytics.ts, AiView.tsx, TxV10TabDemote.test.tsx, AiView.test.tsx)
2. **DEBT-02** — AddSheet refetch-after-submit (parent screens stale data)
3. **DEBT-03** — Account picker UI upgrade (row-cycler → bottom-sheet list, web+iOS)
4. **DEBT-04** — iOS SubscriptionMenuSheet day/price editor surfaces backend errors via Toast (not silent)
5. **DEBT-05** — Web Transactions row swipe-left delete (parity с iOS)
6. **DEBT-06** — iOS PosterStyle.swift + KeypadView.swift press-feedback uses .posterAnimation (not bare .animation)
7. **DEBT-07** — iOS SettingsAPI extracted to own file (cosmetic)

</domain>

<decisions>
## Implementation Decisions

### Locked from v1.0 patterns
- Use existing components/animations — no new design.
- Reuse Toast component from Phase 23 for error surfaces.
- Account picker — web PosterSheet primary, iOS .posterSheet modifier (Phase 25 patterns).
- Refetch after submit — каждый Mount принимает `refetchToken: number` prop, increment по AddSheet.onSubmitted.

### Open implementation choices
- **DEBT-01 TS errors:** look at each error, classify — false positive (test signature mismatch), missing import, type narrowing issue. Fix smallest-first.
- **DEBT-02 refetch:** AddSheet.onSubmitted callback already exists; parent Mount instantiates `[token, setToken]` state, increments on submit, passes as dep to useEffect fetch. Symmetric web + iOS.
- **DEBT-03 picker:** new `AccountPickerSheet.tsx` (web) + `AccountPickerSheet.swift` (iOS). Bottom-sheet с list of accounts (name + balance + ОСНОВНОЙ badge), tap → select + close. Used by AddSheet account row.
- **DEBT-04 errors:** wrap PATCH in try/catch, on failure show PosterToast «Не удалось обновить» с retry. iOS: same pattern.
- **DEBT-05 swipe:** add `react-swipeable` или native CSS scroll-snap для swipe-left → expose delete button. Right-click → context-menu fallback.
- **DEBT-06 anim:** simple grep + replace `.animation(.easeOut(duration: X), value: pressed)` → `.posterAnimation(PosterAnimations.snap, value: pressed)` (or appropriate posterAnimation alias).
- **DEBT-07 file split:** `git mv` SettingsAPI enum from TransactionsAPI.swift to new SettingsAPI.swift; update imports.

</decisions>

<code_context>
- Existing tech debt locations:
  - `frontend/src/api/v10/analytics.ts` (TS errors)
  - `frontend/src/screensV10/Ai/AiView.tsx` + tests (TS errors)
  - `frontend/src/screensV10/__tests__/TxV10TabDemote.test.tsx` (node:fs/__dirname issues)
  - `frontend/src/screensV10/AddSheet/AddSheet.tsx` (refetch trigger missing)
  - `frontend/src/screensV10/Home/HomeMount.tsx` + `Transactions/TransactionsMount.tsx` (refetch consumers)
  - `frontend/src/screensV10/AddSheet/AddSheet.tsx` (account row cycler)
  - `ios/BudgetPlanner/FeaturesV10/AddSheet/AddSheetView.swift` (account picker dialog)
  - `frontend/src/screensV10/Subscriptions/SubscriptionMenuSheet.tsx` (web day/price errors)
  - `ios/BudgetPlanner/FeaturesV10/Subscriptions/SubscriptionMenuSheet.swift` (iOS day/price errors)
  - `frontend/src/screensV10/Transactions/TransactionsView.tsx` (swipe-left)
  - `ios/BudgetPlanner/FeaturesV10/Common/PosterStyle.swift` + `AddSheet/KeypadView.swift` (press-feedback)
  - `ios/BudgetPlanner/Networking/Endpoints/TransactionsAPI.swift` (SettingsAPI to extract)

</code_context>

<specifics>
## Specific Ideas

**Suggested plan structure (parallelizable where files disjoint):**
- 30-01: TS errors fix (DEBT-01) — small, foundation for clean baseline
- 30-02: AddSheet refetch + AccountPickerSheet web (DEBT-02 web + DEBT-03 web)
- 30-03: AddSheet refetch + AccountPickerSheet iOS (DEBT-02 iOS + DEBT-03 iOS)
- 30-04: Subscription editor error surface (DEBT-04 web+iOS)
- 30-05: Web swipe-left delete (DEBT-05)
- 30-06: iOS press-feedback animation switch + SettingsAPI file split (DEBT-06 + DEBT-07)

</specifics>

<deferred>
## Deferred Ideas

- AI rule-engine NLP/personalization (v1.1, large scope)
- ACCT-V10 «ПЕРЕВОД» account-to-account transfer (v1.1, full feature)
- Background-color toggle DF-V11-04 (v1.1)
- woff2 +16% size optimization (v1.1, requires font subset re-export)
</deferred>
