# Phase 24-11 — iOS manual smoke checklist

**Plan:** 24-11 (final wave of Phase 24).
**Goal:** verify the full onboarding flow end-to-end on iOS after the
gateway wiring shipped in Plan 24-11 — XCUI is deferred to Phase 28
acceptance per CONTEXT D-01, so this list is the human-verify safety
net before Phase 24 closes.

---

## 0 · Prep

- [ ] backend running locally (`make up` in repo root) on `192.168.31.117:8000`
       (matches `BACKEND_URL` env var in `ios/project.yml` scheme).
- [ ] DB clean for the test user (admin `DELETE /api/v1/internal/onboarding/reset`
       if you want to re-run the empty-state branch). Otherwise the gateway
       lands on the Home placeholder immediately on launch.
- [ ] keep the prototype open side-by-side for visual eyeball checks:
       `prototype/poster-screens.jsx` (open in browser via the existing dev
       server, or just eyeball against the screenshots in `.planning/sketches/`).
       NOTE: this is a coarse «не сломалось» check — pixel-perfect comparisons
       are Phase 28's concern.

## 1 · Build + install on simulator

```bash
cd ios
make run     # generate + build + boot iPhone 17 Pro + install + launch
```

- [ ] simulator boots, app launches without crash.
- [ ] coral background fills the screen, JetBrains Mono «ЗАГРУЗКА» eyebrow
       briefly visible (loading plate) before content swaps in.

## 2 · Empty-state path (income_cents:nil, accounts:[])

After admin-reset (or first-ever launch for this `tg_user_id`):

- [ ] gateway lands on **Step 01 / 04 · ДОХОД**.
- [ ] eyebrow «ШАГ 01 / 04 · ДОХОД» renders top-left.
- [ ] Mass title «ОТКУДА·ДЕНЬГИ.» on coral.
- [ ] PosterSlider — drag from 0 to ~80 000 ₽; «ДАЛЕЕ →» is disabled at 0,
       enabled when income > 0.

Tap «ДАЛЕЕ →» → **Step 02 / 04 · СЧЕТА**:

- [ ] eyebrow updates to «ШАГ 02 / 04 · СЧЕТА».
- [ ] hint reads «нужен минимум один счёт» until you add one.
- [ ] tap «+ ДОБАВИТЬ СЧЁТ» → PosterSheet slides up from below.
- [ ] enter bank «Т-БАНК», kind «card», balance via slider/input.
- [ ] **Quirk to verify: PosterSheet drag-to-close.** Drag the sheet header
       downward — it should follow the finger and dismiss past ~50% drag.
       Tap the dim background → also dismisses.
- [ ] after add, hint flips to «1 счёт · NN NNN ₽».
- [ ] add a second account («СБЕР», card) — pluralisation flips to «2 счёта · ...».
- [ ] toggle primary on the second account; first account loses primary mark.
- [ ] «ДАЛЕЕ →» enabled.

Tap «ДАЛЕЕ →» → **Step 03 / 04 · ПЛАН**:

- [ ] eyebrow «ШАГ 03 / 04 · ПЛАН».
- [ ] all 8 default categories render with auto-allocated cents (sum = income).
- [ ] hint: «всё распределено» when sum == income.
- [ ] increase one category past income — hint flips to red «превышение N ₽»
       and «ДАЛЕЕ →» disables.
- [ ] back to balanced — «ДАЛЕЕ →» re-enables.
- [ ] reduce one category — hint flips to «остаётся N ₽ → накопления».

Tap «ДАЛЕЕ →» → **Step 04 / 04 · ЦЕЛЬ**:

- [ ] eyebrow «ШАГ 04 / 04 · ЦЕЛЬ».
- [ ] enter goal name «Грузия», target «500 000 ₽», skip due-date or set one.
- [ ] «ГОТОВО →» CTA visible; disabled until name non-empty AND target > 0.
- [ ] try «ПРОПУСТИТЬ» — lands on Final without goal.

Tap «ГОТОВО →» (or «ПРОПУСТИТЬ») → **FinalView**:

- [ ] hero «ВСЁ.» + italic «деньги — под контролем.» renders.
- [ ] summary plate shows ДОХОД / СЧЕТА / ПЛАН / ЦЕЛЬ rows separated by
       1pt dividers.
- [ ] tap «НАЧАТЬ →» — POST /api/v1/onboarding/complete fires.

## 3 · After-submit refetch (200 → Home placeholder)

After a successful submit:

- [ ] CTA dims, brief loading state, then OnboardingMountView re-fetches /me.
- [ ] gateway swaps to **HomePlaceholderView** (eyebrow «VOL.05 · ДОМ»,
       Mass «ДОМ.», italic «экран — впереди.»).
- [ ] kill app + relaunch → still on HomePlaceholderView (no draft restoration —
       UserDefaults `onboarding.v10.draft` was cleared on 200, verify with
       `xcrun simctl spawn booted plutil -p ~/Library/.../Preferences/com.exeynod.BudgetPlanner.plist`
       if you want a hard check).

## 4 · Persistence path (force-quit mid-flight)

Reset the user via admin endpoint, relaunch, advance to Step 02 with one
account added:

- [ ] long-press app icon in simulator → «Quit», or `xcrun simctl terminate booted com.exeynod.BudgetPlanner`.
- [ ] relaunch via `xcrun simctl launch booted com.exeynod.BudgetPlanner`.
- [ ] gateway lands on **Step 02** with the previously-added account
       still in the list. Income value preserved.

## 5 · Error-state path

Stop the backend (`make down`) and force a reload (kill + relaunch):

- [ ] gateway lands on **ErrorPlate** with copy «не удалось загрузить профиль».
- [ ] tap «ПОПРОБОВАТЬ →» — re-fetches; loading plate flashes; either
       error returns (backend still down) or onboarding flow appears
       (backend back up).

## 6 · 409 conflict path (already onboarded)

After a clean submit (you're now in HomePlaceholderView), trigger a 409
by *not* admin-resetting and somehow forcing the flow again — the live
app cannot do this without help, so this branch is best left to
`FinalSubmitTests.testSubmit409ClearsDraftAndDelaysOnCompleteNil`.

## 7 · Real device (free Apple ID)

If verifying on a physical iPhone (free Apple ID provisioning):

- [ ] `make generate` then open `BudgetPlanner.xcodeproj` in Xcode, set
       signing team to your Apple ID, plug in device, hit ▶︎.
- [ ] iPhone must be on the same Wi-Fi as the Mac running the backend
       (BACKEND_URL is `http://192.168.31.117:8000` — adjust to your
       Mac's IP via `ipconfig getifaddr en0` and edit project.yml +
       `make generate` again).
- [ ] repeat sections 2-5 on device. PosterSheet drag interaction +
       slider haptics differ from simulator — eyeball both.

## What this list intentionally does NOT cover

- pixel-perfect parity with `prototype/poster-screens.jsx` — Phase 28.
- XCUITest automation — Phase 28.
- voice-over / dynamic type — Phase 28.
- low-bandwidth network conditions — Phase 28.

If any item above fails, attach a screenshot to the Phase 24 verification
note and file a follow-up plan.
