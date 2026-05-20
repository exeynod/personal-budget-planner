.PHONY: tokens tokens-check perf-report hidden-unicode-grep migration-roundtrip contract

# Phase 69 B1 — regenerate contract/openapi.json from the LIVE app inside the
# docker api container (local .venv is broken). The api image bakes the code
# and does NOT bind-mount the repo, so we pipe the dump script in via stdin and
# redirect its --stdout output into the host file. sort_keys makes it
# byte-stable for the B5 git-diff sync-guard.
DC_TEST = docker compose -f docker-compose.yml -f docker-compose.dev.yml -f docker-compose.test.yml
contract:
	@echo "Regenerating contract/openapi.json from the live app (docker api)…"
	@$(DC_TEST) exec -T api /app/.venv/bin/python - --stdout \
	  < contract/dump_openapi.py > contract/openapi.json
	@echo "Wrote contract/openapi.json ($$(wc -l < contract/openapi.json) lines)."

tokens:
	npm run gen:tokens

tokens-check:
	@npm run gen:tokens >/dev/null
	@git diff --exit-code design/ frontend/src/stylesV10/tokens.css ios/BudgetPlanner/FeaturesV10/Common/PosterTokens.swift \
	  || (echo "ERROR: generated tokens drifted from source. Run 'make tokens' and commit."; exit 1)

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

