.PHONY: help \
        up up-build down logs ps \
        migrate seed psql \
        test-backend test-frontend test-e2e tsc \
        lint fmt fmt-check \
        check-no-manual-ddl check-no-manual-ddl-selftest \
        ci-local verify-all hooks \
        perf-report hidden-unicode-grep migration-roundtrip contract contract-check

# Default goal: print the catalog. `make` with no target → `make help`.
.DEFAULT_GOAL := help

# Compose invocation shared by the dev-stack targets. Base + dev override
# (dev publishes api on :8000, DEV_MODE=true, console logs). Matches what
# `docker compose up` loads implicitly, but spelled out so the targets are
# self-documenting and don't depend on override auto-loading.
# --env-file .env points Compose at the repo-root .env for ${VAR} interpolation
# (it otherwise defaults to deploy/, the first -f file's dir, and silently
# interpolates empty — see deploy_inner.sh). Using --env-file (not
# --project-directory) keeps the relative build contexts `context: ..` intact.
DC := docker compose --env-file .env -f deploy/docker-compose.yml -f deploy/docker-compose.dev.yml

# ============================================================
# help — the catalog. `make` or `make help`.
# ============================================================
help:
	@echo "TG Budget Planner — make targets (see docs/RUNBOOK.md for scenarios)"
	@echo ""
	@echo "Compose (dev stack: caddy/api/bot/worker/db):"
	@echo "  make up               - поднять dev-стек в фоне (api на :8000)"
	@echo "  make up-build         - пересобрать образы и поднять (после правок кода)"
	@echo "  make down             - остановить стек (volume сохраняется)"
	@echo "  make logs             - docker compose logs -f --tail=100"
	@echo "  make ps               - статус сервисов"
	@echo ""
	@echo "DB:"
	@echo "  make migrate          - alembic upgrade head в контейнере api (admin role)"
	@echo "  make seed             - dev_seed идёт авто на старте api; + scripts/seed_extra_dev.py"
	@echo "  make psql             - psql в контейнере db (budget_app role)"
	@echo ""
	@echo "Tests:"
	@echo "  make test-backend     - pytest на живой БД (scripts/run-integration-tests.sh -q)"
	@echo "  make test-frontend    - cd frontend && vitest run"
	@echo "  make test-e2e         - Playwright (native-liquid-glass + responsive)"
	@echo "  make tsc              - frontend tsc -b (type-check)"
	@echo ""
	@echo "Lint / format:"
	@echo "  make lint             - ruff check app/ main_*.py + frontend tsc -b"
	@echo "  make fmt              - ruff format app/ main_*.py (применить)"
	@echo "  make fmt-check        - ruff format --check (гейт, без правок)"
	@echo ""
	@echo "Contract (источник истины — contract/openapi.json):"
	@echo "  make contract         - перегенерить contract/openapi.json из живого api"
	@echo "  make contract-check   - regen-all 3 артефакта + git-diff-гейт (дрейф)"
	@echo ""
	@echo "Schema-SoT гейт (docs-drift):"
	@echo "  make check-no-manual-ddl          - запрет CREATE/ALTER/DROP TABLE вне alembic/versions/"
	@echo "  make check-no-manual-ddl-selftest - negative-control: гейт обязан краснеть на фейке"
	@echo "  make migration-roundtrip          - alembic upgrade→downgrade→upgrade (нужен поднятый стек)"
	@echo ""
	@echo "Агрегаты:"
	@echo "  make verify-all       - ddl-гейт + lint + tsc + contract-check (быстрый, без docker-тестов)"
	@echo "  make ci-local         - полный mirror CI (.github/workflows/ci.yml); гоняется в pre-push"
	@echo "  make hooks            - установить git-хуки (lefthook install)"
	@echo ""
	@echo "Прочее:"
	@echo "  make perf-report      - bundle-size + (best-effort) Lighthouse"
	@echo "  make hidden-unicode-grep - поиск невидимых codepoints в исходниках"

# ============================================================
# Compose — dev stack
# ============================================================
up:
	$(DC) up -d

up-build:
	$(DC) up -d --build

down:
	$(DC) down

logs:
	$(DC) logs -f --tail=100

ps:
	$(DC) ps

# ============================================================
# DB
# ============================================================
# alembic uses the privileged ADMIN role for DDL (entrypoint.sh on the VPS does
# the same). Runs inside the already-running api container.
migrate:
	$(DC) exec -T api sh -c 'DATABASE_URL="$${ADMIN_DATABASE_URL:-$$DATABASE_URL}" /app/.venv/bin/alembic upgrade head'

# dev_seed runs automatically on api boot when DEV_MODE=true (main_api.py). This
# target layers the richer UAT fixtures (extra actuals/planned/subscriptions) on
# top — idempotent, safe to re-run. Requires the stack to be up (`make up`).
seed:
	$(DC) exec -T api /app/.venv/bin/python /app/scripts/seed_extra_dev.py

psql:
	$(DC) exec db psql -U budget_app -d budget

# ============================================================
# Tests
# ============================================================
test-backend:
	bash scripts/run-integration-tests.sh -q

test-frontend:
	cd frontend && npm test

test-e2e:
	cd frontend && npx playwright test

tsc:
	cd frontend && npx tsc -b

# ============================================================
# Lint / format
# ============================================================
# Scoped to the production codebase (app/ + entrypoints), which is the tree CI
# and the hooks care about — tests/ and scripts/ carry intentional lint noise
# (SQLi payloads, throwaway helpers). The pre-commit hook additionally
# ruff-checks only STAGED files, so day-to-day you only pay for what you touch.
lint:
	ruff check app/ main_api.py main_bot.py main_worker.py
	cd frontend && npx tsc -b

fmt:
	ruff format app/ main_api.py main_bot.py main_worker.py

fmt-check:
	ruff format --check app/ main_api.py main_bot.py main_worker.py

# ============================================================
# Schema-SoT / docs-drift gate
# ============================================================
check-no-manual-ddl:
	@bash scripts/check-no-manual-ddl.sh

# Negative-control (anti-fake discipline): every gate ships with a deliberate
# break proving it can actually go red. Plants a CREATE TABLE in a temp file and
# asserts the scanner EXITS 1; plants the same DDL + a DDL-EXEMPT line and
# asserts it EXITS 0. mktemp-clean (never touches the tree), so it is safe to
# wire into verify-all.
check-no-manual-ddl-selftest:
	@tmp=$$(mktemp -d); \
	trap 'rm -rf "$$tmp"' EXIT; \
	printf 'CREATE TABLE selftest_probe (id int8);\n' > "$$tmp/probe.py"; \
	printf '# DDL-EXEMPT: probe\nCREATE TABLE selftest_probe (id int8);\n' > "$$tmp/probe_exempt.py"; \
	rc_plant=0; bash scripts/check-no-manual-ddl.sh "$$tmp/probe.py" >/dev/null 2>&1 || rc_plant=$$?; \
	rc_exempt=0; bash scripts/check-no-manual-ddl.sh "$$tmp/probe_exempt.py" >/dev/null 2>&1 || rc_exempt=$$?; \
	fail=0; \
	if [ "$$rc_plant" -eq 1 ]; then echo "PASS: planted CREATE TABLE detected (exit 1)"; \
	  else echo "FAIL: planted CREATE TABLE NOT detected (exit $$rc_plant, want 1)"; fail=1; fi; \
	if [ "$$rc_exempt" -eq 0 ]; then echo "PASS: DDL-EXEMPT variant passed (exit 0)"; \
	  else echo "FAIL: DDL-EXEMPT variant did NOT pass (exit $$rc_exempt, want 0)"; fail=1; fi; \
	if [ "$$fail" -ne 0 ]; then echo "check-no-manual-ddl negative-control FAILED"; exit 1; fi; \
	echo "check-no-manual-ddl negative-control OK"

# ============================================================
# Aggregates
# ============================================================
# Fast, docker-free gate: schema-SoT + lint + frontend type-check + contract
# drift. Does NOT run the docker-backed pytest/e2e (that's `make ci-local`).
verify-all: check-no-manual-ddl check-no-manual-ddl-selftest lint contract-check

# Full CI mirror — see scripts/ci-local.sh. Wired into pre-push (lefthook.yml).
ci-local:
	bash scripts/ci-local.sh

# Install git hooks (one-time per clone). Prefers an installed lefthook; if it
# is missing, tries `npx lefthook`; otherwise prints install instructions.
hooks:
	@if command -v lefthook >/dev/null 2>&1; then \
	  lefthook install; \
	elif command -v npx >/dev/null 2>&1; then \
	  npx --yes lefthook install; \
	else \
	  echo "lefthook not found. Install it, then re-run 'make hooks':"; \
	  echo "  brew install lefthook       # macOS"; \
	  echo "  npm i -g lefthook           # via npm"; \
	  echo "  go install github.com/evilmartians/lefthook@latest"; \
	  exit 1; \
	fi

# Phase 69 B1 — regenerate contract/openapi.json from the LIVE app inside the
# docker api container (local .venv is broken). The api image bakes the code
# and does NOT bind-mount the repo, so we pipe the dump script in via stdin and
# redirect its --stdout output into the host file. sort_keys makes it
# byte-stable for the B5 git-diff sync-guard.
DC_TEST = docker compose --env-file .env -f deploy/docker-compose.yml -f deploy/docker-compose.dev.yml -f deploy/docker-compose.test.yml
contract:
	@echo "Regenerating contract/openapi.json from the live app (docker api)…"
	@# Atomic write (WR-02): dump to a temp file first; only mv into place on a
	@# clean exit. A redirect straight to contract/openapi.json truncates the
	@# committed source-of-truth at command start, so a mid-stream docker/exec
	@# failure would corrupt it and silently propagate garbage into schema.ts +
	@# GeneratedDTO.swift on the next regen. Mirrors the in-process --dump=python
	@# path, which writes via Path.write_text after a full render (atomic).
	@$(DC_TEST) exec -T api /app/.venv/bin/python - --stdout \
	  < contract/dump_openapi.py > contract/openapi.json.tmp \
	  && mv contract/openapi.json.tmp contract/openapi.json \
	  || { rm -f contract/openapi.json.tmp; \
	       echo "ERROR: openapi dump failed; contract/openapi.json left untouched." >&2; \
	       exit 1; }
	@echo "Wrote contract/openapi.json ($$(wc -l < contract/openapi.json) lines)."

# Phase 69 B5 — sync-guard: regenerate all 3 contract artifacts (openapi.json,
# web schema.ts, iOS GeneratedDTO.swift) and fail if any drifted from the
# committed version (git diff non-empty). Override the openapi dump strategy
# with CONTRACT_DUMP=docker|python|skip (default docker). See contract/README.md.
contract-check:
	@CONTRACT_DUMP=$${CONTRACT_DUMP:-docker} bash contract/check_contract_sync.sh

# (tokens / tokens-check targets removed — the design-token codegen was retired
#  with the Maximal Poster removal; native.css --lgn-* tokens are hand-authored.)

# POL-05 — bundle-size + (best-effort) Lighthouse run.
# Output идёт в stdout; фиксируется в 28-perf-report.md вручную.
perf-report:
	@echo "=== Phase 28-04 perf-report ==="
	@echo "Step 1: production build"
	npm --prefix frontend run build 2>&1 | tee .perf-build.log
	@echo ""
	@echo "Step 2: woff2 size aggregation (target <= 200kB gzipped sum)"
	@find frontend/dist/assets -name '*.woff2' -exec ls -l {} \; 2>/dev/null \
	  | awk '{ sum += $$5 } END { printf "Total woff2 raw: %d bytes (%.1f kB)\n", sum, sum/1024 }' || echo "no woff2 found in dist"
	@echo ""
	@echo "Step 3: total dist size"
	@du -sh frontend/dist 2>/dev/null || echo "no frontend/dist"
	@echo ""
	@echo "Step 4 (optional, может fail): Lighthouse CLI"
	@(cd frontend && npx --yes lighthouse http://localhost:5173 --only-categories=performance --form-factor=mobile --output=json --output-path=../.perf-lighthouse.json --chrome-flags='--headless' 2>&1 | tail -5) \
	  || echo "Lighthouse CLI unavailable — manual smoke required (см. checkpoint)"
	@echo ""
	@echo "DONE. Заполни 28-perf-report.md секцию Measurements значениями."

# POL-06 — обнаруживает невидимые codepoints в исходниках:
#   U+00AD  SOFT HYPHEN              (0xC2 0xAD)
#   U+200B  ZERO WIDTH SPACE         (0xE2 0x80 0x8B)
#   U+200C  ZERO WIDTH NON-JOINER    (0xE2 0x80 0x8C)
#   U+200D  ZERO WIDTH JOINER        (0xE2 0x80 0x8D)
#   U+FEFF  ZERO WIDTH NO-BREAK SPACE / BOM  (0xEF 0xBB 0xBF)
# Возвращает exit 1 на любой hit, exit 0 если чисто.
hidden-unicode-grep:
	@echo "Scanning for U+00AD U+200B U+200C U+200D U+FEFF в frontend/src ios/BudgetPlanner app …"
	@HITS=$$(LC_ALL=C grep -rPnI \
	    --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' \
	    --include='*.css' --include='*.scss' --include='*.module.css' \
	    --include='*.swift' \
	    --include='*.py' \
	    --include='*.md' --include='*.html' \
	    --exclude-dir='node_modules' --exclude-dir='.git' --exclude-dir='dist' \
	    --exclude-dir='build' --exclude-dir='.next' --exclude-dir='coverage' \
	    '[\xC2\xAD]|[\xE2\x80\x8B-\xE2\x80\x8D]|[\xEF\xBB\xBF]' \
	    frontend/src ios/BudgetPlanner app 2>/dev/null || true); \
	if [ -n "$$HITS" ]; then \
	  echo "FOUND HIDDEN UNICODE:"; \
	  echo "$$HITS"; \
	  exit 1; \
	else \
	  echo "Clean — no hidden unicode."; \
	fi

# POL-06 — alembic round-trip: upgrade head → downgrade -1 → upgrade head.
# Требует поднятого docker-compose стека (api + db).
migration-roundtrip:
	@scripts/alembic-roundtrip.sh

