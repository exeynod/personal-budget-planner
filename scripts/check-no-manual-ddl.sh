#!/usr/bin/env bash
# Docs-drift / schema-SoT gate: forbid raw schema DDL outside alembic/versions/.
#
# The DB schema has exactly ONE source of truth — Alembic migrations under
# alembic/versions/. RLS policies, roles and GRANTs (alembic 0007/0008) are
# security-load-bearing, so a CREATE/ALTER/DROP TABLE smuggled into app code,
# an ad-hoc script, or a doc snippet that someone copy-pastes into psql would
# silently diverge prod from the migration history. This gate makes that fail.
#
# Scope: schema-bearing application source only — app/ and the main_*.py
# entrypoints. NOT scanned:
#   - alembic/versions/  → the SoT itself (raw DDL is expected here).
#   - tests/             → testcontainer temp tables + SQLi string-payloads.
#   - contract/, docs/   → contract dumps + prose snippets.
# Embedded DDL inside Python string literals is caught too (the grep is
# content-based, not import-based).
#
# Escape hatch: put `DDL-EXEMPT` (or `DDL-EXEMPT: <reason>`) on the same line
# or the line immediately above a legitimate raw-DDL statement (e.g. a one-off
# maintenance helper). The negative-control selftest
# (`make check-no-manual-ddl-selftest`) proves both the red path and the
# exemption path still work.
#
# Usage:
#   scripts/check-no-manual-ddl.sh                 # default: app/ + main_*.py
#   scripts/check-no-manual-ddl.sh FILE [FILE...]  # explicit set (selftest)
#
# Exit codes:
#   0  clean
#   1  violation found (raw DDL without DDL-EXEMPT)
#   2  internal error (grep failure / unreadable file)

set -uo pipefail

# Match a statement OPENER: CREATE [GLOBAL|LOCAL|TEMP|TEMPORARY|UNLOGGED] TABLE,
# ALTER TABLE, DROP TABLE. Statement openers are single-line, so a line-based
# grep is adequate. Case-insensitive.
DDL_RE='(CREATE([[:space:]]+(GLOBAL|LOCAL|TEMP|TEMPORARY|UNLOGGED))*[[:space:]]+TABLE|ALTER[[:space:]]+TABLE|DROP[[:space:]]+TABLE)'

# Build the file set. Newline-delimited (portable to bash 3.2 — no `mapfile`).
if [ "$#" -gt 0 ]; then
  file_list=$(printf '%s\n' "$@")
else
  # Default scan target: schema-bearing source. git ls-files keeps us off
  # generated/ignored trees; we add --others --exclude-standard so a NEW (still
  # untracked) file with smuggled DDL is caught before it ever lands — the gate
  # must red on what you're about to commit, not only on history. Fall back to
  # find if not in a git work tree.
  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    file_list=$(
      {
        git ls-files 'app/*.py' 'app/**/*.py' 'main_api.py' 'main_bot.py' 'main_worker.py'
        git ls-files --others --exclude-standard 'app/*.py' 'app/**/*.py' 'main_api.py' 'main_bot.py' 'main_worker.py'
      } | sort -u
    )
  else
    file_list=$(
      find app -name '*.py' -type f 2>/dev/null
      ls main_api.py main_bot.py main_worker.py 2>/dev/null
    )
  fi
fi

violations=""
while IFS= read -r f; do
  [ -n "$f" ] || continue
  [ -f "$f" ] || continue

  # Grep for candidate DDL lines (with line numbers). grep exit:
  #   0 match, 1 no match (fine), >=2 real error → fail loud (exit 2).
  hits=$(grep -niE "$DDL_RE" "$f")
  rc=$?
  if [ "$rc" -ge 2 ]; then
    echo "check-no-manual-ddl: grep error on $f (exit $rc)" >&2
    exit 2
  fi
  [ -n "$hits" ] || continue

  # For each candidate line, honour a DDL-EXEMPT marker on that line OR the
  # line directly above it.
  while IFS= read -r hit; do
    [ -n "$hit" ] || continue
    lineno=${hit%%:*}
    # Same-line exemption?
    if printf '%s' "$hit" | grep -q 'DDL-EXEMPT'; then
      continue
    fi
    # Previous-line exemption?
    prev=$((lineno - 1))
    if [ "$prev" -ge 1 ] && sed -n "${prev}p" "$f" 2>/dev/null | grep -q 'DDL-EXEMPT'; then
      continue
    fi
    violations="$violations$f:$hit"$'\n'
  done <<< "$hits"
done <<< "$file_list"

if [ -n "$violations" ]; then
  echo "Raw schema DDL detected outside alembic/versions/ (schema SoT)." >&2
  echo "Move it into an Alembic migration, or annotate the line with DDL-EXEMPT" >&2
  echo "if it is genuinely not a schema change (e.g. a SQLi test payload)." >&2
  echo >&2
  printf '%s' "$violations" >&2
  exit 1
fi

exit 0
