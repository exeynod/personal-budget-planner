---
phase: 50-theme-registry
plan: 01
requirements: [THEME-03]
status: complete
commit: 9a8b255
---

# Phase 50-01 Summary — Multi-theme tokens + codegen

## What shipped

- `design/tokens.json` +46 lines: добавлена `themes.{maximal_poster,liquid_glass,ios_default}` секция; `themes.maximal_poster` пустая (uses :root defaults — zero regression); LG palette + materials + shadows; iOS Default palette + system fonts.
- `scripts/gen-tokens.ts` +81 lines: extended для emit per-theme blocks `[data-theme="X"]` (skip пустой maximal_poster), Swift `Theme` enum + `LiquidGlassTokens` / `IOSDefaultTokens` namespaces.
- `frontend/src/stylesV10/tokens.css` regenerated: includes 2 new per-theme blocks (28 lines).
- `ios/BudgetPlanner/FeaturesV10/Common/PosterTokens.swift` regenerated: includes Theme enum + per-theme token namespaces (42 lines).

## Verification

- `npx tsx scripts/gen-tokens.ts` → "✓ tokens.css and PosterTokens.swift regenerated"
- `grep -c '\[data-theme="liquid_glass"\]' tokens.css` → 1
- `grep -c 'enum Theme' PosterTokens.swift` → 1

## Decisions

- `themePrefix` map in codegen: `lg-` / `ios-` / `poster-` (последний for non-themed root).
- Material blur values web-only (no Swift equivalent — iOS uses native `.glassEffect()`).
- `Color(hex:)` already existed в PosterTokens.swift — reused; non-hex semi-transparent values use `Color(.sRGB, ...)`.
