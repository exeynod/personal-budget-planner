---
phase: 23-design-system-foundation
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - design/tokens.json
  - scripts/gen-tokens.ts
  - package.json
  - Makefile
  - frontend/src/stylesV10/tokens.css
  - ios/BudgetPlanner/FeaturesV10/Common/PosterTokens.swift
autonomous: true
requirements: [DS-01]
tags: [design-system, codegen, tokens]
must_haves:
  truths:
    - "Designer edits design/tokens.json and `npm run gen:tokens` regenerates web CSS + iOS Swift tokens with no manual sync."
    - "make tokens-check exits 0 when generated artifacts are committed; non-zero when they drift from source."
    - "Generated tokens.css contains every palette entry from CONTEXT.md / DESIGN-SYSTEM.md §1 as CSS custom properties."
    - "Generated PosterTokens.swift exposes static let constants on `enum PosterTokens` (or struct) consumable from SwiftUI."
  artifacts:
    - path: "design/tokens.json"
      provides: "Single source of truth — palette, spacing scale, typography registry, radii, shadows, easing curves"
    - path: "scripts/gen-tokens.ts"
      provides: "Custom Node TS generator (~80-120 LOC, no external deps)"
    - path: "package.json"
      provides: "Repo-root npm with scripts: gen:tokens, gen:tokens:watch, tokens-check"
    - path: "Makefile"
      provides: "tokens-check target wraps gen:tokens + git diff --exit-code"
    - path: "frontend/src/stylesV10/tokens.css"
      provides: "Generated CSS custom properties (--poster-*)"
    - path: "ios/BudgetPlanner/FeaturesV10/Common/PosterTokens.swift"
      provides: "Generated Swift Color/CGFloat constants for SwiftUI"
  key_links:
    - from: "design/tokens.json"
      to: "frontend/src/stylesV10/tokens.css"
      via: "scripts/gen-tokens.ts string templating"
    - from: "design/tokens.json"
      to: "ios/BudgetPlanner/FeaturesV10/Common/PosterTokens.swift"
      via: "scripts/gen-tokens.ts string templating"
    - from: "Makefile tokens-check"
      to: "scripts/gen-tokens.ts"
      via: "npm run gen:tokens && git diff --exit-code"
---

<objective>
Establish single-source design tokens in `design/tokens.json` and a custom TypeScript Node generator (`scripts/gen-tokens.ts`, ~80-120 LOC, stdlib only) that emits both `frontend/src/stylesV10/tokens.css` (CSS custom properties) and `ios/BudgetPlanner/FeaturesV10/Common/PosterTokens.swift` (Swift Color/CGFloat constants for SwiftUI). Add repo-root `package.json` (this repo currently has no root package.json) with `gen:tokens` / `gen:tokens:watch` / `tokens-check` scripts, and add `Makefile` target `tokens-check` that runs the generator and fails CI if generated artifacts drift from source.

Purpose: DS-01 round-trip — designer commits a hex change to `design/tokens.json`, runs `npm run gen:tokens`, and both web + iOS update without manual edits. CI catches missed regenerations.
Output: 6 files (1 source, 1 generator, 2 build configs, 2 generated artifacts) committed atomically.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/phases/23-design-system-foundation/23-CONTEXT.md
@.planning/v1.0-handoff/handoff/DESIGN-SYSTEM.md
@.planning/research/ADR-001-cyrillic-font-fallback.md
@CLAUDE.md

<read_first>
- `.planning/v1.0-handoff/handoff/DESIGN-SYSTEM.md` §1 (palette), §2 (typography scale), §3 (spacing scale 4/8/10/12/14/18/22/24/28/40/56), §4 (radii + shadows), §7.1 (easing curves)
- `.planning/phases/23-design-system-foundation/23-CONTEXT.md` Area 1 (codegen toolchain)
- `frontend/src/main.tsx` — verify how existing tokens.css is imported (will follow same pattern)
- `ios/BudgetPlanner/Design/Tokens.swift` — verify existing v0.6 token style (so PosterTokens.swift shape is consistent)
- `ios/Makefile` — note existing format/build targets; root Makefile is NEW for this repo
- `frontend/package.json` — verify TypeScript version (5.6.2) — use compatible tsx loader
</read_first>

<interfaces>
<!-- Tokens schema produced by this plan; all later plans MUST consume from generated outputs, NOT redefine. -->

design/tokens.json schema (canonical):
```json
{
  "$schema": "./tokens.schema.json",
  "version": "1.0.0",
  "color": {
    "cream":  "#F4EAD9",
    "ink":    "#1B1A18",
    "paper":  "#FFF6E8",
    "black":  "#0E0E0E",
    "coral":  "#FF5A3C",
    "cobalt": "#1B2A6B",
    "yellow": "#FFE76E",
    "red":    "#C24A2A"
  },
  "spacing": { "s4": 4, "s8": 8, "s10": 10, "s12": 12, "s14": 14, "s18": 18, "s22": 22, "s24": 24, "s28": 28, "s40": 40, "s56": 56 },
  "radius": { "none": 0, "device": 48 },
  "shadow": {
    "tabBar": "0 12px 30px rgba(0,0,0,0.45)",
    "fab":    "0 6px 16px rgba(255,231,110,0.35)",
    "thumb":  "0 2px 6px rgba(0,0,0,0.25)"
  },
  "font": {
    "archivoBlack": "Archivo Black",
    "dmSerifItalic": "DM Serif Display",
    "ptSerifItalic": "PT Serif",
    "manrope":      "Manrope Variable",
    "jetBrainsMono":"JetBrains Mono Variable",
    "posterSerifItalic": "PosterSerifItalic"
  },
  "fontSize": {
    "eye": 11, "monoSm": 11, "bodySm": 12, "body": 13, "monoMd": 14,
    "italicMd": 17, "displaySm": 28, "display": 88, "mass": 88, "massItalic": 70
  },
  "letterSpacing": { "eye": "0.18em", "cta": "0.14em", "hero": "-0.04em", "mass": "-0.04em", "uppercaseBody": "0.04em" },
  "easing": {
    "easeOut":   "cubic-bezier(0.22, 0.61, 0.36, 1)",
    "overshoot": "cubic-bezier(0.34, 1.56, 0.64, 1)",
    "sheetEase": "cubic-bezier(0.32, 0.72, 0, 1)"
  }
}
```

Output `frontend/src/stylesV10/tokens.css` shape:
```css
/* AUTO-GENERATED by scripts/gen-tokens.ts — do not edit by hand */
:root {
  --poster-coral: #FF5A3C;
  --poster-cobalt: #1B2A6B;
  /* ... */
  --poster-space-22: 22px;
  --poster-radius-none: 0;
  --poster-shadow-tab-bar: 0 12px 30px rgba(0,0,0,0.45);
  --poster-font-archivo-black: 'Archivo Black';
  --poster-easing-ease-out: cubic-bezier(0.22, 0.61, 0.36, 1);
  /* ... */
}
```

Output `ios/BudgetPlanner/FeaturesV10/Common/PosterTokens.swift` shape:
```swift
// AUTO-GENERATED by scripts/gen-tokens.ts — do not edit by hand
import SwiftUI
import CoreGraphics

enum PosterTokens {
    enum Color {
        static let coral  = SwiftUI.Color(hex: "FF5A3C")
        static let cobalt = SwiftUI.Color(hex: "1B2A6B")
        // ...
    }
    enum Space {
        static let s4:  CGFloat = 4
        static let s22: CGFloat = 22
        // ...
    }
    enum Radius { static let none: CGFloat = 0; static let device: CGFloat = 48 }
    enum Shadow {
        static let tabBar = (radius: CGFloat(30), x: CGFloat(0), y: CGFloat(12), opacity: 0.45)
        static let fab    = (radius: CGFloat(16), x: CGFloat(0), y: CGFloat(6),  opacity: 0.35)
        static let thumb  = (radius: CGFloat(6),  x: CGFloat(0), y: CGFloat(2),  opacity: 0.25)
    }
    enum Font {
        static let archivoBlack    = "Archivo Black"
        static let dmSerifItalic   = "DMSerifDisplay-Italic"
        static let ptSerifItalic   = "PTSerif-Italic"
        static let manrope         = "Manrope"          // variable
        static let jetBrainsMono   = "JetBrainsMono"    // variable
    }
    enum FontSize {
        static let eye:        CGFloat = 11
        // ...
    }
    enum Easing {
        // SwiftUI Animation timingCurve(c0x, c0y, c1x, c1y, duration:)
        static let easeOutControl   = (c0x: 0.22, c0y: 0.61, c1x: 0.36, c1y: 1.0)
        static let overshootControl = (c0x: 0.34, c0y: 1.56, c1x: 0.64, c1y: 1.0)
        static let sheetEaseControl = (c0x: 0.32, c0y: 0.72, c1x: 0.0,  c1y: 1.0)
    }
}

// SwiftUI Color hex helper (placed once, also used by PosterAnimations.swift)
extension SwiftUI.Color {
    init(hex: String) {
        var s = hex.trimmingCharacters(in: .alphanumerics.inverted)
        if s.count == 6 { s += "FF" }
        let v = UInt64(s, radix: 16) ?? 0xFF5A3CFF
        self.init(.sRGB,
                  red:   Double((v >> 24) & 0xFF) / 255,
                  green: Double((v >> 16) & 0xFF) / 255,
                  blue:  Double((v >>  8) & 0xFF) / 255,
                  opacity: Double( v        & 0xFF) / 255)
    }
}
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Create design/tokens.json + repo-root package.json + Makefile target</name>
  <files>design/tokens.json, package.json, Makefile</files>
  <read_first>
    - `.planning/v1.0-handoff/handoff/DESIGN-SYSTEM.md` §1, §2, §3, §4, §7.1 — extract every palette hex, spacing value, font-family name, radius, shadow recipe, and easing curve.
    - `frontend/package.json` — note that there's a workspace package; the new repo-root `package.json` MUST be minimal (devDependencies-only: `tsx`, `typescript`).
    - `ios/Makefile` — confirm existing iOS targets; root Makefile is NEW.
  </read_first>
  <action>
    Create `design/tokens.json` populated with EXACTLY the values from DESIGN-SYSTEM.md §1-§4 + §7.1 (palette, spacing 4/8/10/12/14/18/22/24/28/40/56, radii none/device, shadows for tabBar/fab/thumb, font families, fontSize scale per §2 «Шкала размеров», letterSpacing per §2 «Letter-spacing», easing per §7.1). Use the schema from `<interfaces>` block above verbatim.

    Create repo-root `/package.json` (NOTE: this file does not exist yet — `ls /Users/exy/pet_projects/tg-budget-planner/package.json` returns "No such file"):
    ```json
    {
      "name": "tg-budget-planner-monorepo",
      "private": true,
      "version": "1.0.0",
      "scripts": {
        "gen:tokens": "tsx scripts/gen-tokens.ts",
        "gen:tokens:watch": "tsx watch scripts/gen-tokens.ts",
        "tokens-check": "npm run gen:tokens && git diff --exit-code design/ frontend/src/stylesV10/tokens.css ios/BudgetPlanner/FeaturesV10/Common/PosterTokens.swift"
      },
      "devDependencies": {
        "tsx": "^4.19.2",
        "typescript": "^5.6.2"
      }
    }
    ```
    Use `tsx` (≥4.19) — modern Node TS loader, zero config. NOT `ts-node` (slower, requires more config). NOT `style-dictionary` per CONTEXT decision.

    Create root `/Makefile`:
    ```makefile
    .PHONY: tokens tokens-check

    tokens:
    	npm run gen:tokens

    tokens-check:
    	@npm run gen:tokens >/dev/null
    	@git diff --exit-code design/ frontend/src/stylesV10/tokens.css ios/BudgetPlanner/FeaturesV10/Common/PosterTokens.swift \
    	  || (echo "ERROR: generated tokens drifted from source. Run 'make tokens' and commit."; exit 1)
    ```

    Run `npm install` after writing files to populate `node_modules/tsx` and write `package-lock.json`.
  </action>
  <acceptance_criteria>
    - `test -f design/tokens.json && python3 -c "import json; json.load(open('design/tokens.json'))"` exits 0 (valid JSON)
    - `jq '.color.coral' design/tokens.json` returns `"#FF5A3C"` exactly
    - `jq '.color | length' design/tokens.json` returns `8`
    - `jq '.spacing | length' design/tokens.json` returns `11`
    - `jq '.easing.easeOut' design/tokens.json` returns `"cubic-bezier(0.22, 0.61, 0.36, 1)"` exactly
    - `test -f package.json && jq -r '.scripts."gen:tokens"' package.json` returns `"tsx scripts/gen-tokens.ts"`
    - `jq -r '.scripts."tokens-check"' package.json` contains `"git diff --exit-code"`
    - `grep -c "^tokens-check:" Makefile` returns `1`
    - `npm install` exits 0; `node_modules/.bin/tsx` exists
  </acceptance_criteria>
  <verify>
    <automated>test -f design/tokens.json &amp;&amp; jq -r '.color.coral' design/tokens.json | grep -q '^#FF5A3C$' &amp;&amp; jq -r '.scripts."tokens-check"' package.json | grep -q 'git diff --exit-code' &amp;&amp; grep -q '^tokens-check:' Makefile</automated>
  </verify>
  <done>
    design/tokens.json, package.json, Makefile committed; `npm install` succeeds and writes package-lock.json.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Implement scripts/gen-tokens.ts and emit web + iOS artifacts</name>
  <files>scripts/gen-tokens.ts, frontend/src/stylesV10/tokens.css, ios/BudgetPlanner/FeaturesV10/Common/PosterTokens.swift</files>
  <read_first>
    - `design/tokens.json` from Task 1 (now present)
    - `<interfaces>` block above for output shape
    - `ios/BudgetPlanner/Design/Tokens.swift` to mirror conventions for SwiftUI Color extension placement (we re-define `Color(hex:)` here, but keep it scoped via `extension SwiftUI.Color` in PosterTokens.swift to avoid clash with existing v0.6 Color helpers if any)
  </read_first>
  <behavior>
    - Test 1 (idempotency): run generator twice in a row → second run produces byte-identical output (`md5sum tokens.css PosterTokens.swift` matches between runs).
    - Test 2 (color round-trip): `jq '.color.coral = "#ABCDEF"' design/tokens.json | sponge design/tokens.json && npm run gen:tokens` → `tokens.css` contains `--poster-coral: #ABCDEF` AND `PosterTokens.swift` contains `Color(hex: "ABCDEF")`.
    - Test 3 (drift detection): `make tokens-check` exits 0 when committed; manually edit tokens.css and `make tokens-check` exits non-zero with the error message.
    - Test 4 (no external deps): `node --experimental-strip-types scripts/gen-tokens.ts` works AND `grep -E "^import" scripts/gen-tokens.ts | grep -v "node:"` returns nothing (only Node stdlib imports allowed).
  </behavior>
  <action>
    Create `scripts/gen-tokens.ts` (≤120 LOC, stdlib only):

    ```typescript
    #!/usr/bin/env tsx
    // AUTO-GENERATED outputs do NOT edit by hand. Edit design/tokens.json + this script.
    import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
    import { dirname, join } from 'node:path';

    const ROOT = join(import.meta.dirname, '..');
    const SRC = join(ROOT, 'design/tokens.json');
    const OUT_CSS = join(ROOT, 'frontend/src/stylesV10/tokens.css');
    const OUT_SWIFT = join(ROOT, 'ios/BudgetPlanner/FeaturesV10/Common/PosterTokens.swift');

    type Tokens = {
      version: string;
      color: Record<string, string>;
      spacing: Record<string, number>;
      radius: Record<string, number>;
      shadow: Record<string, string>;
      font: Record<string, string>;
      fontSize: Record<string, number>;
      letterSpacing: Record<string, string>;
      easing: Record<string, string>;
    };

    const t: Tokens = JSON.parse(readFileSync(SRC, 'utf8'));

    // ---------- helpers ----------
    const kebab = (s: string) => s.replace(/([A-Z])/g, '-$1').toLowerCase();
    const camelKeys = <T>(obj: Record<string, T>) => Object.entries(obj);

    // ---------- CSS emit ----------
    const cssLines: string[] = ['/* AUTO-GENERATED by scripts/gen-tokens.ts — do not edit. */', ':root {'];
    for (const [k, v] of camelKeys(t.color))         cssLines.push(`  --poster-${kebab(k)}: ${v};`);
    for (const [k, v] of camelKeys(t.spacing))       cssLines.push(`  --poster-space-${k.replace(/^s/, '')}: ${v}px;`);
    for (const [k, v] of camelKeys(t.radius))        cssLines.push(`  --poster-radius-${kebab(k)}: ${v}px;`);
    for (const [k, v] of camelKeys(t.shadow))        cssLines.push(`  --poster-shadow-${kebab(k)}: ${v};`);
    for (const [k, v] of camelKeys(t.font))          cssLines.push(`  --poster-font-${kebab(k)}: '${v}';`);
    for (const [k, v] of camelKeys(t.fontSize))      cssLines.push(`  --poster-font-size-${kebab(k)}: ${v}px;`);
    for (const [k, v] of camelKeys(t.letterSpacing)) cssLines.push(`  --poster-tracking-${kebab(k)}: ${v};`);
    for (const [k, v] of camelKeys(t.easing))        cssLines.push(`  --poster-easing-${kebab(k)}: ${v};`);
    cssLines.push('}', '');
    mkdirSync(dirname(OUT_CSS), { recursive: true });
    writeFileSync(OUT_CSS, cssLines.join('\n'));

    // ---------- Swift emit ----------
    const swiftLines: string[] = [
      '// AUTO-GENERATED by scripts/gen-tokens.ts — do not edit.',
      'import SwiftUI',
      'import CoreGraphics',
      '',
      'enum PosterTokens {',
      '    enum Color {',
      ...camelKeys(t.color).map(([k, v]) =>
        `        static let ${k} = SwiftUI.Color(hex: "${v.replace('#', '')}")`),
      '    }',
      '    enum Space {',
      ...camelKeys(t.spacing).map(([k, v]) =>
        `        static let ${k}: CGFloat = ${v}`),
      '    }',
      '    enum Radius {',
      ...camelKeys(t.radius).map(([k, v]) =>
        `        static let ${k}: CGFloat = ${v}`),
      '    }',
      '    enum FontSize {',
      ...camelKeys(t.fontSize).map(([k, v]) =>
        `        static let ${k}: CGFloat = ${v}`),
      '    }',
      '    enum Font {',
      ...camelKeys(t.font).map(([k, v]) =>
        `        static let ${k} = "${v}"`),
      '    }',
      '    enum Easing {',
      ...camelKeys(t.easing).map(([k, v]) => {
        // parse "cubic-bezier(0.22, 0.61, 0.36, 1)" → control points
        const m = v.match(/cubic-bezier\(([^)]+)\)/);
        const [c0x, c0y, c1x, c1y] = (m?.[1] ?? '0,0,1,1').split(',').map(s => s.trim());
        return `        static let ${k}Control = (c0x: ${c0x}, c0y: ${c0y}, c1x: ${c1x}, c1y: ${c1y})`;
      }),
      '    }',
      '    enum Shadow {',
      ...camelKeys(t.shadow).map(([k, v]) => {
        // parse "0 12px 30px rgba(0,0,0,0.45)" → x, y, blur, opacity
        const m = v.match(/(-?\d+)px?\s+(-?\d+)px?\s+(-?\d+)px?\s+rgba?\(([^)]+)\)/);
        const [x, y, blur] = m ? [m[1], m[2], m[3]] : ['0', '0', '0'];
        const opacity = m ? (m[4].split(',').pop() || '0').trim() : '0';
        return `        static let ${k} = (x: CGFloat(${x}), y: CGFloat(${y}), blur: CGFloat(${blur}), opacity: ${opacity})`;
      }),
      '    }',
      '}',
      '',
      'extension SwiftUI.Color {',
      '    init(hex: String) {',
      '        var s = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)',
      '        if s.count == 6 { s += "FF" }',
      '        let v = UInt64(s, radix: 16) ?? 0xFF5A3CFF',
      '        self.init(.sRGB,',
      '                  red:   Double((v >> 24) & 0xFF) / 255,',
      '                  green: Double((v >> 16) & 0xFF) / 255,',
      '                  blue:  Double((v >>  8) & 0xFF) / 255,',
      '                  opacity: Double( v        & 0xFF) / 255)',
      '    }',
      '}',
      '',
    ];
    mkdirSync(dirname(OUT_SWIFT), { recursive: true });
    writeFileSync(OUT_SWIFT, swiftLines.join('\n'));

    console.log('✓ tokens.css and PosterTokens.swift regenerated');
    ```

    Run `npm run gen:tokens` once, commit the two generated files. Then verify `make tokens-check` exits 0 (idempotent).

    NOTES:
    - Per D-CONTEXT Area 1: ~80 LOC target — current draft is ~100 LOC including Swift heredoc, acceptable. Keep ≤120.
    - Use ONLY `node:fs` and `node:path` imports — no external npm packages.
    - The Swift Color hex helper is emitted INSIDE `PosterTokens.swift` so consumers don't need separate import wiring; check that it does NOT clash with any existing `extension Color` in `ios/BudgetPlanner/Design/`.
  </action>
  <acceptance_criteria>
    - `wc -l scripts/gen-tokens.ts` ≤ 120
    - `grep -E "^import" scripts/gen-tokens.ts | grep -v "from 'node:" | wc -l` returns `0` (only stdlib imports)
    - `npm run gen:tokens` exits 0 and prints `✓ tokens.css and PosterTokens.swift regenerated`
    - `head -1 frontend/src/stylesV10/tokens.css` contains `AUTO-GENERATED`
    - `grep -F -- "--poster-coral: #FF5A3C;" frontend/src/stylesV10/tokens.css` returns 1 hit
    - `grep -F -- "--poster-easing-ease-out: cubic-bezier(0.22, 0.61, 0.36, 1);" frontend/src/stylesV10/tokens.css` returns 1 hit
    - `grep -F 'static let coral = SwiftUI.Color(hex: "FF5A3C")' ios/BudgetPlanner/FeaturesV10/Common/PosterTokens.swift` returns 1 hit
    - `grep -F 'static let s22: CGFloat = 22' ios/BudgetPlanner/FeaturesV10/Common/PosterTokens.swift` returns 1 hit
    - Idempotency: `npm run gen:tokens && md5_a=$(md5 -q frontend/src/stylesV10/tokens.css) && npm run gen:tokens && md5_b=$(md5 -q frontend/src/stylesV10/tokens.css) && [ "$md5_a" = "$md5_b" ]`
    - Round-trip: `make tokens-check` exits 0 immediately after commit (no drift).
    - Drift detection: temp-edit `frontend/src/stylesV10/tokens.css` (append a comment), `make tokens-check` exits non-zero; revert.
    - iOS smoke: `grep -F 'extension SwiftUI.Color' ios/BudgetPlanner/FeaturesV10/Common/PosterTokens.swift` returns 1 hit
  </acceptance_criteria>
  <verify>
    <automated>npm run gen:tokens &amp;&amp; grep -F -- '--poster-coral: #FF5A3C;' frontend/src/stylesV10/tokens.css &amp;&amp; grep -F 'static let coral = SwiftUI.Color(hex: "FF5A3C")' ios/BudgetPlanner/FeaturesV10/Common/PosterTokens.swift &amp;&amp; make tokens-check</automated>
  </verify>
  <done>
    Generator produces deterministic web + iOS tokens; `make tokens-check` exits 0 on committed state and non-zero on drift; coral hex round-trip works; ~100 LOC TypeScript with stdlib-only imports.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Local FS → committed repo | Generator writes files that go into git; malicious tokens.json could inject arbitrary CSS/Swift |
| Designer → tokens.json | Untrusted hex/numeric inputs may break parsing |
| CI runner → make tokens-check | Drift detection assumes generator is deterministic |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-23-01-01 | Tampering | scripts/gen-tokens.ts | mitigate | Idempotency test (Task 2 acceptance) ensures deterministic output; CI gate via `make tokens-check` blocks merge on drift |
| T-23-01-02 | Tampering | design/tokens.json | mitigate | JSON schema validity enforced via `JSON.parse` throw in generator; type assertion `as Tokens` does not validate at runtime, but downstream `cubic-bezier` regex parses safely (returns "0,0,1,1" fallback if malformed). Future: add `tokens.schema.json` if schema drift becomes an issue (Phase 28 polish task). |
| T-23-01-03 | Information Disclosure | tokens.json | accept | Tokens are public design metadata (palette, fonts) — no secrets |
| T-23-01-04 | Denial of Service | tsx loader | accept | Local dev tool; no remote attack surface |
| T-23-01-05 | Elevation of Privilege | tsx in node_modules | mitigate | Pin `tsx@^4.19.2` in package.json devDependencies; package-lock.json captures sub-dep tree; npm audit run before merge if needed |
</threat_model>

<verification>
Run sequentially:
1. `python3 -c "import json; json.load(open('design/tokens.json'))"` exits 0
2. `npm run gen:tokens` exits 0
3. `git diff --exit-code design/ frontend/src/stylesV10/tokens.css ios/BudgetPlanner/FeaturesV10/Common/PosterTokens.swift` exits 0
4. `make tokens-check` exits 0
5. Modify a hex in `design/tokens.json` → `npm run gen:tokens` → both web and iOS reflect the change → revert.
</verification>

<success_criteria>
- DS-01 round-trip works: `design/tokens.json` is single source; `npm run gen:tokens` regenerates both targets; CI catches drift.
- All 8 palette colors, 11 spacing values, 3 easing curves, 5 fonts, 3 shadows propagate from JSON to CSS to Swift.
- Generator is ≤120 LOC, stdlib-only, idempotent.
</success_criteria>

<output>
After completion, create `.planning/phases/23-design-system-foundation/23-01-SUMMARY.md` listing exact file count, generator LOC, and `make tokens-check` exit status.
</output>
