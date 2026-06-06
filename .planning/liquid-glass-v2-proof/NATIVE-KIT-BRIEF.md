# Liquid Glass v2 — Native web kit brief (for porting screens)

**Goal:** port each web screen to the native iOS «Liquid Glass» design, reusing
ALL data logic. The native shell renders when `ui.theme === 'liquid_glass'`.
Maximal Poster (`maximal_poster`) is the default and MUST NOT regress.

Reference screenshots (the design source of truth):
`/Users/exy/pet_projects/tg-budget-planner/.planning/ios-native-screens/`
(00-onboarding, 01-home, 02-transactions, 03-management). Also live iOS sim.

Proven reference implementation: **Home** — `screensV10/Home/NativeHomeView.tsx`

- the branch in `screensV10/Home/HomeMount.tsx`. Copy that pattern.

## Architecture (DO follow exactly)

Each screen reuses its existing **Mount** (data fetcher) and adds a variant branch:

```tsx
import { useShellVariant } from "../native/ShellVariant";
import { NativeXView } from "./NativeXView";
// inside the Mount component, near the top:
const variant = useShellVariant(); // 'native' | 'poster' (default poster)
// ...in the ready render:
if (variant === "native") return <NativeXView {...sameProps} />;
return <XView {...props} />; // unchanged poster path
```

- The poster path MUST stay byte-identical (pixel baselines). Only ADD a branch.
- `NativeXView` consumes the SAME props the poster `XView` receives.
- Do NOT duplicate data logic. If you need a derived value, compute it in the
  native view from existing props, or add an additive field to the Mount vm.

## Primitives (`screensV10/native/NativePrimitives.tsx`)

- `<NativeLargeTitle title trailing? />` — big screen title + optional right action (tab roots: Главная/Транзакции/Управление).
- `<NativeNavBar title onBack? trailing? />` — pushed/detail screens: back chevron + centered title.
- `<SectionHeader>Категории</SectionHeader>` — grey grouped section label.
- `<InsetGroup>` … `<InsetRow leading? title subtitle? trailing? trailingMuted? chevron? onClick? testId? />` — white rounded grouped card + rows with hairline separators (inset past icon).
- `<Segmented options value onChange ariaLabel? />` — iOS segmented control (e.g. Расходы/Доходы, История/План).
- `<CircleButton onClick ariaLabel testId?>{icon}</CircleButton>` — round white header action (e.g. «+», filter).
- `<NativeTabBar active onTab />` — owned by the shell; do not re-render in screens.

Helpers:

- `screensV10/native/CategoryIcon.tsx` → `<CategoryIcon name id? size? />` — phosphor tile (colored rounded square + white glyph). Use for category rows.
- `screensV10/native/money.ts` → `formatMoneyNative(cents)` ("50 000", "1 155,54"), `formatSignedMoneyNative(cents)` ("+27 644,46"/"−…"), `formatMoneyRubNative(cents)` ("… ₽"). Native shows kopecks when present; do NOT use poster `formatRubles` (floors).
- `screensV10/native/AddSheetHost.tsx` → `useAddSheetHost().openAddSheet()` for the «+» action (Home only, per iOS).

Icons: `@phosphor-icons/react` (already a dep — the SF Symbols stand-in). Do NOT
add lucide or other icon libs. weight="fill" for filled/active, "regular" else.

## Design tokens (CSS vars, defined in `stylesV10/native.css`, prefixed `--lgn-`)

bg `--lgn-bg` #F2F2F7 · card `--lgn-card` #fff · ink `--lgn-ink` #1C1C1E ·
secondary `--lgn-ink-2` rgba(60,60,67,.6) · tertiary `--lgn-ink-3` ·
accent `--lgn-accent` #FF7A4C · green `--lgn-green` #34C759 · red `--lgn-red` ·
blue `--lgn-blue` #007AFF · hairline-soft `--lgn-hairline-soft` · radius card
`--lgn-r-card` 14px · font `--lgn-font` (SF Pro / -apple-system). Use these vars
in your `Native*View.module.css`. Scope all classes via CSS modules.

## Conventions (CRITICAL — from the owner)

- NO invented functionality, NO dead/broken buttons. Mirror the EXISTING UX of
  the poster screen — same actions, same navigation targets, same data. If the
  poster screen has a control, port it; if it doesn't, don't add one.
- Sign convention: positive = good. Expenses delta = План−Факт; income = Факт−План.
- Money is BIGINT kopecks; never float. Rubles on UI via the native formatter.
- Pushed detail screens get a back chevron via `usePosterRouter().pop` →
  `<NativeNavBar onBack={() => router.pop()} />`. Use `usePosterRouterOptional()`
  from `../common` if the view may render standalone in tests.

## Verify

- `npx tsc -b` must pass.
- Maximal Poster: do not touch poster `*View.tsx`/`*.module.css`. Branch in Mount only.
- Screenshots: the spec `tests/e2e/native-liquid-glass.spec.ts` mocks an onboarded
  user under `ui.theme='liquid_glass'` and captures each screen. Add a capture for
  your screen there (or the main session will).
