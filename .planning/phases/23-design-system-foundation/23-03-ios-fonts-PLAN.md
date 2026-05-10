---
phase: 23-design-system-foundation
plan: 03
type: execute
wave: 2
depends_on: [23-design-system-foundation/01]
files_modified:
  - ios/BudgetPlanner/Resources/Fonts/Manrope-VariableFont_wght.ttf
  - ios/BudgetPlanner/Resources/Fonts/JetBrainsMono-VariableFont_wght.ttf
  - ios/BudgetPlanner/Resources/Fonts/ArchivoBlack-Regular.ttf
  - ios/BudgetPlanner/Resources/Fonts/DMSerifDisplay-Italic.ttf
  - ios/BudgetPlanner/Resources/Fonts/PTSerif-Italic.ttf
  - ios/BudgetPlanner/Info.plist
  - ios/project.yml
  - ios/BudgetPlanner.xcodeproj
autonomous: false
requirements: [DS-03]
tags: [design-system, fonts, ios, xcodegen]
must_haves:
  truths:
    - "iOS app launches and registers all 5 font families synchronously via UIAppFonts (no async FOUT race)."
    - "Font.custom(\"PTSerif-Italic\", size: 28) renders cyrillic glyphs correctly in SwiftUI Preview."
    - "Font.custom(\"DMSerifDisplay-Italic\", size: 28) renders Latin glyphs correctly in SwiftUI Preview."
    - "Font.custom(\"Manrope\", size: 16).weight(.semibold) returns a usable variable-weight glyph (variable font registration succeeds)."
  artifacts:
    - path: "ios/BudgetPlanner/Resources/Fonts/Manrope-VariableFont_wght.ttf"
    - path: "ios/BudgetPlanner/Resources/Fonts/JetBrainsMono-VariableFont_wght.ttf"
    - path: "ios/BudgetPlanner/Resources/Fonts/ArchivoBlack-Regular.ttf"
    - path: "ios/BudgetPlanner/Resources/Fonts/DMSerifDisplay-Italic.ttf"
    - path: "ios/BudgetPlanner/Resources/Fonts/PTSerif-Italic.ttf"
    - path: "ios/BudgetPlanner/Info.plist"
      contains: "UIAppFonts"
  key_links:
    - from: "ios/BudgetPlanner/Info.plist UIAppFonts array"
      to: "ios/BudgetPlanner/Resources/Fonts/*.ttf"
      via: "synchronous font registration at launch"
    - from: "project.yml resources"
      to: "Resources/Fonts/"
      via: "XcodeGen folder-references include"
---

<objective>
Bundle 5 TrueType font files into the iOS app at `ios/BudgetPlanner/Resources/Fonts/`, register them via `UIAppFonts` in `Info.plist` (synchronous at-launch registration — eliminates FOUT race per DS-03), and ensure XcodeGen project regeneration picks up the new resources. After this plan, `Font.custom("PTSerif-Italic", size:)` and `Font.custom("DMSerifDisplay-Italic", size:)` work in SwiftUI Previews.

Purpose: DS-03 — iOS typography foundation. PT Serif Italic acts as the cyrillic-coverage replacement for DM Serif Italic per ADR-001 (iOS uses simple fallback, NOT composite UIFont).
Output: 5 TTF files added, Info.plist updated, project.yml updated, BudgetPlanner.xcodeproj regenerated.
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
- `.planning/research/ADR-001-cyrillic-font-fallback.md` — iOS pragmatic fallback strategy (single PT Serif Italic, NOT composite UIFont)
- `.planning/phases/23-design-system-foundation/23-CONTEXT.md` Area 3 — TTF list + UIAppFonts strategy
- `ios/project.yml` — current XcodeGen config; `BudgetPlanner` target's `sources` already includes `path: BudgetPlanner` and `BudgetPlanner/Resources/PrivacyInfo.xcprivacy` is explicitly added; we'll add the Fonts folder analogously
- `ios/Makefile` — `make generate` runs `xcodegen generate`; `make run` is full cycle
- `ios/BudgetPlanner/Info.plist` — verify there's no existing `UIAppFonts` key
- `ios/BudgetPlanner/Resources/` — currently contains only `PrivacyInfo.xcprivacy`
- The TTF source: download from Google Fonts canonical URL (or @fontsource npm package's `files/*.ttf` if present). Acceptable provenance: Open Font License (OFL) — all 5 are OFL.
</read_first>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Acquire 5 TTF font files and place in Resources/Fonts/</name>
  <files>
    ios/BudgetPlanner/Resources/Fonts/Manrope-VariableFont_wght.ttf,
    ios/BudgetPlanner/Resources/Fonts/JetBrainsMono-VariableFont_wght.ttf,
    ios/BudgetPlanner/Resources/Fonts/ArchivoBlack-Regular.ttf,
    ios/BudgetPlanner/Resources/Fonts/DMSerifDisplay-Italic.ttf,
    ios/BudgetPlanner/Resources/Fonts/PTSerif-Italic.ttf
  </files>
  <read_first>
    - Confirm `frontend/node_modules/@fontsource-variable/manrope/files/` exists from Plan 23.02 (Wave 2 sibling — note: web-fonts plan and ios-fonts plan run in same wave, but this task does NOT depend on web-fonts; if web-fonts has not run yet, npm packages won't be present and we fall back to direct download)
    - `ios/BudgetPlanner/Resources/` (currently contains only PrivacyInfo.xcprivacy)
  </read_first>
  <action>
    Create directory: `mkdir -p ios/BudgetPlanner/Resources/Fonts`.

    Acquire 5 TTF files (preferred: extract from @fontsource npm packages so versions match web exactly; fallback: download from Google Fonts):

    Method A — extract from @fontsource (preferred, requires Plan 23.02 to have run npm install OR run npm install standalone in frontend/):
    ```bash
    # If web-fonts plan has installed packages:
    cp frontend/node_modules/@fontsource-variable/manrope/files/manrope-all-wght-normal.ttf \
       ios/BudgetPlanner/Resources/Fonts/Manrope-VariableFont_wght.ttf 2>/dev/null \
    || curl -fL -o ios/BudgetPlanner/Resources/Fonts/Manrope-VariableFont_wght.ttf \
       'https://github.com/sharanda/manrope/raw/master/fonts/ttf/Manrope-Regular.ttf'

    cp frontend/node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-all-wght-normal.ttf \
       ios/BudgetPlanner/Resources/Fonts/JetBrainsMono-VariableFont_wght.ttf 2>/dev/null \
    || curl -fL -o ios/BudgetPlanner/Resources/Fonts/JetBrainsMono-VariableFont_wght.ttf \
       'https://github.com/JetBrains/JetBrainsMono/raw/master/fonts/variable/JetBrainsMono%5Bwght%5D.ttf'

    cp frontend/node_modules/@fontsource/archivo-black/files/archivo-black-latin-400-normal.ttf \
       ios/BudgetPlanner/Resources/Fonts/ArchivoBlack-Regular.ttf 2>/dev/null \
    || curl -fL -o ios/BudgetPlanner/Resources/Fonts/ArchivoBlack-Regular.ttf \
       'https://github.com/google/fonts/raw/main/ofl/archivoblack/ArchivoBlack-Regular.ttf'

    cp frontend/node_modules/@fontsource/dm-serif-display/files/dm-serif-display-latin-400-italic.ttf \
       ios/BudgetPlanner/Resources/Fonts/DMSerifDisplay-Italic.ttf 2>/dev/null \
    || curl -fL -o ios/BudgetPlanner/Resources/Fonts/DMSerifDisplay-Italic.ttf \
       'https://github.com/google/fonts/raw/main/ofl/dmserifdisplay/DMSerifDisplay-Italic.ttf'

    cp frontend/node_modules/@fontsource/pt-serif/files/pt-serif-cyrillic-400-italic.ttf \
       ios/BudgetPlanner/Resources/Fonts/PTSerif-Italic.ttf 2>/dev/null \
    || curl -fL -o ios/BudgetPlanner/Resources/Fonts/PTSerif-Italic.ttf \
       'https://github.com/google/fonts/raw/main/ofl/ptserif/PT_Serif-Italic.ttf'
    ```

    NOTE: @fontsource ships `.woff2` only by default (smaller); the variable `manrope-all-wght-normal.ttf` may not exist as a TTF in some package versions. iOS requires TTF/OTF (woff2 not natively supported). If npm extraction fails for any file, fall back to direct download from Google Fonts canonical OFL repos (URLs above).

    Verify each file:
    ```bash
    for f in Manrope-VariableFont_wght JetBrainsMono-VariableFont_wght ArchivoBlack-Regular DMSerifDisplay-Italic PTSerif-Italic; do
      file ios/BudgetPlanner/Resources/Fonts/$f.ttf | grep -q 'TrueType\|font' || echo "FAIL: $f"
    done
    ```

    `file(1)` should report `TrueType Font data` or `OpenType font` for each. If any reports `HTML` (i.e. download was a 404 page), it must be re-downloaded.

    All 5 fonts are OFL (Open Font License) — bundling is permitted. Add a `LICENSES.md` reference in summary if not already present at repo root.
  </action>
  <acceptance_criteria>
    - `ls ios/BudgetPlanner/Resources/Fonts/*.ttf | wc -l` returns 5
    - `file ios/BudgetPlanner/Resources/Fonts/Manrope-VariableFont_wght.ttf | grep -qE 'TrueType|font'`
    - `file ios/BudgetPlanner/Resources/Fonts/JetBrainsMono-VariableFont_wght.ttf | grep -qE 'TrueType|font'`
    - `file ios/BudgetPlanner/Resources/Fonts/ArchivoBlack-Regular.ttf | grep -qE 'TrueType|font'`
    - `file ios/BudgetPlanner/Resources/Fonts/DMSerifDisplay-Italic.ttf | grep -qE 'TrueType|font'`
    - `file ios/BudgetPlanner/Resources/Fonts/PTSerif-Italic.ttf | grep -qE 'TrueType|font'`
    - Each file ≥ 30 KB (`stat -f%z` on macOS or `wc -c`) — guards against accidentally-saved HTML 404 pages
    - PTSerif-Italic.ttf size ≥ 100 KB (full cyrillic subset is bigger; sanity check that we got cyrillic-coverage build)
  </acceptance_criteria>
  <verify>
    <automated>ls ios/BudgetPlanner/Resources/Fonts/*.ttf | wc -l | grep -q '^[[:space:]]*5$' &amp;&amp; for f in ios/BudgetPlanner/Resources/Fonts/*.ttf; do file "$f" | grep -qE 'TrueType|font' || exit 1; done</automated>
  </verify>
  <done>
    5 TTF files present in ios/BudgetPlanner/Resources/Fonts/, each verified as TrueType/OpenType, all ≥ 30KB.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Register fonts via UIAppFonts in Info.plist + project.yml resources</name>
  <files>ios/BudgetPlanner/Info.plist, ios/project.yml</files>
  <read_first>
    - `ios/BudgetPlanner/Info.plist` lines 1-65 — current state, no UIAppFonts key
    - `ios/project.yml` lines 19-30 — current `sources` config (includes `path: BudgetPlanner` and `path: BudgetPlanner/Resources/PrivacyInfo.xcprivacy`); the Fonts/ folder will be auto-included by the existing `path: BudgetPlanner` entry IF it lives under BudgetPlanner/. We must verify XcodeGen recognizes `.ttf` as a resource.
  </read_first>
  <action>
    Edit `ios/BudgetPlanner/Info.plist`. Insert `UIAppFonts` key + array IMMEDIATELY before the existing `<key>UILaunchScreen</key>` line (alphabetical-ish ordering keeps the plist sane). The 5 file references must be exactly:

    ```xml
    <key>UIAppFonts</key>
    <array>
      <string>Fonts/Manrope-VariableFont_wght.ttf</string>
      <string>Fonts/JetBrainsMono-VariableFont_wght.ttf</string>
      <string>Fonts/ArchivoBlack-Regular.ttf</string>
      <string>Fonts/DMSerifDisplay-Italic.ttf</string>
      <string>Fonts/PTSerif-Italic.ttf</string>
    </array>
    ```

    NOTE on path: the convention `Fonts/Foo.ttf` (vs. just `Foo.ttf`) is required because XcodeGen with `createIntermediateGroups: true` (already set in project.yml line 7) places files into nested subgroups based on filesystem layout. iOS resolves UIAppFonts paths relative to the bundle root, where the Fonts/ folder will appear as a "blue folder reference" if we use `type: folder` in project.yml — see Task 3.

    ALTERNATIVE if `Fonts/` paths fail at runtime (UIFont returns nil): change all 5 entries to bare filenames (`Manrope-VariableFont_wght.ttf` etc.) — this is what most apps use. Pick the bare-filename approach if the folder-reference variant requires extra XcodeGen config; document chosen variant in summary.

    Also update `ios/project.yml` to ensure `Resources/Fonts/` is treated as resources (the `BudgetPlanner` source path already covers them, but we make it explicit for clarity):

    ```yaml
    targets:
      BudgetPlanner:
        type: application
        platform: iOS
        deploymentTarget: "26.0"
        sources:
          - path: BudgetPlanner
            excludes:
              - "**/.DS_Store"
          - path: BudgetPlanner/Resources/PrivacyInfo.xcprivacy
            type: file
            buildPhase: resources
          - path: BudgetPlanner/Resources/Fonts
            type: folder
            buildPhase: resources
        info:
          path: BudgetPlanner/Info.plist
          properties:
            CFBundleDisplayName: BudgetPlanner
            ...  # (rest unchanged)
    ```

    The new `path: BudgetPlanner/Resources/Fonts` + `type: folder` line ensures XcodeGen creates a "blue folder reference" preserving the `Fonts/` directory at the bundle root — required for the `Fonts/Foo.ttf` UIAppFonts paths.
  </action>
  <acceptance_criteria>
    - `grep -F '<key>UIAppFonts</key>' ios/BudgetPlanner/Info.plist` returns 1 hit
    - `xmllint --noout ios/BudgetPlanner/Info.plist` exits 0 (valid XML)
    - `plutil -lint ios/BudgetPlanner/Info.plist` exits 0
    - `grep -c 'PTSerif-Italic.ttf\|Manrope-VariableFont_wght.ttf\|JetBrainsMono-VariableFont_wght.ttf\|ArchivoBlack-Regular.ttf\|DMSerifDisplay-Italic.ttf' ios/BudgetPlanner/Info.plist` returns 5
    - `grep -F 'BudgetPlanner/Resources/Fonts' ios/project.yml` returns ≥ 1
    - `grep -F 'type: folder' ios/project.yml` returns ≥ 1
  </acceptance_criteria>
  <verify>
    <automated>plutil -lint ios/BudgetPlanner/Info.plist &amp;&amp; grep -c '\.ttf' ios/BudgetPlanner/Info.plist | grep -q '^[[:space:]]*5$' &amp;&amp; grep -F 'BudgetPlanner/Resources/Fonts' ios/project.yml</automated>
  </verify>
  <done>
    UIAppFonts registered with 5 entries; project.yml updated to include Fonts/ as resource folder; Info.plist passes plutil -lint.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Regenerate xcodeproj and build to confirm fonts ship in app bundle</name>
  <files>ios/BudgetPlanner.xcodeproj</files>
  <read_first>
    - `ios/Makefile` — `make generate` runs `xcodegen generate`; `make build` does the simulator build (`xcbeautify`)
    - `ios/project.yml` (post-Task 2 changes)
  </read_first>
  <action>
    From `ios/`:
    ```bash
    cd ios
    make generate                    # xcodegen generate
    make build                       # xcodebuild build (Debug, simulator)
    ```

    `make build` requires Xcode installed (developer machine; CI may skip). On developer machine, this verifies that:
    1. xcodeproj regenerated successfully
    2. Fonts/ directory appears in build phase Copy Bundle Resources
    3. Compile succeeds (no Swift errors from PosterTokens.swift created in Plan 23.01)

    Verify .ttf files are inside the built `.app` bundle:
    ```bash
    APP_PATH=$(xcodebuild -project BudgetPlanner.xcodeproj -scheme BudgetPlanner \
      -showBuildSettings -configuration Debug 2>/dev/null \
      | awk -F' = ' '/ BUILT_PRODUCTS_DIR / {print $2}' | head -1)
    ls "$APP_PATH/BudgetPlanner.app/Fonts/"      # bundled folder reference
    # OR, if fonts are at bundle root:
    ls "$APP_PATH/BudgetPlanner.app/" | grep '\.ttf'
    ```

    Expected: at least one of the two `ls` commands returns 5 .ttf files. Document which layout was achieved in summary.
  </action>
  <acceptance_criteria>
    - `cd ios && xcodegen generate` exits 0
    - `test -d ios/BudgetPlanner.xcodeproj`
    - `cd ios && make build 2>&1 | tail -20` does NOT contain `error:` (build success)
    - After build, the .app bundle directory contains 5 .ttf files (either at bundle root OR inside `Fonts/` subfolder; document which)
    - Build phase verification: `grep -F 'PTSerif-Italic.ttf' ios/BudgetPlanner.xcodeproj/project.pbxproj` returns ≥ 1 hit (file is referenced in pbxproj)
  </acceptance_criteria>
  <verify>
    <automated>cd ios &amp;&amp; xcodegen generate &amp;&amp; grep -F 'PTSerif-Italic.ttf' BudgetPlanner.xcodeproj/project.pbxproj</automated>
  </verify>
  <done>
    xcodeproj regenerated; .ttf files are referenced in project.pbxproj; ios build succeeds (or, if developer machine lacks Xcode, project.pbxproj contains all 5 font references and the next iOS plan can drive the build).
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 4: Human verifies font rendering in iOS simulator (smoke test)</name>
  <what-built>
    Plans 23-01 (PosterTokens.swift), 23-03 (5 TTF + UIAppFonts) collectively let the iOS app render with bundled fonts. Plan 23-08 (iOS components) consumes Font.custom("DMSerifDisplay-Italic", size:) and Font.custom("PTSerif-Italic", size:). At THIS plan boundary, the only verifiable fact is that fonts are registered and loadable; component rendering is verified later (Wave 3-4).

    Strategy: provide a 5-line SwiftUI Preview snippet that the human runs in Xcode Canvas to visually confirm:
    - DM Serif Italic renders Latin "May" correctly
    - PT Serif Italic renders cyrillic "Май" correctly (with cyrillic glyphs, not Times fallback)
    - Manrope renders body text
  </what-built>
  <how-to-verify>
    1. Open `ios/BudgetPlanner.xcodeproj` in Xcode (created by Task 3).
    2. Create a temporary file `ios/BudgetPlanner/Resources/_FontSmokePreview.swift` (will be deleted in Plan 23.08):
       ```swift
       import SwiftUI

       struct _FontSmokePreview: View {
           var body: some View {
               VStack(alignment: .leading, spacing: 14) {
                   Text("May").font(.custom("DMSerifDisplay-Italic", size: 48))
                   Text("Май").font(.custom("PTSerif-Italic",       size: 48))
                   Text("BUDGET").font(.custom("Archivo Black",     size: 32))
                   Text("142 380 ₽").font(.custom("JetBrainsMono",  size: 28))
                   Text("Body Manrope").font(.custom("Manrope",     size: 16))
               }
               .padding(40)
           }
       }

       #Preview { _FontSmokePreview() }
       ```
    3. Open the file in Xcode → Canvas (Cmd+Option+Return).
    4. Verify each line renders with the EXPECTED glyph style (italic serif for "May" + "Май", uppercase bold for "BUDGET", monospace digits, sans-serif body).
    5. CRITICAL: «Май» must show italic-serif cyrillic glyphs (PT Serif distinctive forms) — NOT system Times-Italic or San Francisco. If it falls back to system, re-check Info.plist UIAppFonts paths (try bare filename vs `Fonts/...` per Task 2).
    6. Also confirm in the Xcode console (filter: "font") there are no "[ImageManager] Could not find font" warnings.
    7. Delete `_FontSmokePreview.swift` after verification (Plan 23.08 introduces the persistent gallery).
  </how-to-verify>
  <resume-signal>
    Type "approved — fonts render" if all 5 fonts display correctly in Canvas with cyrillic «Май» using PT Serif distinctive glyphs. Otherwise describe which font(s) failed and the console error message.
  </resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Network → developer machine | TTF download from Google Fonts repo (one-time, dev-time only) |
| App bundle → iOS runtime | Fonts loaded synchronously at launch via UIAppFonts |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-23-03-01 | Tampering | TTF download | mitigate | Files acquired from canonical OFL repos (Google Fonts org); file(1) verifies TrueType magic; ≥30KB sanity check on size guards against HTML 404 pages |
| T-23-03-02 | Spoofing | UIAppFonts registration | accept | Synchronous at-launch registration is a system-trusted code path; no third-party font services involved |
| T-23-03-03 | DoS | bundle size | mitigate | 5 TTFs total ≤ ~1.5 MB (acceptable); Phase 28 perf budget (POL-05) verifies overall app size |
| T-23-03-04 | Information Disclosure | font metadata | accept | OFL fonts ship public metadata (Google/JetBrains/sharanda authorship); no PII exposure |
</threat_model>

<verification>
1. All 5 TTFs verified by `file(1)` as TrueType.
2. Info.plist passes `plutil -lint`.
3. xcodegen regenerates xcodeproj.
4. xcodebuild Debug build succeeds (assuming Xcode toolchain available).
5. project.pbxproj references all 5 TTFs.
6. Human checkpoint confirms cyrillic «Май» renders in PT Serif Italic glyph style.
</verification>

<success_criteria>
- DS-03 satisfied: 5 fonts bundled, registered, loadable via Font.custom().
- ADR-001 cyrillic fallback verified visually on iOS (PT Serif Italic for «Май»).
- XcodeGen regen workflow integrated.
</success_criteria>

<output>
After completion, create `.planning/phases/23-design-system-foundation/23-03-SUMMARY.md` with: TTF source provenance (npm vs direct download), UIAppFonts path variant chosen (Fonts/X.ttf vs bare X.ttf), human checkpoint result, and any deviation from CONTEXT.md.
</output>
