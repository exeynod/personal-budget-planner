# Contract codegen — single source of truth

The FastAPI app's OpenAPI schema is the **single source of truth** for the API
contract. Two client type sets are _generated_ from it (never hand-edited), plus
the schema itself is dumped to a byte-stable file so it can be diffed in CI:

| Artifact         | Path                                                        | Generator                                    | Reads                   |
| ---------------- | ----------------------------------------------------------- | -------------------------------------------- | ----------------------- |
| OpenAPI schema   | `contract/openapi.json`                                     | `contract/dump_openapi.py` (`make contract`) | `main_api.app`          |
| Web TS types     | `frontend/src/api/generated/schema.ts`                      | `npm run gen:api` (openapi-typescript)       | `contract/openapi.json` |
| iOS Codable DTOs | `ios/BudgetPlanner/Networking/Generated/GeneratedDTO.swift` | `python3 contract/gen_swift_dto.py` (stdlib) | `contract/openapi.json` |

All three generators are **deterministic / idempotent** (sorted keys, sorted
output): regenerating on a clean tree produces a byte-identical file. That is
what makes the sync-guard (below) safe — it only fires on real drift, never on
key-order noise.

## Handwritten iOS read-DTOs vs `Gen.*` (mirror guard)

The iOS read-DTOs below are **hand-mirrored** onto their generated `Gen.*`
counterparts (field-for-field), not typealiased to them, so each can keep an
intentional _type_ divergence the consumer code relies on:

| Handwritten mirror                                | `Gen.*` source            | Intentional divergence (benign)                                                                                             |
| ------------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `UserDTO` (`CommonDTO.swift`)                     | `Gen.MeV10Response`       | `onboardedAt: Date?` vs `String?` (mirror parses the date)                                                                  |
| `ActualV10DTO` (`TransactionDTO.swift`)           | `Gen.ActualRead`          | `createdAt: Date?` (defensive-optional) vs required `Date`; `tag: CategoryTag` (reused enum) vs nested `Gen.ActualRead.Tag` |
| `CategoryV10DTO` (`CategoryV10DTO.swift`)         | `Gen.CategoryRead`        | reuses `CommonDTO.CategoryKind` / `CategoryTag` enums                                                                       |
| `AccountDTO` (`AccountDTO.swift`)                 | `Gen.AccountRead`         | none beyond enum reuse                                                                                                      |
| `SubscriptionV10DTO` (`SubscriptionV10DTO.swift`) | `Gen.SubscriptionReadV10` | omits the nested `category: Gen.CategoryRead` (resolves via `categoryId` locally) — field-name allowlisted                  |

These are **type-only** divergences — the property _names_ still match `Gen.*`.
The `git diff --exit-code` sync-guard regenerates only the `Gen.*` file and so
**cannot** see a future _field_ drift between a mirror and `Gen.*` (e.g. a new
required field added to `Gen.CategoryRead`). To close that gap,
`contract/check_dto_mirrors.py` (run inside `check_contract_sync.sh`, step 3b)
asserts each mirror's property-NAME set equals its `Gen.*` source's, modulo a
per-mirror allowlist of known field-name divergences (only
`SubscriptionV10DTO.category` today). Type-only divergences never change the
name set, so they never trip the guard; a new/removed `Gen.*` field does.

If you intentionally diverge a mirror's field _set_ from `Gen.*`, add the field
name to that mirror's `allowed` set in `check_dto_mirrors.py` with a comment.

## Regen pipeline (run in this order)

The order matters: the web and iOS generators **read** `contract/openapi.json`,
so the backend dump goes first.

```bash
# 1. Dump the OpenAPI schema from the live app.
#    The api docker image bakes the code and does NOT bind-mount the repo, so
#    `make contract` pipes the dump script in via stdin and redirects --stdout
#    into the host file. Requires the dev/test stack to be up:
#      docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.dev.yml -f deploy/docker-compose.test.yml up -d api
make contract

# 2. Regenerate the web TypeScript types.
(cd frontend && npm run gen:api)

# 3. Regenerate the iOS Codable DTOs (pure Python stdlib — no venv needed).
python3 contract/gen_swift_dto.py

# 4. Commit all three together.
git add contract/openapi.json \
        frontend/src/api/generated/schema.ts \
        ios/BudgetPlanner/Networking/Generated/GeneratedDTO.swift
```

One-liner (also printed by the guard on failure):

```bash
make contract && (cd frontend && npm run gen:api) && python3 contract/gen_swift_dto.py
```

## Sync-guard — `make contract-check`

`contract/check_contract_sync.sh` regenerates every artifact and then runs
`git diff --exit-code` on the generated paths. **Empty diff → exit 0** (in
sync); **non-empty diff → exit 1** with a message naming the stale file(s) and
the regen command. CI runs this so a contract change without regenerated client
types fails the build.

```bash
make contract-check                 # docker dump (local default)
```

### Dump modes (`--dump=` / `$CONTRACT_DUMP`)

The backend dump (step 1) needs `main_api.app` importable, which differs by
environment, so the strategy is selectable:

| Mode               | What it does                                                                                            | Use where                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `docker` (default) | `make contract` — pipe dump script into the running `api` container                                     | Locally (host `.venv` is intentionally not maintained)                                  |
| `python`           | `python3 contract/dump_openapi.py` in-process                                                           | CI **backend** job (`uv`-synced deps make the app importable)                           |
| `skip`             | Do **not** re-dump openapi.json; regenerate web+iOS from the committed openapi.json and diff only those | Lightweight Node+Python CI job — catches TS/Swift drift without needing the backend app |

```bash
bash contract/check_contract_sync.sh --dump=python   # CI backend job: full guard incl. backend dump
bash contract/check_contract_sync.sh --dump=skip     # light job: TS/Swift vs committed openapi.json
CONTRACT_DUMP=skip make contract-check               # same via env var
```

## CI wiring

The guard runs in CI (`.github/workflows/ci.yml`) in **two** places for full
coverage with minimal cost:

1. **`backend` job, `--dump=python`** — the backend job already has `uv`-synced
   deps + Node, so it dumps openapi.json in-process and diffs all three
   artifacts. This is the authoritative guard: it catches a backend schema
   change that was committed without regenerating the dump or the client types.
2. **(implicit in the same job)** — because the backend job runs the full
   guard, a separate light job is unnecessary; `--dump=skip` exists for local
   fast checks and for any future Node/Python-only job.

## How to fix a guard failure

If CI (or `make contract-check`) fails with "generated contract types are
STALE":

1. You changed the API (a response model, an endpoint, a schema field) but did
   not regenerate the client types — or you hand-edited a generated file.
2. Run the regen pipeline above (`make contract && (cd frontend && npm run
gen:api) && python3 contract/gen_swift_dto.py`).
3. Commit the regenerated `openapi.json`, `schema.ts`, and `GeneratedDTO.swift`.
4. Never hand-edit the generated files — they are overwritten on every regen.
