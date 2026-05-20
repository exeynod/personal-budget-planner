#!/usr/bin/env python3
"""Phase 69 B3 — generate vanilla `Codable` Swift DTOs from contract/openapi.json.

Why a custom script (NOT Apple swift-openapi-generator): the iOS app uses a
hand-written URLSession transport (`APIClient.request<T>`) with a custom
`JSONDecoder` (`.convertFromSnakeCase` + an MSK-pinned date strategy).
swift-openapi-generator always emits a `Client` + `ClientTransport` layer and
pulls swift-openapi-runtime/urlsession — it cannot emit models-only, so it would
replace/wrap our transport and re-pin the date handling. This script emits PLAIN
`Codable` structs that decode through the EXISTING decoder unchanged.

Design contract
---------------
* **Nullability is driven by the OpenAPI ``required`` set** of each schema:
    - property listed in ``required``           -> non-optional ``let x: T``
    - property absent from ``required``          -> optional ``let x: T?``
  (A server ``default`` keeps the field out of ``required`` -> Swift optional.
  We deliberately mirror the wire's *required* set, not its always-present set,
  so a fixture that omits a defaulted field still decodes — see 69-05.)
* **camelCase property names** — the APIClient decoder is
  ``.convertFromSnakeCase``, so we emit camelCase names and let the decoder map
  the snake_case wire keys. No explicit ``CodingKeys`` needed.
* **Money stays ``Int``** — any ``integer`` field is ``Int`` (never Double),
  enforcing the BIGINT-cents / no-float rule on ``*_cents``.
* **Determinism / idempotency** — schemas and properties are emitted in sorted
  order; running twice yields a byte-identical file (feeds the B5 git-diff guard).
* **Namespace** — every generated type is nested inside a caseless ``enum Gen``
  so the generated DTOs do NOT collide with the handwritten ``DTO/*.swift`` types
  during the generate-before-migrate window (69-05 migrates consumers).

Usage:  python3 contract/gen_swift_dto.py
        (regenerate contract/openapi.json first with `make contract`)
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
OPENAPI_PATH = REPO_ROOT / "contract" / "openapi.json"
OUT_PATH = (
    REPO_ROOT
    / "ios"
    / "BudgetPlanner"
    / "Networking"
    / "Generated"
    / "GeneratedDTO.swift"
)

NAMESPACE = "Gen"
REGEN_CMD = "python3 contract/gen_swift_dto.py"

# Swift reserved words that may appear as property names — backtick-escape them.
SWIFT_KEYWORDS = {
    "associatedtype", "class", "deinit", "enum", "extension", "func", "import",
    "init", "inout", "internal", "let", "operator", "private", "protocol",
    "public", "static", "struct", "subscript", "typealias", "var", "break",
    "case", "continue", "default", "defer", "do", "else", "fallthrough", "for",
    "guard", "if", "in", "repeat", "return", "switch", "where", "while", "as",
    "catch", "false", "is", "nil", "rethrows", "super", "self", "throw",
    "throws", "true", "try",
}


def snake_to_camel(name: str) -> str:
    """Mirror Foundation's `.convertFromSnakeCase` -> camelCase property names.

    Foundation strips underscores and uppercases the following letter, preserving
    a leading-underscore run and lowercasing the very first component. e.g.
    ``parent_txn_id`` -> ``parentTxnId``, ``ai_spend_cents`` -> ``aiSpendCents``.
    """
    if "_" not in name:
        return name
    parts = name.split("_")
    head = parts[0]
    tail = "".join(p[:1].upper() + p[1:] for p in parts[1:] if p)
    return head + tail


def enum_case_name(value: str) -> str:
    """Swift enum case identifier for a raw string value (e.g. mini_app->miniApp)."""
    camel = snake_to_camel(value)
    if camel != value and "_" in value:
        # snake -> camel done; raw value preserved via `= "..."`.
        return camel
    return value


def type_name(schema_name: str) -> str:
    """Swift type name for an OpenAPI schema name (already PascalCase upstream)."""
    return schema_name


def is_money_field(prop_name: str) -> bool:
    return prop_name.endswith("_cents")


def resolve_ref(ref: str) -> str:
    return ref.rsplit("/", 1)[-1]


def swift_inline_enum_name(struct_name: str, prop_camel: str) -> str:
    """Nested enum type name for an inline string-enum property."""
    return prop_camel[:1].upper() + prop_camel[1:]


def collect_inline_enums(struct_name: str, props: dict[str, Any]) -> dict[str, dict]:
    """Find properties whose schema is an inline string enum (no $ref).

    Returns {prop_name: {"enum": [...], "type_name": NestedName}}.
    Handles both bare `{enum: [...]}` and `anyOf: [{enum:[...]}, {null}]`.
    """
    inline: dict[str, dict] = {}
    for pname in sorted(props):
        pschema = props[pname]
        enum_vals = None
        # bare enum
        if pschema.get("type") == "string" and "enum" in pschema:
            enum_vals = pschema["enum"]
        # anyOf with a string-enum branch
        elif "anyOf" in pschema:
            for branch in pschema["anyOf"]:
                if branch.get("type") == "string" and "enum" in branch:
                    enum_vals = branch["enum"]
                    break
        if enum_vals is not None:
            camel = snake_to_camel(pname)
            inline[pname] = {
                "enum": list(enum_vals),
                "type_name": swift_inline_enum_name(struct_name, camel),
            }
    return inline


def swift_base_type(
    pschema: dict[str, Any],
    prop_name: str,
    inline_enum_type: str | None,
) -> str:
    """Map a (non-optional) JSON-schema property to its Swift base type."""
    if inline_enum_type is not None:
        return inline_enum_type

    if "$ref" in pschema:
        return f"{NAMESPACE}.{resolve_ref(pschema['$ref'])}"

    # Unwrap anyOf (nullable unions) — pick the first non-null branch.
    if "anyOf" in pschema:
        for branch in pschema["anyOf"]:
            if branch.get("type") == "null":
                continue
            return swift_base_type(branch, prop_name, None)

    jtype = pschema.get("type")
    if jtype == "string":
        fmt = pschema.get("format")
        if fmt in ("date", "date-time"):
            return "Date"
        return "String"
    if jtype == "integer":
        return "Int"
    if jtype == "number":
        # *_cents are money — must be Int even if some path types as number.
        return "Int" if is_money_field(prop_name) else "Double"
    if jtype == "boolean":
        return "Bool"
    if jtype == "array":
        items = pschema.get("items", {})
        elem = swift_base_type(items, prop_name, None)
        return f"[{elem}]"
    if jtype == "object":
        # Typed dictionary (additionalProperties with a concrete value type) ->
        # [String: Value]. Untyped/free-form object -> unsupported (skip struct).
        addl = pschema.get("additionalProperties")
        if isinstance(addl, dict) and addl:
            val = swift_base_type(addl, prop_name, None)
            if "JSONValueUnsupported" not in val:
                return f"[String: {val}]"
        return "JSONValueUnsupported"
    if jtype is None:
        # Untyped (e.g. Pydantic ValidationError `input`) -> unsupported.
        return "JSONValueUnsupported"
    return "JSONValueUnsupported"


def prop_is_nullable(pschema: dict[str, Any]) -> bool:
    if "anyOf" in pschema:
        return any(b.get("type") == "null" for b in pschema["anyOf"])
    return False


def render_enum(name: str, values: list[str], indent: str) -> list[str]:
    lines = [f"{indent}enum {name}: String, Codable, Equatable {{"]
    for v in values:
        case = enum_case_name(v)
        if case == v:
            lines.append(f"{indent}    case {case}")
        else:
            lines.append(f'{indent}    case {case} = "{v}"')
    lines.append(f"{indent}}}")
    return lines


def render_struct(name: str, schema: dict[str, Any]) -> tuple[list[str], bool]:
    """Render one struct. Returns (lines, skipped) — skipped=True if unsupported."""
    props: dict[str, Any] = schema.get("properties", {})
    required = set(schema.get("required", []))
    inline_enums = collect_inline_enums(name, props)

    body: list[str] = []
    indent = "    "
    inner = indent + "    "

    # Nested inline enums first (sorted by their type name for determinism).
    enum_blocks = sorted(inline_enums.items(), key=lambda kv: kv[1]["type_name"])
    for _pname, meta in enum_blocks:
        body.extend(render_enum(meta["type_name"], meta["enum"], inner))
        body.append("")

    # Properties (sorted) — detect unsupported (opaque object) types.
    for pname in sorted(props):
        pschema = props[pname]
        inline_type = None
        if pname in inline_enums:
            inline_type = inline_enums[pname]["type_name"]
        base = swift_base_type(pschema, pname, inline_type)
        if "JSONValueUnsupported" in base:
            # Schema carries an opaque object we don't model — skip the whole
            # struct to keep the build green (documented in README/drift).
            return ([], True)
        # Required-set-driven: in `required` AND not nullable -> non-optional.
        optional = (pname not in required) or prop_is_nullable(pschema)
        camel = snake_to_camel(pname)
        ident = f"`{camel}`" if camel in SWIFT_KEYWORDS else camel
        decl = f"{inner}let {ident}: {base}{'?' if optional else ''}"
        body.append(decl)

    lines = [f"{indent}struct {name}: Codable, Equatable {{"]
    lines.extend(body)
    lines.append(f"{indent}}}")
    return (lines, False)


def prop_refs(pschema: dict[str, Any]) -> set[str]:
    """All schema names this property's type depends on (transitive via $ref)."""
    refs: set[str] = set()
    if "$ref" in pschema:
        refs.add(resolve_ref(pschema["$ref"]))
    if "anyOf" in pschema:
        for b in pschema["anyOf"]:
            refs |= prop_refs(b)
    if pschema.get("type") == "array" and isinstance(pschema.get("items"), dict):
        refs |= prop_refs(pschema["items"])
    addl = pschema.get("additionalProperties")
    if isinstance(addl, dict):
        refs |= prop_refs(addl)
    return refs


def intrinsically_unsupported(name: str, schema: dict[str, Any]) -> bool:
    """A schema we cannot model directly (untyped/free-form fields)."""
    if schema.get("type") == "string" and "enum" in schema:
        return False
    if not (schema.get("type") == "object" or "properties" in schema):
        # Non-object, non-enum top-level schema (rare) — unsupported.
        return True
    for _pname, pschema in schema.get("properties", {}).items():
        # Untyped property (no type, no $ref, no anyOf) -> opaque.
        if not any(k in pschema for k in ("type", "$ref", "anyOf")):
            return True
        if pschema.get("type") == "object":
            addl = pschema.get("additionalProperties")
            if not (isinstance(addl, dict) and any(
                k in addl for k in ("type", "$ref", "anyOf")
            )):
                return True
    return False


def compute_skipped(schemas: dict[str, Any]) -> set[str]:
    """Intrinsically-unsupported schemas + the transitive closure of any schema
    that references a skipped one (so the generated code stays compilable)."""
    skipped = {n for n, s in schemas.items() if intrinsically_unsupported(n, s)}
    # Build ref graph and propagate skips upward to dependents.
    deps: dict[str, set[str]] = {}
    for n, s in schemas.items():
        d: set[str] = set()
        for pschema in s.get("properties", {}).values():
            d |= prop_refs(pschema)
        deps[n] = d
    changed = True
    while changed:
        changed = False
        for n, d in deps.items():
            if n not in skipped and (d & skipped):
                skipped.add(n)
                changed = True
    return skipped


def main() -> None:
    spec = json.loads(OPENAPI_PATH.read_text(encoding="utf-8"))
    schemas: dict[str, Any] = spec.get("components", {}).get("schemas", {})
    pre_skipped = compute_skipped(schemas)

    out: list[str] = []
    out.append("// GENERATED — do not edit.")
    out.append(f"// Source: contract/openapi.json (Phase 69 B1).")
    out.append(f"// Regenerate: {REGEN_CMD}  (after `make contract`).")
    out.append("//")
    out.append("// Vanilla `Codable` DTOs decoded through the EXISTING APIClient")
    out.append("// JSONDecoder (.convertFromSnakeCase + MSK-pinned date strategy).")
    out.append("// No transport / decoder change. Nullability follows the OpenAPI")
    out.append("// `required` set: required -> non-optional; absent -> Swift optional.")
    out.append("// Namespaced under `enum Gen` to avoid colliding with the")
    out.append("// handwritten DTO/*.swift types until 69-05 migrates consumers.")
    out.append("")
    out.append("import Foundation")
    out.append("")
    out.append("enum Gen {")

    skipped: list[str] = []
    top_level_enums: list[str] = []
    rendered_structs: list[str] = []

    blocks: list[str] = []
    for sname in sorted(schemas):
        if sname in pre_skipped:
            skipped.append(sname)
            continue
        schema = schemas[sname]
        # Top-level string-enum schema -> nested enum.
        if schema.get("type") == "string" and "enum" in schema:
            enum_lines = render_enum(
                type_name(sname), schema["enum"], "    "
            )
            blocks.append("\n".join(enum_lines))
            top_level_enums.append(sname)
            continue
        if schema.get("type") == "object" or "properties" in schema:
            lines, was_skipped = render_struct(type_name(sname), schema)
            if was_skipped:
                skipped.append(sname)
                continue
            blocks.append("\n".join(lines))
            rendered_structs.append(sname)
            continue
        # Anything else (rare) — skip, record.
        skipped.append(sname)

    out.append("\n\n".join(blocks))
    out.append("}")
    out.append("")  # trailing newline

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text("\n".join(out), encoding="utf-8")

    print(f"Wrote {OUT_PATH.relative_to(REPO_ROOT)}")
    print(f"  structs: {len(rendered_structs)}  enums: {len(top_level_enums)}")
    if skipped:
        print(f"  skipped (unsupported/opaque): {', '.join(sorted(skipped))}")


if __name__ == "__main__":
    main()
