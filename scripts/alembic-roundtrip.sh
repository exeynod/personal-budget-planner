#!/usr/bin/env bash
# Phase 28-05 (POL-06) — alembic migration round-trip safety check.
#
# Проверяет, что миграции корректно применяются в обе стороны:
#   1. upgrade head        — поднять схему до последней ревизии
#   2. downgrade -1        — откатить одну ревизию (downgrade()-логика)
#   3. upgrade head        — снова накатить (idempotency + recovery)
#
# Если какой-либо шаг падает с non-zero, скрипт прерывается (set -e) и
# возвращает код > 0. Это и есть migration safety gate перед v1.0 release.
#
# Usage:
#   scripts/alembic-roundtrip.sh
#
# Requires:
#   docker compose up -d db api
#   (api контейнер должен иметь alembic в PATH — это default из ./app/alembic.ini)
#
# Override defaults через env:
#   DOCKER_COMPOSE='docker-compose'  scripts/alembic-roundtrip.sh
#   API_SERVICE='api-dev'            scripts/alembic-roundtrip.sh

set -euo pipefail

DOCKER_COMPOSE="${DOCKER_COMPOSE:-docker compose}"
API_SERVICE="${API_SERVICE:-api}"

echo "=== Phase 28-05 alembic round-trip ==="
echo "Compose: $DOCKER_COMPOSE   Service: $API_SERVICE"
echo ""

echo "Step 1/3: alembic upgrade head"
$DOCKER_COMPOSE exec -T "$API_SERVICE" uv run alembic upgrade head

echo ""
echo "Step 2/3: alembic downgrade -1"
$DOCKER_COMPOSE exec -T "$API_SERVICE" uv run alembic downgrade -1

echo ""
echo "Step 3/3: alembic upgrade head (re-apply)"
$DOCKER_COMPOSE exec -T "$API_SERVICE" uv run alembic upgrade head

echo ""
echo "Round-trip OK — миграции применяются в обе стороны без ошибок."
