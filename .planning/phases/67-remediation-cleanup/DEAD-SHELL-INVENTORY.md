# DEAD-SHELL-INVENTORY — legacy v06 web shell (R5 / P1-6)

Phase 67-06 · 2026-05-20 · web frontend (`frontend/src`)

Documentation only. **No source files are deleted by this plan.** This inventory
records which files load only under the legacy v06 web shell, whether that shell
is reachable after the P1-6 key split, and a KEEP / DELETE-LATER decision.

---

## 1. Shell entry graph

`frontend/src/main.tsx` dispatches one of two shells:

| Shell | Root module | Selector (after P1-6 split, Phase 67-06) |
|-------|-------------|------------------------------------------|
| v10 (default) | `./AppV10` | `VITE_UI_THEME=v10` env, or `localStorage['ui.shell']==='v10'`, or new-install default |
| v06 (legacy)  | `./App`    | `VITE_UI_THEME=v06` env, or `localStorage['ui.shell']==='v06'` |

`App.tsx` (the v06 root) is imported by **`main.tsx` only** (the v06 branch and
the AppV10-import-failure defensive fallback). No V10 production code imports it.

`AppV10` uses its own API layer under `src/api/v10/*` (accounts, actual, ai,
analytics, categories, goals, planMonth, savings, subscriptions) and its own
`screensV10/*` + `componentsV10/*`. The legacy layer is therefore parallel, not
shared — with the small exceptions listed in §4.

## 2. Reachability after the P1-6 key split

**Reachable.** Before Phase 67-06, the shell dispatcher and the theme picker
both wrote `localStorage['ui.theme']` with incompatible vocabularies
(`v06`/`v10` vs `maximal_poster`/`liquid_glass`/`ios_default`). Selecting any v10
theme stored a value the dispatcher did not recognise, so it fell through to the
`v10` default and the v06 shell became **unreachable at runtime** via the UI.

After the split:
- shell dispatch reads its own key `ui.shell` (vocabulary `v06`/`v10`);
- the theme picker (`screensV10/common/useTheme.ts`) is the sole owner of
  `ui.theme` (theme values only).

The v06 shell is now reachable **independently of theme choice** via either:
- build-time `VITE_UI_THEME=v06`, or
- runtime `localStorage['ui.shell']='v06'` (whitelist-validated).

A one-time migration shim in `main.tsx` adopts a legacy `v06`/`v10` value left on
`ui.theme` into `ui.shell`, so pre-existing installs keep their shell choice.

## 3. Files reachable ONLY through the v06 shell (`App.tsx` graph)

Evidence: import-graph grep across `src/screensV10`, `src/componentsV10`,
`src/AppV10.tsx` for each legacy module — listed below are modules with **zero**
production references from the V10 graph (and not used by the standalone
`src/preview/PreviewApp.tsx` QA entry).

### 3a. v06 root + screens (`src/screens/*`)
v06-only. `App.tsx` is the sole importer chain.
- `App.tsx` (+ `App.module.css`)
- `screens/OnboardingScreen`, `HomeScreen`, `CategoriesScreen`, `TemplateScreen`,
  `SettingsScreen`, `SubscriptionsScreen`, `TransactionsScreen`,
  `ManagementScreen`, `AccessScreen`, `AnalyticsScreen`, `AiScreen`,
  `HistoryView`, `PlannedView` (13 `.tsx` + matching `.module.css`)

### 3b. legacy hooks (`src/hooks/*`) — v06-only
`useCountUp` is the ONLY hook referenced by V10 (1 ref) → **shared, keep**.
v06-only hooks (16): `useActual`, `useAdminAiUsage`, `useAdminUsers`,
`useAiCategorize`, `useAiConversation`, `useAnalytics`, `useCategories`,
`useCurrentPeriod`, `useDashboard`, `useFabAction`, `usePeriods`, `usePlanned`,
`useSettings`, `useSubscriptions`, `useTemplate`, `useUser`.

### 3c. legacy api modules (`src/api/*`) — v06-only
Zero V10 production references: `billing`, `categories`, `planned`,
`subscriptions`, `templates`, `tier`.
(Shared with V10, **keep**: `actual`, `admin`, `ai`, `analytics`, `client`,
`me`, `onboardingV10`, `periods`, `types`.)

### 3d. legacy components (`src/components/*`, 38 `.tsx`) — v06-only in production
The only V10→legacy-component reference is a **test** importing the v06
`BottomNav` as a regression fixture (`screensV10/__tests__/TxV10TabDemote.test.tsx`),
which is not a production reachability path. All 38 legacy components otherwise
load only through `App.tsx`/`screens/*`.

**Approx. v06-only file count:** ~13 screens (×2 with css) + 16 hooks +
6 api modules + ~38 components (×2 with css) ≈ **50+ files** — matches the R5
spec estimate.

## 4. Cross-shell shared modules (do NOT delete with the shell)
- `src/hooks/useCountUp.ts`
- `src/api/{actual,admin,ai,analytics,client,me,onboardingV10,periods,types}.ts`
- `src/components/BottomNav.tsx` — referenced by a V10 regression test only
  (move the fixture or keep BottomNav if the shell is deleted).
- `src/preview/PreviewApp.tsx` — standalone QA preview entry; imports neither the
  v06 nor v10 shell. Independent of this decision.

## 5. Decision: **KEEP (DELETE-LATER candidate, follow-up scoped)**

The v06 shell is a **reachable, maintained alternative** after the P1-6 split
(`ui.shell=v06` / `VITE_UI_THEME=v06`). It is therefore NOT dead UI today — the
collision that made it look dead has been removed. Per CONTEXT R5 default
(split key now, inventory now, delete later only if confirmed unreachable +
low-risk), deletion is **out of scope** for Phase 67-06.

This is consistent with R6 (ARCH-A1): the iOS analogue (`MainShell` v06 vs
`V10MainShell`) is still ROADMAP-fixed as "permanent alternative" pending an
owner decision. Deleting the web v06 shell pre-empts that product call.

### Proposed bounded follow-up (only if owner sunsets v06)
1. Confirm no environment ships `VITE_UI_THEME=v06` and no install relies on
   `ui.shell=v06`.
2. Remove the v06 branch + defensive fallback in `main.tsx`; default to v10 only.
3. Relocate the `BottomNav` test fixture (§4) before deleting `components/`.
4. Delete §3a–§3d v06-only files; keep §4 shared modules.
5. `npm run build` + `npm test` green; verify bundle-size reduction.

Until that owner decision, the shell stays.
