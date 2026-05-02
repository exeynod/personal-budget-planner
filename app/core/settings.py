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
    OWNER_TG_ID: int = 0

    # Internal API protection (bot ↔ api shared secret)
    INTERNAL_TOKEN: str = "changeme"
    API_BASE_URL: str = "http://api:8000"

    # Public hosting / Caddy
    PUBLIC_DOMAIN: str = "localhost"

    # Dev / observability
    DEV_MODE: bool = False
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "json"
    APP_TZ: str = "Europe/Moscow"


settings = Settings()
