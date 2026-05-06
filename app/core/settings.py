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

    # Telegram
    BOT_TOKEN: str = "changeme"
    BOT_USERNAME: str = "tg_budget_planner_bot"
    OWNER_TG_ID: int = 0

    # Internal API protection (bot ↔ api shared secret)
    INTERNAL_TOKEN: str = "changeme"
    API_BASE_URL: str = "http://api:8000"

    # Public hosting / Caddy
    PUBLIC_DOMAIN: str = "localhost"
    MINI_APP_URL: str = "https://localhost"

    # Dev / observability
    DEV_MODE: bool = False
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "json"
    APP_TZ: str = "Europe/Moscow"

    # AI Assistant (Phase 9) — AI-08, AI-09
    OPENAI_API_KEY: str = "changeme"
    LLM_PROVIDER: str = "openai"
    LLM_MODEL: str = "gpt-4.1-nano"
    AI_MAX_CONTEXT_MESSAGES: int = 20


settings = Settings()


def validate_production_settings(s: Settings = settings) -> None:
    """Refuse to start when production-mode config has insecure defaults.

    Called from each entry point's startup (main_api lifespan, main_bot main(),
    main_worker main()). When ``DEV_MODE=True`` validation is skipped — local
    dev and tests can run with placeholder values.
    """
    if s.DEV_MODE:
        return

    insecure = []
    if s.BOT_TOKEN in ("", "changeme"):
        insecure.append("BOT_TOKEN")
    if s.INTERNAL_TOKEN in ("", "changeme"):
        insecure.append("INTERNAL_TOKEN")
    if s.OWNER_TG_ID == 0:
        insecure.append("OWNER_TG_ID")
    if s.OPENAI_API_KEY in ("", "changeme"):
        insecure.append("OPENAI_API_KEY")

    if insecure:
        raise RuntimeError(
            "Refusing to start: insecure default values for "
            f"{', '.join(insecure)} with DEV_MODE=False. "
            "Set real secrets in .env or DEV_MODE=true for local development."
        )
