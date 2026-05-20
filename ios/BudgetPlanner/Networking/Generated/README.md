# Networking/Generated — codegen output (DO NOT EDIT BY HAND)

`GeneratedDTO.swift` is **generated** from `contract/openapi.json` (the Phase 69 B1
deterministic OpenAPI dump). Do not edit it by hand — your change will be lost on
the next regen. Edit the generator (`contract/gen_swift_dto.py`) or the backend
Pydantic schemas instead.

## Regenerate

```sh
make contract              # (repo root) re-dump contract/openapi.json from the live app
python3 contract/gen_swift_dto.py   # emit GeneratedDTO.swift
# — or, from ios/ —
make gen-dto               # runs the generator + xcodegen generate
```

Generation is **idempotent**: running the generator twice produces a
byte-identical `GeneratedDTO.swift` (schemas + properties are emitted in sorted
order). This feeds the B5 git-diff sync-guard — a stale generated file vs a fresh
`openapi.json` fails CI.

## What it generates

One vanilla `Codable, Equatable` Swift `struct` per `components.schemas` object
(plus `String`-backed enums for enum schemas), all nested inside a caseless
`enum Gen` namespace.

The structs decode through the **existing** `APIClient` `JSONDecoder`
unchanged — `.convertFromSnakeCase` (so we emit camelCase property names, no
explicit `CodingKeys`) + the custom MSK-pinned date strategy (so `Date` fields
need no per-DTO handling). The hand-written URLSession transport is untouched.
This is why we use a custom script rather than Apple `swift-openapi-generator`
(which forces a `Client`/`ClientTransport` layer + `swift-openapi-runtime`) —
see `69-03-PLAN.md` / `69-03-SUMMARY.md` for the full 5-criteria rationale.

## Nullability rule (read this before 69-05)

**Optionality is driven entirely by the OpenAPI `required` set of each schema:**

- property listed in the schema's `required` array → **non-optional** `let x: T`
- property **absent** from `required` (server `default` or genuinely optional)
  → **Swift optional** `let x: T?`

A server `default` keeps a field out of `required`, so it is emitted **optional**
even though the wire always carries it. This is deliberate: a test fixture that
omits a defaulted field must still decode. For `CategoryRead` this means
`code` / `ord` / `createdAt` are **non-optional**, while
`planCents` / `rollover` / `paused` / `parentId` / `tag` are **optional**.

## Namespacing — why `enum Gen`

During the generate-before-migrate window (69-03 generates; **69-05** migrates
consumers) the generated DTOs coexist with the hand-written `DTO/*.swift` types.
Many names collide (`CategoryRead`, `SubCycle`, `ActualRead`, `BalanceResponse`,
…). Nesting every generated type inside `enum Gen` (e.g. `Gen.CategoryRead`,
`Gen.SubCycle`) keeps the build green with both sets present. 69-05 will migrate
call sites onto the `Gen.*` types and retire the hand-written stubs.

## Skipped schemas

`ValidationError` (the Pydantic 422 error envelope) is intentionally **not**
generated: it carries untyped (`input`) and free-form (`ctx`) fields that have no
concrete Swift type. It is not a domain DTO and the client never decodes it as
typed. See `drift-report.md` for the per-DTO diff against the hand-written DTOs.
