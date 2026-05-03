"""Pure parsing helpers for bot command arguments.

D-49: parse_amount — converts user-entered amount strings to kopecks.
Supported formats: 1500 / 1500.50 / 1 500 / 1500р / 1500₽ / 1 500,50 руб.
Cap: 10^12 копеек (overflow guard). Returns None on any parse error.

D-50: parse_add_command — splits /add or /income args into
(amount_cents, category_query, description_or_None). The first token after
the amount is always the category query; remaining tokens form the description.
"""
from __future__ import annotations

import re

# After stripping suffixes and spaces: only digits + optional 1-2 decimal places.
_AMOUNT_RE = re.compile(r"^\d+([.,]\d{1,2})?$")


def parse_amount(s: str) -> int | None:
    """Parse 1500 / 1500.50 / 1 500 / 1500р / 1500₽ → kopecks; None on error.

    Supported formats:
    - integer: 1500 → 150000
    - decimal with dot or comma: 1500.50, 1500,50 → 150050 (max 2 decimal places)
    - thousand-spaces: 1 500 (regular space) and NBSP → 150000
    - suffixes: р, руб, ₽ (case-insensitive trailing) → stripped
    - combinations: 1 500.50 ₽ → 150050

    Returns None for:
    - Incorrect format (NaN, alpha, .50 without integer part)
    - amount <= 0
    - amount > 10^12 kopecks (overflow guard)
    - 3+ decimal places
    """
    if not s:
        return None
    s = s.strip()
    # Strip suffixes case-insensitively, longest first to avoid cutting 'руб' as 'р' + leftover 'уб'
    for suffix in ("₽", "руб", "р"):
        if s.lower().endswith(suffix):
            s = s[: -len(suffix)].rstrip()
            break
    # Normalize decimal separator and remove spaces (regular + NBSP \xa0)
    s = s.replace(",", ".")
    s = s.replace(" ", "").replace("\xa0", "")
    if not _AMOUNT_RE.match(s):
        return None
    try:
        f = float(s)
    except ValueError:
        return None
    if f <= 0:
        return None
    cents = round(f * 100)
    if cents > 10**12:
        return None
    return cents


def parse_add_command(args: str | None) -> tuple[int, str, str | None] | None:
    """Parse /add AMOUNT CATEGORY_QUERY [DESCRIPTION] args (without leading /add).

    Parameters
    ----------
    args:
        CommandObject.args — may be None if no args supplied.

    Returns
    -------
    tuple (amount_cents, category_query, description_or_None) or None on failure.
    Requires at least two tokens: AMOUNT and CATEGORY_QUERY.
    """
    if not args:
        return None
    tokens = args.strip().split()
    if len(tokens) < 2:
        return None
    amount_cents = parse_amount(tokens[0])
    if amount_cents is None:
        return None
    category_query = tokens[1]
    description = " ".join(tokens[2:]) if len(tokens) > 2 else None
    return amount_cents, category_query, description
