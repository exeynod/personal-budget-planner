---
phase: 51-liquid-glass-system
plan: 01
requirements: [LG-SYS-01, LG-SYS-02, LG-SYS-03, LG-SYS-04]
status: complete
commit: a2dc43a
---

# Phase 51-01 Summary — LG tokens finalize (palette/material/typography/motion/radius)

## What shipped

- `design/tokens.json` `themes.liquid_glass`: finalized palette (bg/glass-tint/border/text), 4-level materials, SF Pro typography stack + 11 HIG font sizes (largeTitle..caption2), motion (3 springs + 3 durations), radius scale (card/sheet/button/pill).
- `frontend/src/stylesV10/tokens.css` regenerated: `[data-theme="liquid_glass"]` block содержит все LG-SYS-01..04 vars.
- `ios/BudgetPlanner/FeaturesV10/Common/PosterTokens.swift` regenerated: `LiquidGlassTokens` namespace расширен FontSize / Radius / Motion sub-enums.

## Verification

- `npx tsx scripts/gen-tokens.ts` clean.
- `grep -c "lg-font-size" tokens.css` → 11 (all HIG sizes present).
- `grep -c "lg-radius" tokens.css` → 4 (card/sheet/button/pill).
- Maximal Poster baselines — zero diff (only `[data-theme="liquid_glass"]` block touched).

## Decisions

- Material `--lg-material-*` остаются web-only (Swift namespace skip — native Material on iOS).
- SF Pro fallback stack: `-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif` —
  иmage on non-Apple browsers использует system default.
- Motion: cubic-bezier curve approximations системных SwiftUI springs (`.smooth`, `.bouncy`).
