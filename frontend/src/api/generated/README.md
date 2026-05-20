# `src/api/generated/` — generated API types

## `schema.ts` is GENERATED — do not hand-edit

`schema.ts` is produced by [`openapi-typescript`](https://openapi-ts.dev/) from the
repo-root contract artifact `contract/openapi.json`. **Never edit it by hand** — any
manual change will be clobbered on the next regen, and the B5 sync-guard / idempotency
check will flag the drift.

## Regenerate

```bash
cd frontend
npm run gen:api
```

This runs:

```
openapi-typescript ../contract/openapi.json -o src/api/generated/schema.ts
```

Regeneration is **idempotent**: running `gen:api` twice yields a byte-identical
`schema.ts`.

## Source-of-truth chain

```
backend Pydantic schemas
   └─ make contract  →  contract/openapi.json   (FastAPI OpenAPI dump, Phase 69 B1)
        └─ npm run gen:api  →  frontend/src/api/generated/schema.ts
```

If the **backend API changes**, regenerate the contract dump first (`make contract`
at repo root, see `contract/dump_openapi.py`), then re-run `npm run gen:api` here.
Generating against a stale `contract/openapi.json` will silently reproduce old types.

## Shape

`openapi-typescript` emits two top-level namespaces:

- `export interface paths { ... }` — keyed by route + method.
- `export interface components { schemas: { CategoryRead: {...}, ... } }` —
  reference a DTO via `components["schemas"]["CategoryRead"]`.

Consumer migration onto these generated types (replacing the handwritten
`src/api/types.ts` + `src/api/v10/*` DTOs) is **out of scope for this plan (69-02)**.
See `drift-report.md` for the full generated-vs-handwritten diff that drives the
69-04 migration.
