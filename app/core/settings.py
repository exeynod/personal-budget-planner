"""Application settings via pydantic-settings.

Loads configuration from environment variables (.env in dev). All ENV vars
are documented in docs/HLD.md §8 and CONTEXT.md decisions D-05/D-06/D-13.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Database (async for FastAPI/aiogram, sync for APScheduler jobstore)
    DATABASE_URL: str = "postgresql+asyncpg://budget:budget@db:5432/budget_db"
    DATABASE_URL_SYNC: str = "postgresql://budget:budget@db:5432/budget_db"

    # Phase 12 D-11-07-02: split runtime role from admin role.
    # DATABASE_URL connects as budget_app (NOSUPERUSER NOBYPASSRLS) → RLS enforced.
    # ADMIN_DATABASE_URL connects as `budget` (SUPERUSER) → used by alembic for DDL.
    # Default mirrors DATABASE_URL для backward compat в setups до Plan 12-05.
    ADMIN_DATABASE_URL: str = "postgresql+asyncpg://budget:budget@db:5432/budget_db"

    # Telegram
    BOT_TOKEN: str = "changeme"
    BOT_USERNAME: str = "tg_budget_planner_bot"
    OWNER_TG_ID: int = 0

    # Internal API protection (bot ↔ api shared secret)
    INTERNAL_TOKEN: str = "changeme"
    API_BASE_URL: str = "http://api:8000"

    # Phase 17 (v0.6 IOSAUTH-02): native iOS dev token exchange.
    # Endpoint POST /api/v1/auth/dev-exchange принимает {secret} равный этому
    # значению и выдаёт long-lived Bearer-токен для OWNER_TG_ID. None = endpoint
    # отдаёт 503. Не используется для web-фронта (он шлёт TG initData как раньше).
    DEV_AUTH_SECRET: str | None = None

    # Public hosting / Caddy
    PUBLIC_DOMAIN: str = "localhost"
    MINI_APP_URL: str = "https://localhost"

    # Dev / observability
    DEV_MODE: bool = False
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "json"
    APP_TZ: str = "Europe/Moscow"

    # Entry-point identifier — one of "api" | "bot" | "worker" | "" (tests).
    # Set by docker-compose so validate_production_settings can demand
    # AI secrets only from the api container (Phase 10.1).
    SERVICE: str = ""

    # AI Assistant (Phase 9) — AI-08, AI-09
    OPENAI_API_KEY: str = "changeme"
    LLM_PROVIDER: str = "openai"
    LLM_MODEL: str = "gpt-4.1-nano"
    # Sliding window of recent messages sent to the LLM on each chat turn.
    # 8 = ~3-4 user/assistant pairs, sufficient for budget Q&A continuity.
    # Lowered from 20 in Phase 10.1 cost optimization (see audit).
    AI_MAX_CONTEXT_MESSAGES: int = 8

    # AI Categorization (Phase 10) — AICAT-01..06
    # Включить embedding-based category suggestion (text-embedding-3-small + pgvector)
    ENABLE_AI_CATEGORIZATION: bool = True
    EMBEDDING_MODEL: str = "text-embedding-3-small"


settings = Settings()


_PLACEHOLDER_TOKENS = ("", "changeme")


def validate_production_settings(s: Settings = settings) -> None:
    """Refuse to start when configuration has insecure / missing values.

    Called from each entry point's startup (main_api lifespan, main_bot main(),
    main_worker main()). Two tiers:

    1. **Production-only** (skipped when ``DEV_MODE=True``): BOT_TOKEN,
       INTERNAL_TOKEN, OWNER_TG_ID. Local dev / tests can run with
       placeholders here.
    2. **Always-on for the api entry point** (regardless of DEV_MODE):
       when ``LLM_PROVIDER=openai`` a real ``OPENAI_API_KEY`` must be
       present, and when ``ENABLE_AI_CATEGORIZATION=true`` the same
       applies. Without it the AI surface degrades silently — we refuse
       to start instead so the miswire is caught at boot, not at first
       chat call (Phase 10.1). bot / worker entry points don't make AI
       calls and skip this check so the secret stays scoped to api.
    """
    insecure: list[str] = []

    if not s.DEV_MODE:
        if s.BOT_TOKEN in _PLACEHOLDER_TOKENS:
            insecure.append("BOT_TOKEN")
        if s.INTERNAL_TOKEN in _PLACEHOLDER_TOKENS:
            insecure.append("INTERNAL_TOKEN")
        if s.OWNER_TG_ID == 0:
            insecure.append("OWNER_TG_ID")

    needs_ai_key = s.SERVICE in ("", "api") and (
        s.LLM_PROVIDER.lower() == "openai" or s.ENABLE_AI_CATEGORIZATION
    )
    if needs_ai_key and s.OPENAI_API_KEY in _PLACEHOLDER_TOKENS:
        insecure.append("OPENAI_API_KEY")

    if insecure:
        raise RuntimeError(
            "Refusing to start: missing or placeholder values for "
            f"{', '.join(insecure)}. "
            "Set real secrets in .env (DEV_MODE only relaxes BOT_TOKEN / "
            "INTERNAL_TOKEN / OWNER_TG_ID — OPENAI_API_KEY is required "
            "whenever AI features are enabled)."
        )
