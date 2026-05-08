#!/usr/bin/env bash
# VPS-side deploy WRAPPER — kept deliberately minimal.
#
# This script is the SSH force-command target in ~/.ssh/authorized_keys
# (`command="/home/exy/personal-budget-planner/deploy.sh"`). It changes as
# rarely as possible — typically never — because any change to it has a
# bootstrap problem: the running process can't pick up its own update mid-run,
# so a stale wrapper would have to be replaced manually before the new logic
# could take effect.
#
# To dodge that, *all* deploy logic lives in deploy_inner.sh. This wrapper
# does exactly two things:
#   1. fetch + reset hard to origin/master (so deploy_inner.sh on disk is
#      always the version pinned by the commit being deployed)
#   2. exec deploy_inner.sh, replacing the current process and inheriting
#      stdin/stdout/stderr verbatim — so the .env payload CI pipes in
#      reaches deploy_inner.sh untouched.
#
# That means when the CI workflow changes deploy_inner.sh, the very next
# `ssh deploy` call picks up the new logic on the *first* run with no
# manual VPS intervention.
set -euo pipefail

REPO=/home/exy/personal-budget-planner
cd "$REPO"

echo "[deploy-wrapper $(date -u +%FT%TZ)] fetching origin/master"
git fetch --quiet origin master
git reset --hard origin/master

echo "[deploy-wrapper $(date -u +%FT%TZ)] handing off to deploy_inner.sh ($(git rev-parse --short HEAD))"
chmod +x ./deploy_inner.sh
exec ./deploy_inner.sh
