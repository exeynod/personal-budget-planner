"""Pydantic schemas for /api/v1/auth endpoints (Phase 17, IOSAUTH-02).

Native iOS-клиент не имеет доступа к Telegram initData, поэтому web-фронт
и iOS используют разные auth-механизмы:

- Web: X-Telegram-Init-Data (HMAC-SHA256 валидация на каждом запросе).
- iOS: Authorization: Bearer <token>, где токен получен через
  POST /auth/dev-exchange (на dev) или TG Login Widget / Sign in with Apple
  (на prod в Phase 21).
"""
from pydantic import BaseModel, Field


class DevExchangeRequest(BaseModel):
    """POST /auth/dev-exchange request body.

    Fields:
        secret: значение должно совпадать с settings.DEV_AUTH_SECRET. Любое
            несовпадение → 403. min_length=1 защищает от пустой строки
            (тривиальный bypass если секрет в env тоже пустой).
    """

    secret: str = Field(min_length=1, max_length=512)


class DevExchangeResponse(BaseModel):
    """POST /auth/dev-exchange response.

    Fields:
        token: long-lived Bearer-токен (64-char hex). Возвращается plaintext
            один раз — повторно не извлекаем (хранится только sha256-hash).
        tg_user_id: Telegram user ID владельца (OWNER_TG_ID), идёт обратно
            чтобы клиент мог отобразить в UI ("Logged in as @user").
    """

    token: str
    tg_user_id: int
