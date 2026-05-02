"""Telegram initData validation per HLD §7.1.

Algorithm: 5-step HMAC-SHA256 as per
https://docs.telegram-mini-apps.com/platform/init-data
"""
import hashlib
import hmac
import json
import time
from urllib.parse import parse_qsl, unquote


def validate_init_data(init_data_raw: str, bot_token: str) -> dict:
    """Validate Telegram Mini App initData string.

    Args:
        init_data_raw: raw query string from Telegram
            (e.g. ``"auth_date=...&hash=...&user=..."``).
        bot_token: Telegram bot token from BotFather.

    Returns:
        dict with Telegram user data (id, first_name, etc.)

    Raises:
        ValueError: ``"Missing hash"`` if hash param absent.
        ValueError: ``"Invalid hash"`` if HMAC verification fails.
        ValueError: ``"auth_date expired"`` if ``auth_date`` > 24 hours ago.
    """
    params = dict(parse_qsl(init_data_raw, keep_blank_values=True))

    # Step 1: extract and remove hash
    received_hash = params.pop("hash", None)
    if not received_hash:
        raise ValueError("Missing hash")

    # Step 2: data_check_string — sorted key=value pairs joined by \n
    data_check_string = "\n".join(
        f"{k}={v}" for k, v in sorted(params.items())
    )

    # Step 3: secret_key = HMAC-SHA256("WebAppData", bot_token)
    secret_key = hmac.new(
        b"WebAppData",
        bot_token.encode(),
        hashlib.sha256,
    ).digest()

    # Step 4: calc_hash = HMAC-SHA256(data_check_string, secret_key).hexdigest()
    calc_hash = hmac.new(
        secret_key,
        data_check_string.encode(),
        hashlib.sha256,
    ).hexdigest()

    # Step 5: timing-safe comparison (prevent timing attacks per ASVS V6)
    if not hmac.compare_digest(calc_hash, received_hash):
        raise ValueError("Invalid hash")

    # Step 5b: auth_date must be <= 24h (86400 seconds) — anti-replay (HLD §7.1)
    auth_date = int(params.get("auth_date", 0))
    if time.time() - auth_date > 86400:
        raise ValueError("auth_date expired")

    # Parse user JSON
    user_raw = params.get("user", "{}")
    user_data = json.loads(unquote(user_raw))
    return user_data
