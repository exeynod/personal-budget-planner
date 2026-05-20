#!/usr/bin/env python3
"""Phase 69 WR-01 — handwritten-DTO ↔ Gen.* field-set drift guard.

The iOS read-DTOs (`CategoryV10DTO`, `UserDTO`, `AccountDTO`, `ActualV10DTO`,
`SubscriptionV10DTO`) are NOT typealiased to their generated `Gen.*`
counterparts — they are hand-mirrored field-for-field so each can keep an
intentional, consumer-facing type divergence (e.g. `UserDTO.onboardedAt: Date?`
vs `Gen.MeV10Response.onboardedAt: String?`, or `ActualV10DTO.createdAt: Date?`
defensive-optional vs the required `Gen.ActualRead.createdAt: Date`).

Because the sync-guard (`check_contract_sync.sh`) only regenerates and diffs the
*generated* artifacts, it cannot see a future unintended divergence between a
mirror and its `Gen.*` source — exactly the drift class Phase 69 set out to
kill, one layer up. This guard closes that gap WITHOUT trying to compare Swift
types (fragile): it asserts the *property-NAME set* of each mirror equals the
property-name set of its `Gen.*` source, modulo an explicit allowlist of
known-intentional field-name divergences.

What it catches: a new required field added to a `Gen.*` read model (a backend
contract change) that was never reflected onto the handwritten mirror — the
mirror's field-name set falls behind and this guard fails, forcing a human to
reconcile (and decide optional/required + type).

What it deliberately does NOT catch: type-only divergences (String? vs Date?),
which are the documented intentional ones (see contract/README.md). Those never
change the field-NAME set, so they never trip this guard.

Parsing: both the generated file and the handwritten mirrors declare fields with
the canonical `    let <name>: <type>` pattern (the project's `let`-property
style, snake_case already converted to camelCase by the generator). We scan from
the `struct <Name>` line to the matching closing brace at the struct's
indentation, collecting `let`/`var` property names and skipping nested
`enum`/`struct` bodies (so `Gen.X`'s nested `Kind`/`Tag`/`Rollover`/`Source`
enums and their cases are not mistaken for fields).

Exit 0 = all mirrors aligned. Exit 1 = drift (named), with the regen/reconcile
hint. Run standalone or via check_contract_sync.sh (wired in after step 3).
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

GEN_FILE = REPO_ROOT / "ios/BudgetPlanner/Networking/Generated/GeneratedDTO.swift"

# mirror_struct -> (mirror_file, gen_struct, allowed_field_name_divergences)
#
# `allowed` lists field NAMES that may legitimately appear on ONE side only
# (intentional, documented). Type-only divergences need NO allowlist entry —
# this guard compares names, not types.
MIRRORS: dict[str, tuple[str, str, set[str]]] = {
    "CategoryV10DTO": (
        "ios/BudgetPlanner/Networking/DTO/CategoryV10DTO.swift",
        "CategoryRead",
        set(),
    ),
    "UserDTO": (
        "ios/BudgetPlanner/Networking/DTO/CommonDTO.swift",
        "MeV10Response",
        set(),
    ),
    "AccountDTO": (
        "ios/BudgetPlanner/Networking/DTO/AccountDTO.swift",
        "AccountRead",
        set(),
    ),
    "ActualV10DTO": (
        "ios/BudgetPlanner/Networking/DTO/TransactionDTO.swift",
        "ActualRead",
        set(),
    ),
    "SubscriptionV10DTO": (
        "ios/BudgetPlanner/Networking/DTO/SubscriptionV10DTO.swift",
        "SubscriptionReadV10",
        # Gen.SubscriptionReadV10 embeds the full nested `category: Gen.CategoryRead`
        # object; the handwritten mirror intentionally carries only `categoryId`
        # and resolves the category locally (it never decodes the nested object).
        {"category"},
    ),
}

# A STORED property line: `let foo: Bar` / `var foo: Bar?` / `let foo: [Baz]`.
# A trailing `{` (e.g. `var id: Int { tgUserId }`) marks a COMPUTED property —
# excluded via the negative lookahead so computed accessors like
# `UserDTO.id` / `UserDTO.isOnboarded` are not mistaken for wire fields.
PROP_RE = re.compile(r"^\s*(?:let|var)\s+([A-Za-z_][A-Za-z0-9_]*)\s*:(?![^=]*\{)")
STRUCT_RE = re.compile(r"^(\s*)struct\s+([A-Za-z_][A-Za-z0-9_]*)\b")
NESTED_BLOCK_RE = re.compile(r"^\s*(?:enum|struct)\s+[A-Za-z_]")


def extract_field_names(text: str, struct_name: str) -> set[str] | None:
    """Return the set of top-level stored-property names of `struct struct_name`.

    Skips nested enum/struct bodies (so nested `Kind`/`Tag` enums and their
    `case`s are not collected). Returns None if the struct is not found.
    """
    lines = text.splitlines()
    n = len(lines)
    for i, line in enumerate(lines):
        m = STRUCT_RE.match(line)
        if not m or m.group(2) != struct_name:
            continue
        struct_indent = len(m.group(1))
        fields: set[str] = set()
        nested_depth = 0  # >0 while inside a nested enum/struct
        # Walk the body until we return to (or below) the struct's indentation
        # on a `}` closing line.
        j = i + 1
        while j < n:
            cur = lines[j]
            stripped = cur.strip()
            cur_indent = len(cur) - len(cur.lstrip())
            # Closing brace at the struct's own indent ends the struct.
            if stripped == "}" and cur_indent <= struct_indent:
                break
            if nested_depth > 0:
                # Track braces only coarsely: a nested block ends on a `}` at
                # an indent deeper than the struct (its own closing brace).
                if stripped == "}":
                    nested_depth -= 1
                j += 1
                continue
            if NESTED_BLOCK_RE.match(cur):
                # Enter nested enum/struct — its body (and any `let` in it, e.g.
                # associated-value-free enums have none anyway) is skipped.
                nested_depth += 1
                j += 1
                continue
            pm = PROP_RE.match(cur)
            if pm:
                fields.add(pm.group(1))
            j += 1
        return fields
    return None


def main() -> int:
    gen_text = GEN_FILE.read_text(encoding="utf-8")
    drift: list[str] = []
    missing: list[str] = []

    for mirror_name, (mirror_rel, gen_name, allowed) in MIRRORS.items():
        mirror_path = REPO_ROOT / mirror_rel
        if not mirror_path.exists():
            missing.append(f"  - mirror file not found: {mirror_rel}")
            continue
        mirror_fields = extract_field_names(
            mirror_path.read_text(encoding="utf-8"), mirror_name
        )
        gen_fields = extract_field_names(gen_text, gen_name)
        if mirror_fields is None:
            missing.append(f"  - struct {mirror_name} not found in {mirror_rel}")
            continue
        if gen_fields is None:
            missing.append(f"  - struct Gen.{gen_name} not found in GeneratedDTO.swift")
            continue

        only_in_gen = (gen_fields - mirror_fields) - allowed
        only_in_mirror = (mirror_fields - gen_fields) - allowed
        if only_in_gen or only_in_mirror:
            parts = [f"  {mirror_name} ↔ Gen.{gen_name}:"]
            if only_in_gen:
                parts.append(
                    f"      missing on mirror (present on Gen.*): {sorted(only_in_gen)}"
                )
            if only_in_mirror:
                parts.append(
                    f"      extra on mirror (absent on Gen.*):    {sorted(only_in_mirror)}"
                )
            drift.append("\n".join(parts))

    if missing:
        print("[dto-mirror-check] ERROR: could not resolve some structs:", file=sys.stderr)
        print("\n".join(missing), file=sys.stderr)
        return 1

    if drift:
        print(
            "[dto-mirror-check] ERROR: handwritten DTO mirror(s) drifted from Gen.*\n",
            file=sys.stderr,
        )
        print("\n\n".join(drift), file=sys.stderr)
        print(
            "\nThe handwritten iOS read-DTOs mirror their Gen.* counterparts "
            "field-for-field\n(they are intentionally NOT typealiased so each can "
            "keep a documented type\ndivergence — see contract/README.md). A "
            "field-NAME mismatch means the\ngenerated contract gained/lost a field "
            "that the mirror has not reconciled.\n\nFix: update the handwritten "
            "mirror to match Gen.* field names (decide\noptional/required + the "
            "consumer-facing type), OR — if the divergence is\nintentional — add "
            "the field name to that mirror's allowlist in\ncontract/check_dto_mirrors.py "
            "with a comment explaining why.",
            file=sys.stderr,
        )
        return 1

    print(
        "[dto-mirror-check] OK — all handwritten DTO mirrors match their Gen.* "
        f"field sets ({len(MIRRORS)} checked)."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
